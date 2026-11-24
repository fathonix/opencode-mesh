// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Thin V2 adapter: delegation only. Exports Plugin.define({id, setup}) and
// delegates every behavior to the same src/ functions V1 uses. No tool logic,
// no presence logic, no TTL values live here. Sole host-SDK import in the tree
// beside the frozen V1 entry (beta-drift isolation: a docs shift touches this
// file only; src/ never imports the host SDK minus the three V1 shells).
import { Plugin } from "@opencode/plugin";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVICT_GRACE_MS } from "../constants.js";
import { MeshError } from "../errors.js";
import { appendDeleteAudit, appendBootAudit, atomicUpdateRegistry, heartbeat, readRegistry, } from "../registry.js";
import { BUILD_STAMP, VERSION } from "../version.js";
import { isAttachedExempt } from "../expiry.js";
import { deriveSessionType } from "../expiry.js";
import { stampLastAction } from "../lastAction.js";
import { clearClaimerTimer, configureClaimer, ensureClaimer, releaseClaimerOwner, } from "../claimer.js";
import { startAttachPoller, stopAttachPoller } from "../attach.js";
import { MESH_REGISTER_DESCRIPTION, executeMeshRegister, } from "../tools/mesh_register.core.js";
import { MESH_PEERS_DESCRIPTION, executeMeshPeers, } from "../tools/mesh_peers.core.js";
import { MESH_SEND_DESCRIPTION, executeMeshSend, } from "../tools/mesh_send.core.js";
import { acquireV2Setup, armV2SharedTimer, mergeV2Ids, releaseV2Setup, removeV2Ids, runV2SharedTick, v2OwnedIds, } from "../v2singleflight.js";
import { v2ModelString } from "../v2routes.js";
import { adoptDbSessions } from "../adopt.js";
import { readDbSessions } from "../discovery.js";
/** Stable V2 plugin id (also the status/diagnostics identity). */
const MESH_V2_PLUGIN_ID = "opencode-mesh";
/** The four tool names both entries register (single source for the zero-registration check). */
const MESH_TOOL_NAMES = ["mesh_register", "mesh_peers", "mesh_send", "mesh_broadcast"];
/** Read one field as a non-empty string; objects and blanks read absent. */
function v2Field(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
/** Session directory: explicit field wins, event/location wrapper next. */
function v2DirectoryOf(info) {
    return (v2Field(info.directory) ?? v2Field(info.location?.directory) ?? undefined);
}
/** Model to the registry string (providerID/id); unusable reads absent. */
function v2ModelOf(info) {
    if (typeof info.model === "string" && info.model.length > 0)
        return info.model;
    return v2ModelString(info.model);
}
/**
 * Merge identity into the registry entry: parameters win, stored values
 * fill gaps, generic titles never clobber real ones, repo derives from the
 * directory at write time. Never throws (presence paths drop, never break).
 */
async function upsertV2Presence(sessionId, fields) {
    if (!sessionId)
        return;
    const agent = v2Field(fields.agent);
    const directory = v2DirectoryOf(fields);
    const title = v2Field(fields.title);
    const model = v2ModelOf(fields);
    const sessionType = fields.parentID === undefined || fields.parentID === null
        ? undefined
        : deriveSessionType(fields.parentID);
    if (agent === undefined &&
        directory === undefined &&
        title === undefined &&
        model === undefined &&
        sessionType === undefined) {
        return;
    }
    try {
        await atomicUpdateRegistry((reg) => {
            const existing = reg[sessionId];
            const next = {
                ...(existing ?? {}),
                sessionId,
            };
            if (agent !== undefined && agent !== "unknown")
                next.agent = agent;
            else if (typeof next.agent !== "string")
                next.agent = "unknown";
            if (directory !== undefined) {
                next.directory = directory;
                next.cwd = directory;
            }
            if (title !== undefined) {
                next.description = title;
                next.summary = title;
                next.title = title;
            }
            if (model !== undefined)
                next.model = model;
            if (sessionType !== undefined)
                next.sessionType = sessionType;
            next.updatedAt = Date.now();
            reg[sessionId] = next;
        });
    }
    catch { }
}
// Per-setup debounce mirroring the V1 EVICT_GRACE_MS fast path: repeat firings
// inside the window cost zero writes. Shared-ownership merges into the guard;
// this map stays per-setup so teardown never touches foreign ids.
const v2SeenAt = new Map();
/** In-process v2 inject client for the claimer (first setup owns it). */
let v2ClaimClient = null;
/**
 * Refresh hook for the claim-leg target snapshot (first setup owns it). The
 * shared tick calls it so a session created since boot becomes claimable
 * without a restart; null when no v2 setup armed the claimer.
 */
let v2ClaimTargetsRefresh = null;
/**
 * Best-effort presence touch for one session id: guard-merge plus registry
 * heartbeat plus last-action stamp. Creates nothing (heartbeat on a missing
 * id is a no-op by registry contract); identity arrives via ensureV2Presence
 * and lifecycle data. Never throws (event/hook paths drop, never break).
 */
async function touchV2Presence(sessionId) {
    if (!sessionId)
        return;
    const now = Date.now();
    const last = v2SeenAt.get(sessionId);
    if (last !== undefined && now - last < EVICT_GRACE_MS)
        return;
    v2SeenAt.set(sessionId, now);
    mergeV2Ids([sessionId]);
    try {
        await heartbeat(sessionId);
    }
    catch { }
    try {
        await stampLastAction(sessionId);
    }
    catch { }
}
/** Last identity enrichment per id; bounds session.get to one read per window. */
const v2EnrichedAt = new Map();
/**
 * Full presence for one session id: heartbeat touch plus identity enrich.
 * Stored-complete rows skip the read; otherwise one session.get per window
 * fills agent, directory, model, and title (the v2 counterparts of the v1
 * resolveIdentity fields). The plugin-instance directory is a fallback only
 * and never overrides a stored session directory. Never throws.
 */
async function ensureV2Presence(client, sessionId, toolAgent) {
    if (!sessionId)
        return;
    await touchV2Presence(sessionId);
    const now = Date.now();
    const enriched = v2EnrichedAt.get(sessionId);
    if (enriched !== undefined && now - enriched < EVICT_GRACE_MS)
        return;
    let stored;
    const reg = await readRegistry();
    stored = reg[sessionId];
    const needsAgent = typeof stored?.agent !== "string" || stored.agent === "unknown";
    const needsDir = typeof stored?.directory !== "string" &&
        typeof stored?.cwd !== "string";
    const needsModel = typeof stored?.model !== "string";
    if (!needsAgent && !needsDir && !needsModel)
        return;
    v2EnrichedAt.set(sessionId, now);
    let info = null;
    try {
        const raw = await client.session?.get?.({ sessionID: sessionId });
        const data = raw && typeof raw === "object"
            ? (raw.data ?? raw)
            : null;
        if (data && typeof data === "object")
            info = data;
    }
    catch {
        info = null;
    }
    const fallbackDir = needsDir
        ? v2Field(client.location?.directory)
        : undefined;
    await upsertV2Presence(sessionId, {
        agent: info?.agent ?? toolAgent,
        model: info?.model,
        title: info?.title,
        directory: (info ? v2DirectoryOf(info) : undefined) ?? fallbackDir,
        parentID: info?.parentID,
    });
}
/**
 * V2 session lifecycle handler. Created writes full presence from the event
 * data (sessionID, location, agent, model, title all ride the payload);
 * deleted evicts with the attached-exempt guard; updated has no V2
 * counterpart (manifest grep count 0) so freshness beyond this relies on
 * TTL expiry with ghost bound STALE_TTL_MS, never a name-matched silent
 * subscribe. Other events are no-ops by construction.
 */
async function handleV2Event(raw) {
    const event = raw;
    if (!event || typeof event.type !== "string")
        return;
    if (event.type === "session.created") {
        const data = event.data ?? {};
        const id = (typeof data["sessionID"] === "string" ? data["sessionID"] : undefined) ??
            event.id ??
            "";
        await touchV2Presence(id);
        // Full identity rides the created payload; persist it so v2 rows carry
        // the same agent, directory, model, and title v1 learns via resolveIdentity.
        await upsertV2Presence(id, data);
        return;
    }
    if (event.type === "session.deleted") {
        const data = event.data ?? {};
        const id = (typeof data["sessionID"] === "string" ? data["sessionID"] : undefined) ??
            event.id ??
            "";
        if (!id)
            return;
        // Attached-exempt: the oracle still lists this id, so the delete path
        // alone never removes it; expiry owns the transition (mirrors V1).
        const reg = (await readRegistry());
        if (isAttachedExempt(reg[id]))
            return;
        try {
            await atomicUpdateRegistry((reg) => {
                delete reg[id];
            });
        }
        catch { }
        v2SeenAt.delete(id);
        try {
            await appendDeleteAudit("session.deleted", [id]);
        }
        catch { }
        return;
    }
    return;
}
/** Skills root probe: both layouts, first hit wins (mirrors the V1 resolver). */
function resolveV2SkillsRoot() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [resolve(here, "..", "skills"), resolve(here, "..", "..", "skills")];
    for (const c of candidates) {
        try {
            if (existsSync(resolve(c, "opencode-mesh", "SKILL.md")))
                return c;
        }
        catch { }
    }
    return null;
}
export default Plugin.define({
    id: MESH_V2_PLUGIN_ID,
    async setup(ctx) {
        const ownership = acquireV2Setup();
        // Per-setup owned ids (subset of the guard union); teardown deletes only these.
        const mine = new Set();
        const noteMine = (id) => {
            if (id)
                mine.add(id);
        };
        // Init record: one audit-file line per init, screen output unchanged.
        try {
            await appendBootAudit(BUILD_STAMP, VERSION).catch(() => { });
        }
        catch { }
        // Prebuilt tool defs (loaded before registration; transform callbacks stay
        // synchronous, pure editor.add only, zero await/import/IO, reload-idempotent).
        const registerDef = {
            name: "mesh_register",
            description: MESH_REGISTER_DESCRIPTION,
            input: {
                type: "object",
                properties: {
                    summary: { type: "string", description: "One-line summary of this session's purpose" },
                    description: { type: "string", description: "Canonical description (alias for summary)" },
                },
                additionalProperties: false,
            },
            execute: async (input, context) => {
                const args = input;
                if (context.sessionID) {
                    noteMine(context.sessionID);
                    await ensureV2Presence(ctx, context.sessionID, context.agent);
                }
                const r = await executeMeshRegister(args, {
                    sessionID: context.sessionID,
                    agent: context.agent,
                    // Tool contexts carry no directory on v2 (schema); the plugin
                    // instance directory seeds fresh rows, stored rows keep theirs.
                    directory: ctx.location?.directory,
                });
                return { content: r.output };
            },
        };
        const peersDef = {
            name: "mesh_peers",
            description: MESH_PEERS_DESCRIPTION,
            input: {
                type: "object",
                properties: {
                    includeSelf: { type: "boolean" },
                    agent: { type: "string" },
                    description: { type: "string" },
                    cwd: { type: "string" },
                    repo: { type: "string" },
                    receipt: { type: "string" },
                },
                additionalProperties: false,
            },
            execute: async (input, context) => {
                const args = input;
                if (context.sessionID) {
                    noteMine(context.sessionID);
                    await ensureV2Presence(ctx, context.sessionID);
                }
                const r = await executeMeshPeers(args, { sessionID: context.sessionID });
                return { content: r.output };
            },
        };
        const sendDef = {
            name: "mesh_send",
            description: MESH_SEND_DESCRIPTION,
            input: {
                type: "object",
                properties: {
                    target: { type: "string" },
                    text: { type: "string" },
                    noReply: { type: "boolean" },
                    silent: { type: "boolean" },
                    broadcast: { type: "boolean" },
                },
                required: ["target", "text"],
                additionalProperties: false,
            },
            execute: async (input, context) => {
                const args = input;
                if (context.sessionID) {
                    noteMine(context.sessionID);
                    await ensureV2Presence(ctx, context.sessionID, context.agent);
                }
                const r = await executeMeshSend(args, {
                    sessionID: context.sessionID,
                    agent: context.agent,
                });
                return { content: r.output };
            },
        };
        const broadcastDef = {
            name: "mesh_broadcast",
            description: "Broadcast to all peers (opt-in MESH_BROADCAST=1, default-off; alias for mesh_send broadcast:true)",
            input: {
                type: "object",
                properties: {
                    text: { type: "string" },
                    noReply: { type: "boolean" },
                    silent: { type: "boolean" },
                },
                required: ["text"],
                additionalProperties: false,
            },
            execute: async (input, context) => {
                const args = input;
                if (context.sessionID) {
                    noteMine(context.sessionID);
                    await ensureV2Presence(ctx, context.sessionID, context.agent);
                }
                const r = await executeMeshSend({ target: "all", text: args.text, broadcast: true, noReply: args.noReply, silent: args.silent }, { sessionID: context.sessionID, agent: context.agent });
                return { content: r.output };
            },
        };
        await ctx.tool.transform((editor) => {
            editor.add(registerDef);
            editor.add(peersDef);
            editor.add(sendDef);
            editor.add(broadcastDef);
        });
        // Fail-loud registration proof: zero tools registered means the host
        // replayed nothing and every call would miss. Uses the existing
        // SERVER_UNAVAILABLE channel (no new codes in slice).
        const listed = await ctx.tool.list();
        const listedIds = new Set(listed.map((t) => t.id));
        const missing = MESH_TOOL_NAMES.filter((n) => !listedIds.has(n));
        if (missing.length > 0) {
            throw new MeshError("SERVER_UNAVAILABLE", `v2 setup registered zero tools for ${missing.join(",")}: host transform replay missed`);
        }
        // Presence hook: sessionID plus agent arrive on the tool event; the
        // ensurer stamps liveness and fills identity (never blocks the tool).
        await ctx.tool.hook("execute.before", (event) => {
            void ensureV2Presence(ctx, event.sessionID, event.agent).then((v) => {
                if (event.sessionID)
                    noteMine(event.sessionID);
                return v;
            });
        });
        // Event subscription with AbortController teardown so dispose stops
        // the loop and a second setup never inherits a stale subscription.
        const controller = new AbortController();
        void (async () => {
            try {
                for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
                    const id = event.id;
                    if (typeof id === "string" && id)
                        noteMine(id);
                    await handleV2Event(event);
                }
            }
            catch {
                // Abort or transport drop ends the loop; cleanup owns teardown.
            }
        })();
        // Skill registration via the owning domain (V2 has no mutable global
        // config). Failure never breaks setup: the installer file-copy leg
        // already delivers the skill on V2 through the installer file copy,
        // so setup stays green when this registration throws.
        try {
            const skillsRoot = resolveV2SkillsRoot();
            if (skillsRoot) {
                const skillDir = resolve(skillsRoot, "opencode-mesh");
                const content = readFileSync(resolve(skillDir, "SKILL.md"), "utf8");
                const path = skillDir;
                const description = "Agent-to-agent mesh messaging between OpenCode sessions.";
                await ctx.skill.transform((editor) => {
                    editor.add({
                        id: "opencode-mesh",
                        name: "opencode-mesh",
                        description,
                        path: path,
                        content,
                    });
                });
            }
        }
        catch {
            // File-copy leg covers delivery; setup stays green.
        }
        // Shared pollers arm exactly once per process (first setup only). Later
        // setups merge ids by union, register cheaply, arm zero timers. The V1
        // entry predates this guard, so same-process V1+V2 claimer-config overlap
        // is a named gap (V1 always reconfigures); V2-only processes are exact.
        if (ownership.first) {
            // Live inject handle for the claimer: user admission through the
            // setup context reaches this server's sessions with no ports and no
            // auth header, and renders the chat bubble like v1 (first setup owns
            // it; same-process later setups share the server, so one handle
            // covers the union).
            v2ClaimClient = {
                prompt: (input) => ctx.session.prompt({
                    sessionID: input.sessionID,
                    text: input.text,
                    delivery: input.delivery,
                }),
            };
            // Addressable targets for the claim leg. The v2 daemon owns this whole
            // process, so every session the host can reach is claimable here: own
            // ids, then locally known rows, then every database row. Without this
            // widening a background service starts with an empty owned set and no
            // queued row is ever claimed, which is a silent permanent stall.
            const claimTargetsV2 = async () => {
                const out = new Set(v2OwnedIds());
                try {
                    const reg = (await readRegistry());
                    for (const id of Object.keys(reg))
                        out.add(id);
                }
                catch { }
                try {
                    const rows = await readDbSessions();
                    for (const id of Object.keys(rows))
                        out.add(id);
                }
                catch { }
                return [...out];
            };
            // Synchronous snapshot refreshed by the shared tick: the claim poll must
            // not await filesystem or SQLite reads on every 2s interval.
            let claimableIds = [...v2OwnedIds()];
            void claimTargetsV2()
                .then((ids) => {
                claimableIds = ids;
            })
                .catch(() => { });
            v2ClaimTargetsRefresh = () => {
                void claimTargetsV2()
                    .then((ids) => {
                    claimableIds = ids;
                })
                    .catch(() => { });
            };
            configureClaimer({
                getOwnIds: () => v2OwnedIds(),
                getClaimTargets: () => claimableIds,
                getClient: () => null,
                getV2Client: () => v2ClaimClient,
                getRegistry: async () => (await readRegistry().catch(() => ({}))),
            });
            ensureClaimer();
            startAttachPoller();
            // Restart adoption: the owned set dies with the server process while
            // sessions survive in the database; adopt database-fresh ids now so
            // queued rows have a claimant without any manual touch per session.
            try {
                const pass = await adoptDbSessions().catch(() => null);
                if (pass)
                    mergeV2Ids([...pass.adopted, ...pass.heartbeated]);
            }
            catch { }
            armV2SharedTimer(() => {
                void runV2SharedTick();
                // Keep the claim-leg target snapshot fresh: sessions created after
                // boot must become claimable without a daemon restart.
                v2ClaimTargetsRefresh?.();
            });
        }
        // Setup cleanup (replaces the V1 dispose hook; hook/transform
        // registrations auto-dispose, timers and sockets need explicit cleanup).
        return async () => {
            controller.abort();
            const mineIds = [...mine];
            const { last } = releaseV2Setup();
            removeV2Ids(mineIds);
            for (const id of mineIds)
                v2SeenAt.delete(id);
            for (const id of mineIds)
                v2EnrichedAt.delete(id);
            if (last) {
                clearClaimerTimer();
                stopAttachPoller();
                v2ClaimClient = null;
                v2ClaimTargetsRefresh = null;
                try {
                    await releaseClaimerOwner();
                }
                catch { }
            }
            if (mineIds.length === 0)
                return;
            const now = Date.now();
            const deleted = [];
            try {
                await atomicUpdateRegistry((reg) => {
                    for (const id of mineIds) {
                        const entry = reg[id];
                        if (!entry)
                            continue;
                        // Attached-exempt regardless of age: cleanup never deletes an attached id.
                        if (isAttachedExempt(entry))
                            continue;
                        // V2 has no live status feed to confirm absence: delete only
                        // past the grace window, never on a partial view alone.
                        if (typeof entry.updatedAt === "number" && now - entry.updatedAt <= EVICT_GRACE_MS)
                            continue;
                        delete reg[id];
                        deleted.push(id);
                    }
                });
            }
            catch { }
            try {
                await appendDeleteAudit("dispose", deleted);
            }
            catch { }
        };
    },
});
//# sourceMappingURL=opencode-mesh-v2.js.map
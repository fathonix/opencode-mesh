import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVICT_GRACE_MS, HEARTBEAT_INTERVAL_MS, STALE_TTL_MS } from "../constants.js";
import { isLockContention } from "../fsAtomic.js";
import { atomicUpdateRegistry, appendBootAudit, readRegistry, unwrapStatusMap } from "../registry.js";
import { pruneDeadByStatus } from "../registry.js";
import { BUILD_STAMP, VERSION } from "../version.js";
import { isAttachedExempt } from "../expiry.js";
import { noteBusyActive, stampLastAction } from "../lastAction.js";
import { resolveValidDir } from "../xdg.js";
import { startAttachPoller, stopAttachPoller } from "../attach.js";
import { mesh_register } from "../tools/mesh_register.js";
import { tool } from "@opencode-ai/plugin";
import { isGenericTitle, resolveIdentity } from "../identity.js";
import { clearClaimerTimer, configureClaimer, ensureClaimer, releaseClaimerOwner } from "../claimer.js";
const mesh_broadcast = tool({
    description: "Broadcast to all peers (opt-in MESH_BROADCAST=1, default-off; alias for mesh_send broadcast:true)",
    args: {
        text: tool.schema.string().describe("Message text to broadcast"),
        noReply: tool.schema.boolean().optional().describe("Legacy compat; maps to silent deposit, reply by reverse send"),
        silent: tool.schema.boolean().optional().describe("Canonical per-message silent flag; true deposits history-only, omit follows MESH_WAKE"),
    },
    async execute(args, ctx) {
        const { mesh_send } = await import("../tools/mesh_send.js");
        return mesh_send.execute({ target: "all", text: args.text, broadcast: true, noReply: args.noReply, silent: args.silent }, ctx);
    },
});
const seenSessions = new Map();
// In-process client for the heartbeat liveness join. Set at plugin init; the
// tick reads it (never a port fetch) so the join costs no port discovery.
let liveClient = null;
let heartbeatTimer = null;
function ensureHeartbeat() {
    if (heartbeatTimer)
        return;
    heartbeatTimer = setInterval(async () => {
        const now = Date.now();
        let statusMap = null;
        try {
            const c = liveClient;
            if (c.session?.status) {
                const raw = (await c.session.status());
                statusMap = unwrapStatusMap(raw);
            }
        }
        catch { }
        if (statusMap && Object.keys(statusMap).length === 0)
            statusMap = null; // empty view is unknown, never a delete signal
        for (const [sid, last] of seenSessions.entries()) {
            const lag = now - Math.max(last.agentAt, last.titleAt);
            if (lag > STALE_TTL_MS) {
                seenSessions.delete(sid);
                continue;
            }
            // Busy liveness input: a Runner turn counts as activity regardless of
            // timestamp. The stamp sits beside the heartbeat so tracker failure
            // never breaks the tick.
            try {
                const t = statusMap?.[sid]?.type;
                if (t === "busy" || t === "retry")
                    await noteBusyActive(sid, t);
            }
            catch { }
            // Liveness join: null map keeps and heartbeats; absent ids delete via shared helper.
            if (statusMap && !(sid in statusMap)) {
                let evicted = false;
                try {
                    await atomicUpdateRegistry((reg) => {
                        const entry = reg[sid];
                        if (!entry)
                            return;
                        // Attached-exempt: an attached id never deletes by time alone.
                        if (isAttachedExempt(entry))
                            return;
                        const scoped = { [sid]: entry };
                        pruneDeadByStatus(scoped, statusMap, now);
                        if (!(sid in scoped)) {
                            delete reg[sid];
                            evicted = true;
                        }
                    });
                }
                catch { }
                try {
                    const { appendDeleteAudit } = await import("../registry.js");
                    if (evicted)
                        await appendDeleteAudit("tick-evict", [sid]);
                }
                catch { }
                seenSessions.set(sid, { agentAt: now, titleAt: now });
                continue;
            }
            // Recreate: own sid live but missing re-inserts inside writer; never read-then-write.
            if (statusMap && sid in statusMap) {
                try {
                    await atomicUpdateRegistry((reg) => {
                        if (reg[sid])
                            return;
                        reg[sid] = { sessionId: sid, agent: "unknown", updatedAt: now };
                    });
                }
                catch { }
            }
            try {
                const { heartbeat } = await import("../registry.js");
                await heartbeat(sid);
                const cur = seenSessions.get(sid);
                if (cur)
                    seenSessions.set(sid, { agentAt: now, titleAt: now });
            }
            catch { }
        }
    }, HEARTBEAT_INTERVAL_MS);
    if (heartbeatTimer && typeof heartbeatTimer.unref === "function")
        heartbeatTimer.unref();
}
/** Test/harness teardown: stop the heartbeat tick so stale module instances never fire into a later root. */
function clearHeartbeatTimer() {
    if (heartbeatTimer)
        clearInterval(heartbeatTimer);
    heartbeatTimer = null;
}
// Skills root for config-hook auto-load; both layouts probed, first hit wins.
// Fail-closed fallback pushes a path the host scans to nothing.
function resolveSkillsRoot() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [resolve(here, "..", "skills"), resolve(here, "..", "..", "skills")];
    for (const c of candidates) {
        try {
            if (existsSync(resolve(c, "opencode-mesh", "SKILL.md")))
                return c;
        }
        catch { }
    }
    return candidates[1];
}
async function upsertPresence(sessionId, directory, agent, title, model) {
    const dirFence = resolveValidDir(directory);
    const absDir = dirFence.kind === "valid" ? dirFence.dir : undefined;
    // Why: fence (event paths never throw): a stale directory downgrades to absent,
    // never stored. The tool boundary (mesh_register) refuses loud instead.
    const validDir = absDir && existsSync(absDir) ? absDir : undefined;
    const base = validDir ? basename(validDir) : "";
    const fallback = base ? `${agent ?? 'unknown'} @ ${base}` : sessionId.slice(0, 8);
    const isGeneric = isGenericTitle(title ?? undefined);
    // Fail-closed: lock contention drops the presence refresh and the next
    // firing retries; all other errors keep current propagation.
    try {
        await atomicUpdateRegistry(async (reg) => {
            const existing = reg[sessionId];
            let finalAgent;
            if (agent && agent !== "unknown")
                finalAgent = agent;
            else if (existing && typeof existing.agent === "string" && existing.agent !== "unknown")
                finalAgent = existing.agent;
            else
                finalAgent = agent ?? "unknown";
            const existingDir = existing?.directory ?? existing?.cwd;
            const finalDir = validDir ?? (typeof existingDir === "string" && existingDir.length > 0 && existingDir.startsWith("/") ? existingDir : undefined);
            const finalCwd = finalDir;
            const finalRepo = finalDir ? basename(finalDir) : existing?.repo;
            // Parameter wins, else stored inherits; absent stays absent.
            // Fallback stays wire-time concern only.
            const existingModel = existing?.model;
            const finalModel = typeof model === "string" && model.length > 0
                ? model
                : typeof existingModel === "string" && existingModel.length > 0
                    ? existingModel
                    : undefined;
            const next = {
                sessionId,
                agent: finalAgent,
                directory: finalDir,
                cwd: finalCwd,
                repo: finalRepo,
                description: isGeneric ? (existing?.description ?? existing?.summary ?? fallback) : title,
                summary: isGeneric ? (existing?.summary ?? existing?.description ?? fallback) : title,
                title: isGeneric ? (existing?.title ?? title ?? fallback) : title,
                updatedAt: Date.now(),
                ...(finalModel !== undefined ? { model: finalModel } : {}),
            };
            // never persist '' directory — omit if undefined
            if (!finalDir) {
                delete next.directory;
                delete next.cwd;
            }
            if (finalRepo === undefined)
                delete next.repo;
            if (existing &&
                existing.description &&
                !isGenericTitle(existing.description) &&
                isGenericTitle(next.description)) {
                reg[sessionId] = { ...existing, updatedAt: Date.now() };
                return;
            }
            reg[sessionId] = next;
        });
    }
    catch (err) {
        if (!isLockContention(err))
            throw err;
    }
}
async function autoRegister(sessionId, directory, ctx, client) {
    const now = Date.now();
    const last = seenSessions.get(sessionId);
    // Why: debounce window is EVICT_GRACE_MS by definition (constants own the value).
    if (last && now - last.agentAt < EVICT_GRACE_MS && now - last.titleAt < EVICT_GRACE_MS) {
        ensureHeartbeat();
        ensureClaimer();
        return;
    }
    // Per-field freshness: stale fields proceed to enrichment with current values.
    seenSessions.set(sessionId, { agentAt: now, titleAt: now });
    ensureHeartbeat();
    ensureClaimer();
    try {
        const reg = (await readRegistry().catch(() => ({})));
        if (reg[sessionId]) {
            const { heartbeat } = await import("../registry.js");
            await heartbeat(sessionId);
            return;
        }
        const ident = client
            ? await resolveIdentity(client, sessionId, { directory }, ctx)
            : { agent: ctx?.agent ?? "unknown", title: null, directory };
        await upsertPresence(sessionId, ident.directory ?? directory, ident.agent, ident.title, "model" in ident ? ident.model : undefined);
    }
    catch { }
}
// pure: delivery is POST prompt_async, no file poll
async function deletePresence(sessionId) {
    // Fail-closed: contention still runs in-memory delete; disk waits for next writer.
    try {
        await atomicUpdateRegistry((reg) => {
            delete reg[sessionId];
        });
    }
    catch (err) {
        if (!isLockContention(err))
            throw err;
    }
    seenSessions.delete(sessionId);
}
// @ts-ignore — Plugin Hooks narrow ToolResult vs Promise<unknown> widen; typed Plugin preserved, no as unknown cast
const plugin = async (input) => {
    const client = input.client;
    liveClient = client;
    try {
        const { setLiveClient } = await import("../discovery.js");
        setLiveClient(client);
    }
    catch { }
    // Init record: one audit-file line per init via appendBootAudit carrying the live
    // stamp; screen output stays unchanged (the tests/mesh-delivery.test.ts console census locks zero new screen lines).
    try {
        await appendBootAudit(BUILD_STAMP, VERSION).catch(() => { });
    }
    catch { }
    ensureHeartbeat();
    configureClaimer({
        getOwnIds: () => [...seenSessions.keys()],
        getClient: () => liveClient ?? null,
        getRegistry: async () => (await readRegistry().catch(() => ({}))),
    });
    ensureClaimer();
    startAttachPoller();
    // Lazy tool imports at first use: mesh_send/mesh_peers reach node:sqlite
    // transitively, so no static edge may resolve at plugin load.
    const { mesh_peers } = await import("../tools/mesh_peers.js");
    const { mesh_send } = await import("../tools/mesh_send.js");
    return {
        event: async ({ event }) => {
            switch (event.type) {
                case "session.created": {
                    const info = event.properties.info;
                    const id = info.id;
                    if (!id)
                        return;
                    const now = Date.now();
                    const last = seenSessions.get(id);
                    if (last && now - last.agentAt < EVICT_GRACE_MS && now - last.titleAt < EVICT_GRACE_MS)
                        return;
                    seenSessions.set(id, { agentAt: now, titleAt: now });
                    const ident = await resolveIdentity(client, id, { agent: info.agent, directory: info.directory, title: info.title });
                    await upsertPresence(id, ident.directory ?? info.directory, ident.agent, ident.title, ident.model);
                    // Last-action stamp after the debounce guard: repeat firings inside
                    // the window cost zero writes; stamp failure drops, never throws.
                    try {
                        await stampLastAction(id);
                    }
                    catch { }
                    ensureHeartbeat();
                    ensureClaimer();
                    break;
                }
                case "session.updated": {
                    const info = event.properties.info;
                    const id = info.id;
                    if (!id)
                        return;
                    const ident = await resolveIdentity(client, id, { agent: info.agent, directory: info.directory, title: info.title });
                    const resolved = ident.title;
                    // Fail-closed: contention skips enrichment; in-memory updates still run for retry.
                    try {
                        await atomicUpdateRegistry(async (reg) => {
                            const existing = reg[id];
                            if (!existing)
                                return;
                            let mutated = false;
                            if (existing.agent === "unknown" &&
                                ident.agent !== "unknown" &&
                                typeof ident.agent === "string" &&
                                ident.agent.length > 0) {
                                existing.agent = ident.agent;
                                mutated = true;
                            }
                            const curDir = existing.directory ?? existing.cwd;
                            if ((!curDir || (typeof curDir === "string" && curDir.length === 0)) &&
                                ident.directory &&
                                typeof ident.directory === "string" &&
                                ident.directory.startsWith("/")) {
                                existing.directory = ident.directory;
                                existing.cwd = ident.directory;
                                existing.repo = basename(ident.directory);
                                mutated = true;
                            }
                            // Title gating: a generic title never clobbers a real one.
                            const kept = existing.description;
                            if (resolved && !isGenericTitle(resolved) && (!kept || isGenericTitle(kept))) {
                                existing.description = resolved;
                                existing.summary = resolved;
                                existing.title = resolved;
                                mutated = true;
                            }
                            // Model refresh: a non-empty live model overwrites, absent never
                            // clobbers (additive, staleness is bounded by live-first reads).
                            if (typeof ident.model === "string" &&
                                ident.model.length > 0 &&
                                existing.model !== ident.model) {
                                existing.model = ident.model;
                                mutated = true;
                            }
                            if (mutated)
                                existing.updatedAt = Date.now();
                        });
                    }
                    catch (err) {
                        if (!isLockContention(err))
                            throw err;
                    }
                    if (resolved && !isGenericTitle(resolved)) {
                        const cur = seenSessions.get(id);
                        if (cur)
                            seenSessions.set(id, { agentAt: cur.agentAt, titleAt: Date.now() });
                        else
                            seenSessions.set(id, { agentAt: Date.now(), titleAt: Date.now() });
                        // Non-generic title transitions stamp last action; stamp failure drops.
                        try {
                            await stampLastAction(id);
                        }
                        catch { }
                    }
                    if (ident.agent !== "unknown") {
                        const cur = seenSessions.get(id);
                        if (cur)
                            seenSessions.set(id, { agentAt: Date.now(), titleAt: cur.titleAt });
                    }
                    ensureClaimer();
                    break;
                }
                case "session.deleted": {
                    const info = event.properties.info;
                    const id = info.id;
                    if (!id)
                        return;
                    // Attached-exempt: the oracle still lists this id, so the delete
                    // path alone never removes it; expiry owns the transition.
                    try {
                        const reg = (await readRegistry().catch(() => ({})));
                        if (isAttachedExempt(reg[id]))
                            return;
                    }
                    catch { }
                    await deletePresence(id);
                    try {
                        const { appendDeleteAudit } = await import("../registry.js");
                        await appendDeleteAudit("session.deleted", [id]);
                    }
                    catch { }
                    break;
                }
                default:
                    return;
            }
        },
        "tool.execute.before": async (input) => {
            const sid = input.sessionID;
            if (!sid)
                return;
            const now = Date.now();
            const last = seenSessions.get(sid);
            if (last && now - last.agentAt < EVICT_GRACE_MS && now - last.titleAt < EVICT_GRACE_MS)
                return;
            seenSessions.set(sid, { agentAt: now, titleAt: now });
            const ctx = { agent: input.agent, directory: input.directory };
            const ident = await resolveIdentity(client, sid, undefined, ctx);
            await upsertPresence(sid, ident.directory, ident.agent, ident.title, ident.model);
            // Stamp placement follows session.created: after the debounce guard.
            try {
                await stampLastAction(sid);
            }
            catch { }
            ensureClaimer();
        },
        tool: {
            mesh_register: {
                ...mesh_register,
                async execute(args, ctx) {
                    const c = ctx;
                    await autoRegister(c.sessionID, c.directory, { agent: c.agent, directory: c.directory }, client);
                    return mesh_register.execute(args, ctx);
                },
            },
            mesh_peers: {
                ...mesh_peers,
                async execute(args, ctx) {
                    const c = ctx;
                    await autoRegister(c.sessionID, c.directory, { agent: c.agent, directory: c.directory }, client);
                    return mesh_peers.execute(args, ctx);
                },
            },
            mesh_send: {
                ...mesh_send,
                async execute(args, ctx) {
                    const c = ctx;
                    await autoRegister(c.sessionID, c.directory, { agent: c.agent, directory: c.directory }, client);
                    return mesh_send.execute(args, ctx);
                },
            },
            mesh_broadcast,
        },
        config: async (input) => {
            // Skill auto-load pushes skills root once; errors drop auto-load, copy fallback delivers.
            try {
                const cfg = input;
                const root = resolveSkillsRoot();
                if (!cfg.skills)
                    cfg.skills = {};
                const paths = cfg.skills.paths;
                if (Array.isArray(paths)) {
                    if (!paths.includes(root))
                        paths.push(root);
                }
                else {
                    cfg.skills.paths = [root];
                }
            }
            catch { }
        },
        dispose: async () => {
            // Scope invariant: dispose deletes own seenSessions ids only, past grace window.
            // Cross-process eviction belongs to runGc live-join; partial view never deletes alone.
            // Claimer teardown mirrors the scope: clear the poll timer and release owned unacked claims only.
            // Heartbeat teardown matches: a disposed instance must never tick into a later root.
            clearHeartbeatTimer();
            clearClaimerTimer();
            stopAttachPoller();
            await releaseClaimerOwner();
            const ids = [...seenSessions.keys()];
            if (ids.length === 0)
                return;
            let statusMap = null;
            try {
                const c = client;
                if (c.session?.status) {
                    const raw = (await c.session.status());
                    statusMap = unwrapStatusMap(raw);
                }
            }
            catch { }
            if (statusMap && Object.keys(statusMap).length === 0)
                statusMap = null; // empty view is unknown, never a delete signal
            const now = Date.now();
            const deleted = [];
            // Fail-closed: contention skips the disk write while timer clear,
            // claimer release, audit attempt, and in-memory deletes still run;
            // teardown paths never throw a lock error to the host.
            try {
                await atomicUpdateRegistry((reg) => {
                    for (const id of ids) {
                        const entry = reg[id];
                        if (!entry)
                            continue;
                        // Attached-exempt regardless of age: dispose never deletes an attached id.
                        if (isAttachedExempt(entry))
                            continue;
                        if (statusMap && !(id in statusMap)) {
                            if (typeof entry.updatedAt === "number" && now - entry.updatedAt <= EVICT_GRACE_MS)
                                continue;
                            delete reg[id];
                            deleted.push(id);
                        }
                    }
                });
            }
            catch (err) {
                if (!isLockContention(err))
                    throw err;
            }
            try {
                const { appendDeleteAudit } = await import("../registry.js");
                await appendDeleteAudit("dispose", deleted);
            }
            catch { }
            for (const id of ids) {
                seenSessions.delete(id);
            }
        },
    };
};
export default plugin;
//# sourceMappingURL=opencode-mesh.js.map
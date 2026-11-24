// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Single owner for identity plus title gating.
// Generic-title predicate mirrors opencode Session.isDefaultTitle; null and empty read generic.
import { resolveMeshModel } from "./outbox.js";
import { resolveValidDir } from "./xdg.js";
/** Generic-title predicate; null and empty read generic, never clobbers real titles. */
export function isGenericTitle(t) {
    return !t || /^((New session - )|(Child session - ))\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t);
}
/**
 * Display identity from explicit info, live fetch, then context.
 * Live fetch also reads model plus variant for registry learning.
 */
export async function resolveIdentity(client, sessionId, info, ctx) {
    let fetched = null;
    try {
        const c = client;
        if (c?.session?.get) {
            const raw = (await c.session.get({ path: { id: sessionId } }));
            if (raw && typeof raw === "object")
                fetched = raw;
        }
        // Why: best-effort — live identity fetch failure degrades to anonymous.
    }
    catch { }
    const getField = (k) => {
        if (!fetched)
            return undefined;
        const direct = fetched[k];
        if (typeof direct === "string" && direct.length > 0)
            return direct;
        const infoObj = fetched.info;
        const nested = infoObj?.[k];
        if (typeof nested === "string" && nested.length > 0)
            return nested;
        return undefined;
    };
    // agent priority: info.agent -> fetched.agent -> ctx.agent -> unknown
    const rawAgent = info?.agent ?? getField("agent") ?? ctx?.agent;
    const agent = typeof rawAgent === "string" && rawAgent.length > 0 ? rawAgent : "unknown";
    // directory priority: info.directory -> fetched.directory -> ctx.directory -> undefined (never '')
    const rawDir = info?.directory ?? getField("directory") ?? ctx?.directory;
    const dirFence = resolveValidDir(rawDir);
    const directory = dirFence.kind === "valid" ? dirFence.dir : undefined;
    // title priority: info.title -> fetched.title -> null
    const rawTitle = info?.title ?? getField("title") ?? null;
    const title = typeof rawTitle === "string" && rawTitle.length > 0 ? rawTitle : null;
    // model/variant ride the same fetch for display plus upsertPresence learning.
    const model = readModelString(fetched);
    const variant = readVariantString(fetched);
    return {
        agent,
        title,
        directory,
        ...(model !== undefined ? { model } : {}),
        ...(variant !== undefined ? { variant } : {}),
    };
}
/** Live model as providerID/modelID string; accepts registry, blob, and info shapes. */
function readModelString(fetched) {
    if (!fetched)
        return undefined;
    const infoObj = fetched.info;
    const raw = fetched.model ?? infoObj?.model;
    if (typeof raw === "string" && raw.length > 0)
        return raw;
    if (raw && typeof raw === "object") {
        const blob = raw;
        const providerID = blob.providerID;
        const modelID = blob.modelID ?? blob.id;
        const validProvider = typeof providerID === "string" && providerID.length > 0;
        const validModel = typeof modelID === "string" && modelID.length > 0;
        if (validProvider && validModel)
            return `${providerID}/${modelID}`;
    }
    return undefined;
}
/** Read the live variant string from the row, `info`, or the model blob. */
function readVariantString(fetched) {
    if (!fetched)
        return undefined;
    const infoObj = fetched.info;
    const modelBlob = (fetched.model ?? infoObj?.model);
    const blobVariant = modelBlob && typeof modelBlob === "object" ? modelBlob.variant : undefined;
    const raw = fetched.variant ?? infoObj?.variant ?? blobVariant;
    return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}
/**
 * Row parser for every layer; unusable rows read miss, never guessed triples.
 * Variant carries only when known and non-default; no membership checks.
 */
function parseSessionRowToWireDetailed(row, source, missReason = source === "db" ? "db-parse-fail" : "live-miss-parse") {
    if (!row || typeof row !== "object")
        return { miss: missReason };
    const rec = row;
    const infoObj = rec.info;
    const rawAgent = rec.agent ?? infoObj?.agent;
    if (typeof rawAgent !== "string" || rawAgent.length === 0 || rawAgent === "unknown")
        return { miss: missReason };
    // DB cells carry JSON blobs; decode here for one shape, miss on failure.
    let modelRow = rec;
    const cellModel = rec.model ?? infoObj?.model;
    if (typeof cellModel === "string" && cellModel.trimStart().startsWith("{")) {
        try {
            const decoded = JSON.parse(cellModel);
            if (!decoded || typeof decoded !== "object")
                return { miss: missReason };
            modelRow = { ...rec, model: decoded };
        }
        catch {
            return { miss: missReason };
        }
    }
    const modelStr = readModelString(modelRow);
    if (typeof modelStr !== "string" || modelStr.length === 0)
        return { miss: missReason };
    const out = {
        agent: rawAgent,
        model: resolveMeshModel({ model: modelStr }),
        source,
    };
    const variantStr = readVariantString(modelRow);
    if (typeof variantStr === "string" && variantStr.length > 0 && variantStr !== "default") {
        out.variant = variantStr;
    }
    return { receiver: out };
}
/**
 * Receiver resolution across live, direct, db, and registry; miss reads null.
 * Skipped layers leave no step; every failure reads as miss, never throws.
 */
export async function resolveReceiverWireDetailed(client, targetId, registryEntry, extra) {
    const trail = [];
    try {
        const c = client;
        if (c?.session?.get) {
            try {
                const raw = await c.session.get({ path: { id: targetId } });
                const parsed = parseSessionRowToWireDetailed(raw, "live", "live-miss-parse");
                if ("receiver" in parsed)
                    return { receiver: parsed.receiver, trail };
                trail.push({ layer: "live", reason: "live-miss-parse" });
            }
            catch {
                trail.push({ layer: "live", reason: "live-throw" });
            }
        }
        // Why: best-effort — receiver resolution failure must not crash the discovery path.
    }
    catch { }
    if (extra?.directRow !== undefined && extra.directRow !== null) {
        const viaDirect = parseSessionRowToWireDetailed(extra.directRow, "live", "direct-parse-fail");
        if ("receiver" in viaDirect)
            return { receiver: viaDirect.receiver, trail };
        trail.push({ layer: "direct", reason: "direct-parse-fail" });
    }
    let dbEvidence;
    try {
        const { readDbTripleDetailed } = await import("./discovery.js");
        const triple = await readDbTripleDetailed(targetId);
        if (triple.ok) {
            const viaDb = parseSessionRowToWireDetailed(triple.triple, "db", "db-parse-fail");
            if ("receiver" in viaDb)
                return { receiver: viaDb.receiver, trail };
            trail.push({ layer: "db", reason: "db-parse-fail" });
        }
        else {
            trail.push({ layer: "db", reason: triple.reason });
            if (triple.reason === "db-throw") {
                const t = triple;
                dbEvidence = {
                    dbPath: t.dbPath,
                    ...(t.dbCode !== undefined ? { dbCode: t.dbCode } : {}),
                    ...(t.dbError !== undefined ? { dbError: t.dbError } : {}),
                };
            }
            else {
                dbEvidence = { dbPath: triple.dbPath };
            }
        }
    }
    catch {
        trail.push({ layer: "db", reason: "db-throw" });
    }
    const entryAgent = registryEntry?.agent;
    const entryModel = registryEntry?.model;
    if (typeof entryAgent === "string" &&
        entryAgent.length > 0 &&
        entryAgent !== "unknown" &&
        typeof entryModel === "string" &&
        entryModel.length > 0) {
        return {
            receiver: {
                agent: entryAgent,
                model: resolveMeshModel({ model: entryModel }),
                source: "registry",
            },
            trail,
            ...(dbEvidence !== undefined ? { dbEvidence } : {}),
        };
    }
    if (registryEntry === null || registryEntry === undefined) {
        trail.push({ layer: "registry", reason: "registry-absent" });
    }
    else if (typeof entryAgent !== "string" || entryAgent.length === 0 || entryAgent === "unknown") {
        trail.push({ layer: "registry", reason: "registry-unknown-agent" });
    }
    else {
        trail.push({ layer: "registry", reason: "registry-no-model" });
    }
    return { receiver: null, trail, ...(dbEvidence !== undefined ? { dbEvidence } : {}) };
}
/** Thin wrapper over `resolveReceiverWireDetailed`: identical decisions, evidence discarded. */
export async function resolveReceiverWire(client, targetId, registryEntry, extra) {
    const detailed = await resolveReceiverWireDetailed(client, targetId, registryEntry, extra);
    return detailed.receiver;
}
//# sourceMappingURL=identity.js.map
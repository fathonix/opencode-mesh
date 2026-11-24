// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Mesh registry with STALE_TTL pruning and flock-guarded writes.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_OPENCODE_PORT, FILE_MODE, LOCK_OUTER_ROUNDS, OPENCODE_PORT, ROUTE_PROBE_TIMEOUT_MS, STALE_TTL_MS, EVICT_GRACE_MS } from "./constants.js";
import { getServerAuthHeaderSync } from "./serverAuth.js";
import { ensureDir0700, writeAtomic } from "./fsAtomic.js";
import { MeshError } from "./errors.js";
import { BUILD_STAMP } from "./version.js";
import { resolveMeshRoot, resolveRegistryPath } from "./xdg.js";
/** Normalize entry aliases: description↔summary, cwd↔directory, repo derived, title fallback. */
export function normalizeEntry(entry) {
    const e = { ...entry };
    // legacy daemon key stripped — never persisted for new rows
    if ("daemon" in e)
        delete e.daemon;
    // repo computed via basename(directory) — keep for compat but derived if missing
    if (!e.repo && (e.directory || e.cwd))
        e.repo = (e.directory || e.cwd).split("/").pop() || undefined;
    // summary/cwd are read-alias only for legacy rows — synthesize if missing
    const desc = e.description;
    const summ = e.summary;
    if (!desc && summ)
        e.description = summ;
    if (!summ && desc)
        e.summary = desc;
    const dir = e.directory;
    const cwd = e.cwd;
    if (!cwd && dir)
        e.cwd = dir;
    if (!dir && cwd)
        e.directory = cwd;
    // directory never '' — delete if empty or not absolute
    const d = e.directory;
    if (typeof d === "string" && (d.length === 0 || !d.startsWith("/"))) {
        delete e.directory;
        delete e.cwd;
    }
    const t = e.title;
    const d2 = e.description;
    if (!t && d2)
        e.title = d2;
    // Why: serve columns deleted as trusted route state — strip on sight, valid or
    // not. Loopback pin owns routing; enumeration owns multi-instance discovery.
    if ("serveUrl" in e)
        delete e.serveUrl;
    if ("servePort" in e)
        delete e.servePort;
    // Display-only rank keys are wire-only: strip on sight, never persisted.
    for (const k of ["attachedRank", "dirRank", "agentRank", "recencyRank", "titleRank", "rank"]) {
        if (k in e)
            delete e[k];
    }
    return e;
}
/** Re-exported stale TTL for consumers (canonical in constants.ts). */
export { STALE_TTL_MS } from "./constants.js";
// In-process mutex to serialize registry writes; combined with fs flock for cross-process safety.
let registryChain = Promise.resolve();
function withRegistryChain(fn) {
    const p = registryChain.then(fn, fn);
    registryChain = p.then(() => { }, () => { });
    return p;
}
/** Atomic RMW holding registryChain across read→mutate→write (prevents heartbeat lost-update). */
export async function atomicUpdateRegistry(fn, meshRoot) {
    await withRegistryChain(async () => {
        // Herd armor: inner lock throws EEXIST under burst; bounded jitter retries.
        // Exhaustion rethrows, never half-writes; outer bound owns bursts.
        let lastErr = null;
        for (let round = 0; round < LOCK_OUTER_ROUNDS; round++) {
            try {
                await writeUnderLock(fn, meshRoot);
                return;
            }
            catch (err) {
                if (err?.code !== "EEXIST")
                    throw err;
                lastErr = err;
                await new Promise((r) => setTimeout(r, 50 + Math.random() * 200));
            }
        }
        throw lastErr;
    });
}
async function writeUnderLock(fn, meshRoot) {
    const mod = await import("./fsAtomic.js");
    await mod.withRegistryLock(async () => {
        // Why: corrupt-then-wipe guard. A present but unparseable store fails
        // loud before any mutation persists. Missing files still write fresh.
        const target = resolveRegistryPath(meshRoot);
        let raw = null;
        try {
            raw = await readFile(target, "utf8");
        }
        catch {
            raw = null;
        }
        if (raw !== null) {
            try {
                JSON.parse(raw);
            }
            catch {
                throw new MeshError("STORAGE_CORRUPT", `registry unreadable, refusing write: ${target}`);
            }
        }
        const reg = await readRegistry(meshRoot);
        await fn(reg);
        for (const [k, v] of Object.entries(reg))
            reg[k] = normalizeEntry(v);
        const pruned = pruneStale(reg);
        const root = meshRoot ?? resolveMeshRoot();
        await ensureDir0700(resolve(target, "..") === root ? root : resolve(target, ".."));
        // migratedAt set once on migration, not on every heartbeat — preserve existing
        let existingMigratedAt;
        try {
            const rawData = await readFile(target, "utf8");
            const rawDoc = JSON.parse(rawData);
            if (rawDoc && typeof rawDoc.migratedAt === "number")
                existingMigratedAt = rawDoc.migratedAt;
            // Why: best-effort — registry read or parse failure must not block the session.
        }
        catch { }
        const doc = {
            version: 1,
            entries: pruned,
            migratedAt: existingMigratedAt ?? Date.now(),
        };
        await writeAtomic(target, JSON.stringify(doc, null, 2), {
            mode: FILE_MODE,
        });
    }, meshRoot);
}
/** Read registry from the mesh root. */
export async function readRegistry(meshRoot) {
    const target = resolveRegistryPath(meshRoot);
    let data = null;
    try {
        data = await readFile(target, "utf8");
    }
    catch {
        data = null;
    }
    let parsed = {};
    if (data) {
        try {
            const raw = JSON.parse(data);
            if (raw && typeof raw.version === "number" && raw.version === 1 && raw.entries) {
                parsed = raw.entries;
            }
            else {
                parsed = raw;
            }
        }
        catch {
            parsed = {};
        }
    }
    for (const [k, v] of Object.entries(parsed))
        parsed[k] = normalizeEntry(v);
    return pruneStale(parsed);
}
/** Heartbeat — update updatedAt for sessionId and persist. */
export async function heartbeat(sessionId, meshRoot) {
    await atomicUpdateRegistry((reg) => {
        if (reg[sessionId])
            reg[sessionId].updatedAt = Date.now();
    }, meshRoot);
}
/** Drop entries older than STALE_TTL_MS. */
export function pruneStale(registry, now = Date.now()) {
    const out = {};
    for (const [k, v] of Object.entries(registry)) {
        if (now - v.updatedAt <= STALE_TTL_MS)
            out[k] = v;
    }
    return out;
}
/**
 * Unwrap data-wrapped or raw status payloads; null on other shapes, deletes zero.
 */
export function unwrapStatusMap(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const maybe = raw;
        if (maybe.data && typeof maybe.data === "object")
            return maybe.data;
        return raw;
    }
    return null;
}
/** Fetch live status; null on failure, unwraps data wrapper via unwrapStatusMap. */
export async function fetchSessionStatusMap(port = OPENCODE_PORT) {
    try {
        const auth = getServerAuthHeaderSync();
        const headers = {};
        if (auth)
            headers.Authorization = auth;
        const res = await fetch(`http://127.0.0.1:${port}/session/status`, { headers, signal: AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS) });
        if (!res.ok)
            return null;
        const raw = (await res.json());
        return unwrapStatusMap(raw);
    }
    catch {
        return null;
    }
}
/** Single-port guard: live map when one port answers, null on split or empty. */
export async function fetchSinglePortStatusMap() {
    const primary = await fetchSessionStatusMap(OPENCODE_PORT);
    if (OPENCODE_PORT === DEFAULT_OPENCODE_PORT)
        return primary && Object.keys(primary).length > 0 ? primary : null;
    const fallback = await fetchSessionStatusMap(DEFAULT_OPENCODE_PORT);
    const pKeys = primary ? Object.keys(primary) : [];
    const fKeys = fallback ? Object.keys(fallback) : [];
    if (pKeys.length > 0 && fKeys.length > 0 && pKeys.some((k) => !fKeys.includes(k)) && fKeys.some((k) => !pKeys.includes(k)))
        return null;
    if (pKeys.length > 0)
        return primary;
    if (fKeys.length > 0)
        return fallback;
    return null;
}
/**
 * Delete ids absent from status view; null or young ids delete zero.
 */
export function pruneDeadByStatus(registry, statusMap, now = Date.now()) {
    if (!statusMap || Object.keys(statusMap).length === 0)
        return 0;
    let n = 0;
    for (const [id, e] of Object.entries(registry)) {
        if (!(id in statusMap) && now - e.updatedAt > EVICT_GRACE_MS) {
            delete registry[id];
            n++;
        }
    }
    return n;
}
/** Delete audit to audit.log; twin writer with appendDeliveryAudit, separate vocabularies. */
export async function appendDeleteAudit(reason, ids, meshRoot) {
    if (ids.length === 0)
        return;
    try {
        const { appendFile, chmod } = await import("node:fs/promises");
        const { resolve } = await import("node:path");
        const root = meshRoot ?? resolveMeshRoot();
        const target = resolve(root, "audit.log");
        const now = Date.now();
        const lines = ids.map((id) => JSON.stringify({ at: now, reason, id }) + "\n").join("");
        try {
            await appendFile(target, lines, { mode: FILE_MODE });
        }
        catch {
            await appendFile(target, lines);
        }
        try {
            await chmod(target, FILE_MODE);
            // Why: best-effort — chmod failure must not block the delete audit.
        }
        catch { }
        // Why: best-effort — audit write failure must not block the registry operation.
    }
    catch { }
}
/** Best-effort delivery audit: one JSON line per event to `<meshRoot>/audit.log`. Never throws. */
export async function appendDeliveryAudit(event, detail, meshRoot) {
    try {
        const { appendFile, chmod } = await import("node:fs/promises");
        const { resolve } = await import("node:path");
        const root = meshRoot ?? resolveMeshRoot();
        const target = resolve(root, "audit.log");
        const line = JSON.stringify({ at: Date.now(), event, build: BUILD_STAMP, ...detail }) + "\n";
        try {
            await appendFile(target, line, { mode: FILE_MODE });
        }
        catch {
            await appendFile(target, line);
        }
        try {
            await chmod(target, FILE_MODE);
            // Why: best-effort — chmod failure must not block the delivery audit.
        }
        catch { }
        // Why: best-effort — audit write failure must not block the delivery path.
    }
    catch { }
}
/** Audit-file line per init to audit.log; carries build plus version plus pid, never read by wire. */
export async function appendBootAudit(build, version, meshRoot) {
    try {
        const { appendFile, chmod } = await import("node:fs/promises");
        const { resolve } = await import("node:path");
        const root = meshRoot ?? resolveMeshRoot();
        const target = resolve(root, "audit.log");
        const line = JSON.stringify({ at: Date.now(), event: "mesh.boot", build, version, pid: process.pid }) + "\n";
        try {
            await appendFile(target, line, { mode: FILE_MODE });
        }
        catch {
            await appendFile(target, line);
        }
        try {
            await chmod(target, FILE_MODE);
            // Why: best-effort — chmod failure must not block the boot audit.
        }
        catch { }
        // Why: best-effort — audit write failure must not block the boot path.
    }
    catch { }
}
/** Persist confirmed-dead deletions through the single writer. No-op on null or keyless map. */
export async function persistConfirmedDead(statusMap, meshRoot) {
    if (!statusMap || Object.keys(statusMap).length === 0)
        return 0;
    let deleted = 0;
    const deletedIds = [];
    await atomicUpdateRegistry((reg) => {
        const before = new Set(Object.keys(reg));
        deleted = pruneDeadByStatus(reg, statusMap);
        for (const id of before)
            if (!(id in reg))
                deletedIds.push(id);
    }, meshRoot);
    await appendDeleteAudit("persist-confirmed-dead", deletedIds, meshRoot);
    return deleted;
}
//# sourceMappingURL=registry.js.map
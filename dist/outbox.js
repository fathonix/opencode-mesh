// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Mesh-owned durable queue with atomic claim (single owner).
// One row per delivery, FIFO per target via seq; SQLite transactions own concurrency, never a file lock.
import { existsSync } from "node:fs";
import { chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { FILE_MODE, MSG_ID_B62_LEN, MSG_ID_HEX_LEN, MSG_ID_PREFIX, ONE_MB, OUTBOX_CLAIM_TIMEOUT_MS, OUTBOX_DEPTH_CAP, OUTBOX_MAX_ATTEMPTS, OUTBOX_TTL_MS, OUTBOX_VACUUM_MIN_PAGES } from "./constants.js";
import { MeshError } from "./errors.js";
import { ensureDir0700, fsyncDir, isNoSpace, writeAtomic } from "./fsAtomic.js";
import { BUILD_STAMP } from "./version.js";
import { resolveOutboxPath, sanitizeSessionId } from "./xdg.js";
import { dirname, resolve } from "node:path";
const OUTBOX_DDL = `CREATE TABLE IF NOT EXISTS outbox(
seq INTEGER PRIMARY KEY AUTOINCREMENT,
id TEXT UNIQUE NOT NULL,
target_session TEXT NOT NULL,
from_session TEXT NOT NULL,
from_agent TEXT NOT NULL,
text TEXT NOT NULL,
created_at INTEGER NOT NULL,
broadcast_id TEXT,
claimed_by TEXT,
claimed_at INTEGER,
delivered_at INTEGER,
attempts INTEGER NOT NULL DEFAULT 0,
silent INTEGER NOT NULL DEFAULT 0,
fail_reason TEXT
)`;
const OUTBOX_INDEX_TARGET = `CREATE INDEX IF NOT EXISTS idx_outbox_target_seq ON outbox(target_session, seq)`;
const OUTBOX_INDEX_CLAIM = `CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox(claimed_by, delivered_at)`;
/** Single-owned size guard: all three points live here; throws 413, never clips. */
export function assertSendable(text, prefixLength = 0) {
    const textBytes = Buffer.byteLength(text, "utf8");
    if (textBytes > ONE_MB)
        throw new MeshError("PAYLOAD_TOO_LARGE", `1MB guard 413: text ${textBytes} exceeds ${ONE_MB}`);
    if (prefixLength + 2 + textBytes > ONE_MB)
        throw new MeshError("PAYLOAD_TOO_LARGE", `1MB guard 413: prefixed ${prefixLength + 2 + textBytes} exceeds ${ONE_MB}`);
}
/** Serialized-body point of the same guard: bodies at or over 1MB refuse. */
export function assertBodySendable(bodyBytes) {
    if (bodyBytes >= ONE_MB)
        throw new MeshError("PAYLOAD_TOO_LARGE", `1MB guard 413: body ${bodyBytes} >= ${ONE_MB}`);
}
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let msgCounter = 0;
/** Single-owner branded message ID (12 hex plus 14 base62; counter orders, random uniquifies). */
export function newMessageId() {
    const hex = randomBytes(MSG_ID_HEX_LEN / 2).toString("hex");
    msgCounter = (msgCounter + 1) % 0xffffffff;
    const buf = randomBytes(10);
    buf.writeUInt32BE(msgCounter, 6);
    let n = BigInt(`0x${buf.toString("hex")}`);
    let s = "";
    for (let i = 0; i < MSG_ID_B62_LEN; i++) {
        s = B62[Number(n % 62n)] + s;
        n /= 62n;
    }
    return `${MSG_ID_PREFIX}${hex}${s}`;
}
/** Brand predicate for the msg_ alphabet (row keys are equality-matched, never brand-checked). */
export function isMsgId(s) {
    return /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(s);
}
/**
 * Mesh model parser over a verified-present model token; slash-less takes the opencode provider prefix.
 * Absent never reaches here (every caller guards; missing reads null at the resolver and defers, never synthesizes).
 */
export function resolveMeshModel(entry) {
    const raw = entry?.model;
    if (typeof raw !== "string" || raw.length === 0)
        throw new Error("resolveMeshModel requires a verified-present model token");
    const i = raw.indexOf("/");
    if (i > 0)
        return { providerID: raw.slice(0, i), modelID: raw.slice(i + 1) };
    return { providerID: "opencode", modelID: raw };
}
/** Shared lazy sqlite loader (single fork point). Tries `bun:sqlite` where the
 * Bun marker is present, else `node:sqlite`; throws STORAGE_UNAVAILABLE when
 * neither driver resolves. Call sites keep their SQL plus PRAGMA text verbatim. */
export async function loadSqlite() {
    if (hasBunMarker()) {
        try {
            // @ts-ignore — bun:sqlite types exist only under Bun; Node benches resolve this leg lazily at runtime.
            const m = (await import("bun:sqlite"));
            const Raw = (m.Database ?? m.DatabaseSync);
            if (typeof Raw === "function")
                return wrapCtor(Raw, true);
            // Why: best-effort — bun:sqlite driver not available must not block SQLite loading.
        }
        catch { }
    }
    try {
        const m = await import("node:sqlite");
        return wrapCtor(m.DatabaseSync, false);
    }
    catch (err) {
        throw new MeshError("STORAGE_UNAVAILABLE", `outbox unavailable: ${String(err?.message ?? err)}`);
    }
}
/** Bun runtime marker (exact predicate: version flag plus global). */
function hasBunMarker() {
    try {
        if (typeof process.versions?.bun === "string")
            return true;
        if (typeof globalThis.Bun !== "undefined")
            return true;
        // Why: best-effort — bun version detection failure must not block driver selection.
    }
    catch { }
    return false;
}
function normalizeChanges(res) {
    const c = res?.changes;
    if (typeof c === "bigint")
        return Number(c); // BigInt (bun:sqlite) to Number (node:sqlite parity)
    return Number(c ?? 0);
}
function adaptStatement(raw) {
    const s = raw;
    // Bind to the statement handle: both drivers' methods require receiver `this`.
    const get = typeof s.get === "function" ? s.get.bind(raw) : undefined;
    const all = typeof s.all === "function" ? s.all.bind(raw) : undefined;
    const run = typeof s.run === "function" ? s.run.bind(raw) : undefined;
    return {
        get: (...p) => (get ? get(...p) : undefined),
        all: (...p) => (all ? all(...p) : []),
        run: (...p) => {
            if (run)
                return { changes: normalizeChanges(run(...p)) };
            return { changes: 0 };
        },
    };
}
function adaptDb(raw) {
    const db = raw;
    // Bind to the db handle: both drivers' methods require receiver `this`.
    const prepareRaw = db.prepare;
    const queryRaw = db.query;
    const execRaw = db.exec;
    const closeRaw = db.close;
    const prepare = typeof prepareRaw === "function" ? prepareRaw.bind(raw) : undefined;
    const query = typeof queryRaw === "function" ? queryRaw.bind(raw) : undefined;
    const exec = typeof execRaw === "function" ? execRaw.bind(raw) : undefined;
    const close = typeof closeRaw === "function" ? closeRaw.bind(raw) : undefined;
    return {
        exec: (sql) => {
            if (exec)
                exec(sql);
        },
        prepare: (sql) => {
            if (prepare)
                return adaptStatement(prepare(sql));
            if (query)
                return adaptStatement(query(sql));
            throw new MeshError("STORAGE_UNAVAILABLE", "outbox unavailable: driver has no prepare/query");
        },
        close: () => {
            try {
                close?.();
                // Why: best-effort — DB close failure must not block the adapter cleanup.
            }
            catch { }
        },
    };
}
function wrapCtor(Raw, isBun) {
    function Ctor(path, options) {
        // node:sqlite rejects an explicit undefined options arg; bun accepts omission.
        // Pass options only when defined so both drivers open identically.
        if (options === undefined)
            return adaptDb(new Raw(path));
        if (isBun) {
            // bun:sqlite opens read-only via lowercase `readonly`; camelCase is ignored.
            // Defined-but-absent stays omission so both drivers open identically.
            if (options.readOnly === undefined)
                return adaptDb(new Raw(path));
            return adaptDb(new Raw(path, { readonly: options.readOnly }));
        }
        return adaptDb(new Raw(path, options));
    }
    return Ctor;
}
// Erased shape: drivers resolve lazily in loadSqlite; zero static edges.
// Adapter normalizes exec/prepare/close; covered by the loadSqlite lazy-driver suite.
function isUnavailable(err) {
    return err instanceof MeshError && err.code === "STORAGE_UNAVAILABLE";
}
function storageError(err) {
    const code = err?.code ?? "";
    const errno = err?.errno;
    const errcode = err?.errcode;
    if (isNoSpace(err) || code.includes("FULL") || errno === 13 || errcode === 13)
        return new MeshError("STORAGE_FULL", `outbox full: ${String(err?.message ?? err)}`);
    if (code.includes("CORRUPT") || errno === 11)
        return new MeshError("STORAGE_CORRUPT", `outbox corrupt: ${String(err?.message ?? err)}`);
    throw err;
}
async function openOutbox(meshRoot) {
    const Ctor = await loadSqlite();
    const target = resolveOutboxPath(meshRoot);
    const db = new Ctor(target);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = FULL");
    db.exec(OUTBOX_DDL);
    db.exec(OUTBOX_INDEX_TARGET);
    db.exec(OUTBOX_INDEX_CLAIM);
    // Additive migration: old DBs gain silent on first open; rows read 0.
    // PRAGMA skips migrated DBs; duplicate-column catch guards races.
    try {
        const cols = db.prepare(`PRAGMA table_info(outbox)`).all();
        if (!cols.some((c) => c?.name === "silent")) {
            try {
                db.exec(`ALTER TABLE outbox ADD COLUMN silent INTEGER NOT NULL DEFAULT 0`);
            }
            catch (err) {
                if (!/duplicate column/i.test(String(err?.message ?? err)))
                    throw err;
            }
        }
        // Additive migration: old DBs gain fail_reason on first open; rows read NULL.
        // Same PRAGMA plus catch for races; column exists before queries run.
        if (!cols.some((c) => c?.name === "fail_reason")) {
            try {
                db.exec(`ALTER TABLE outbox ADD COLUMN fail_reason TEXT`);
            }
            catch (err) {
                if (!/duplicate column/i.test(String(err?.message ?? err)))
                    throw err;
            }
        }
        // Additive migrations: old DBs gain sender_build plus miss pair plus build.
        // Same PRAGMA plus catch per column; pre-migration rows read NULL.
        for (const name of ["sender_build", "miss_layer", "miss_reason", "build"]) {
            if (!cols.some((c) => c?.name === name)) {
                try {
                    db.exec(`ALTER TABLE outbox ADD COLUMN ${name} TEXT`);
                }
                catch (err) {
                    if (!/duplicate column/i.test(String(err?.message ?? err)))
                        throw err;
                }
            }
        }
    }
    catch (err) {
        if (!/duplicate column/i.test(String(err?.message ?? err)))
            throw err;
    }
    return db;
}
/** Ensure dir 0700 plus first-byte file 0600 through the atomic path, then open. */
export async function ensureOutbox(meshRoot) {
    const target = resolveOutboxPath(meshRoot);
    await ensureDir0700(dirname(resolve(target)));
    if (!existsSync(target)) {
        await writeAtomic(target, "", { mode: FILE_MODE });
        try {
            chmodSync(target, FILE_MODE);
            // Why: best-effort — chmod failure must not block outbox creation.
        }
        catch { }
        await fsyncDir(dirname(resolve(target)));
    }
    return target;
}
async function withDb(meshRoot, fn) {
    const db = await openOutbox(meshRoot);
    try {
        return fn(db);
    }
    finally {
        try {
            db.close();
            // Why: best-effort — DB close failure must not block the withDb wrapper.
        }
        catch { }
    }
}
/** Enqueue one canonical row. ONE_MB guard runs before any transaction. */
export async function enqueue(input, meshRoot) {
    sanitizeSessionId(input.target_session);
    sanitizeSessionId(input.from_session);
    assertSendable(input.text);
    await ensureOutbox(meshRoot);
    const id = input.id ?? newMessageId();
    const now = Date.now();
    try {
        return await withDb(meshRoot, (db) => {
            // Why: idempotency lookup: envelope id already present → duplicate no-op.
            if (input.id) {
                const dup = db.prepare(`SELECT id FROM outbox WHERE id = ?`).get(input.id);
                if (dup?.id === input.id)
                    return input.id;
            }
            // Why: depth cap: overflow rejects newest with STORAGE_FULL, never silent drop.
            const depth = db
                .prepare(`SELECT COUNT(*) AS n FROM outbox WHERE target_session = ? AND delivered_at IS NULL`)
                .get(input.target_session);
            if (Number(depth?.n ?? 0) >= OUTBOX_DEPTH_CAP)
                throw new MeshError("STORAGE_FULL", `outbox depth cap: ${input.target_session} holds ${OUTBOX_DEPTH_CAP}, newest rejected`);
            try {
                db.prepare(`INSERT INTO outbox(id,target_session,from_session,from_agent,text,created_at,broadcast_id,silent,sender_build) VALUES(?,?,?,?,?,?,?,?,?)`).run(id, input.target_session, input.from_session, input.from_agent, input.text, now, input.broadcast_id ?? null, input.silent === true ? 1 : 0, BUILD_STAMP);
            }
            catch (err) {
                // Lost insert race under the UNIQUE(id) key: re-lookup decides.
                if (/constraint|unique/i.test(String(err?.message ?? err))) {
                    const raced = db.prepare(`SELECT id FROM outbox WHERE id = ?`).get(id);
                    if (raced?.id === id)
                        return id;
                }
                throw storageError(err);
            }
            return id;
        });
    }
    catch (err) {
        throw storageError(err);
    }
}
/**
 * Atomically claim the oldest unclaimed undelivered row per target session.
 * Lost race returns [] (fail-closed, never throws). Limit bounds rows per target.
 */
export async function claim(targetSessions, owner, limitPerTarget = 1, meshRoot) {
    const ids = [...new Set(targetSessions)];
    for (const id of ids)
        sanitizeSessionId(id);
    if (ids.length === 0 || limitPerTarget < 1)
        return [];
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const claimed = [];
            const pick = db.prepare(`SELECT * FROM outbox WHERE target_session = ? AND claimed_by IS NULL AND delivered_at IS NULL AND fail_reason IS NULL ORDER BY seq ASC LIMIT ?`);
            const take = db.prepare(`UPDATE outbox SET claimed_by = ?, claimed_at = ? WHERE id = ? AND claimed_by IS NULL AND delivered_at IS NULL AND fail_reason IS NULL`);
            for (const target of ids) {
                db.exec("BEGIN IMMEDIATE");
                try {
                    const rows = pick.all(target, limitPerTarget);
                    for (const row of rows) {
                        const at = Date.now();
                        const res = take.run(owner, at, row.id);
                        if (Number(res.changes) === 1)
                            claimed.push({ ...row, claimed_by: owner, claimed_at: at });
                    }
                    db.exec("COMMIT");
                }
                catch {
                    try {
                        db.exec("ROLLBACK");
                    }
                    catch { }
                }
            }
            return claimed;
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return [];
        throw err;
    }
}
/** Ack delivery. Only the owning claimer affects the row; foreign owner affects zero. */
export async function ack(id, owner, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const res = db.prepare(`UPDATE outbox SET delivered_at = ? WHERE id = ? AND claimed_by = ?`).run(Date.now(), id, owner);
            return Number(res.changes) === 1;
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return false;
        throw err;
    }
}
/** Release a claim for redelivery. Only the owning claimer affects the row. */
export async function release(id, owner, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const res = db
                .prepare(`UPDATE outbox SET claimed_by = NULL, claimed_at = NULL, attempts = attempts + 1 WHERE id = ? AND claimed_by = ?`)
                .run(id, owner);
            return Number(res.changes) === 1;
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return false;
        throw err;
    }
}
/**
 * Terminalize one row under the owner guard; claim exclusion is absolute.
 * Miss columns stay NULL when detail is omitted; failed writes change nothing.
 */
export async function failRow(id, owner, reason, detail, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const res = db
                .prepare(`UPDATE outbox SET claimed_by = NULL, claimed_at = NULL, attempts = ?, fail_reason = ?, miss_layer = ?, miss_reason = ?, build = ? WHERE id = ? AND claimed_by = ?`)
                .run(OUTBOX_MAX_ATTEMPTS, reason, detail?.layer ?? null, detail?.missReason ?? null, BUILD_STAMP, id, owner);
            return Number(res.changes) === 1;
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return false;
        throw storageError(err);
    }
}
/** Crash recovery: release claims older than the timeout; fresh claims stay held. */
export async function requeueStale(timeoutMs = OUTBOX_CLAIM_TIMEOUT_MS, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const res = db
                .prepare(`UPDATE outbox SET claimed_by = NULL, claimed_at = NULL, attempts = attempts + 1 WHERE claimed_by IS NOT NULL AND delivered_at IS NULL AND attempts < ? AND claimed_at < ?`)
                .run(OUTBOX_MAX_ATTEMPTS, Date.now() - timeoutMs);
            return Number(res.changes);
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return 0;
        throw err;
    }
}
/** Dispose path: release every unacked claim held by one owner only. */
export async function releaseOwner(owner, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const res = db
                .prepare(`UPDATE outbox SET claimed_by = NULL, claimed_at = NULL, attempts = attempts + 1 WHERE claimed_by = ? AND delivered_at IS NULL`)
                .run(owner);
            return Number(res.changes);
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return 0;
        throw err;
    }
}
/** Count undelivered rows waiting for the given sessions (harness probe, no claim). */
export async function pendingCount(targetSessions, meshRoot) {
    const ids = [...new Set(targetSessions)];
    for (const id of ids)
        sanitizeSessionId(id);
    if (ids.length === 0)
        return 0;
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const q = `SELECT COUNT(*) AS n FROM outbox WHERE target_session IN (${ids.map(() => "?").join(",")}) AND delivered_at IS NULL AND fail_reason IS NULL`;
            const row = db.prepare(q).get(...ids);
            return Number(row?.n ?? 0);
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return 0;
        throw err;
    }
}
/**
 * Receipt lookup for one delivery; read-only, never mutates rows.
 * @param id Receipt id returned at send time.
 */
export async function receiptById(id, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const row = db.prepare(`SELECT * FROM outbox WHERE id = ?`).get(id);
            if (!row)
                return { id, state: "failed-permanent", reason: "unknown-receipt" };
            // Absent-tolerant: pre-migration rows read NULL, omitting keys exactly
            // like the silent precedent; unknown miss strings pass through.
            const opt = row;
            const senderBuild = typeof opt.sender_build === "string" && opt.sender_build.length > 0 ? opt.sender_build : undefined;
            const build = typeof opt.build === "string" && opt.build.length > 0 ? opt.build : undefined;
            const missLayer = typeof opt.miss_layer === "string" && opt.miss_layer.length > 0 ? opt.miss_layer : undefined;
            const missReason = typeof opt.miss_reason === "string" && opt.miss_reason.length > 0 ? opt.miss_reason : undefined;
            const failReason = row.fail_reason;
            if (typeof failReason === "string" && failReason.length > 0)
                return {
                    id,
                    state: "failed-permanent",
                    reason: failReason,
                    target_session: row.target_session,
                    attempts: row.attempts,
                    ...(senderBuild !== undefined ? { senderBuild } : {}),
                    ...(build !== undefined ? { build } : {}),
                    ...(missLayer !== undefined ? { missLayer } : {}),
                    ...(missReason !== undefined ? { missReason } : {}),
                };
            if (row.delivered_at !== null)
                return { id, state: "injected-progressing", target_session: row.target_session, attempts: row.attempts };
            if (row.attempts >= OUTBOX_MAX_ATTEMPTS && row.created_at < Date.now() - OUTBOX_TTL_MS)
                return { id, state: "dead-lettered", reason: "max-attempts", target_session: row.target_session, attempts: row.attempts };
            if (row.claimed_by !== null)
                return { id, state: "injected-progressing", target_session: row.target_session, attempts: row.attempts };
            return { id, state: "queued", target_session: row.target_session, attempts: row.attempts };
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return { id, state: "failed-permanent", reason: "storage-unavailable" };
        throw err;
    }
}
/** GC collection: delete delivered past TTL plus dead-letter rows; VACUUM past threshold. */
export async function collectOutbox(now, ttlMs, maxAttempts, meshRoot) {
    await ensureOutbox(meshRoot);
    try {
        return await withDb(meshRoot, (db) => {
            const dead = db
                .prepare(`SELECT COUNT(*) AS n FROM outbox WHERE delivered_at IS NULL AND attempts >= ? AND created_at < ?`)
                .get(maxAttempts, now - ttlMs);
            const deadLetter = Number(dead?.n ?? 0);
            const res = db
                .prepare(`DELETE FROM outbox WHERE (delivered_at IS NOT NULL AND delivered_at < ?) OR (delivered_at IS NULL AND attempts >= ? AND created_at < ?)`)
                .run(now - ttlMs, maxAttempts, now - ttlMs);
            const deleted = Number(res.changes);
            // Why: VACUUM conditional on the freed-pages threshold (single GC owns it).
            if (deleted > 0) {
                try {
                    const free = db.prepare(`PRAGMA freelist_count`).get();
                    if (Number(free?.freelist_count ?? 0) >= OUTBOX_VACUUM_MIN_PAGES)
                        db.exec("VACUUM");
                }
                catch { }
            }
            return { deleted, deadLetter };
        });
    }
    catch (err) {
        if (isUnavailable(err))
            return { deleted: 0, deadLetter: 0 };
        throw err;
    }
}
//# sourceMappingURL=outbox.js.map
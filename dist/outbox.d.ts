import type { MissLayer, MissReason } from "./identity.js";
/** One queued delivery row. */
export interface OutboxRow {
    seq: number;
    id: string;
    target_session: string;
    from_session: string;
    from_agent: string;
    text: string;
    created_at: number;
    broadcast_id: string | null;
    claimed_by: string | null;
    claimed_at: number | null;
    delivered_at: number | null;
    attempts: number;
    /** Silent deposit bit: 1 pins `noReply:true` on the claim inject, 0 wakes. Pre-migration rows read back 0. */
    silent: number;
    /** Terminal failure reason: NULL while routable, closed-set string after `failRow` commits. Pre-migration rows read back NULL. */
    fail_reason: string | null;
    /** Generation that enqueued the row, recorded where the sender cannot later rewrite it. Pre-migration rows read back NULL. */
    sender_build?: string | null;
    /** Terminal miss layer from the resolver trail, NULL until `failRow` commits. Pre-migration rows read back NULL. */
    miss_layer?: string | null;
    /** Terminal miss reason from the resolver trail, NULL until `failRow` commits. Pre-migration rows read back NULL. */
    miss_reason?: string | null;
    /** Generation that terminalized the row, NULL until `failRow` commits. Pre-migration rows read back NULL. */
    build?: string | null;
}
export interface EnqueueInput {
    target_session: string;
    from_session: string;
    from_agent: string;
    text: string;
    broadcast_id?: string;
    /** Per-message silent deposit; survives the queue so the claim leg matches the direct leg. Defaults to wake. */
    silent?: boolean;
    /** Envelope id for idempotent enqueue: a row with this id already present is a duplicate no-op returning the id. */
    id?: string;
}
/** Single-owned size guard: all three points live here; throws 413, never clips. */
export declare function assertSendable(text: string, prefixLength?: number): void;
/** Serialized-body point of the same guard: bodies at or over 1MB refuse. */
export declare function assertBodySendable(bodyBytes: number): void;
/** Single-owner branded message ID (12 hex plus 14 base62; counter orders, random uniquifies). */
export declare function newMessageId(): string;
/** Brand predicate for the msg_ alphabet (row keys are equality-matched, never brand-checked). */
export declare function isMsgId(s: string): boolean;
/**
 * Mesh model parser over a verified-present model token; slash-less takes the opencode provider prefix.
 * Absent never reaches here (every caller guards; missing reads null at the resolver and defers, never synthesizes).
 */
export declare function resolveMeshModel(entry: {
    model: string;
}): {
    providerID: string;
    modelID: string;
};
/** Shared lazy sqlite loader (single fork point). Tries `bun:sqlite` where the
 * Bun marker is present, else `node:sqlite`; throws STORAGE_UNAVAILABLE when
 * neither driver resolves. Call sites keep their SQL plus PRAGMA text verbatim. */
export declare function loadSqlite(): Promise<SqliteCtor>;
/** Normalized statement: `node:sqlite` prepare plus `bun:sqlite` query shapes converge here. */
export interface SqliteStatement {
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
    run: (...params: unknown[]) => {
        changes: number;
    };
}
/** Normalized database handle: exec plus prepare plus close converge here. */
export interface SqliteDb {
    exec: (sql: string) => void;
    prepare: (sql: string) => SqliteStatement;
    close: () => void;
}
/** Normalized constructor: path plus optional read-only open, driver-agnostic. */
export interface SqliteCtor {
    new (path: string, options?: {
        readOnly?: boolean;
    }): SqliteDb;
}
/** Ensure dir 0700 plus first-byte file 0600 through the atomic path, then open. */
export declare function ensureOutbox(meshRoot?: string): Promise<string>;
/** Enqueue one canonical row. ONE_MB guard runs before any transaction. */
export declare function enqueue(input: EnqueueInput, meshRoot?: string): Promise<string>;
/**
 * Atomically claim the oldest unclaimed undelivered row per target session.
 * Lost race returns [] (fail-closed, never throws). Limit bounds rows per target.
 */
export declare function claim(targetSessions: string[], owner: string, limitPerTarget?: number, meshRoot?: string): Promise<OutboxRow[]>;
/** Ack delivery. Only the owning claimer affects the row; foreign owner affects zero. */
export declare function ack(id: string, owner: string, meshRoot?: string): Promise<boolean>;
/** Release a claim for redelivery. Only the owning claimer affects the row. */
export declare function release(id: string, owner: string, meshRoot?: string): Promise<boolean>;
/** Closed failure vocabulary; marked via fail_reason, never delivered_at. */
export type OutboxFailReason = "clientless-no-route" | "receiver-unresolvable" | "max-attempts" | `direct-terminal-${number}`;
/**
 * Terminalize one row under the owner guard; claim exclusion is absolute.
 * Miss columns stay NULL when detail is omitted; failed writes change nothing.
 */
export declare function failRow(id: string, owner: string, reason: OutboxFailReason, detail?: {
    layer: MissLayer;
    missReason: MissReason;
}, meshRoot?: string): Promise<boolean>;
/** Crash recovery: release claims older than the timeout; fresh claims stay held. */
export declare function requeueStale(timeoutMs?: number, meshRoot?: string): Promise<number>;
/** Dispose path: release every unacked claim held by one owner only. */
export declare function releaseOwner(owner: string, meshRoot?: string): Promise<number>;
/** Count undelivered rows waiting for the given sessions (harness probe, no claim). */
export declare function pendingCount(targetSessions: string[], meshRoot?: string): Promise<number>;
/** Terminal-aware receipt for one delivery (state vocabulary owned by receiptById below). */
export interface OutboxReceipt {
    id: string;
    state: "queued" | "injected-progressing" | "failed-permanent" | "dead-lettered";
    reason?: string;
    target_session?: string;
    attempts?: number;
    /** Generation that enqueued the row. Present only on the `failed-permanent` branch for a stored terminal row (absent-tolerant read of `sender_build`); other branches omit it. */
    senderBuild?: string;
    /** Generation that terminalized the row. Present only on the `failed-permanent` branch for a stored terminal row; other branches omit it. */
    build?: string;
    /** Terminal miss layer from the resolver trail. Present only on the `failed-permanent` branch for a stored terminal row whose terminalizer knew it; other branches omit it. */
    missLayer?: string;
    /** Terminal miss reason from the resolver trail. Present only on the `failed-permanent` branch for a stored terminal row whose terminalizer knew it; other branches omit it. */
    missReason?: string;
}
/**
 * Receipt lookup for one delivery; read-only, never mutates rows.
 * @param id Receipt id returned at send time.
 */
export declare function receiptById(id: string, meshRoot?: string): Promise<OutboxReceipt>;
/** GC collection: delete delivered past TTL plus dead-letter rows; VACUUM past threshold. */
export declare function collectOutbox(now: number, ttlMs: number, maxAttempts: number, meshRoot?: string): Promise<{
    deleted: number;
    deadLetter: number;
}>;
//# sourceMappingURL=outbox.d.ts.map
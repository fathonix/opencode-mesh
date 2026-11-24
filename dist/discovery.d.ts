import { type Registry } from "./registry.js";
export type StatusMap = Record<string, {
    type: string;
}>;
export interface DbSession {
    id: string;
    agent: string | null;
    directory: string | null;
    title: string | null;
    dbUpdatedAt: number;
    /** Derived type: primary when parent_id is NULL, subagent otherwise. Absent reads primary. */
    sessionType?: string;
}
export type DbSessionMap = Record<string, DbSession>;
/** Plugin sets its in-process client here at init; tools read live status through it. */
export declare function setLiveClient(client: unknown): void;
/**
 * DB session scrape, read-only; failures yield partial maps, delete zero.
 * Unions session and session_v2; v2 hosts persist live sessions there only.
 */
export declare function readDbSessions(dbPath?: string): Promise<DbSessionMap>;
/**
 * Tagged DB triple with classified miss; read-only, never throws.
 * Evidence rides beside verdict for terminal audit lines.
 */
export declare function readDbTripleDetailed(sessionId: string, dbPath?: string): Promise<{
    ok: true;
    triple: {
        agent: string | null;
        model: string | null;
    };
} | {
    ok: false;
    reason: "db-throw";
    dbPath: string;
    dbCode?: string;
    dbError?: string;
} | {
    ok: false;
    reason: "db-row-absent";
    dbPath: string;
}>;
/** Narrow receiver triple, read-only; failures yield null for miss fallthrough. */
export declare function readDbTriple(sessionId: string, dbPath?: string): Promise<{
    agent: string | null;
    model: string | null;
} | null>;
export declare function readMessageRecency(dbPath?: string): Promise<Record<string, number>>;
/** Test seam: drops cached recency so the next read hits the database. */
export declare function clearRecencyCache(): void;
/**
 * In-process live status where the plugin holder exists. Never a TCP fetch.
 * Null means unknown, never empty (fail-closed: null deletes zero).
 */
export declare function readLiveStatus(): Promise<StatusMap | null>;
/** Union of the TCP single-port view and the in-process view; live wins per id. */
export declare function mergeStatus(tcp: StatusMap | null, live: StatusMap | null): StatusMap | null;
/** TCP status view: v1 single-port map, v1-plus-v2 union only when it misses. */
export declare function readTcpStatus(): Promise<StatusMap | null>;
/**
 * Extra rank inputs for the tiered join. Every field is optional so existing
 * four-arg callers keep compiling and behaving identically when omitted.
 */
export interface JoinExtra {
    /** Attached ids from the oracle tier (unioned with registry markers). */
    attached?: Iterable<string>;
    /** Tracker stamps per id (tool plus session-event activity). */
    lastAction?: Record<string, number>;
    /** DB message-leg recency per id, read at display time. */
    messageRecency?: Record<string, number>;
}
/**
 * Visible peers from DB plus registry plus live; never hides, one badge each.
 */
export declare function joinSessions(db: DbSessionMap, reg: Registry, status: StatusMap | null, now?: number, extra?: JoinExtra): Record<string, unknown>;
export interface JoinResult {
    peers: Record<string, unknown>;
    statusMap: StatusMap | null;
    tcpMap: StatusMap | null;
    degraded: boolean;
}
export declare const ATTACH_SNAPSHOT_MAX_AGE_MS: number;
/** Full join for display surfaces: DB existence unconditionally plus registry claims plus live overlay. */
export declare function joinAll(meshRoot?: string, opts?: {
    withRecency?: boolean;
}): Promise<JoinResult>;
//# sourceMappingURL=discovery.d.ts.map
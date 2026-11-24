/** Recency bound: only sessions active inside this window get adopted. */
export declare const ADOPT_WINDOW_MS: number;
/** Per-pass cap: bounds one scan on large shared databases. */
export declare const ADOPT_MAX_IDS = 100;
export interface AdoptPass {
    /** Ids newly inserted from database rows this pass. */
    adopted: string[];
    /** Known ids heartbeated this pass. */
    heartbeated: string[];
    /** Fresh rows left out by the cap. */
    skipped: number;
}
/**
 * One adoption pass: database-fresh sessions rejoin ownership. Never throws
 * (setup and tick paths drop, never break); returns the id sets for union
 * merge by the caller, which owns process membership.
 */
export declare function adoptDbSessions(opts?: {
    dbPath?: string;
    now?: number;
    limit?: number;
}): Promise<AdoptPass>;
//# sourceMappingURL=adopt.d.ts.map
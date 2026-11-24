/**
 * Acquire one V2 setup slot. The first acquirer arms shared timers; later
 * setups register cheaply and arm zero timers. Merges nothing by itself; call
 * mergeV2Ids for union ownership.
 */
export declare function acquireV2Setup(): {
    first: boolean;
};
/**
 * Release one V2 setup slot. The last release stops the shared timer; every
 * other release only decrements. Returns true when the caller released last.
 */
export declare function releaseV2Setup(): {
    last: boolean;
};
/** Merge ids into shared ownership by union; never overwrite. */
export declare function mergeV2Ids(ids: string[]): void;
/** Drop ids from shared ownership (per-setup teardown calls this with its own ids only). */
export declare function removeV2Ids(ids: string[]): void;
/** Snapshot of shared owned ids (union across live setups). */
export declare function v2OwnedIds(): string[];
/** Live V2 setup count (0 when fully torn down). */
export declare function v2SetupCount(): number;
/**
 * Arm the shared heartbeat tick; no-op unless this process holds no timer.
 * The tick callback owns zero I/O beyond the callback itself.
 */
export declare function armV2SharedTimer(tick: () => void): void;
/** Test/harness reset: stop the timer and drop all slots and ids. */
export declare function resetV2Singleflight(): void;
/**
 * One shared tick: adopt database-fresh sessions so restarts re-own live
 * rows, then heartbeat the union. Never throws; setup arms it, tests drive
 * it directly with no timers involved.
 */
export declare function runV2SharedTick(): Promise<void>;
//# sourceMappingURL=v2singleflight.d.ts.map
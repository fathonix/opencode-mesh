/** Contention jitter: random 50-149ms spreads herd retries, avoiding livelock. */
export declare function jitterMs(): number;
/** True when the error signals exhausted disk; no-space never retries as contention. */
export declare function isNoSpace(err: unknown): boolean;
/** Unique temp name beside target; pid plus random avoids writer collision. */
export declare function tmpName(base: string): string;
/** Fsync directory so renames survive crashes; failures never throw. */
export declare function fsyncDir(dir: string): Promise<void>;
/** Ensure dir exists 0700 from creation; secrets never widen. */
export declare function ensureDir0700(dir: string): Promise<void>;
/**
 * Registry-only RMW lock; O_EXCL create plus jitter retries own contention.
 * Crash-safe exclusion for single-writer updates.
 */
export declare function withRegistryLock<T>(fn: () => Promise<T>, meshRoot?: string): Promise<T>;
/** True for EEXIST only; contention retries, real errors throw. */
export declare function isLockContention(err: unknown): boolean;
/** Crash-safe write via temp plus fsync plus rename; readers never see tears. */
export declare function writeAtomic(targetPath: string, data: string, opts?: {
    mode?: number;
}): Promise<void>;
//# sourceMappingURL=fsAtomic.d.ts.map
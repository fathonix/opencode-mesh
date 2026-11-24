/** Busy exemption predicate: a busy or retrying session counts as active regardless of timestamp. */
export declare function isBusyActive(statusType?: string | null): boolean;
/**
 * Backward-jump clamp: the stored stamp keeps the max of stored versus
 * observed, so wall-clock moves backward never resurrect deletion.
 */
export declare function clampLastAction(stored: number, observed: number): number;
/** Forward-jump probe: a leap beyond one dampening bound reads as sleep, never as idle time. */
export declare function isForwardJump(stored: number, observed: number): boolean;
/** Read the stamp off a registry-shaped entry; null when absent or invalid. */
export declare function readLastActionAt(entry: unknown): number | null;
/**
 * Stamp session with action time; max clamp, drops on failure, never throws.
 */
export declare function stampLastAction(sessionId: string, opts?: {
    at?: number;
    meshRoot?: string;
}): Promise<void>;
/**
 * Busy liveness input: a session observed busy stamps now, keeping the id
 * active while the Runner turn runs. Drops on failure like every stamp.
 */
export declare function noteBusyActive(sessionId: string, statusType: string, meshRoot?: string): Promise<void>;
//# sourceMappingURL=lastAction.d.ts.map
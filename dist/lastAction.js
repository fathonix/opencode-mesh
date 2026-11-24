// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Last-action tracker persisted in the shared store.
// Tool, session-event, or message-leg activity; busy counts as active.
import { LAST_ACTION_DAMPEN_MS } from "./constants.js";
/** Busy exemption predicate: a busy or retrying session counts as active regardless of timestamp. */
export function isBusyActive(statusType) {
    return statusType === "busy" || statusType === "retry";
}
/**
 * Backward-jump clamp: the stored stamp keeps the max of stored versus
 * observed, so wall-clock moves backward never resurrect deletion.
 */
export function clampLastAction(stored, observed) {
    return Math.max(stored, observed);
}
/** Forward-jump probe: a leap beyond one dampening bound reads as sleep, never as idle time. */
export function isForwardJump(stored, observed) {
    return observed - stored > LAST_ACTION_DAMPEN_MS;
}
/** Read the stamp off a registry-shaped entry; null when absent or invalid. */
export function readLastActionAt(entry) {
    const at = entry?.lastActionAt;
    return typeof at === "number" && at > 0 ? at : null;
}
/**
 * Stamp session with action time; max clamp, drops on failure, never throws.
 */
export async function stampLastAction(sessionId, opts) {
    const at = opts?.at ?? Date.now();
    try {
        const reg = await import("./registry.js");
        // No-op skip behind a lock-free read: unknown ids take zero locks.
        // A creation racing this read drops one best-effort stamp; the next
        // firing re-stamps, so tracker failure still never breaks the event path.
        const current = (await reg.readRegistry(opts?.meshRoot).catch(() => ({})));
        if (current[sessionId] === undefined)
            return;
        await reg.atomicUpdateRegistry((r) => {
            const e = r[sessionId];
            if (!e)
                return;
            const stored = typeof e.lastActionAt === "number" ? e.lastActionAt : 0;
            e.lastActionAt = clampLastAction(stored, at);
        }, opts?.meshRoot);
        // Why: best-effort — registry update failure must not block the stamp operation.
    }
    catch { }
}
/**
 * Busy liveness input: a session observed busy stamps now, keeping the id
 * active while the Runner turn runs. Drops on failure like every stamp.
 */
export async function noteBusyActive(sessionId, statusType, meshRoot) {
    if (!isBusyActive(statusType))
        return;
    await stampLastAction(sessionId, { meshRoot });
}
//# sourceMappingURL=lastAction.js.map
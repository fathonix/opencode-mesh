// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Single owner for the wake-vs-silent wire decision.
/** False only when kill-switch is set; unset keeps wake as default. */
export function isWakeEnabled() {
    return process.env.MESH_WAKE !== "0";
}
/**
 * Wire noReply key; kill-switch first, then per-message flags; wake omits key.
 */
export function resolveNoReply(opts) {
    if (!isWakeEnabled())
        return { noReply: true };
    if ((opts?.silent ?? opts?.noReply ?? false) === true)
        return { noReply: true };
    return {};
}
/** Silent-bit predicate sharing resolveNoReply truth table; testing bit uses this. */
export function isSilent(opts) {
    if (!isWakeEnabled())
        return true;
    return (opts?.silent ?? opts?.noReply ?? false) === true;
}
//# sourceMappingURL=wake.js.map
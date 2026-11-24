// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
/* Canonical mesh prefix; single template owned by formatMeshPrefix. */
// `[OC-MESH | SENDER: {agent} - {sessionId}]` normal
// `[OC-MESH | SENDER (SILENT): {agent} - {sessionId}]` silent history-only
// `[OC-MESH | SENDER (QUARANTINED): {agent} - {sessionId}]` unattested
// `[OC-MESH | SENDER (SILENT) (QUARANTINED): {agent} - {sessionId}]` combined, fixed order SILENT first
/**
 * Canonical header plus SILENT and QUARANTINED markers, SILENT first.
 * One template keeps every inject path byte-identical.
 */
export function formatMeshPrefix(agent, sessionId, verified = true, silent = false) {
    return `[OC-MESH | SENDER${silent ? " (SILENT)" : ""}${verified ? "" : " (QUARANTINED)"}: ${agent} - ${sessionId}]`;
}
/** True only when MESH_QUARANTINE is exactly 1; default-off passes verbatim. */
export function isQuarantineEnabled() {
    return process.env.MESH_QUARANTINE === "1";
}
/** Tag lookalikes at any position when enabled; else return text verbatim. */
export function quarantineText(text) {
    if (!isQuarantineEnabled())
        return text;
    const re = /\[OC-MESH \| SENDER(?: \(SILENT\))?(?: \(QUARANTINED\))?:/i;
    if (re.test(text))
        return `[QUARANTINED-LOOKALIKE] ${text}`;
    return text;
}
/** Runtime-measured prefix byte length, never an estimate. */
export function meshPrefixLength(agent, sessionId, verified = true, silent = false) {
    return Buffer.byteLength(formatMeshPrefix(agent, sessionId, verified, silent), "utf8");
}
//# sourceMappingURL=frontmatter.js.map
/**
 * Canonical header plus SILENT and QUARANTINED markers, SILENT first.
 * One template keeps every inject path byte-identical.
 */
export declare function formatMeshPrefix(agent: string, sessionId: string, verified?: boolean, silent?: boolean): string;
/** True only when MESH_QUARANTINE is exactly 1; default-off passes verbatim. */
export declare function isQuarantineEnabled(): boolean;
/** Tag lookalikes at any position when enabled; else return text verbatim. */
export declare function quarantineText(text: string): string;
/** Runtime-measured prefix byte length, never an estimate. */
export declare function meshPrefixLength(agent: string, sessionId: string, verified?: boolean, silent?: boolean): number;
//# sourceMappingURL=frontmatter.d.ts.map
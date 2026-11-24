/** The six install states (plus a spec-mismatch flag beside the state, never a seventh state). */
export type PluginInstallState = "absent" | "legacy-only" | "native-only" | "dual-server" | "cli-augmented" | "disabled";
export type KeyPresence = "present" | "absent" | "disabled";
export interface PluginSourceDetail {
    opencodeJsonPlugin: KeyPresence;
    opencodeJsonPlugins: KeyPresence;
    cliJsonPlugins: KeyPresence;
    specMismatch: boolean;
}
export interface PluginClassification {
    state: PluginInstallState;
    detail: PluginSourceDetail;
}
/**
 * Classify the install across both config files. Reads: A = opencode.json
 * `plugin`, B = opencode.json `plugins`, C = cli.json `plugins`. Null raw
 * means unreadable or absent file (same cell: absent).
 */
export declare function classifyPluginInstall(opencodeRaw: string | null, cliRaw: string | null): PluginClassification;
/**
 * Backward-compatible rollup for the status `plugin` cell (existing gates
 * assert exactly `present` or `absent`): present when any server key carries
 * the entry and no disable wins, else absent. The six-state truth rides in
 * `pluginSources`.
 */
export declare function rollupPluginPresence(c: PluginClassification): "present" | "absent";
//# sourceMappingURL=statusMatrix.d.ts.map
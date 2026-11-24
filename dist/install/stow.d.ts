/**
 * Guard mesh root before writes; only deep homedir or tmpdir resolve.
 */
export declare function validateMeshRoot(resolved: string): void;
/** Stow root for detection plus restow cwd; defaults to ~/dotfiles. */
export declare function stowRoot(): string;
/** Detect stowed opencode.json; unstowed reads source as live. */
export declare function detectStowRoot(livePath: string): {
    isStowed: boolean;
    sourcePath: string;
    livePath: string;
    packageName: string;
};
/** Post-write census of stow leaf; failures degrade to empty, never throw. */
export declare function verifyLeaf(livePath: string, sourcePath: string): Promise<{
    lsLive: string;
    lsSource: string;
    rgLHit: boolean;
}>;
/** Move mesh root to trash; allowlist-validated first, recoverable. */
export declare function purgeMeshRoot(root: string): Promise<"trash" | "system-trash" | "filesystem">;
/** Newest install snapshot, if any; null when nothing was ever snapshotted. */
export declare function latestSnapshot(): Promise<{
    dir: string;
    path: string;
} | null>;
/** Durable write honoring stow; atomic to source, then restow. */
export declare function stowedWrite(sourcePath: string, content: string, opts?: {
    mode?: number;
}): Promise<void>;
/** Marker file content recording that cli.json was absent at snapshot time. */
export declare const CLI_ABSENT_MARKER = "ABSENT\n";
/** Split snapshot unit: both config raws plus a manifest, or fail loud. */
export interface SplitSnapshot {
    dir: string;
    opencodePath: string;
    cliPath: string;
    manifestPath: string;
    cliExisted: boolean;
}
/**
 * Snapshot both config files before either write. cli.json is never written
 * by the mesh installer; its raw (or absent marker) is provenance so restore
 * can replay the unit or fail loud. Snapshot raws stay 0600.
 */
export declare function writeSplitSnapshot(opencodeRaw: string, cliRaw: string | null, meta: {
    isStowed: boolean;
    sourcePath: string;
}): Promise<SplitSnapshot>;
/**
 * Read a split snapshot unit. Returns null when the dir holds no opencode
 * raw (not a snapshot). cliRaw is null when the absent marker was recorded.
 */
export declare function readSplitSnapshot(dir: string): Promise<{
    opencodeRaw: string;
    cliRaw: string | null;
    manifest: Record<string, unknown>;
} | null>;
//# sourceMappingURL=stow.d.ts.map
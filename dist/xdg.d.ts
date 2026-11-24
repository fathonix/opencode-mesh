export declare const MESH_SUBPATH = "opencode/mesh";
export declare const OUTBOX_SUBPATH = "outbox.db";
/** Mesh root with explicit override first; tests isolate via env. */
export declare function resolveMeshRoot(env?: NodeJS.ProcessEnv | string): string;
/** Registry file path under the mesh root; single owner. */
export declare function resolveRegistryPath(env?: NodeJS.ProcessEnv | string): string;
/** Outbox database path under the mesh root; beside the registry. */
export declare function resolveOutboxPath(env?: NodeJS.ProcessEnv | string): string;
/** Guard session id to safe filename characters; rejects others with 400. */
export declare function sanitizeSessionId(id: string): string;
/** Tri-state fence: valid, absent, or invalid; callers own stale policy. */
export type ValidDir = {
    kind: 'valid';
    dir: string;
} | {
    kind: 'absent';
} | {
    kind: 'invalid';
};
/** Classify directory into the tri-state fence; empty never reads valid. */
export declare function resolveValidDir(dir: string | undefined): ValidDir;
/** Ensure mesh root exists 0700; first touch already owner-only. */
export declare function ensureMeshDirs(meshRoot?: string): Promise<void>;
//# sourceMappingURL=xdg.d.ts.map
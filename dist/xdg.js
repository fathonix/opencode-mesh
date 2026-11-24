// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// XDG state directory resolution for the mesh.
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { ensureDir0700 } from './fsAtomic.js';
export const MESH_SUBPATH = 'opencode/mesh';
export const OUTBOX_SUBPATH = 'outbox.db';
/** Mesh root with explicit override first; tests isolate via env. */
export function resolveMeshRoot(env = process.env) {
    if (typeof env === 'string')
        return resolve(env);
    const explicit = env.OPENCODE_MESH_ROOT?.trim();
    if (explicit)
        return resolve(explicit);
    const xdg = env.XDG_STATE_HOME?.trim();
    if (xdg)
        return resolve(xdg, MESH_SUBPATH);
    return resolve(homedir(), '.local', 'state', MESH_SUBPATH);
}
/** Registry file path under the mesh root; single owner. */
export function resolveRegistryPath(env) {
    return resolve(resolveMeshRoot(env), 'registry.json');
}
/** Outbox database path under the mesh root; beside the registry. */
export function resolveOutboxPath(env) {
    return resolve(resolveMeshRoot(env), OUTBOX_SUBPATH);
}
/** Guard session id to safe filename characters; rejects others with 400. */
export function sanitizeSessionId(id) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
        throw Object.assign(new Error('400 sessionId allowlist'), { status: 400 });
    return id;
}
/** Classify directory into the tri-state fence; empty never reads valid. */
export function resolveValidDir(dir) {
    if (typeof dir !== 'string' || dir.length === 0)
        return { kind: 'absent' };
    if (!dir.startsWith('/'))
        return { kind: 'invalid' };
    return { kind: 'valid', dir };
}
/** Ensure mesh root exists 0700; first touch already owner-only. */
export async function ensureMeshDirs(meshRoot) {
    const root = meshRoot ?? resolveMeshRoot();
    await ensureDir0700(root);
}
//# sourceMappingURL=xdg.js.map
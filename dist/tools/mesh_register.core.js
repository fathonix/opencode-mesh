// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Host-free register executor core (no host-SDK imports; V1 shell + V2 adapter delegate here).
import { existsSync } from "node:fs";
import { MeshError } from "../errors.js";
import { isLockContention } from "../fsAtomic.js";
import { atomicUpdateRegistry, normalizeEntry, readRegistry } from "../registry.js";
import { isGenericTitle } from "../identity.js";
import { resolveValidDir } from "../xdg.js";
/** Tool description shared by the V1 shell and the V2 adapter (single source). */
export const MESH_REGISTER_DESCRIPTION = "Register this session in the mesh registry (summary + heartbeat). Returns peers.";
/**
 * Host-free register executor: upserts caller into registry and returns peers.
 * Stale directories refuse loud, never stored; absent stays absent.
 */
export async function executeMeshRegister(args, ctx) {
    const sessionId = ctx.sessionID;
    if (!sessionId)
        throw new MeshError("PEER_NOT_FOUND", "session.deleted 404: missing sessionID");
    const rawDesc = args.description ?? args.summary;
    const isGenericNew = isGenericTitle(rawDesc ?? null);
    const dir = ctx.directory;
    const agent = ctx.agent;
    const dirFence = resolveValidDir(dir);
    const validDir = dirFence.kind === "valid" ? dirFence.dir : undefined;
    // Directory fence: stale directories refuse loud, never stored.
    // Absent stays absent.
    if (validDir && !existsSync(validDir))
        throw new MeshError("INVALID_DIRECTORY", `stale directory refused: ${validDir}`);
    const base = (validDir || "").split("/").pop() || "";
    const fallback = base ? `${agent ?? "unknown"} @ ${base}` : sessionId.slice(0, 8);
    // Fail-closed: contention degrades, validation stays loud for caller input.
    // Presence enrichment lives in the plugin wrapper via upsertPresence; this tool inherits only.
    // Absent or empty stays absent, one enrichment owner.
    try {
        await atomicUpdateRegistry(async (reg) => {
            const existing = reg[sessionId];
            const isGenericExisting = isGenericTitle(existing?.description ?? null);
            if (existing && !isGenericExisting && isGenericNew) {
                if (!rawDesc) {
                    existing.updatedAt = Date.now();
                    return;
                }
                if (isGenericNew) {
                    existing.updatedAt = Date.now();
                    return;
                }
            }
            const entry = {
                sessionId,
                agent: agent ?? existing?.agent ?? "unknown",
                model: existing?.model,
                directory: validDir ?? existing?.directory,
                cwd: validDir ?? existing?.cwd,
                summary: rawDesc ?? existing?.summary ?? existing?.description ?? fallback,
                description: rawDesc ?? existing?.description ?? existing?.summary ?? fallback,
                title: rawDesc ?? existing?.title ?? existing?.description ?? fallback,
                updatedAt: Date.now(),
            };
            // never store '' directory; omit if undefined
            if (!entry.directory) {
                delete entry.directory;
                delete entry.cwd;
            }
            if (!entry.repo)
                delete entry.repo;
            // Learned model inherits like agent; absent or empty stays absent
            if (typeof entry.model !== "string" || entry.model.length === 0) {
                delete entry.model;
            }
            reg[sessionId] = normalizeEntry(entry);
        });
    }
    catch (err) {
        if (!isLockContention(err))
            throw err;
        const bestPeers = (await readRegistry().catch(() => ({})));
        return {
            output: JSON.stringify({ registered: sessionId, peers: bestPeers, busy: true }, null, 2),
        };
    }
    const peers = (await readRegistry());
    return {
        output: JSON.stringify({ registered: sessionId, peers }, null, 2),
    };
}
//# sourceMappingURL=mesh_register.core.js.map
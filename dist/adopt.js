// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Restart adoption: rebuilds live ownership from database recency, since a
// server restart empties the in-memory owned set. Cross-server duplicates
// are safe: outbox claims are atomic.
import { ACTIVE_WINDOW_MS } from "./constants.js";
import { readDbSessions } from "./discovery.js";
import { deriveSessionType } from "./expiry.js";
import { isGenericTitle } from "./identity.js";
import { atomicUpdateRegistry, heartbeat } from "./registry.js";
/** Recency bound: only sessions active inside this window get adopted. */
export const ADOPT_WINDOW_MS = ACTIVE_WINDOW_MS;
/** Per-pass cap: bounds one scan on large shared databases. */
export const ADOPT_MAX_IDS = 100;
/**
 * One adoption pass: database-fresh sessions rejoin ownership. Never throws
 * (setup and tick paths drop, never break); returns the id sets for union
 * merge by the caller, which owns process membership.
 */
export async function adoptDbSessions(opts) {
    const now = opts?.now ?? Date.now();
    const limit = opts?.limit ?? ADOPT_MAX_IDS;
    const rows = await readDbSessions(opts?.dbPath);
    const fresh = Object.values(rows)
        .filter((r) => now - r.dbUpdatedAt <= ADOPT_WINDOW_MS)
        .sort((a, b) => b.dbUpdatedAt - a.dbUpdatedAt);
    const take = fresh.slice(0, Math.max(0, limit));
    const pass = {
        adopted: [],
        heartbeated: [],
        skipped: fresh.length - take.length,
    };
    for (const row of take) {
        try {
            let created = false;
            await atomicUpdateRegistry((reg) => {
                const existing = reg[row.id];
                if (existing)
                    return;
                // Why: insert mirrors the v1 recreate row (identity plus stamp, no
                // liveness claims); enrichment stays with tool and event paths.
                const directory = typeof row.directory === "string" && row.directory.length > 0
                    ? row.directory
                    : undefined;
                const title = typeof row.title === "string" && !isGenericTitle(row.title)
                    ? row.title
                    : undefined;
                const agent = typeof row.agent === "string" && row.agent.length > 0
                    ? row.agent
                    : "unknown";
                const next = {
                    sessionId: row.id,
                    agent,
                    description: title ?? agent,
                    summary: title ?? agent,
                    title: title ?? row.id.slice(0, 8),
                    sessionType: row.sessionType ?? deriveSessionType(null),
                    updatedAt: now,
                };
                if (directory) {
                    next.directory = directory;
                    next.cwd = directory;
                }
                reg[row.id] = next;
                created = true;
            });
            if (created) {
                pass.adopted.push(row.id);
            }
            else {
                try {
                    await heartbeat(row.id);
                }
                catch {
                    // Heartbeat failure drops; the next pass retries.
                }
                pass.heartbeated.push(row.id);
            }
        }
        catch {
            // Per-row faults drop; one bad row never stalls the pass.
        }
    }
    return pass;
}
//# sourceMappingURL=adopt.js.map
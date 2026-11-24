/** Single peer entry in the mesh registry. */
export interface RegistryEntry {
    sessionId: string;
    agent: string;
    title?: string;
    description?: string;
    directory?: string;
    cwd?: string;
    summary?: string;
    model?: string;
    updatedAt: number;
    migratedAt?: number;
    /** Attach tier: true while an oracle (ps plus guarded status) lists the id. Optional so old rows parse. */
    attached?: boolean;
    /** Last oracle observation of attachment (epoch ms). Drives the ps-gone grace. */
    attachedAt?: number;
    /** Focus state is unknown from every oracle; the marker documents that, never a focus value. */
    focus?: string;
    /** Last action (tool use, session event, or message leg) as epoch ms. Backward jumps clamp to max. */
    lastActionAt?: number;
    /** Session type driving per-type TTLs: primary (parent_id NULL) or subagent. Absent reads primary. */
    sessionType?: string;
    /** Per-agent override tag naming the TTL class applied at delete time (audit taxonomy). */
    ttlOverrideTag?: string;
}
/** Normalize entry aliases: description↔summary, cwd↔directory, repo derived, title fallback. */
export declare function normalizeEntry(entry: RegistryEntry): RegistryEntry;
/** Registry maps sessionId → peer metadata. */
export type Registry = Record<string, RegistryEntry>;
/** Re-exported stale TTL for consumers (canonical in constants.ts). */
export { STALE_TTL_MS } from "./constants.js";
/** Atomic RMW holding registryChain across read→mutate→write (prevents heartbeat lost-update). */
export declare function atomicUpdateRegistry(fn: (reg: Registry) => void | Promise<void>, meshRoot?: string): Promise<void>;
/** Read registry from the mesh root. */
export declare function readRegistry(meshRoot?: string): Promise<Registry>;
/** Heartbeat — update updatedAt for sessionId and persist. */
export declare function heartbeat(sessionId: string, meshRoot?: string): Promise<void>;
/** Drop entries older than STALE_TTL_MS. */
export declare function pruneStale(registry: Registry, now?: number): Registry;
/**
 * Unwrap data-wrapped or raw status payloads; null on other shapes, deletes zero.
 */
export declare function unwrapStatusMap(raw: unknown): Record<string, {
    type: string;
}> | null;
/** Fetch live status; null on failure, unwraps data wrapper via unwrapStatusMap. */
export declare function fetchSessionStatusMap(port?: number): Promise<Record<string, {
    type: string;
}> | null>;
/** Single-port guard: live map when one port answers, null on split or empty. */
export declare function fetchSinglePortStatusMap(): Promise<Record<string, {
    type: string;
}> | null>;
/**
 * Delete ids absent from status view; null or young ids delete zero.
 */
export declare function pruneDeadByStatus(registry: Registry, statusMap: Record<string, {
    type: string;
}> | null, now?: number): number;
/** Delete audit to audit.log; twin writer with appendDeliveryAudit, separate vocabularies. */
export declare function appendDeleteAudit(reason: string, ids: string[], meshRoot?: string): Promise<void>;
/**
 * Closed delivery vocabulary to audit.log; claimed reserved never emitted.
 * Zero-extra-I/O holds by not emitting claimed.
 */
export type DeliveryAuditEvent = "outbox.claimed" | "outbox.injected" | "outbox.claim-deferred" | "outbox.claim-terminal";
/** Best-effort delivery audit: one JSON line per event to `<meshRoot>/audit.log`. Never throws. */
export declare function appendDeliveryAudit(event: DeliveryAuditEvent, detail: Record<string, unknown>, meshRoot?: string): Promise<void>;
/** Audit-file line per init to audit.log; carries build plus version plus pid, never read by wire. */
export declare function appendBootAudit(build: string, version: string, meshRoot?: string): Promise<void>;
/** Persist confirmed-dead deletions through the single writer. No-op on null or keyless map. */
export declare function persistConfirmedDead(statusMap: Record<string, {
    type: string;
}> | null, meshRoot?: string): Promise<number>;
//# sourceMappingURL=registry.d.ts.map
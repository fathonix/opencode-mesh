export declare const ONE_MB: number;
export declare const STALE_TTL_MS: number;
/** Degraded-peers window: 2x ensureHeartbeat tick, covers one missed tick. */
export declare const ACTIVE_WINDOW_MS: number;
/** Eviction grace: keeps fresh ids inside one seenSessions debounce window. */
export declare const EVICT_GRACE_MS: number;
/** Heartbeat cadence: plugin tick re-attests own ids; one miss never flaps. */
export declare const HEARTBEAT_INTERVAL_MS: number;
/** Default loopback port when OPENCODE_PORT is unset; single source. */
export declare const DEFAULT_OPENCODE_PORT = 4096;
export declare const OPENCODE_PORT: number;
export declare const DIR_MODE = 448;
export declare const FILE_MODE = 384;
/** Crash-safe lock reap age: stale locks reap on the next writer. */
export declare const LOCK_STALE_MS = 30000;
/** Outer EEXIST rounds: burst absorber; see atomicUpdateRegistry contention. */
export declare const LOCK_OUTER_ROUNDS = 8;
/** Claimer poll cadence per process; crash-recovery claim timeout. */
export declare const OUTBOX_POLL_MS = 2000;
export declare const OUTBOX_CLAIM_TIMEOUT_MS = 30000;
/** Bounded hold: rows live minutes; single source for the GC drain leg. */
export declare const OUTBOX_TTL_MS: number;
export declare const OUTBOX_MAX_ATTEMPTS = 25;
/** Per-target depth cap: overflow rejects newest with STORAGE_FULL, never silent drop. 5x the N≤20 fan-out bound. */
export declare const OUTBOX_DEPTH_CAP = 100;
/** VACUUM only when the GC freed at least this many pages (freelist threshold). */
export declare const OUTBOX_VACUUM_MIN_PAGES = 16;
/** Wire brand for mesh message IDs (live opencode msg_ alphabet: 12 hex plus 14 base62). */
export declare const MSG_ID_PREFIX = "msg_";
export declare const MSG_ID_HEX_LEN = 12;
export declare const MSG_ID_B62_LEN = 14;
/** Recency cache TTL: bounds full-table message scans to one per window. */
export declare const RECENCY_TTL_MS: number;
/** Subagent TTL: idle subagents past this meet the expired predicate. */
export declare const SUBAGENT_TTL_MS: number;
/** Primary TTL: idle primaries inside this read sleeper and stay. */
export declare const PRIMARY_TTL_MS: number;
/** Attach poller cadence: one EVICT_GRACE_MS window, one seenSessions debounce window. */
export declare const ATTACH_POLL_MS: number;
/** Sleep dampening bound: one heartbeat tick; forward jumps beyond one tick suspend time deletes for one poller cycle. */
export declare const LAST_ACTION_DAMPEN_MS: number;
/** Ps-gone grace: value-equal to EVICT_GRACE_MS under a dedicated name so expiry reads intent. */
export declare const ATTACH_GONE_GRACE_MS: number;
/** Loopback route-probe budget: single GET /session/status must answer inside this or the leg claims. */
export declare const ROUTE_PROBE_TIMEOUT_MS = 1000;
/** Direct POST budget: prompt_async must answer inside this or the caller sees SERVER_UNAVAILABLE. */
export declare const POST_TIMEOUT_MS = 5000;
/** Claimer busy-queue wait: 550-650ms band for Runner busy|retry (single owner: src/claimer.ts). */
export declare const CLAIMER_BUSY_BASE_MS = 550;
export declare const CLAIMER_BUSY_JITTER_MS = 100;
/** Env key owning the per-agent TTL override map (single reader lives in src/expiry.ts). */
export declare const TTL_OVERRIDES_ENV_KEY = "MESH_TTL_OVERRIDES_JSON";
/** Owner-file age for the pre-0.2.0 inbox drain (closes 0.3.0; single owner: src/gc.ts). */
export declare const LEGACY_OWNER_TTL_MS: number;
/** Millisecond-integer override for the subagent TTL; falls back to the constant on absent or invalid. */
export declare function resolveSubagentTtlMs(): number;
/** Millisecond-integer override for the primary TTL; falls back to the constant on absent or invalid. */
export declare function resolvePrimaryTtlMs(): number;
//# sourceMappingURL=constants.d.ts.map
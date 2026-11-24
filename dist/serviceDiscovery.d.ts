/** Opt-out switch: exact "0" disables every file read (pinned-port hosts). */
export declare const SERVICE_DISCOVERY_ENV_KEY = "MESH_SERVICE_DISCOVERY";
/**
 * Service discovery gate. Enabled by default in live runs (`0` or `false`
 * opts out). In test harnesses (vitest/jest) kept dormant by default so
 * host-level `~/.local/state/opencode/service.json` files never pollute
 * isolated test cases unless `XDG_STATE_HOME` or explicit opt-in is provided.
 */
export declare function isServiceDiscoveryEnabled(env?: NodeJS.ProcessEnv): boolean;
/** TTL for the cached record: one claimer tick, so a restart re-resolves fast. */
export declare const SERVICE_RECORD_TTL_MS = 2000;
export interface ServiceRecord {
    /** Loopback port the host is actually listening on. */
    port: number;
    /** Basic password the host requires; absent means an unauthenticated host. */
    password?: string;
    /** Basic username the host expects; absent means the opencode default. */
    username?: string;
    /** Record file mtime in epoch ms; 0 when the host omits it. */
    mtimeMs: number;
}
/** State root: XDG_STATE_HOME wins over the home fallback, matching the host. */
export declare function resolveServiceStateDir(env?: NodeJS.ProcessEnv): string;
/** Absolute record path; single owner for the filename. */
export declare function resolveServiceRecordPath(env?: NodeJS.ProcessEnv): string;
/**
 * Parse one service record body into a port plus optional credentials.
 * Accepts the flat host shape (`{url, password}`) and a nested
 * `{server: {url, password}}` wrapping; a record without a resolvable
 * loopback port reads null so callers keep their pinned behavior.
 */
export declare function parseServiceRecord(body: string): ServiceRecord | null;
/**
 * Read the host service record; null on every miss (absent file, bad JSON,
 * non-loopback URL, discovery disabled). Never throws: a missing record is
 * the normal state on v1 hosts and on every non-service CLI invocation.
 */
export declare function readServiceRecord(opts?: {
    path?: string;
    now?: number;
    noCache?: boolean;
}): Promise<ServiceRecord | null>;
/** Test hook: drop the memoized record so the next read hits the file. */
export declare function resetServiceRecordCache(): void;
/**
 * Sync mirror for the sync auth path. Impure by design: the header path is
 * already sync, and a service record is a few hundred bytes read at most
 * once per SERVICE_RECORD_TTL_MS. Shares the async cache slot so a caller
 * that already waited on the async read pays no second syscall.
 */
export declare function readServiceRecordSync(opts?: {
    path?: string;
    now?: number;
}): ServiceRecord | null;
/**
 * Ports to probe with discovery folded in: the record port leads so the
 * first probe succeeds on a live service host, then the caller's own list.
 * With no record the input list is returned untouched (v1 contract), and the
 * ENUM_MAX_PORTS bound still holds so a record can never widen the scan.
 */
export declare function withDiscoveredPorts(ports: number[], opts?: {
    record?: ServiceRecord | null;
    limit?: number;
}): Promise<number[]>;
/**
 * Basic header from the record when the environment supplies none. Callers
 * prefer env auth (explicit operator intent) and fall back here, so a service
 * host's generated password still authorizes loopback probes.
 */
export declare function getServiceAuthHeader(record?: ServiceRecord | null): Promise<string | undefined>;
/** Sync mirror for the sync auth path; reads through readServiceRecordSync. */
export declare function getServiceAuthHeaderSync(record?: ServiceRecord | null): string | undefined;
//# sourceMappingURL=serviceDiscovery.d.ts.map
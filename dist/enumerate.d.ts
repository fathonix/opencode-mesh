export declare const ENUM_MAX_PORTS = 8;
export declare const ENUM_TIMEOUT_MS = 1000;
/** Per-body cap: the probe keeps a hash only, so larger bodies never buffer. */
export declare const ENUM_MAX_BODY: number;
export interface ServerSight {
    port: number;
    reachable: boolean;
    latencyMs: number;
    /** sha1 of the /session/status body ("" when unreachable); differs across incarnations with live state. */
    fingerprint: string;
    /** Local epoch ms of this sighting. */
    observedAt: number;
}
export declare function enumPorts(explicit?: number[]): number[];
/** Probe one loopback port; per-port budget keeps hung servers from stalling. */
export declare function probePort(port: number, timeoutMs?: number): Promise<ServerSight>;
/** Enumerate bounded set concurrently; order follows input, no port-scan sprawl. */
export declare function enumerateServers(explicitPorts?: number[], timeoutMs?: number): Promise<ServerSight[]>;
//# sourceMappingURL=enumerate.d.ts.map
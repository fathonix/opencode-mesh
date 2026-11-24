/** v2 liveness path: answers {data: {sessionId: {type}}} like v1 status. */
export declare const V2_ACTIVE_PATH = "/api/session/active";
/** v2 session read path (GET answers {data: SessionInfo} or SessionInfo). */
export declare function v2SessionPath(sessionId: string): string;
/** v2 inject path: user admission renders the chat bubble like v1. */
export declare function v2PromptPath(sessionId: string): string;
/** v2 delivery mirrors wake: steer admits now, queue waits its turn. */
export declare function v2DeliveryForWake(opts?: {
    silent?: boolean;
    noReply?: boolean;
}): "steer" | "queue";
/** Ports to probe: explicit list wins, else MESH_ENUM_PORTS, else the pin. */
export declare function portsToProbe(explicit?: number[]): number[];
/**
 * Async portsToProbe: folds in the host service record so an ephemeral
 * service port leads the probe list. Every caller on this path is already
 * async, and with no record the sync list is returned untouched.
 */
export declare function portsToProbeAsync(explicit?: number[]): Promise<number[]>;
/** One v2 active view; null on any miss (timeout, refused, non-ok). */
export declare function fetchV2Active(port: number, auth?: string): Promise<Record<string, {
    type: string;
}> | null>;
/** Merged liveness across v1 status plus v2 active on every probed port. */
export declare function activeUnion(ports?: number[], auth?: string, opts?: {
    v1?: boolean;
}): Promise<Record<string, {
    type: string;
}> | null>;
/** One v2 session row; null on miss or unparseable body. */
export declare function fetchV2Session(port: number, sessionId: string, auth?: string): Promise<unknown | null>;
export interface LocatedSession {
    kind: "v1" | "v2";
    port: number;
    row: unknown;
}
/**
 * First session row across ports, v1 shape first per port (v1 behavior
 * unchanged when a v1 server answers; v2 servers answer the v2 leg only).
 */
export declare function locateSession(sessionId: string, ports?: number[], auth?: string): Promise<LocatedSession | null>;
export interface V2PromptResult {
    ok: boolean;
    status?: number;
    id?: string;
}
/**
 * v2 inject via user admission (renders the user chat bubble exactly like
 * the v1 prompt_async leg; synthetic admission wakes but never draws it).
 * 2xx admits; callers own the status contract (404 miss, 401 auth, 413
 * guard, 429 busy all stay typed there).
 */
export declare function postV2Prompt(port: number, sessionId: string, text: string, opts?: {
    silent?: boolean;
    noReply?: boolean;
}, auth?: string): Promise<V2PromptResult>;
/** ModelRef-ish ({providerID, id|modelID}) to the registry model string. */
export declare function v2ModelString(model: unknown): string | undefined;
/**
 * v2 SessionInfo to the receiver-parser shape ({agent, model}); null when
 * the row cannot address a wire triple (unknown agent or unusable model).
 */
export declare function v2RowToTriple(row: unknown): {
    agent: string;
    model: string;
} | null;
//# sourceMappingURL=v2routes.d.ts.map
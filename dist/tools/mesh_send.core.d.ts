/** Tool description shared by the V1 shell and the V2 adapter (single source). */
export declare const MESH_SEND_DESCRIPTION = "Send text to a peer session via mesh (pure TUI prompt_async). The wire carries the receiver agent as observed; attribution stays in the prefix.";
/** Plain-args form of the send tool (host-agnostic; V1 zod and V2 JSON Schema both fold here). */
export interface MeshSendArgs {
    target: string;
    text: string;
    noReply?: boolean;
    silent?: boolean;
    broadcast?: boolean;
}
/** Minimal caller context the core needs (V1 ToolContext and V2 ToolContext both satisfy this). */
export interface MeshToolContext {
    sessionID: string;
    directory?: string;
    agent?: string;
}
/**
 * Tagged direct-leg outcome; miss degrades to claim with identical behavior.
 */
export type DirectRowOutcome = {
    ok: true;
    row: unknown;
} | {
    ok: false;
    reason: "direct-fetch-miss" | "direct-parse-fail";
    status?: number;
};
/**
 * Loopback GET under route-probe conventions; miss reads fallthrough, never throws.
 */
export declare function fetchDirectRow(peerId: string, viaAuth: string | undefined, port?: number): Promise<DirectRowOutcome>;
/**
 * Host-free send executor: unicast exact-match delivery plus registry-scoped
 * broadcast. Guards (broadcast opt-in, 1MB caps, exact resolution) verbatim.
 */
export declare function executeMeshSend(args: MeshSendArgs, ctx: MeshToolContext): Promise<{
    output: string;
}>;
//# sourceMappingURL=mesh_send.core.d.ts.map
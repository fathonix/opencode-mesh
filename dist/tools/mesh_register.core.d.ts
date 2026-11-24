/** Tool description shared by the V1 shell and the V2 adapter (single source). */
export declare const MESH_REGISTER_DESCRIPTION = "Register this session in the mesh registry (summary + heartbeat). Returns peers.";
/** Plain-args form of the register tool (host-agnostic). */
export interface MeshRegisterArgs {
    summary?: string;
    description?: string;
}
/** Minimal caller context the core needs. */
export interface MeshRegisterContext {
    sessionID: string;
    directory?: string;
    agent?: string;
}
/**
 * Host-free register executor: upserts caller into registry and returns peers.
 * Stale directories refuse loud, never stored; absent stays absent.
 */
export declare function executeMeshRegister(args: MeshRegisterArgs, ctx: MeshRegisterContext): Promise<{
    output: string;
}>;
//# sourceMappingURL=mesh_register.core.d.ts.map
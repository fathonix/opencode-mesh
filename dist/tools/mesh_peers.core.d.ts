/** Tool description shared by the V1 shell and the V2 adapter (single source). */
export declare const MESH_PEERS_DESCRIPTION = "List mesh peers from registry merged with live session status.";
/** Plain-args form of the peers tool (host-agnostic; V1 zod and V2 JSON Schema both fold here). */
export interface MeshPeersArgs {
    includeSelf?: boolean;
    agent?: string;
    description?: string;
    cwd?: string;
    repo?: string;
    receipt?: string;
}
/** Minimal caller context the core needs. */
export interface MeshPeersContext {
    sessionID: string;
}
/** L1 directory score: exact outranks ancestor outranks basename outranks miss; miss scores zero, stays listed. */
export declare function scoreDirectory(candidateDirs: Array<string | undefined>, query: string | undefined): number;
/** L2 agent score inside the directory order: substring match scores, miss scores zero, stays listed. */
export declare function scoreAgent(agent: string, query: string | undefined): number;
/** L4 title confirmation score: non-generic title-family match scores, generic scores zero, miss stays listed. */
export declare function scoreTitle(fields: Array<string | undefined>, query: string | undefined): number;
/**
 * Host-free peers executor: ranked peer union display (never hides;
 * freshness badge per row) plus receipt-by-id delivery state.
 */
export declare function executeMeshPeers(args: MeshPeersArgs, ctx: MeshPeersContext): Promise<{
    output: string;
}>;
//# sourceMappingURL=mesh_peers.core.d.ts.map
import { MESH_PEERS_DESCRIPTION, scoreAgent, scoreDirectory, scoreTitle, type MeshPeersArgs, type MeshPeersContext } from "./mesh_peers.core.js";
export { MESH_PEERS_DESCRIPTION, scoreAgent, scoreDirectory, scoreTitle };
export type { MeshPeersArgs, MeshPeersContext };
export declare const mesh_peers: {
    description: string;
    args: {
        includeSelf: import("zod").ZodOptional<import("zod").ZodBoolean>;
        agent: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        cwd: import("zod").ZodOptional<import("zod").ZodString>;
        repo: import("zod").ZodOptional<import("zod").ZodString>;
        receipt: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        includeSelf?: boolean | undefined;
        agent?: string | undefined;
        description?: string | undefined;
        cwd?: string | undefined;
        repo?: string | undefined;
        receipt?: string | undefined;
    }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
};
//# sourceMappingURL=mesh_peers.d.ts.map
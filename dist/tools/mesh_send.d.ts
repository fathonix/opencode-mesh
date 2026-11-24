import { MESH_SEND_DESCRIPTION, fetchDirectRow, type DirectRowOutcome, type MeshSendArgs, type MeshToolContext } from "./mesh_send.core.js";
export { fetchDirectRow, MESH_SEND_DESCRIPTION };
export type { DirectRowOutcome, MeshSendArgs, MeshToolContext };
export declare const mesh_send: {
    description: string;
    args: {
        target: import("zod").ZodString;
        text: import("zod").ZodString;
        noReply: import("zod").ZodOptional<import("zod").ZodBoolean>;
        silent: import("zod").ZodOptional<import("zod").ZodBoolean>;
        broadcast: import("zod").ZodOptional<import("zod").ZodBoolean>;
    };
    execute(args: {
        target: string;
        text: string;
        noReply?: boolean | undefined;
        silent?: boolean | undefined;
        broadcast?: boolean | undefined;
    }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
};
//# sourceMappingURL=mesh_send.d.ts.map
import { MESH_REGISTER_DESCRIPTION, type MeshRegisterArgs, type MeshRegisterContext } from "./mesh_register.core.js";
export { MESH_REGISTER_DESCRIPTION };
export type { MeshRegisterArgs, MeshRegisterContext };
/** mesh_register — upserts caller into registry and returns peers. */
export declare const mesh_register: {
    description: string;
    args: {
        summary: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        summary?: string | undefined;
        description?: string | undefined;
    }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
};
//# sourceMappingURL=mesh_register.d.ts.map
export type MeshErrorCode = "PEER_NOT_FOUND" | "PAYLOAD_TOO_LARGE" | "UNAUTHORIZED" | "PEER_BUSY_RETRY" | "SERVER_UNAVAILABLE" | "STORAGE_FULL" | "STORAGE_CORRUPT" | "STORAGE_UNAVAILABLE" | "INVALID_DIRECTORY" | "BROADCAST_DISABLED";
/**
 * Typed failure with stable code plus status; call sites match code, never message text.
 */
export declare class MeshError extends Error {
    code: MeshErrorCode;
    status: number;
    didYouMean?: string[];
    constructor(code: MeshErrorCode, message: string, opts?: {
        didYouMean?: string[];
        status?: number;
    });
}
//# sourceMappingURL=errors.d.ts.map
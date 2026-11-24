const STATUS_MAP = {
    PEER_NOT_FOUND: 404,
    PAYLOAD_TOO_LARGE: 413,
    UNAUTHORIZED: 401,
    PEER_BUSY_RETRY: 429,
    SERVER_UNAVAILABLE: 503,
    STORAGE_FULL: 507,
    STORAGE_CORRUPT: 500,
    STORAGE_UNAVAILABLE: 503,
    INVALID_DIRECTORY: 400,
    BROADCAST_DISABLED: 403,
};
/**
 * Typed failure with stable code plus status; call sites match code, never message text.
 */
export class MeshError extends Error {
    code;
    status;
    didYouMean;
    constructor(code, message, opts) {
        super(message);
        this.name = "MeshError";
        this.code = code;
        this.status = opts?.status ?? STATUS_MAP[code];
        if (opts?.didYouMean)
            this.didYouMean = opts.didYouMean;
    }
}
//# sourceMappingURL=errors.js.map
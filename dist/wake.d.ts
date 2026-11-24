/**
 * Wake-by-default; MESH_WAKE=0 opts out globally, silent flag per message.
 * Both legs resolve here so direct plus claimer cannot diverge.
 */
/** Per-message silence options accepted by the resolver. */
export interface WakeOpts {
    /** Canonical per-message silent flag; wins over legacy `noReply`. */
    silent?: boolean;
    /** Legacy compat flag; honored when `silent` is omitted. */
    noReply?: boolean;
}
/** False only when kill-switch is set; unset keeps wake as default. */
export declare function isWakeEnabled(): boolean;
/**
 * Wire noReply key; kill-switch first, then per-message flags; wake omits key.
 */
export declare function resolveNoReply(opts?: WakeOpts): {
    noReply?: true;
};
/** Silent-bit predicate sharing resolveNoReply truth table; testing bit uses this. */
export declare function isSilent(opts?: WakeOpts): boolean;
//# sourceMappingURL=wake.d.ts.map
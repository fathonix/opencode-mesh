export declare const EXPIRY_PRECEDENCE: readonly ["attached-exempt", "busy-exempt", "override", "type-default", "dampening-hold"];
export type ExpiryStep = "attached-exempt" | "busy-exempt" | "override" | "type-default" | "dampening-hold";
/** Rank of one precedence step in ascending evaluation order. */
export declare function precedenceIndex(step: ExpiryStep): number;
export type SessionType = "primary" | "subagent";
/** Null parent reads primary, any parent reads subagent. */
export declare function deriveSessionType(parentId: unknown): SessionType;
/** Agent-to-ms map from JSON env; invalid or absent reads empty. */
export declare function readTtlOverrides(): Record<string, number>;
export interface TtlResolution {
    ttlMs: number;
    override: boolean;
}
/** Override-first TTL: per-agent map wins, else the type default. */
export declare function resolveTtlMs(sessionType: SessionType, agent?: string | null): TtlResolution;
/** Attached ids never delete by time alone; live processes outrank clocks. */
export declare function isAttachedExempt(entry: unknown): boolean;
/** Busy or retrying ids count as active; mid-turn sessions never prune. */
export declare function isBusyExempt(statusType?: string | null): boolean;
/** Forward leap past one bound suspends time deletes for one poller cycle. */
export declare function noteForwardJump(now: number, deltaMs: number): void;
/** Hold probe; self-clears after one cycle so expiry resumes alone. */
export declare function isDampeningHold(now: number): boolean;
export interface ExpiryInput {
    sessionType: SessionType;
    agent?: string | null;
    attached: boolean;
    statusType?: string | null;
    lastActionAt: number;
    now: number;
}
export interface ExpiryVerdict {
    state: "attached" | "live" | "expired";
    reason: string;
    ttlMs: number;
    override: boolean;
}
/** Precedence verdict: attached, busy, override/default, hold; else expired. */
export declare function evaluateExpiry(input: ExpiryInput): ExpiryVerdict;
/** Collect expired ids without mutating; absent lookup reads idle. */
export declare function collectExpired(reg: Record<string, unknown>, opts?: {
    now?: number;
    statusTypeOf?: (id: string) => string | null;
}): string[];
/** Delete ids via single writer plus one audit line each; never throws. */
export declare function deleteExpiredWithAudit(ids: string[], detail: {
    reason: string;
    ttlClass: string;
    override: boolean;
}, meshRoot?: string): Promise<number>;
//# sourceMappingURL=expiry.d.ts.map
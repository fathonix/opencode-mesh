export interface PromptClient {
    session?: {
        status?: (o?: unknown) => Promise<unknown>;
        promptAsync?: (o: unknown) => Promise<unknown>;
        get?: (o: unknown) => Promise<unknown>;
    };
}
/**
 * v2 in-process inject client (wired by the v2 adapter from its setup
 * context). User admission renders the chat bubble like v1; the claimer
 * only gates on target existence.
 */
export interface V2InjectClient {
    prompt: (input: {
        sessionID: string;
        text: string;
        delivery: "steer" | "queue";
    }) => Promise<unknown>;
}
export interface ClaimerDeps {
    getOwnIds: () => string[];
    getClient: () => PromptClient | null;
    getRegistry: () => Promise<Record<string, {
        agent?: string;
        directory?: string;
        cwd?: string;
        model?: string;
    }>>;
    /** v2 setups provide this; v1 setups leave it absent (clientless path). */
    getV2Client?: () => V2InjectClient | null;
    /**
     * Targets this process may claim for beyond its own ids. Absent keeps the
     * historical exact-own-id contract; the v2 adapter supplies every id the
     * host can address so a background service process never starves the queue.
     */
    getClaimTargets?: () => string[];
}
/** Plugin init wires its session set plus live client plus registry read here. */
export declare function configureClaimer(d: ClaimerDeps): void;
/**
 * Client-shape code for observability only; all non-ok shapes share one path.
 */
export type ClientShape = "ok" | "null-client" | "no-session" | "no-promptAsync";
/**
 * Single poll: claim due rows and inject each via promptAsync.
 * One bad row never stalls the queue.
 */
export declare function pollClaimer(): Promise<void>;
/**
 * Start per-process poll timer; one unref interval, cadence OUTBOX_POLL_MS.
 */
export declare function ensureClaimer(): void;
/** Dispose path: clear the poll timer only. */
export declare function clearClaimerTimer(): void;
/** Dispose path: release every unacked claim held by this process owners only. */
export declare function releaseClaimerOwner(): Promise<void>;
//# sourceMappingURL=claimer.d.ts.map
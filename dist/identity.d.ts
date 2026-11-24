/** Generic-title predicate; null and empty read generic, never clobbers real titles. */
export declare function isGenericTitle(t?: string | null): boolean;
/**
 * Display identity from explicit info, live fetch, then context.
 * Live fetch also reads model plus variant for registry learning.
 */
export declare function resolveIdentity(client: unknown, sessionId: string, info?: {
    agent?: string;
    directory?: string;
    title?: string;
}, ctx?: {
    agent?: string;
    directory?: string;
}): Promise<{
    agent: string;
    title: string | null;
    directory: string | undefined;
    model?: string;
    variant?: string;
}>;
/** Receiver wire triple: the RECEIVER's own agent+model, never the sender's. */
export interface ReceiverWireState {
    /** Receiver agent read from the resolving layer (always present, never allowlisted). */
    agent: string;
    /** Receiver model object for the wire `model` key. */
    model: {
        providerID: string;
        modelID: string;
    };
    /** Receiver variant, present only when known and non-default. */
    variant?: string;
    /** Which layer resolved the triple (live fetch wins over cached layers). */
    source: "live" | "registry" | "db";
}
/**
 * Closed miss vocabulary; every miss reads null, never branches.
 */
export type MissReason = "live-throw" | "live-miss-parse" | "direct-fetch-miss" | "direct-parse-fail" | "db-throw" | "db-row-absent" | "db-parse-fail" | "registry-absent" | "registry-unknown-agent" | "registry-no-model";
/** Layers that can contribute a trail step (the wire `source` domain is unchanged). */
export type MissLayer = "live" | "direct" | "db" | "registry";
/** One attempted layer plus why it missed. Skipped layers leave no step. */
export interface MissStep {
    layer: MissLayer;
    reason: MissReason;
}
/** Tagged detail beside the legacy nullable receiver: the decision plus its evidence. */
export interface ResolveDetail {
    receiver: ReceiverWireState | null;
    trail: MissStep[];
    /** Store evidence beside the trail; names the store plus the error. Never inside MissStep. */
    dbEvidence?: {
        dbPath: string;
        dbCode?: string;
        dbError?: string;
    };
}
/**
 * Receiver resolution across live, direct, db, and registry; miss reads null.
 * Skipped layers leave no step; every failure reads as miss, never throws.
 */
export declare function resolveReceiverWireDetailed(client: unknown, targetId: string, registryEntry?: {
    agent?: string;
    model?: string;
} | null, extra?: {
    directRow?: unknown;
}): Promise<ResolveDetail>;
/** Thin wrapper over `resolveReceiverWireDetailed`: identical decisions, evidence discarded. */
export declare function resolveReceiverWire(client: unknown, targetId: string, registryEntry?: {
    agent?: string;
    model?: string;
} | null, extra?: {
    directRow?: unknown;
}): Promise<ReceiverWireState | null>;
//# sourceMappingURL=identity.d.ts.map
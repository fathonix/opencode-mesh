export interface GcResult {
    prunedRegistry: number;
    prunedInbox: number;
    prunedAudit: number;
    prunedLive: number;
    prunedOutbox: number;
    deadLetterOutbox?: number;
    liveSkipped?: string;
}
/**
 * Nightly sweep for stale registry plus inbox drain plus outbox TTL.
 * One sweep owns every time delete so storage stays bounded.
 */
export declare function runGc(meshRoot?: string): Promise<GcResult>;
//# sourceMappingURL=gc.d.ts.map
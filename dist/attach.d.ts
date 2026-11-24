/** Focus marker: every oracle lacks a focus field, so attached records carry unknown. */
export declare const ATTACH_FOCUS_UNKNOWN = "unknown";
export interface PsAttach {
    /** Session ids parsed from opencode -s rows. */
    ids: string[];
    /** Bare-opencode rows carrying zero session id: counted, never synthesized into ids. */
    unmapped: number;
}
/**
 * Parse ps output into attached set plus bare-unmapped count; unmapped never creates ids.
 */
export declare function parsePsAttach(output: string): PsAttach;
export interface AttachSnapshot {
    attached: string[];
    unmapped: number;
    at: number;
}
/**
 * Attached set from ps alone. Status ids never attach: an idle-but-listed
 * session would otherwise stay expiry-exempt forever.
 */
export declare function computeAttachedSet(psIds: string[]): string[];
/**
 * One poller cycle; failed cycles drop without stopping timer, never throws.
 */
export declare function pollAttachOnce(opts?: {
    meshRoot?: string;
    psText?: string;
    statusMap?: Record<string, {
        type: string;
    }> | null;
}): Promise<AttachSnapshot>;
/** Start the per-process attach poller beside heartbeat plus claimer; unrefd so it never holds the process open. */
export declare function startAttachPoller(meshRoot?: string): void;
/** Stop the per-process attach poller (dispose path). */
export declare function stopAttachPoller(): void;
/**
 * Latest poller snapshot for the display join; copy, never the live row.
 * Null before the first cycle. Read-only: callers must not mutate the result.
 */
export declare function getAttachSnapshot(): AttachSnapshot | null;
//# sourceMappingURL=attach.d.ts.map
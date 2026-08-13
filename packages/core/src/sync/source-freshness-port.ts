/**
 * Phase 5.1 — Core SourceFreshnessPort.
 *
 * A narrow, read-facing port for source-readiness preparation and revalidation,
 * built on the existing checkpoint-evidence types. MCP read paths depend on this
 * port instead of reaching into Context or SyncManager readiness internals.
 */
import type { ProvenVectorGenerationReceipt } from '../generation/contracts';
import type {
    SourceFreshnessCheckpointEvidence,
    SourceFreshnessPathComparison,
} from './synchronizer';

/**
 * Proven source-freshness checkpoint evidence: a valid owned checkpoint
 * optionally bound to an exact proven generation receipt.
 */
export type ProvenSourceFreshnessCheckpointEvidence =
    | (Extract<SourceFreshnessCheckpointEvidence, { status: 'valid' }> & {
        readonly generationReceipt?: import('../generation/contracts').ProvenGenerationReceipt;
    })
    | Exclude<SourceFreshnessCheckpointEvidence, { status: 'valid' }>;

export interface PrepareCurrentSourceObservationOptions {
    checkpointIdentity?: string;
    requestBoundReceipt?: ProvenVectorGenerationReceipt;
}

export interface RevalidateCurrentSourceObservationOptions {
    expectedObservationToken: string;
    requestBoundReceipt?: ProvenVectorGenerationReceipt;
}

export type PreparedSourceObservation =
    | { available: true; evidence: ProvenSourceFreshnessCheckpointEvidence }
    | { available: false; evidence: Exclude<ProvenSourceFreshnessCheckpointEvidence, { status: 'valid' }> };

/**
 * Narrow dependencies the port needs from its host (Context).
 */
export interface SourceFreshnessPortDependencies {
    inspectSourceFreshnessCheckpoint(
        codebasePath: string,
        checkpointIdentity?: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<ProvenSourceFreshnessCheckpointEvidence>;
    compareSourceObservationToFreshnessCheckpoint(
        codebasePath: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison>;
    compareAllSourceToFreshnessCheckpoint(
        codebasePath: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison>;
    getRegisteredSourceFreshnessCheckpointObservation(codebasePath: string): string | null;
}

/**
 * Read-facing source freshness preparation and revalidation.
 */
export interface SourceFreshnessPort {
    /**
     * Establish the current source observation for a codebase: inspect the
     * checkpoint, bind the request receipt, and report availability with the
     * checkpoint evidence.
     */
    prepareCurrentSourceObservation(
        codebasePath: string,
        options?: PrepareCurrentSourceObservationOptions,
    ): Promise<PreparedSourceObservation>;

    /**
     * Revalidate that the prepared observation is still current: the registered
     * synchronizer's observation token must match the expected token.
     */
    revalidateCurrentSourceObservation(
        codebasePath: string,
        options: RevalidateCurrentSourceObservationOptions,
    ): Promise<boolean>;

    /**
     * Compare the current source tree against the owned checkpoint (drift check).
     */
    compareCurrentSourceToCheckpoint(
        codebasePath: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison>;

    /**
     * Compare the entire current source tree against the owned checkpoint,
     * forcing full-path hashing (the strongest drift proof). Used on the
     * fallback path where a partial comparison would be insufficient.
     */
    compareAllCurrentSourceToCheckpoint(
        codebasePath: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison>;

    /**
     * The currently registered observation token for a codebase, or null.
     */
    currentObservationToken(codebasePath: string): string | null;
}

export function createSourceFreshnessPort(
    deps: SourceFreshnessPortDependencies,
): SourceFreshnessPort {
    return {
        async prepareCurrentSourceObservation(codebasePath, options) {
            const evidence = await deps.inspectSourceFreshnessCheckpoint(
                codebasePath,
                options?.checkpointIdentity,
                options?.requestBoundReceipt,
            );
            if (evidence.status !== 'valid') {
                return { available: false, evidence };
            }
            return { available: true, evidence };
        },

        async revalidateCurrentSourceObservation(codebasePath, options) {
            const current = deps.getRegisteredSourceFreshnessCheckpointObservation(codebasePath);
            return current !== null && current === options.expectedObservationToken;
        },

        async compareCurrentSourceToCheckpoint(codebasePath, requestBoundReceipt) {
            return deps.compareSourceObservationToFreshnessCheckpoint(codebasePath, requestBoundReceipt);
        },

        async compareAllCurrentSourceToCheckpoint(codebasePath, requestBoundReceipt) {
            return deps.compareAllSourceToFreshnessCheckpoint(codebasePath, requestBoundReceipt);
        },

        currentObservationToken(codebasePath) {
            return deps.getRegisteredSourceFreshnessCheckpointObservation(codebasePath);
        },
    };
}

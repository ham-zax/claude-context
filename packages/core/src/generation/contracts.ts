/**
 * Generation-domain contracts.
 *
 * Neutral module for the receipts, proofs, bindings, and snapshots shared by
 * the generation owners (`IndexAuthorityCoordinator`, `IndexGenerationWorkflow`)
 * and their consumers. Kept free of any import of `core/context.ts` so the
 * domain owners never depend on the composition façade.
 *
 * `Context` re-exports these names for public compatibility.
 */
import type { IndexCompletionMarkerDocument } from '../vectordb';
import type { ResolvedIndexPolicy } from '../policy/index-policy-runtime-service';
import type { CurrentNavigationGeneration, StagedNavigationSidecarGeneration } from '../symbols';
import type {
    CanonicalPolicyNavigationBinding,
    CanonicalPublicationBinding,
} from '../core/persisted-index-authority';
import type { DurableIndexAuthorityArtifact } from './restore-transaction';

export interface CustomIndexPolicyUpdate {
    customExtensions?: string[];
    customIgnorePatterns?: string[];
}

export interface ObservedResolvedIndexPolicy extends ResolvedIndexPolicy {
    controlSignature: string;
}

export interface ProvenVectorGenerationReceipt {
    readonly collectionName: string;
    readonly marker: IndexCompletionMarkerDocument;
    readonly policy: ResolvedIndexPolicy;
    readonly publication?: CanonicalPublicationBinding;
    readonly policyDocumentDigest: string;
    readonly exactPayloadCount: number;
    readonly observations: {
        readonly profileFileToken: string | null;
        readonly policyFileToken: string;
    };
}

export interface ProvenGenerationReceipt extends Omit<ProvenVectorGenerationReceipt, 'observations'> {
    readonly navigation: CurrentNavigationGeneration;
    readonly observations: ProvenVectorGenerationReceipt['observations'] & {
        readonly navigationToken: string;
    };
}

export type NavigationGenerationProof =
    | { status: 'valid'; generation: CurrentNavigationGeneration; observationToken: string }
    | { status: 'not_bound' | 'missing' | 'incompatible' | 'corrupt' | 'requires_reindex' | 'unsupported' };

export type IndexPolicyPublicationReceipt =
    | {
        status: 'committed';
        operation: 'publish';
        canonicalRoot: string;
        documentDigest: string;
        policyHash: string;
        collectionName: string;
        navigation: CanonicalPolicyNavigationBinding;
        publication?: CanonicalPublicationBinding;
    }
    | {
        status: 'committed';
        operation: 'clear';
        canonicalRoot: string;
        previousDocumentDigest: string | null;
    };

export type DurableIndexAuthoritySnapshot = {
    canonicalRoot: string;
    policyDocument: DurableIndexAuthorityArtifact | null;
    navigationPointer: DurableIndexAuthorityArtifact | null;
};

export type PreparedIndexCollectionBinding = Readonly<{
    generation: number;
    operationId: string;
    collectionName?: string;
}>;

export type PreparedIndexCollectionReceipt = Readonly<PreparedIndexCollectionBinding & {
    canonicalRoot: string;
    collectionName: string;
}>;

export type IndexCodebaseResult = {
    indexedFiles: number;
    totalChunks: number;
    status: 'completed' | 'limit_reached';
    /** Exact SHA-256 identities of source bytes consumed by this full index. */
    indexedFileHashes: ReadonlyMap<string, string>;
    navigationCandidate?: StagedNavigationSidecarGeneration;
};

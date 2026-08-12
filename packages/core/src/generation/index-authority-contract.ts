/**
 * Phase 4.1 — frozen generation/publication authority contract.
 *
 * This module defines the single writer for active generation authority and the
 * narrow ports every dependency must satisfy. It intentionally owns NO mutable
 * state: Phase 4.2+ move state behind this contract. The existing
 * `createGenerationProofCoordinator()` factory remains the sole source of proof
 * caches and proof flights; this contract re-parents/composes that owner and
 * must never create a second proof cache or proof-flight registry.
 */
import type { GenerationProofCoordinator } from '../core/context';
import type { ProvenGenerationReceipt } from '../core/context';
import type { NavigationGenerationProof } from '../core/context';
import type { IndexPolicyPublicationReceipt } from '../core/context';
import type { DurableIndexAuthoritySnapshot } from '../core/context';
import type { ResolvedIndexPolicy } from '../policy/index-policy-runtime-service';
import type { DurableAuthorityRestoreTransactionMechanics } from './restore-transaction';

/** The single writer of active generation/publication authority. */
export const generationAuthorityWriter = 'IndexAuthorityCoordinator' as const;
export type GenerationAuthorityWriter = typeof generationAuthorityWriter;

/** Every mutable domain this writer owns. */
export const generationAuthorityOwnedDomains = [
    'generation-proof-caches-and-flights',
    'published-collection-marker-navigation-policy-binding',
    'phase-aware-read-publication-retention-gate',
    'activation-rollback-retention-proof-rebinding-durable-restoration',
] as const;
export type GenerationAuthorityOwnedDomain = (typeof generationAuthorityOwnedDomains)[number];

/** Domains this writer must NOT own (they belong to their established owners). */
export const generationAuthorityNonOwnedDomains = [
    'scanning-or-embedding',
    'semantic-ranking',
    'mcp-snapshots-or-root-leases',
    'navigation-artifact-serialization',
    'source-checkpoint-persistence',
] as const;
export type GenerationAuthorityNonOwnedDomain = (typeof generationAuthorityNonOwnedDomains)[number];

/** Proof-state source: the existing factory. No second registry is allowed. */
export const generationProofStateSource = {
    kind: 'existing-generation-proof-coordinator-factory' as const,
    factory: 'createGenerationProofCoordinator' as const,
    proofCacheCount: 1,
    proofFlightRegistryCount: 1,
} as const;

/** Narrow ports (read/type dependencies only) the writer may consume. */

/** Scanning/embedding belong to their established owners; the writer only reads results. */
export type ScanningEmbeddingPort = Readonly<{
    scanAndEmbed: (canonicalRoot: string) => Promise<unknown>;
}>;

/** Semantic ranking stays with its owner; the writer consumes ranked outcomes only. */
export type SemanticRankingPort = Readonly<{
    rank: (candidates: unknown) => Promise<unknown>;
}>;

/** MCP snapshot lifecycle and root leases belong to MCP; the writer never holds them. */
export type McpSnapshotRootLeasePort = Readonly<{
    observeSnapshot: (canonicalRoot: string) => Promise<unknown>;
}>;

/** Navigation artifact serialization stays with its owner; the writer consumes artifacts. */
export type NavigationArtifactSerializationPort = Readonly<{
    serialize: (generation: unknown) => Promise<unknown>;
}>;

/** Source checkpoint persistence belongs to FileSynchronizer; the writer consumes evidence. */
export type SourceCheckpointPersistencePort = Readonly<{
    readCheckpointEvidence: (canonicalRoot: string) => Promise<unknown>;
}>;

/** Durable restore mechanics are infrastructure; the writer decides when to invoke them. */
export type DurableRestoreMechanicsPort = Readonly<{
    mechanics: DurableAuthorityRestoreTransactionMechanics;
}>;

/** Contract-facing proof state: the coordinator brand plus its receipts. */
export type GenerationProofStatePort = Readonly<{
    coordinator: GenerationProofCoordinator;
    readProof: (identity: string) => unknown;
    startProofFlight: (identity: string) => Promise<unknown>;
}>;

/** Published binding state the writer owns. */
export type PublishedBindingPort = Readonly<{
    readPublishedPolicy: (canonicalRoot: string) => ResolvedIndexPolicy | null;
    readPublishedReceipt: (canonicalRoot: string) => IndexPolicyPublicationReceipt | null;
}>;

/** Phase-aware read/publication/retention gate the writer owns. */
export type PhaseGatePort = Readonly<{
    activeReaders: (canonicalRoot: string) => number;
    publicationPending: (canonicalRoot: string) => boolean;
}>;

/** The frozen authority contract: one writer, owned domains, narrow ports. */
export type IndexAuthorityContract = Readonly<{
    writer: GenerationAuthorityWriter;
    ownedDomains: readonly GenerationAuthorityOwnedDomain[];
    nonOwnedDomains: readonly GenerationAuthorityNonOwnedDomain[];
    proofStateSource: typeof generationProofStateSource;
    dependencies: Readonly<{
        scanningEmbedding: ScanningEmbeddingPort;
        semanticRanking: SemanticRankingPort;
        mcpSnapshotRootLease: McpSnapshotRootLeasePort;
        navigationArtifactSerialization: NavigationArtifactSerializationPort;
        sourceCheckpointPersistence: SourceCheckpointPersistencePort;
        durableRestoreMechanics: DurableRestoreMechanicsPort;
    }>;
    proofState: GenerationProofStatePort;
    publishedBinding: PublishedBindingPort;
    phaseGate: PhaseGatePort;
}>;

/** Compile-time witness: the contract names exactly one writer. */
export const indexAuthorityContract = {
    writer: generationAuthorityWriter,
    ownedDomains: generationAuthorityOwnedDomains,
    nonOwnedDomains: generationAuthorityNonOwnedDomains,
    proofStateSource: generationProofStateSource,
} as const satisfies Pick<
    IndexAuthorityContract,
    'writer' | 'ownedDomains' | 'nonOwnedDomains' | 'proofStateSource'
>;

/** Inputs/results the writer must accept (Phase 4.2+ implement these). */
export type AuthorityOperation =
    | { kind: 'publish'; canonicalRoot: string; policy: ResolvedIndexPolicy }
    | { kind: 'clear'; canonicalRoot: string }
    | { kind: 'restore'; canonicalRoot: string; snapshot: DurableIndexAuthoritySnapshot }
    | { kind: 'read'; canonicalRoot: string }
    | { kind: 'retain'; canonicalRoot: string }
    | { kind: 'rebind'; canonicalRoot: string; receipt: ProvenGenerationReceipt }
    | { kind: 'activate'; canonicalRoot: string; receipt: ProvenGenerationReceipt };

export type AuthorityOperationResult =
    | { kind: 'publication'; receipt: IndexPolicyPublicationReceipt }
    | { kind: 'navigation-proof'; proof: NavigationGenerationProof }
    | { kind: 'restored'; result: unknown }
    | { kind: 'read'; binding: ResolvedIndexPolicy | null };

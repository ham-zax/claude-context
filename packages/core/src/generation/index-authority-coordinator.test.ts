import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    ProvenVectorGenerationReceipt,
} from './contracts';
import {
    createGenerationProofCoordinator,
    IndexAuthorityCoordinator,
    type IndexAuthorityDecisionPorts,
} from './index-authority-coordinator';
import type { ResolvedIndexPolicy } from '../policy/index-policy-runtime-service';
import type {
    IndexCompletionFingerprint,
    IndexCompletionMarkerDocument,
} from '../vectordb/types';

const canonicalRoot = '/repo';
const policyHash = 'p'.repeat(64);
const policyDocumentDigest = 'd'.repeat(64);

function currentFingerprint(
    overrides: Partial<IndexCompletionFingerprint> = {},
): IndexCompletionFingerprint {
    return {
        embeddingProvider: 'test',
        embeddingModel: 'test-model',
        embeddingDimension: 4,
        embeddingArtifactDigest: null,
        embeddingNormalizationPolicy: 'provider_output_v1',
        vectorStoreProvider: 'LanceDB',
        schemaVersion: 'hybrid_v3',
        parserVersion: 'parser-v1',
        extractorVersion: 'extractor-v1',
        relationshipVersion: 'relationship-v1',
        embeddingProjectionVersion: 'embedding-projection-v1',
        lexicalProjectionVersion: 'lexical-projection-v1',
        ...overrides,
    };
}

function policy(): ResolvedIndexPolicy {
    return {
        canonicalRoot,
        profile: 'default',
        customExtensions: [],
        customIgnorePatterns: [],
        fileBasedIgnorePatterns: [],
        supportedExtensions: ['.ts'],
        effectiveIgnorePatterns: [],
        policyHash,
    };
}

function marker(
    fingerprint: IndexCompletionFingerprint,
    navigation: IndexCompletionMarkerDocument['navigation'],
    runId = 'run-a',
): IndexCompletionMarkerDocument {
    return {
        kind: 'satori_index_completion_v3',
        codebasePath: canonicalRoot,
        fingerprint,
        indexedFiles: 1,
        totalChunks: 2,
        completedAt: '2026-08-13T00:00:00.000Z',
        runId,
        indexPolicyHash: policyHash,
        indexStatus: 'completed',
        navigation,
    };
}

function publication(markerRunId: string, manifestHash: string) {
    return {
        activationId: 'activation-a',
        sourceCheckpoint: {
            collectionName: 'chunks',
            markerRunId,
            indexPolicyHash: policyHash,
            merkleRoot: 'm'.repeat(64),
            documentDigest: 'c'.repeat(64),
        },
        graph: {
            kind: 'relationship_manifest_v2' as const,
            manifestHash,
        },
        receipt: {
            ownerId: 'owner-a',
            generation: 1,
            operationId: 'operation-a',
        },
    };
}

function buildPorts(
    fingerprint: IndexCompletionFingerprint,
    navigationObservation: { status: 'valid'; token: string },
): IndexAuthorityDecisionPorts {
    return {
        buildIndexCompletionFingerprint: () => fingerprint,
        indexPolicyRuntimeService: {
            getPolicyFileToken: () => 'policy-file-token',
            getPolicyDocumentDigest: () => policyDocumentDigest,
            getPolicyRuntimeCompatibility: () => true,
            resolveCustomIndexPolicyFileToken: () => 'policy-file-token',
        },
        resolveRepoConfigObservationToken: () => null,
        resolveNavigationObservation: () => navigationObservation,
        vectorDatabase: {
            getPublicationObservation: () => 'publication-observation',
        },
    } as unknown as IndexAuthorityDecisionPorts;
}

test('authority decisions run on IndexAuthorityCoordinator without constructing Context', async () => {
    const fingerprint = currentFingerprint();
    const coordinator = new IndexAuthorityCoordinator(
        createGenerationProofCoordinator(),
        buildPorts(fingerprint, { status: 'valid', token: 'navigation-token' }),
    );
    const activePolicy = policy();
    const activeMarker = marker(fingerprint, {
        status: 'sealed',
        generationId: 'generation-a',
        symbolRegistryManifestHash: 'symbol-manifest-a',
        relationshipManifestHash: 'relationship-manifest-a',
        sealHash: 'seal-a',
    });
    const activeBinding = {
        collectionName: 'chunks',
        policyHash,
        navigation: {
            status: 'sealed' as const,
            generationId: 'generation-a',
            sealHash: 'seal-a',
        },
        publication: publication(activeMarker.runId, 'relationship-manifest-a'),
    };
    coordinator.activatePublishedIndexPolicy(activePolicy, activeBinding);

    const authority = coordinator.resolveEffectiveNavigationAuthority(
        activeMarker,
        activePolicy,
        activeBinding,
    );
    assert.deepEqual(authority, {
        status: 'sealed',
        generationId: 'generation-a',
        sealHash: 'seal-a',
        expectedSymbolRegistryManifestHash: 'symbol-manifest-a',
        expectedRelationshipManifestHash: 'relationship-manifest-a',
        relationshipOnlyUpgrade: false,
        useBoundGeneration: true,
    });

    const observations = coordinator.getIndexAuthorityObservations(canonicalRoot);
    assert.ok(observations);
    assert.match(observations.navigation, /navigation-token/);
    assert.match(
        await coordinator.resolveGenerationProofIdentity(canonicalRoot) ?? '',
        /publication-observation/,
    );

    const receipt: ProvenVectorGenerationReceipt = {
        collectionName: 'chunks',
        marker: activeMarker,
        policy: activePolicy,
        policyDocumentDigest,
        exactPayloadCount: activeMarker.totalChunks,
        observations: {
            profileFileToken: null,
            policyFileToken: 'policy-file-token',
        },
    };
    assert.equal(
        coordinator.isPreparedVectorReceiptBoundToCurrentAuthority(canonicalRoot, receipt),
        true,
    );
});

test('authority owner preserves marker ABA and publication decision boundaries', () => {
    const fingerprint = currentFingerprint();
    const coordinator = new IndexAuthorityCoordinator(
        createGenerationProofCoordinator(),
        buildPorts(fingerprint, { status: 'valid', token: 'navigation-token' }),
    );
    const activePolicy = policy();
    const activeMarker = marker(fingerprint, {
        status: 'sealed',
        generationId: 'generation-a',
        symbolRegistryManifestHash: 'symbol-manifest-a',
        relationshipManifestHash: 'relationship-manifest-a',
        sealHash: 'seal-a',
    });
    const activeBinding = {
        collectionName: 'chunks',
        policyHash,
        navigation: {
            status: 'sealed' as const,
            generationId: 'generation-a',
            sealHash: 'seal-a',
        },
        publication: publication(activeMarker.runId, 'different-relationship-manifest'),
    };

    assert.equal(
        coordinator.indexCompletionMarkersEqual(
            activeMarker,
            coordinator.cloneIndexCompletionMarker(activeMarker),
        ),
        true,
    );
    assert.equal(
        coordinator.indexCompletionMarkersEqual(
            activeMarker,
            marker(activeMarker.fingerprint, activeMarker.navigation, 'run-b'),
        ),
        false,
    );

    const publicationAuthority = coordinator.resolveEffectiveNavigationAuthority(
        activeMarker,
        activePolicy,
        activeBinding,
    );
    assert.deepEqual(publicationAuthority, {
        status: 'sealed',
        generationId: 'generation-a',
        sealHash: 'seal-a',
        expectedRelationshipManifestHash: 'different-relationship-manifest',
        relationshipOnlyUpgrade: false,
        useBoundGeneration: true,
    });
});

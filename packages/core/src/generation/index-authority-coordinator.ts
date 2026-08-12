/**
 * Phase 4.2 — generation authority coordinator.
 *
 * Owns the generation proof caches and proof flights by composing the existing
 * `createGenerationProofCoordinator()` owner. This module is the single source
 * of proof state: it must never create a second proof cache or proof-flight
 * registry (Phase 4.1 frozen contract: proofCacheCount=1, proofFlightRegistryCount=1).
 * Context delegates through `IndexAuthorityCoordinator`; public API unchanged.
 */
import type { ProvenVectorGenerationReceipt } from '../core/context';
import type { ProvenGenerationReceipt } from '../core/context';
import type { NavigationGenerationProof } from '../core/context';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
    IndexPolicyPublicationError,
    type DurableIndexAuthoritySnapshot,
} from '../core/context';
import {
    type IndexCompletionMarkerDocument,
} from '../vectordb/types';
import {
    type CanonicalPolicyNavigationBinding,
} from '../core/persisted-index-authority';
import {
    DurableAuthorityRestoreTransactionMechanics,
} from './restore-transaction';
import {
    ResolvedIndexPolicy,
    IndexPolicyRuntimeBinding,
    IndexFormatRequiresReindexError,
    UnsupportedIndexAuthorityError,
} from '../policy/index-policy-runtime-service';
import {
    deleteCollectionWithVerification,
} from '../vectordb';
import {
    DurableIndexAuthorityArtifact,
    type DurableAuthorityMutationOwner,
    type DurableAuthorityRestoreEntry,
    type DurableAuthorityRestoreTransaction,
} from './restore-transaction';
import {
    pruneNavigationSidecarGenerations,
} from '../symbols/sidecar-lifecycle';
import {
    RetiredNavigationPointerError,
    UnsupportedNavigationPointerError,
    type CurrentNavigationGeneration,
    resolveNavigationSidecarRoot,
    resolveCurrentNavigationGeneration,
} from '../symbols/sidecar-reads';
import {
    resolveNavigationSqlitePath,
    importNavigationToSqlite,
} from '../navigation/sqlite';
import { FileSynchronizer } from '../sync/synchronizer';


declare const generationProofCoordinatorBrand: unique symbol;
export type GenerationProofCoordinator = {
    readonly [generationProofCoordinatorBrand]: true;
};

export type CachedGenerationProof = {
    identity: string;
    vectorReceipt: ProvenVectorGenerationReceipt;
    generationReceipt?: ProvenGenerationReceipt;
    navigationArtifactsValidated: boolean;
    source: 'activation' | 'exact';
};

type GenerationProofCoordinatorState = {
    readonly proofs: Map<string, CachedGenerationProof>;
    readonly proofFlights: Map<string, Promise<CachedGenerationProof | null>>;
    readonly navigationFlights: Map<string, Promise<NavigationGenerationProof>>;
    readonly preparedReceipts: WeakMap<ProvenGenerationReceipt, string>;
};

const generationProofCoordinatorStates = new WeakMap<
    GenerationProofCoordinator,
    GenerationProofCoordinatorState
>();

export function createGenerationProofCoordinator(): GenerationProofCoordinator {
    const coordinator = Object.freeze({}) as GenerationProofCoordinator;
    generationProofCoordinatorStates.set(coordinator, {
        proofs: new Map(),
        proofFlights: new Map(),
        navigationFlights: new Map(),
        preparedReceipts: new WeakMap(),
    });
    return coordinator;
}

/**
 * The single authority owner for generation proof caches and proof flights.
 * Composes the coordinator created by `createGenerationProofCoordinator()`:
 * two instances constructed with the same coordinator share one proof registry.
 */

const EMPTY_AUTHORITY_PORTS: IndexAuthorityDecisionPorts = {
    canonicalizeCodebasePath: () => { throw new Error('authority ports not configured'); },
    clearResolvedIndexPolicyRuntime: () => { throw new Error('authority ports not configured'); },
    fsyncPath: () => { throw new Error('authority ports not configured'); },
    indexPolicyDocumentStore: {
        captureDocument: () => { throw new Error('authority ports not configured'); },
        resolvePolicyPath: () => { throw new Error('authority ports not configured'); },
    },
    indexPolicyMutationCoordinator: {
        withLock: () => { throw new Error('authority ports not configured'); },
    },
    indexPolicyRuntimeService: {
        deletePolicyFileToken: () => { throw new Error('authority ports not configured'); },
        getPolicyDocumentDigest: () => { throw new Error('authority ports not configured'); },
        resolveCustomIndexPolicyFileToken: () => { throw new Error('authority ports not configured'); },
    },
    refreshRuntimePolicyAuthority: () => { throw new Error('authority ports not configured'); },
    restoreTransactionMechanics: undefined as never,
    symbolRegistryStateRoot: undefined,
    listRelatedCollectionNames: async () => { throw new Error('authority ports not configured'); },
    vectorDatabase: {
        dropCollection: async () => { throw new Error('authority ports not configured'); },
        hasCollection: async () => { throw new Error('authority ports not configured'); },
    },
    indexCompletionMarkersEqual: () => { throw new Error('authority ports not configured'); },
    isPreparedVectorReceiptBoundToCurrentAuthority: () => { throw new Error('authority ports not configured'); },
    resolveCompletionMarkerForCollection: async () => { throw new Error('authority ports not configured'); },
    resolveGenerationProofIdentity: async () => { throw new Error('authority ports not configured'); },
    resolveEffectiveNavigationAuthority: () => { throw new Error('authority ports not configured'); },
    resolveNavigationObservationToken: () => { throw new Error('authority ports not configured'); },
    resolveRepoConfigObservationToken: () => { throw new Error('authority ports not configured'); },
    cloneIndexCompletionMarker: (marker) => marker,
    cloneProvenGenerationReceipt: (receipt) => receipt,
    cloneProvenVectorGenerationReceipt: (receipt) => receipt,
    publishResolvedIndexPolicy: () => { throw new Error('authority ports not configured'); },
    resolveProvenGeneration: async () => { throw new Error('authority ports not configured'); },
    policyNavigationBindingsEqual: () => { throw new Error('authority ports not configured'); },
};

export class IndexAuthorityCoordinator {
    private readonly state: GenerationProofCoordinatorState;
    private readonly ports: IndexAuthorityDecisionPorts;
    private readonly publishedPolicyBindingsByCodebase = new Map<
        string,
        IndexPolicyRuntimeBinding & { policyHash: string }
    >();
    private readonly publishedResolvedPoliciesByCodebase = new Map<string, ResolvedIndexPolicy>();

    constructor(
        coordinator: GenerationProofCoordinator,
        ports?: IndexAuthorityDecisionPorts,
    ) {
        const state = generationProofCoordinatorStates.get(coordinator);
        if (!state) {
            throw new Error('Generation proof coordinator must be created by createGenerationProofCoordinator().');
        }
        this.state = state;
        this.ports = ports ?? EMPTY_AUTHORITY_PORTS;
    }

    getPublishedPolicyBinding(
        canonicalRoot: string,
    ): (IndexPolicyRuntimeBinding & { policyHash: string }) | undefined {
        return this.publishedPolicyBindingsByCodebase.get(canonicalRoot);
    }

    setPublishedPolicyBinding(
        canonicalRoot: string,
        binding: IndexPolicyRuntimeBinding & { policyHash: string },
    ): void {
        this.publishedPolicyBindingsByCodebase.set(canonicalRoot, binding);
    }

    deletePublishedPolicyBinding(canonicalRoot: string): boolean {
        return this.publishedPolicyBindingsByCodebase.delete(canonicalRoot);
    }

    getPublishedResolvedPolicy(canonicalRoot: string): ResolvedIndexPolicy | undefined {
        return this.publishedResolvedPoliciesByCodebase.get(canonicalRoot);
    }

    setPublishedResolvedPolicy(canonicalRoot: string, policy: ResolvedIndexPolicy): void {
        this.publishedResolvedPoliciesByCodebase.set(canonicalRoot, policy);
    }

    deletePublishedResolvedPolicy(canonicalRoot: string): boolean {
        return this.publishedResolvedPoliciesByCodebase.delete(canonicalRoot);
    }

    hasPublishedResolvedPolicy(canonicalRoot: string): boolean {
        return this.publishedResolvedPoliciesByCodebase.has(canonicalRoot);
    }

    publishedResolvedPolicyRoots(): IterableIterator<string> {
        return this.publishedResolvedPoliciesByCodebase.keys();
    }

    publishedResolvedPolicySnapshot(): ReadonlyMap<string, ResolvedIndexPolicy> {
        return this.publishedResolvedPoliciesByCodebase;
    }

    publishedPolicyBindingSnapshot(): ReadonlyMap<string, IndexPolicyRuntimeBinding & { policyHash: string }> {
        return this.publishedPolicyBindingsByCodebase;
    }

    getGenerationProof(canonicalRoot: string): CachedGenerationProof | undefined {
        return this.state.proofs.get(canonicalRoot);
    }

    setGenerationProof(canonicalRoot: string, proof: CachedGenerationProof): void {
        this.state.proofs.set(canonicalRoot, proof);
    }

    deleteGenerationProof(canonicalRoot: string): boolean {
        return this.state.proofs.delete(canonicalRoot);
    }

    forEachGenerationProof(
        callback: (canonicalRoot: string, proof: CachedGenerationProof) => void,
    ): void {
        this.state.proofs.forEach((proof, canonicalRoot) => callback(canonicalRoot, proof));
    }

    getGenerationProofFlight(
        flightKey: string,
    ): Promise<CachedGenerationProof | null> | undefined {
        return this.state.proofFlights.get(flightKey);
    }

    setGenerationProofFlight(
        flightKey: string,
        flight: Promise<CachedGenerationProof | null>,
    ): void {
        this.state.proofFlights.set(flightKey, flight);
    }

    deleteGenerationProofFlight(flightKey: string, flight: Promise<CachedGenerationProof | null>): void {
        if (this.state.proofFlights.get(flightKey) === flight) {
            this.state.proofFlights.delete(flightKey);
        }
    }

    getNavigationProofFlight(
        flightKey: string,
    ): Promise<NavigationGenerationProof> | undefined {
        return this.state.navigationFlights.get(flightKey);
    }

    setNavigationProofFlight(
        flightKey: string,
        flight: Promise<NavigationGenerationProof>,
    ): void {
        this.state.navigationFlights.set(flightKey, flight);
    }

    deleteNavigationProofFlight(flightKey: string, flight: Promise<NavigationGenerationProof>): void {
        if (this.state.navigationFlights.get(flightKey) === flight) {
            this.state.navigationFlights.delete(flightKey);
        }
    }

    getPreparedGenerationReceipt(receipt: ProvenGenerationReceipt): string | undefined {
        return this.state.preparedReceipts.get(receipt);
    }

    setPreparedGenerationReceipt(receipt: ProvenGenerationReceipt, identity: string): void {
        this.state.preparedReceipts.set(receipt, identity);
    }

    deletePreparedGenerationReceipt(receipt: ProvenGenerationReceipt): boolean {
        return this.state.preparedReceipts.delete(receipt);
    }

    readonly publicationRetentionQueues: PublicationRetentionQueue = new Map();

    private readonly publicationReadGates = new Map<string, PublicationReadGate>();

    hasPublicationRetention(canonicalRoot: string): boolean {
        return this.publicationRetentionQueues.has(canonicalRoot);
    }

    async waitForPublicationRetention(canonicalRoot: string): Promise<void> {
        await this.publicationRetentionQueues.get(canonicalRoot);
    }

    hasActivePublicationReaders(canonicalRoot: string): boolean {
        return (this.publicationReadGates.get(canonicalRoot)?.activeReaders ?? 0) > 0;
    }

    private getPublicationReadGate(canonicalRoot: string): PublicationReadGate {
        let gate = this.publicationReadGates.get(canonicalRoot);
        if (!gate) {
            gate = {
                activeReaders: 0,
                activePublicationIds: new Set(),
                retentionPending: false,
                retentionCleaning: false,
            };
            this.publicationReadGates.set(canonicalRoot, gate);
        }
        return gate;
    }

    async acquirePublicationReadLease(canonicalRoot: string): Promise<() => void> {
        const gate = this.getPublicationReadGate(canonicalRoot);
        while (gate.retentionPending) {
            await gate.retentionFinished;
        }
        gate.activeReaders += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            gate!.activeReaders -= 1;
            if (gate!.activeReaders === 0) {
                gate!.resolveReadersDrained?.();
                gate!.readersDrained = undefined;
                gate!.resolveReadersDrained = undefined;
            }
        };
    }

    async acquireStagedPublicationLease(
        canonicalRoot: string,
        activationId: string,
    ): Promise<() => void> {
        const gate = this.getPublicationReadGate(canonicalRoot);
        while (gate.retentionCleaning) {
            await gate.retentionFinished;
        }
        gate.activePublicationIds.add(activationId);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            gate.activePublicationIds.delete(activationId);
        };
    }

    async acquirePublicationRetentionLease(
        canonicalRoot: string,
        activationId: string,
    ): Promise<(() => void) | null> {
        const gate = this.getPublicationReadGate(canonicalRoot);
        if (gate.retentionPending) {
            throw new Error(`Publication retention is already active for '${canonicalRoot}'.`);
        }
        gate.retentionPending = true;
        gate.retentionFinished = new Promise<void>((resolve) => {
            gate!.resolveRetentionFinished = resolve;
        });
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            gate.retentionCleaning = false;
            gate.retentionPending = false;
            gate.resolveRetentionFinished?.();
            gate.retentionFinished = undefined;
            gate.resolveRetentionFinished = undefined;
        };
        if (gate.activeReaders > 0) {
            gate.readersDrained = new Promise<void>((resolve) => {
                gate!.resolveReadersDrained = resolve;
            });
            await gate.readersDrained;
        }
        if ([...gate.activePublicationIds].some((id) => id !== activationId)) {
            release();
            return null;
        }
        gate.retentionCleaning = true;
        return release;
    }
    public async restoreDurableIndexAuthority(
        snapshot: DurableIndexAuthoritySnapshot,
        publishMutation: (publish: () => void) => void,
        expectedCurrent: DurableIndexAuthoritySnapshot,
        mutationOwner?: DurableAuthorityMutationOwner,
    ): Promise<DurableIndexAuthorityRestoreResult> {
        const canonicalRoot = this.ports.canonicalizeCodebasePath(snapshot.canonicalRoot);
        if (canonicalRoot !== snapshot.canonicalRoot) {
            throw new Error('Durable index authority snapshot root is not canonical.');
        }
        const validateArtifact = (
            name: string,
            artifact: DurableIndexAuthorityArtifact | null,
        ): void => {
            if (!artifact) return;
            if (!/^[a-f0-9]{64}$/.test(artifact.digest)) {
                throw new Error(`Captured ${name} digest is invalid.`);
            }
            const digest = crypto.createHash('sha256').update(artifact.content, 'utf8').digest('hex');
            if (digest !== artifact.digest) {
                throw new Error(`Captured ${name} bytes do not match their digest.`);
            }
        };
        validateArtifact('index policy', snapshot.policyDocument);
        validateArtifact('navigation pointer', snapshot.navigationPointer);
        if (expectedCurrent.canonicalRoot !== canonicalRoot) {
            throw new Error('Expected durable index authority root does not match the restoration root.');
        }
        validateArtifact('expected index policy', expectedCurrent.policyDocument);
        validateArtifact('expected navigation pointer', expectedCurrent.navigationPointer);

        const policyPath = this.ports.indexPolicyDocumentStore.resolvePolicyPath(canonicalRoot);
        const navigationRoot = resolveNavigationSidecarRoot(this.ports.symbolRegistryStateRoot, canonicalRoot);
        const pointerPath = path.join(navigationRoot, 'current.json');
        fs.mkdirSync(path.dirname(policyPath), { recursive: true });
        fs.mkdirSync(navigationRoot, { recursive: true });
        const id = crypto.randomUUID();
        const entries: DurableAuthorityRestoreEntry[] = [
            { targetPath: policyPath, artifact: snapshot.policyDocument, expected: expectedCurrent.policyDocument },
            { targetPath: pointerPath, artifact: snapshot.navigationPointer, expected: expectedCurrent.navigationPointer },
        ].map((entry) => ({
            targetPath: entry.targetPath,
            temporaryPath: `${entry.targetPath}.restore-${id}`,
            displacedPath: `${entry.targetPath}.rollback-${id}`,
            content: entry.artifact?.content ?? null,
            digest: entry.artifact?.digest ?? null,
            expectedDigest: entry.expected?.digest ?? null,
        }));
        for (const entry of entries) {
            if (entry.content !== null) {
                fs.writeFileSync(entry.temporaryPath, entry.content, 'utf8');
                this.ports.fsyncPath(entry.temporaryPath);
            }
        }
        const journalRoot = this.ports.restoreTransactionMechanics.journalRoot();
        fs.mkdirSync(journalRoot, { recursive: true });
        const journalPath = path.join(journalRoot, `${id}.json`);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            ...(mutationOwner ? { mutationOwner: { ...mutationOwner } } : {}),
            entries,
        };
        this.ports.restoreTransactionMechanics.writeDurableAuthorityRestoreTransaction(journalPath, transaction);

        let publicationCount = 0;
        let committed = false;
        try {
            publishMutation(() => {
                publicationCount += 1;
                if (publicationCount > 1) {
                    throw new Error('Durable index authority restoration invoked publish more than once.');
                }
                this.ports.indexPolicyMutationCoordinator.withLock(canonicalRoot, () => {
                    const current = this.captureDurableIndexAuthority(canonicalRoot);
                    if (
                        !this.ports.restoreTransactionMechanics.artifactMatchesPath(policyPath, expectedCurrent.policyDocument)
                        || !this.ports.restoreTransactionMechanics.artifactMatchesPath(pointerPath, expectedCurrent.navigationPointer)
                        || current.canonicalRoot !== expectedCurrent.canonicalRoot
                    ) {
                        throw new Error('Durable index authority changed after rollback capture; refusing stale restoration.');
                    }
                    this.ports.restoreTransactionMechanics.completeDurableAuthorityRestoreTransaction(journalPath, transaction);
                    committed = true;
                });
            });
            if (publicationCount !== 1 || !committed) {
                throw new Error('Durable index authority restoration returned without publishing.');
            }
        } catch (error) {
            if (transaction.phase === 'prepared') {
                for (const entry of entries) fs.rmSync(entry.temporaryPath, { force: true });
                fs.rmSync(journalPath, { force: true });
                this.ports.fsyncPath(journalRoot);
            }
            throw error;
        }

        this.ports.clearResolvedIndexPolicyRuntime(canonicalRoot);
        this.ports.indexPolicyRuntimeService.deletePolicyFileToken(canonicalRoot);
        const sqlitePath = resolveNavigationSqlitePath(this.ports.symbolRegistryStateRoot, canonicalRoot);
        try {
            this.ports.refreshRuntimePolicyAuthority(canonicalRoot);
        } catch (error) {
            if (
                error instanceof IndexFormatRequiresReindexError
                || error instanceof UnsupportedIndexAuthorityError
            ) {
                this.ports.clearResolvedIndexPolicyRuntime(canonicalRoot);
                this.ports.indexPolicyRuntimeService.deletePolicyFileToken(canonicalRoot);
                fs.rmSync(sqlitePath, { force: true });
                return error instanceof UnsupportedIndexAuthorityError
                    ? { status: 'restored_unsupported_authority' }
                    : { status: 'restored_requires_reindex' };
            }
            throw error;
        }
        fs.rmSync(sqlitePath, { force: true });
        try {
            await resolveCurrentNavigationGeneration(this.ports.symbolRegistryStateRoot, canonicalRoot);
        } catch (error) {
            if (
                error instanceof RetiredNavigationPointerError
                || error instanceof UnsupportedNavigationPointerError
            ) {
                this.ports.clearResolvedIndexPolicyRuntime(canonicalRoot);
                this.ports.indexPolicyRuntimeService.deletePolicyFileToken(canonicalRoot);
                return error instanceof UnsupportedNavigationPointerError
                    ? { status: 'restored_unsupported_authority' }
                    : { status: 'restored_requires_reindex' };
            }
            throw error;
        }
        try {
            await importNavigationToSqlite({
                stateRoot: this.ports.symbolRegistryStateRoot,
                normalizedRootPath: canonicalRoot,
            });
        } catch (error) {
            fs.rmSync(sqlitePath, { force: true });
            console.warn(
                `[Context] ⚠️  Durable authority was restored for '${canonicalRoot}', but its derived navigation sqlite cache could not be rebuilt: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return { status: 'restored_current' };
    }
    public captureDurableIndexAuthority(codebasePath: string): DurableIndexAuthoritySnapshot {
        const canonicalRoot = this.ports.canonicalizeCodebasePath(codebasePath);
        const navigationRoot = resolveNavigationSidecarRoot(this.ports.symbolRegistryStateRoot, canonicalRoot);
        const capture = (artifactPath: string): DurableIndexAuthorityArtifact | null => {
            try {
                const content = fs.readFileSync(artifactPath, 'utf8');
                return {
                    content,
                    digest: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
                };
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
                throw error;
            }
        };
        return {
            canonicalRoot,
            policyDocument: this.ports.indexPolicyDocumentStore.captureDocument(canonicalRoot),
            navigationPointer: capture(path.join(navigationRoot, 'current.json')),
        };
    }
    public activatePublishedIndexPolicy(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
    ): void {
        const canonicalRoot = policy.canonicalRoot;
        this.setPublishedPolicyBinding(canonicalRoot, {
            policyHash: policy.policyHash,
            collectionName: binding.collectionName,
            navigation: { ...binding.navigation },
            ...(binding.publication ? { publication: structuredClone(binding.publication) } : {}),
        });
        this.setPublishedResolvedPolicy(canonicalRoot, {
            ...policy,
            customExtensions: [...policy.customExtensions],
            customIgnorePatterns: [...policy.customIgnorePatterns],
            fileBasedIgnorePatterns: [...policy.fileBasedIgnorePatterns],
            supportedExtensions: [...policy.supportedExtensions],
            effectiveIgnorePatterns: [...policy.effectiveIgnorePatterns],
        });
    }
    public clearPublishedIndexPolicyRuntime(canonicalRoot: string): void {
        this.deletePublishedPolicyBinding(canonicalRoot);
        this.deletePublishedResolvedPolicy(canonicalRoot);
    }
    public schedulePublicationRetention(input: {
        canonicalRoot: string;
        activationId: string;
        activeCollectionName: string;
        previousCollectionName: string;
        activeNavigationGenerationId: string;
        previousNavigationGenerationId: string;
        activeDataObservation?: string;
    }): void {
        const previous = this.publicationRetentionQueues.get(input.canonicalRoot) ?? Promise.resolve();
        const retention = previous
            .catch(() => undefined)
            .then(async () => {
                const releaseRetention = await this.acquirePublicationRetentionLease(
                    input.canonicalRoot,
                    input.activationId,
                );
                if (!releaseRetention) return;
                try {
                    this.ports.refreshRuntimePolicyAuthority(input.canonicalRoot);
                    const activeBinding = this.getPublishedPolicyBinding(input.canonicalRoot);
                    if (
                        activeBinding?.collectionName !== input.activeCollectionName
                        || activeBinding.publication?.activationId !== input.activationId
                    ) return;

                    const retainedCollections = new Set([
                        input.activeCollectionName,
                        input.previousCollectionName,
                    ]);
                    for (const collectionName of await this.ports.listRelatedCollectionNames(input.canonicalRoot)) {
                        if (retainedCollections.has(collectionName)) continue;
                        this.ports.refreshRuntimePolicyAuthority(input.canonicalRoot);
                        const currentBinding = this.getPublishedPolicyBinding(input.canonicalRoot);
                        if (
                            currentBinding?.collectionName !== input.activeCollectionName
                            || currentBinding.publication?.activationId !== input.activationId
                        ) return;
                        await deleteCollectionWithVerification(this.ports.vectorDatabase, collectionName);
                    }

                    await pruneNavigationSidecarGenerations({
                        stateRoot: this.ports.symbolRegistryStateRoot,
                        normalizedRootPath: input.canonicalRoot,
                        keepGenerationIds: new Set([
                            input.activeNavigationGenerationId,
                            input.previousNavigationGenerationId,
                        ]),
                    });
                    await FileSynchronizer.pruneSnapshotsForGenerations(
                        input.canonicalRoot,
                        retainedCollections,
                    );
                    await this.rebindGenerationProofAfterRetention({
                        canonicalRoot: input.canonicalRoot,
                        activationId: input.activationId,
                        activeCollectionName: input.activeCollectionName,
                        expectedDataObservation: input.activeDataObservation,
                    });
                } finally {
                    releaseRetention();
                }
            })
            .catch((error) => {
                console.warn(
                    `[Context] ⚠️  Deferred publication generation cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            });
        this.publicationRetentionQueues.set(input.canonicalRoot, retention);
        void retention.finally(() => {
            if (this.publicationRetentionQueues.get(input.canonicalRoot) === retention) {
                this.publicationRetentionQueues.delete(input.canonicalRoot);
            }
        });
    }
    private async rebindGenerationProofAfterRetention(input: {
        canonicalRoot: string;
        activationId: string;
        activeCollectionName: string;
        expectedDataObservation?: string;
    }): Promise<void> {
        const cached = this.getGenerationProof(input.canonicalRoot);
        if (!cached || cached.vectorReceipt.collectionName !== input.activeCollectionName) return;
        const invalidate = () => {
            if (this.getGenerationProof(input.canonicalRoot) === cached) {
                this.deleteGenerationProof(input.canonicalRoot);
            }
        };

        this.ports.refreshRuntimePolicyAuthority(input.canonicalRoot);
        const binding = this.getPublishedPolicyBinding(input.canonicalRoot);
        if (
            binding?.collectionName !== input.activeCollectionName
            || binding.publication?.activationId !== input.activationId
            || !this.ports.isPreparedVectorReceiptBoundToCurrentAuthority(
                input.canonicalRoot,
                cached.vectorReceipt,
            )
        ) {
            invalidate();
            return;
        }

        const observeData = this.ports.vectorDatabase.getCollectionDataObservation;
        if (!input.expectedDataObservation || !observeData) {
            invalidate();
            return;
        }
        const activeStateMatches = async (): Promise<boolean> => {
            const [dataObservation, marker] = await Promise.all([
                observeData.call(this.ports.vectorDatabase, input.activeCollectionName),
                this.ports.resolveCompletionMarkerForCollection(
                    input.canonicalRoot,
                    input.activeCollectionName,
                ),
            ]);
            return dataObservation === input.expectedDataObservation
                && marker !== null
                && this.ports.indexCompletionMarkersEqual(marker, cached.vectorReceipt.marker);
        };
        if (!await activeStateMatches()) {
            invalidate();
            return;
        }

        const identity = await this.ports.resolveGenerationProofIdentity(input.canonicalRoot);
        if (!identity || !await activeStateMatches()) {
            invalidate();
            return;
        }

        // Lance generations share a control table. Removing an inactive sibling
        // advances that table's manifest. Carry the proof only after independently
        // proving that both the active data manifest and its marker remained exact
        // across the combined-observation read.
        this.setGenerationProof(input.canonicalRoot, { ...cached, identity });
    }
    public async recordActivatedGenerationProof(input: {
        canonicalRoot: string;
        marker: IndexCompletionMarkerDocument;
        policy: ResolvedIndexPolicy;
        navigation: CurrentNavigationGeneration;
        exactPayloadCount: number;
    }): Promise<ProvenGenerationReceipt | null> {
        const policyDocumentDigest = this.ports.indexPolicyRuntimeService.getPolicyDocumentDigest(input.canonicalRoot);
        const policyBinding = this.getPublishedPolicyBinding(input.canonicalRoot);
        const navigationAuthority = policyBinding
            ? this.ports.resolveEffectiveNavigationAuthority(
                input.marker,
                input.policy,
                policyBinding,
            )
            : null;
        if (
            !navigationAuthority
            || navigationAuthority.status !== 'sealed'
            || navigationAuthority.generationId !== input.navigation.generationId
            || navigationAuthority.sealHash !== input.navigation.navigationSealHash
        ) return null;
        const navigationToken = this.ports.resolveNavigationObservationToken(
            input.canonicalRoot,
            input.navigation.generationId,
            false,
        );
        const identity = await this.ports.resolveGenerationProofIdentity(input.canonicalRoot);
        if (!policyDocumentDigest || !navigationToken || !identity) return null;
        const receipt: ProvenGenerationReceipt = {
            collectionName: this.getPublishedPolicyBinding(input.canonicalRoot)?.collectionName ?? '',
            marker: this.ports.cloneIndexCompletionMarker(input.marker),
            policy: {
                ...input.policy,
                customExtensions: [...input.policy.customExtensions],
                customIgnorePatterns: [...input.policy.customIgnorePatterns],
                fileBasedIgnorePatterns: [...input.policy.fileBasedIgnorePatterns],
                supportedExtensions: [...input.policy.supportedExtensions],
                effectiveIgnorePatterns: [...input.policy.effectiveIgnorePatterns],
            },
            policyDocumentDigest,
            exactPayloadCount: input.exactPayloadCount,
            navigation: { ...input.navigation },
            observations: {
                profileFileToken: this.ports.resolveRepoConfigObservationToken(input.canonicalRoot),
                policyFileToken: this.ports.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(input.canonicalRoot)!,
                navigationToken,
            },
        };
        if (
            receipt.collectionName.length === 0
            || !receipt.observations.policyFileToken
            || !this.ports.isPreparedVectorReceiptBoundToCurrentAuthority(input.canonicalRoot, receipt)
        ) return null;
        this.setGenerationProof(input.canonicalRoot, {
            identity,
            vectorReceipt: this.ports.cloneProvenVectorGenerationReceipt(receipt),
            generationReceipt: this.ports.cloneProvenGenerationReceipt(receipt),
            navigationArtifactsValidated: true,
            source: 'activation',
        });
        const preparedReceipt = this.ports.cloneProvenGenerationReceipt(receipt);
        this.setPreparedGenerationReceipt(preparedReceipt, identity);
        return preparedReceipt;
    }
    public async publishResolvedIndexPolicyForMarker(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
        marker: IndexCompletionMarkerDocument,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        try {
            this.ports.publishResolvedIndexPolicy(policy, binding, publishMutation);
            return;
        } catch (error) {
            const receipt = error instanceof IndexPolicyPublicationError
                ? error.receipt
                : null;
            if (
                !receipt
                || receipt.operation !== 'publish'
                || receipt.canonicalRoot !== policy.canonicalRoot
                || receipt.policyHash !== policy.policyHash
                || receipt.collectionName !== binding.collectionName
                || !this.ports.policyNavigationBindingsEqual(receipt.navigation, binding.navigation)
            ) {
                throw error;
            }
            let proven: ProvenGenerationReceipt | null;
            try {
                proven = await this.ports.resolveProvenGeneration(policy.canonicalRoot);
            } catch {
                throw error;
            }
            if (
                !proven
                || proven.collectionName !== binding.collectionName
                || proven.marker.runId !== marker.runId
                || proven.marker.indexPolicyHash !== marker.indexPolicyHash
                || JSON.stringify(proven.marker.navigation) !== JSON.stringify(marker.navigation)
            ) {
                throw error;
            }
        }
    }

}
/**
 * Phase 4.3 — publication/read/retention gate state machine.
 *
 * The read gate serializes the Q/R publication invariant (6a5ee87): retention is
 * the only owner allowed to remove inactive physical generations, a
 * publication-bound reader holds a lease for its complete operation, and a
 * second activation cannot prune the collection or navigation generation a
 * reader uses. The retention queue serializes deferred generation cleanup.
 */
export type PublicationReadGate = {
    activeReaders: number;
    activePublicationIds: Set<string>;
    retentionPending: boolean;
    retentionCleaning: boolean;
    readersDrained?: Promise<void>;
    resolveReadersDrained?: () => void;
    retentionFinished?: Promise<void>;
    resolveRetentionFinished?: () => void;
};

export type PublicationRetentionQueue = Map<string, Promise<void>>;

type DurableIndexAuthorityRestoreResult =
    | { status: 'restored_current' }
    | { status: 'restored_requires_reindex' }
    | { status: 'restored_unsupported_authority' };

/**
 * Phase 4.4 — narrow dependencies for authority decisions. Context provides
 * these ports; the coordinator owns the authority decisions (activation,
 * rollback, retention, durable restoration) and published binding state.
 */

type EffectiveNavigationAuthority =
    | {
        status: 'not_bound';
        relationshipOnlyUpgrade: false;
        useBoundGeneration: boolean;
    }
    | {
        status: 'sealed';
        generationId: string;
        sealHash: string;
        expectedSymbolRegistryManifestHash?: string;
        expectedRelationshipManifestHash: string;
        relationshipOnlyUpgrade: boolean;
        useBoundGeneration: boolean;
    };

export type IndexAuthorityDecisionPorts = Readonly<{
    canonicalizeCodebasePath: (codebasePath: string) => string;
    clearResolvedIndexPolicyRuntime: (canonicalRoot: string) => void;
    fsyncPath: (targetPath: string) => void;
    indexPolicyDocumentStore: {
        captureDocument: (canonicalRoot: string) => DurableIndexAuthorityArtifact | null;
        resolvePolicyPath: (canonicalRoot: string) => string;
    };
    indexPolicyMutationCoordinator: {
        withLock: <T>(canonicalRoot: string, operation: () => T) => T;
    };
    indexPolicyRuntimeService: {
        deletePolicyFileToken: (canonicalRoot: string) => void;
        getPolicyDocumentDigest: (canonicalRoot: string) => string | undefined;
        resolveCustomIndexPolicyFileToken: (canonicalRoot: string) => string | null;
    };
    refreshRuntimePolicyAuthority: (canonicalRoot: string) => void;
    restoreTransactionMechanics: DurableAuthorityRestoreTransactionMechanics;
    symbolRegistryStateRoot: string | undefined;
    listRelatedCollectionNames: (canonicalRoot: string) => Promise<string[]>;
    vectorDatabase: {
        getCollectionDataObservation?: (collectionName: string) => Promise<string | null> | undefined;
        dropCollection: (collectionName: string) => Promise<void>;
        hasCollection: (collectionName: string) => Promise<boolean>;
    };
    indexCompletionMarkersEqual: (
        left: IndexCompletionMarkerDocument,
        right: IndexCompletionMarkerDocument,
    ) => boolean;
    isPreparedVectorReceiptBoundToCurrentAuthority: (
        canonicalRoot: string,
        receipt: ProvenVectorGenerationReceipt,
    ) => boolean;
    resolveCompletionMarkerForCollection: (
        canonicalRoot: string,
        collectionName: string,
    ) => Promise<IndexCompletionMarkerDocument | null>;
    resolveGenerationProofIdentity: (canonicalRoot: string) => Promise<string | null>;
    resolveEffectiveNavigationAuthority: (
        marker: IndexCompletionMarkerDocument,
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding & { policyHash: string },
    ) => EffectiveNavigationAuthority | null;
    resolveNavigationObservationToken: (
        canonicalRoot: string,
        generationId: string,
        strict: boolean,
    ) => string | null;
    resolveRepoConfigObservationToken: (canonicalRoot: string) => string | null;
    cloneIndexCompletionMarker: (
        marker: IndexCompletionMarkerDocument,
    ) => IndexCompletionMarkerDocument;
    cloneProvenGenerationReceipt: (receipt: ProvenGenerationReceipt) => ProvenGenerationReceipt;
    cloneProvenVectorGenerationReceipt: (
        receipt: ProvenVectorGenerationReceipt,
    ) => ProvenVectorGenerationReceipt;
    publishResolvedIndexPolicy: (
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
        publishMutation?: (publish: () => void) => void,
    ) => void;
    resolveProvenGeneration: (
        canonicalRoot: string,
    ) => Promise<ProvenGenerationReceipt | null>;
    policyNavigationBindingsEqual: (
        left: CanonicalPolicyNavigationBinding,
        right: CanonicalPolicyNavigationBinding,
    ) => boolean;
}>;

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
export class IndexAuthorityCoordinator {
    private readonly state: GenerationProofCoordinatorState;

    constructor(coordinator: GenerationProofCoordinator) {
        const state = generationProofCoordinatorStates.get(coordinator);
        if (!state) {
            throw new Error('Generation proof coordinator must be created by createGenerationProofCoordinator().');
        }
        this.state = state;
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

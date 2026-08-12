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
}

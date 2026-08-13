import type {
    NavigationStore,
    PreparedGenerationRevalidation,
    ProvenGenerationReceipt,
    ProvenVectorGenerationReceipt,
    SourceFreshnessPort,
} from "@zokizuan/satori-core";
import type { SearchReadinessDebugHint, SearchReadinessInvalidationReason } from "./search-types.js";
import type {
    PreparedReadObservationResult,
    PreparedReadObservationUnavailableReason,
} from "./sync.js";
import type { TrackedRootReadinessState } from "./tracked-root-readiness.js";
import { PreparedReadCache } from "./prepared-read-cache.js";

const PREPARED_NAVIGATION_CACHE_MAX_ROOTS = 32;
const PREPARED_NAVIGATION_CACHE_MAX_FILES_PER_ROOT = 64;
const PREPARED_NAVIGATION_CACHE_MAX_COMPATIBILITY_RESULTS_PER_ROOT = 8;

type PreparedReadState = Extract<TrackedRootReadinessState, { state: "ready" }>;
type PreparedReadObservationSnapshot = {
    vectorAuthority: string;
    navigationAuthority: string;
    mutationGeneration: number;
};

export type PreparedReadCacheObservationResult = {
    observation: string | null;
    sourceObservation: string | null;
    unavailableReason?: PreparedReadObservationUnavailableReason;
};

export type StatusPreparedReadObservation = {
    observation: string;
    sourceObservation: string | null;
    unavailableReason: PreparedReadObservationUnavailableReason | null;
};

export type CachedPreparedReadResult =
    | {
        status: "hit";
        state: PreparedReadState;
    }
    | {
        status: "miss";
        reason: SearchReadinessInvalidationReason;
        observationUnavailableReason?: PreparedReadObservationUnavailableReason;
    };

type NavigationManifestState = Awaited<ReturnType<NavigationStore["getManifest"]>>;
type NavigationManifestOk = Extract<NavigationManifestState, { status: "ok" }>;
type NavigationSymbolsByFileState = Awaited<ReturnType<NavigationStore["getSymbolsByFile"]>>;
type NavigationSymbolsByFileOk = Extract<NavigationSymbolsByFileState, { status: "ok" }>;
type NavigationCompatibilityState = Awaited<ReturnType<NavigationStore["getCompatibilityState"]>>;

type PreparedNavigationCacheEntry = {
    identity: string;
    manifest?: NavigationManifestOk;
    symbolsByFile: Map<string, NavigationSymbolsByFileOk>;
    compatibilityByManifestHash: Map<string, NavigationCompatibilityState>;
};

export interface GenerationAuthorityReader {
    getPreparedAuthorityObservation(codebasePath: string): string | null;
    isPreparedVectorReceiptBoundToCurrentAuthority(
        codebasePath: string,
        receipt: ProvenVectorGenerationReceipt,
    ): boolean;
}

/**
 * The MCP adapter extends Core's source-freshness port with the watcher-backed
 * observation used by prepared reads. The extension stays at the MCP seam:
 * Core's port remains independent of watcher lifecycle details.
 */
export interface PreparedReadSourceFreshnessPort extends SourceFreshnessPort {
    getPreparedReadObservation(codebasePath: string): PreparedReadObservationResult;
}

export interface PreparedGenerationRevalidator {
    revalidatePreparedGeneration(
        codebasePath: string,
        receipt: ProvenVectorGenerationReceipt,
        options?: {
            priorGenerationReceipt?: ProvenGenerationReceipt;
            navigationObservationChanged?: boolean;
        },
    ): Promise<PreparedGenerationRevalidation | null>;
}

export interface Clock {
    now(): number;
}

export interface PreparedReadCacheOwnerDependencies {
    authority: GenerationAuthorityReader;
    sourceFreshness: PreparedReadSourceFreshnessPort;
    getGenerationRevalidator?: () => PreparedGenerationRevalidator | undefined;
    navigationStore: NavigationStore;
    clock: Clock;
    isPathWithinCodebase(targetPath: string, root: string): boolean;
    canonicalNavigationAuthorityAvailable: boolean;
}

function setBoundedCacheEntry<K, V>(
    cache: Map<K, V>,
    key: K,
    value: V,
    maxEntries: number,
): void {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxEntries) {
        const oldestKey = cache.keys().next().value as K | undefined;
        if (oldestKey === undefined) return;
        cache.delete(oldestKey);
    }
}

function parsePreparedReadObservation(value: string): PreparedReadObservationSnapshot | null {
    try {
        const parsed = JSON.parse(value) as Partial<PreparedReadObservationSnapshot>;
        return typeof parsed.vectorAuthority === "string"
            && typeof parsed.navigationAuthority === "string"
            && typeof parsed.mutationGeneration === "number"
            ? parsed as PreparedReadObservationSnapshot
            : null;
    } catch {
        return null;
    }
}

function sourceBackedBindingMatchesPreparedObservation(
    binding: NonNullable<PreparedReadState["sourceBackedNavigationBinding"]>,
    preparedObservation: string,
): boolean {
    const observation = parsePreparedReadObservation(preparedObservation);
    if (!observation) return false;
    try {
        const navigationAuthority = JSON.parse(observation.navigationAuthority) as {
            binding?: {
                status?: unknown;
                generationId?: unknown;
                sealHash?: unknown;
            };
            observation?: {
                status?: unknown;
                token?: unknown;
            };
        };
        const authorityBinding = navigationAuthority.binding;
        const authorityObservation = navigationAuthority.observation;
        if (
            authorityBinding?.status !== "sealed"
            || authorityBinding.generationId !== binding.generationId
            || authorityBinding.sealHash !== binding.navigationSealHash
            || authorityObservation?.status !== "valid"
            || typeof authorityObservation.token !== "string"
        ) {
            return false;
        }
        const token = JSON.parse(authorityObservation.token) as {
            symbolRegistryManifestHash?: unknown;
            relationshipManifestHash?: unknown;
            navigationSealHash?: unknown;
        };
        return token.symbolRegistryManifestHash === binding.symbolRegistryManifestHash
            && token.relationshipManifestHash === binding.relationshipManifestHash
            && token.navigationSealHash === binding.navigationSealHash;
    } catch {
        return false;
    }
}

export class PreparedReadCacheOwner {
    private readonly dependencies: PreparedReadCacheOwnerDependencies;
    private readonly preparedReadCache = new PreparedReadCache<PreparedReadState>();
    private readonly statusPreparedReadObservations = new Map<string, StatusPreparedReadObservation>();
    private readonly preparedNavigationCache = new Map<string, PreparedNavigationCacheEntry>();

    public constructor(dependencies: PreparedReadCacheOwnerDependencies) {
        this.dependencies = dependencies;
    }

    /** Compatibility inspection for existing focused tests; writes remain owned here. */
    public get cache(): PreparedReadCache<PreparedReadState> {
        return this.preparedReadCache;
    }

    public getPreparedAuthorityObservation(codebasePath: string): string | null {
        return this.dependencies.authority.getPreparedAuthorityObservation(codebasePath);
    }

    public getPreparedReadCacheObservation(codebasePath: string): PreparedReadCacheObservationResult {
        const authorityObservation = this.getPreparedAuthorityObservation(codebasePath);
        if (!authorityObservation) return { observation: null, sourceObservation: null };

        try {
            const sourceObservation = this.dependencies.sourceFreshness.getPreparedReadObservation(codebasePath);
            if (!sourceObservation.available) {
                return {
                    observation: authorityObservation,
                    sourceObservation: null,
                    unavailableReason: sourceObservation.reason,
                };
            }
            return {
                observation: authorityObservation,
                sourceObservation: JSON.stringify(sourceObservation.observation),
            };
        } catch {
            return {
                observation: authorityObservation,
                sourceObservation: null,
                unavailableReason: "source_observation_failed",
            };
        }
    }

    public evictPreparedRead(codebasePath: string): void {
        this.preparedReadCache.evict(codebasePath);
        this.statusPreparedReadObservations.delete(codebasePath);
        this.preparedNavigationCache.delete(codebasePath);
    }

    public getPreparedNavigationIdentity(preparedRead: PreparedReadState): string | null {
        try {
            const receipt = preparedRead.generationReceipt;
            const preparedObservation = preparedRead.preparedObservation;
            const root = preparedRead.root.path;
            if (
                preparedRead.navigationStatus !== "valid"
                || !receipt
                || !preparedObservation
                || receipt.policy.canonicalRoot !== root
                || this.getPreparedAuthorityObservation(root) !== preparedObservation
            ) {
                return null;
            }
            const identityParts = [
                receipt.collectionName,
                receipt.marker.runId,
                receipt.policyDocumentDigest,
                receipt.policy.policyHash,
                receipt.navigation.generationId,
                receipt.navigation.symbolRegistryManifestHash,
                receipt.navigation.relationshipManifestHash,
                receipt.navigation.navigationSealHash,
                receipt.observations.navigationToken,
            ];
            if (identityParts.some((value) => typeof value !== "string" || value.length === 0)) {
                return null;
            }
            const observation = parsePreparedReadObservation(preparedObservation);
            if (!observation) return null;

            return JSON.stringify({
                canonicalRoot: root,
                collectionName: receipt.collectionName,
                markerRunId: receipt.marker.runId,
                policyDocumentDigest: receipt.policyDocumentDigest,
                policyHash: receipt.policy.policyHash,
                navigationGenerationId: receipt.navigation.generationId,
                symbolRegistryManifestHash: receipt.navigation.symbolRegistryManifestHash,
                relationshipManifestHash: receipt.navigation.relationshipManifestHash,
                navigationSealHash: receipt.navigation.navigationSealHash,
                navigationObservationToken: receipt.observations.navigationToken,
                mutationGeneration: observation.mutationGeneration,
            });
        } catch {
            return null;
        }
    }

    public isPreparedNavigationReadCurrent(preparedRead: PreparedReadState): boolean {
        if (!this.dependencies.canonicalNavigationAuthorityAvailable) {
            return true;
        }
        if (preparedRead.navigationAuthorityMode === "source_backed_fingerprint_compatibility") {
            return Boolean(
                preparedRead.sourceBackedNavigationBinding
                && preparedRead.sourceBackedNavigationBindingValidated
                && preparedRead.preparedObservation
                && sourceBackedBindingMatchesPreparedObservation(
                    preparedRead.sourceBackedNavigationBinding,
                    preparedRead.preparedObservation,
                )
                && this.getPreparedAuthorityObservation(preparedRead.root.path)
                    === preparedRead.preparedObservation
            );
        }
        if (!preparedRead.generationReceipt || !preparedRead.preparedObservation) {
            return false;
        }
        return this.getPreparedNavigationIdentity(preparedRead) !== null;
    }

    private getPreparedNavigationCacheEntry(
        root: string,
        identity: string,
    ): PreparedNavigationCacheEntry | undefined {
        const entry = this.preparedNavigationCache.get(root);
        if (!entry || entry.identity !== identity) return undefined;
        setBoundedCacheEntry(
            this.preparedNavigationCache,
            root,
            entry,
            PREPARED_NAVIGATION_CACHE_MAX_ROOTS,
        );
        return entry;
    }

    private storePreparedNavigationCacheEntry(
        root: string,
        identity: string,
        update: (entry: PreparedNavigationCacheEntry) => void,
    ): void {
        const existing = this.preparedNavigationCache.get(root);
        const entry = existing?.identity === identity
            ? existing
            : {
                identity,
                symbolsByFile: new Map<string, NavigationSymbolsByFileOk>(),
                compatibilityByManifestHash: new Map<string, NavigationCompatibilityState>(),
            };
        update(entry);
        setBoundedCacheEntry(
            this.preparedNavigationCache,
            root,
            entry,
            PREPARED_NAVIGATION_CACHE_MAX_ROOTS,
        );
    }

    public async loadPreparedNavigationManifest(
        preparedRead: PreparedReadState,
        operations?: SearchReadinessDebugHint["operations"],
    ): Promise<NavigationManifestState> {
        const root = preparedRead.root.path;
        const identityBefore = this.getPreparedNavigationIdentity(preparedRead);
        const cached = identityBefore
            ? this.getPreparedNavigationCacheEntry(root, identityBefore)?.manifest
            : undefined;
        if (cached && this.getPreparedNavigationIdentity(preparedRead) === identityBefore) return cached;

        if (operations) operations.registryLoads += 1;
        const result = await this.dependencies.navigationStore.getManifest({
            normalizedRootPath: root,
            ...(preparedRead.generationReceipt || preparedRead.sourceBackedNavigationBinding
                ? {
                    generationId: preparedRead.generationReceipt?.navigation.generationId
                        ?? preparedRead.sourceBackedNavigationBinding?.generationId,
                }
                : {}),
        });
        if (
            result.status === "ok"
            && preparedRead.sourceBackedNavigationBinding
            && result.manifestHash !== preparedRead.sourceBackedNavigationBinding.symbolRegistryManifestHash
        ) {
            return {
                status: "incompatible",
                rootPath: result.rootPath,
                reason: "symbol registry manifest does not match the completion marker binding",
            };
        }
        if (
            result.status === "ok"
            && identityBefore
            && this.getPreparedNavigationIdentity(preparedRead) === identityBefore
        ) {
            this.storePreparedNavigationCacheEntry(root, identityBefore, (entry) => {
                entry.manifest = result;
            });
        }
        return result;
    }

    public async loadPreparedNavigationSymbolsByFile(
        preparedRead: PreparedReadState,
        file: string,
    ): Promise<NavigationSymbolsByFileState> {
        const root = preparedRead.root.path;
        const identityBefore = this.getPreparedNavigationIdentity(preparedRead);
        const cached = identityBefore
            ? this.getPreparedNavigationCacheEntry(root, identityBefore)?.symbolsByFile.get(file)
            : undefined;
        if (cached && this.getPreparedNavigationIdentity(preparedRead) === identityBefore) return cached;

        const result = await this.dependencies.navigationStore.getSymbolsByFile({
            normalizedRootPath: root,
            ...(preparedRead.generationReceipt || preparedRead.sourceBackedNavigationBinding
                ? {
                    generationId: preparedRead.generationReceipt?.navigation.generationId
                        ?? preparedRead.sourceBackedNavigationBinding?.generationId,
                }
                : {}),
            file,
        });
        if (
            result.status === "ok"
            && preparedRead.sourceBackedNavigationBinding
            && result.manifestHash !== preparedRead.sourceBackedNavigationBinding.symbolRegistryManifestHash
        ) {
            return {
                status: "incompatible",
                rootPath: result.rootPath,
                reason: "symbol registry manifest does not match the completion marker binding",
            };
        }
        if (
            result.status === "ok"
            && identityBefore
            && this.getPreparedNavigationIdentity(preparedRead) === identityBefore
        ) {
            this.storePreparedNavigationCacheEntry(root, identityBefore, (entry) => {
                setBoundedCacheEntry(entry.symbolsByFile, file, result, PREPARED_NAVIGATION_CACHE_MAX_FILES_PER_ROOT);
            });
        }
        return result;
    }

    public async loadPreparedNavigationCompatibility(
        preparedRead: PreparedReadState,
        expectedSymbolRegistryManifestHash: string,
        operations?: SearchReadinessDebugHint["operations"],
    ): Promise<NavigationCompatibilityState> {
        const root = preparedRead.root.path;
        const identityBefore = this.getPreparedNavigationIdentity(preparedRead);
        const cached = identityBefore
            ? this.getPreparedNavigationCacheEntry(root, identityBefore)
                ?.compatibilityByManifestHash.get(expectedSymbolRegistryManifestHash)
            : undefined;
        if (cached && this.getPreparedNavigationIdentity(preparedRead) === identityBefore) return cached;

        if (operations) operations.navigationValidationRuns += 1;
        const result = await this.dependencies.navigationStore.getCompatibilityState({
            normalizedRootPath: root,
            ...(preparedRead.generationReceipt || preparedRead.sourceBackedNavigationBinding
                ? {
                    generationId: preparedRead.generationReceipt?.navigation.generationId
                        ?? preparedRead.sourceBackedNavigationBinding?.generationId,
                }
                : {}),
            expectedSymbolRegistryManifestHash,
        });
        if (preparedRead.sourceBackedNavigationBinding) {
            const binding = preparedRead.sourceBackedNavigationBinding;
            if (result.registry.status === "ok" && result.registry.manifestHash !== binding.symbolRegistryManifestHash) {
                return {
                    ...result,
                    registry: {
                        status: "incompatible",
                        rootPath: result.registry.rootPath,
                        reason: "symbol registry manifest does not match the completion marker binding",
                    },
                };
            }
            if (result.relationships.status === "ok" && result.relationships.manifestHash !== binding.relationshipManifestHash) {
                return {
                    ...result,
                    relationships: {
                        status: "incompatible",
                        rootPath: result.relationships.rootPath,
                        reason: "relationship manifest does not match the completion marker binding",
                    },
                };
            }
        }
        if (
            result.registry?.status === "ok"
            && result.relationships.status === "ok"
            && identityBefore
            && this.getPreparedNavigationIdentity(preparedRead) === identityBefore
        ) {
            this.storePreparedNavigationCacheEntry(root, identityBefore, (entry) => {
                setBoundedCacheEntry(
                    entry.compatibilityByManifestHash,
                    expectedSymbolRegistryManifestHash,
                    result,
                    PREPARED_NAVIGATION_CACHE_MAX_COMPATIBILITY_RESULTS_PER_ROOT,
                );
            });
        }
        return result;
    }

    public async getCachedPreparedRead(
        absolutePath: string,
        operations: SearchReadinessDebugHint["operations"],
        requireNavigation = false,
    ): Promise<CachedPreparedReadResult> {
        operations.preparedCacheLookups += 1;
        const lookup = this.preparedReadCache.lookupCandidate(
            absolutePath,
            this.dependencies.clock.now(),
            (targetPath, root) => this.dependencies.isPathWithinCodebase(targetPath, root),
        );
        if (lookup.status === "miss") return { status: "miss", reason: lookup.reason };

        const cached = lookup.state;
        if (!cached.vectorReceipt) {
            this.evictPreparedRead(lookup.root);
            return { status: "miss", reason: "cache_miss" };
        }
        const root = cached.root.path;
        const observationBeforeResult = this.getPreparedReadCacheObservation(root);
        const observationBefore = observationBeforeResult.observation;
        const statusPreparedObservation = this.statusPreparedReadObservations.get(root);
        if (statusPreparedObservation) {
            this.statusPreparedReadObservations.delete(root);
            const receiptIsCurrent = this.dependencies.authority
                .isPreparedVectorReceiptBoundToCurrentAuthority(root, cached.vectorReceipt);
            if (
                !observationBefore
                || observationBefore !== lookup.observation
                || observationBefore !== statusPreparedObservation.observation
                || observationBeforeResult.sourceObservation !== statusPreparedObservation.sourceObservation
                || (observationBeforeResult.unavailableReason ?? null) !== statusPreparedObservation.unavailableReason
                || !receiptIsCurrent
            ) {
                this.evictPreparedRead(root);
                return {
                    status: "miss",
                    reason: observationBefore ? "observation_changed" : "observation_unavailable",
                    ...(observationBeforeResult.unavailableReason
                        ? { observationUnavailableReason: observationBeforeResult.unavailableReason }
                        : {}),
                };
            }
            operations.preparedCacheHits += 1;
            return {
                status: "hit",
                state: { ...cached, preparedObservation: observationBefore, statusPrepared: true },
            };
        }

        const generationRevalidator = this.dependencies.getGenerationRevalidator?.();
        const revalidate = generationRevalidator?.revalidatePreparedGeneration;
        if (!observationBefore || typeof revalidate !== "function") {
            this.evictPreparedRead(root);
            return {
                status: "miss",
                reason: "observation_unavailable",
                ...(observationBeforeResult.unavailableReason
                    ? { observationUnavailableReason: observationBeforeResult.unavailableReason }
                    : {}),
            };
        }
        const cachedObservation = parsePreparedReadObservation(lookup.observation);
        const currentObservation = parsePreparedReadObservation(observationBefore);
        if (
            !cachedObservation
            || !currentObservation
            || cachedObservation.vectorAuthority !== currentObservation.vectorAuthority
            || cachedObservation.mutationGeneration !== currentObservation.mutationGeneration
        ) {
            this.evictPreparedRead(root);
            return { status: "miss", reason: "observation_changed" };
        }
        const navigationObservationChanged = cachedObservation.navigationAuthority !== currentObservation.navigationAuthority;
        operations.warmReceiptRevalidations += 1;
        const proof = await revalidate.call(
            generationRevalidator,
            root,
            cached.vectorReceipt,
            {
                ...(cached.generationReceipt ? { priorGenerationReceipt: cached.generationReceipt } : {}),
                navigationObservationChanged,
            },
        ).catch(() => null);
        const observationAfter = this.getPreparedReadCacheObservation(root).observation;
        if (
            !proof
            || proof.navigationProof.status === "requires_reindex"
            || proof.navigationProof.status === "unsupported"
            || (requireNavigation && proof.navigationProof.status !== "valid")
            || observationAfter !== observationBefore
        ) {
            this.evictPreparedRead(root);
            return {
                status: "miss",
                reason: observationAfter !== observationBefore ? "observation_changed" : "revalidation_failed",
            };
        }
        operations.preparedCacheHits += 1;
        return {
            status: "hit",
            state: {
                ...cached,
                vectorReceipt: proof.vectorReceipt,
                generationReceipt: proof.generationReceipt,
                navigationStatus: proof.navigationProof.status,
                preparedObservation: observationBefore,
            },
        };
    }

    public seedPreparedRead(
        state: PreparedReadState,
        preserveProofAge: boolean,
        statusPrepared = false,
    ): void {
        const root = state.root.path;
        if (!state.vectorReceipt || !state.preparedObservation) {
            if (!preserveProofAge) this.evictPreparedRead(root);
            return;
        }
        const observationResult = this.getPreparedReadCacheObservation(root);
        const observation = observationResult.observation;
        if (!observation || observation !== state.preparedObservation) {
            if (!preserveProofAge) this.evictPreparedRead(root);
            return;
        }
        if (statusPrepared) {
            setBoundedCacheEntry(
                this.statusPreparedReadObservations,
                root,
                {
                    observation,
                    sourceObservation: observationResult.sourceObservation,
                    unavailableReason: observationResult.unavailableReason ?? null,
                },
                PREPARED_NAVIGATION_CACHE_MAX_ROOTS,
            );
        } else {
            this.statusPreparedReadObservations.delete(root);
        }
        const navigationIdentity = this.getPreparedNavigationIdentity(state);
        if (this.preparedNavigationCache.get(root)?.identity !== navigationIdentity) {
            this.preparedNavigationCache.delete(root);
        }
        const cacheableState = { ...state };
        delete cacheableState.statusPrepared;
        this.preparedReadCache.seed(
            root,
            cacheableState,
            observation,
            this.dependencies.clock.now(),
            preserveProofAge,
        );
    }
}

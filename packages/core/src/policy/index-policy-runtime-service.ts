import * as fs from 'fs';
import * as crypto from 'crypto';
import {
    getSupportedExtensionsForIndexProfile,
    type IndexProfile,
} from '../config/defaults';
import {
    normalizeSupportedExtensions,
} from '../config/index-policy';
import {
    inspectIndexPolicyDocument,
    type CanonicalPolicyNavigationBinding,
    type CanonicalPublicationBinding,
} from '../core/persisted-index-authority';
import {
    IgnoreRuleService,
    type IgnoreRuleStateSnapshot,
} from '../core/ignore-rule-service';

/**
 * Runtime-resolved index policy for one canonical codebase root.
 * The durable document is the authority; this shape mirrors the effective
 * inputs that produced it plus the verified policy hash.
 */
export interface ResolvedIndexPolicy {
    canonicalRoot: string;
    profile: IndexProfile;
    customExtensions: string[];
    customIgnorePatterns: string[];
    fileBasedIgnorePatterns: string[];
    supportedExtensions: string[];
    effectiveIgnorePatterns: string[];
    policyHash: string;
    controlSignature?: string;
}

/**
 * Binding payload carried alongside an activated runtime policy. The runtime
 * service constructs it from the durable document and hands it to Context,
 * which owns published binding state.
 */
export interface IndexPolicyRuntimeBinding {
    collectionName: string;
    navigation: CanonicalPolicyNavigationBinding;
    publication?: CanonicalPublicationBinding;
}

export class IndexPolicyAuthorityError extends Error {
    constructor(message: string, readonly authorityCause: unknown) {
        super(message);
        this.name = 'IndexPolicyAuthorityError';
    }
}

export class IndexFormatRequiresReindexError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IndexFormatRequiresReindexError';
    }
}

export class UnsupportedIndexAuthorityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedIndexAuthorityError';
    }
}

/**
 * Canonical policy hash over the effective runtime inputs. All writers
 * (durable document load, observed-policy resolution, persisted publication)
 * must agree on this single computation.
 */
export function computeIndexPolicyHash(
    profile: IndexProfile,
    supportedExtensions: readonly string[],
    effectiveIgnorePatterns: readonly string[],
): string {
    return crypto.createHash('sha256').update(JSON.stringify({
        profile,
        extensions: supportedExtensions,
        ignorePatterns: effectiveIgnorePatterns,
    }), 'utf8').digest('hex');
}

/**
 * Snapshot of the runtime policy state for one codebase, used to restore the
 * runtime view when a publication transaction rolls back. Published binding
 * state is owned by Context and is not part of this snapshot.
 */
export interface IndexPolicyRuntimeStateSnapshot {
    customExtensions: string[] | null;
    customIgnorePatterns: string[] | null;
    profile: IndexProfile | undefined;
    ignoreState: IgnoreRuleStateSnapshot | null;
    wasLoaded: boolean;
    fileToken: string | null | undefined;
    hadFileToken: boolean;
    runtimeCompatible: boolean | undefined;
    documentDigest: string | undefined;
}

export interface IndexPolicyRuntimeServiceConfig {
    /** Static configured extension overlays (config + environment). */
    configuredExtensionOverlays: readonly string[];
    /**
     * Lazy ignore-rule access: the ignore rule service is constructed after
     * this service in Context, so it is resolved at call time only.
     */
    getIgnoreRuleService: () => IgnoreRuleService;
    canonicalizeCodebasePath: (codebasePath: string) => string;
    resolvePolicyPath: (canonicalRoot: string) => string;
    resolveFilesystemObservationToken: (targetPath: string) => string | null;
    /**
     * Called after runtime activation of a custom policy document. Context
     * owns published bindings and records them here.
     */
    onActivateResolvedIndexPolicy: (
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
    ) => void;
    /** Called when the runtime view of a codebase policy is cleared. */
    onClearPublishedIndexPolicy: (canonicalRoot: string) => void;
}

/**
 * Owns the runtime index-policy view: profile/custom-extension/custom-ignore
 * composition, policy hash resolution, and runtime compatibility evaluation.
 *
 * Deliberately does NOT own published policy bindings or active generation
 * state; Context remains the single owner of those collections and receives
 * activation/clear notifications through the config callbacks.
 */
export class IndexPolicyRuntimeService {
    private readonly configuredExtensionOverlays: string[];
    private readonly getIgnoreRuleService: () => IgnoreRuleService;
    private readonly canonicalizeCodebasePath: (codebasePath: string) => string;
    private readonly resolvePolicyPath: (canonicalRoot: string) => string;
    private readonly resolveFilesystemObservationToken: (targetPath: string) => string | null;
    private readonly onActivateResolvedIndexPolicy: (
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
    ) => void;
    private readonly onClearPublishedIndexPolicy: (canonicalRoot: string) => void;

    private readonly runtimeCustomExtensionsByCodebase: Map<string, string[]>;
    private readonly indexProfilesByCodebase: Map<string, IndexProfile>;
    private readonly loadedCustomPolicyRoots: Set<string>;
    private readonly policyFileTokensByCodebase: Map<string, string | null>;
    private readonly policyDocumentDigestsByCodebase: Map<string, string>;
    private readonly policyRuntimeCompatibilityByCodebase: Map<string, boolean>;

    /**
     * Read-only view of runtime compatibility state (Context integration oracle).
     */
    getPolicyRuntimeCompatibilityByCodebase(): ReadonlyMap<string, boolean> {
        return this.policyRuntimeCompatibilityByCodebase;
    }

    constructor(config: IndexPolicyRuntimeServiceConfig) {
        this.configuredExtensionOverlays = [...config.configuredExtensionOverlays];
        this.getIgnoreRuleService = config.getIgnoreRuleService;
        this.canonicalizeCodebasePath = config.canonicalizeCodebasePath;
        this.resolvePolicyPath = config.resolvePolicyPath;
        this.resolveFilesystemObservationToken = config.resolveFilesystemObservationToken;
        this.onActivateResolvedIndexPolicy = config.onActivateResolvedIndexPolicy;
        this.onClearPublishedIndexPolicy = config.onClearPublishedIndexPolicy;
        this.runtimeCustomExtensionsByCodebase = new Map();
        this.indexProfilesByCodebase = new Map();
        this.loadedCustomPolicyRoots = new Set();
        this.policyFileTokensByCodebase = new Map();
        this.policyDocumentDigestsByCodebase = new Map();
        this.policyRuntimeCompatibilityByCodebase = new Map();
    }

    getConfiguredExtensionOverlays(): string[] {
        return [...this.configuredExtensionOverlays];
    }

    getIndexProfile(canonicalRoot: string): IndexProfile | undefined {
        return this.indexProfilesByCodebase.get(canonicalRoot);
    }

    hasIndexProfile(canonicalRoot: string): boolean {
        return this.indexProfilesByCodebase.has(canonicalRoot);
    }

    setIndexProfileForCodebase(canonicalRoot: string, profile: IndexProfile): void {
        this.indexProfilesByCodebase.set(canonicalRoot, profile);
    }

    deleteIndexProfile(canonicalRoot: string): void {
        this.indexProfilesByCodebase.delete(canonicalRoot);
    }

    getRuntimeCustomExtensions(canonicalRoot: string): string[] {
        return [...(this.runtimeCustomExtensionsByCodebase.get(canonicalRoot) ?? [])];
    }

    getPolicyFileToken(canonicalRoot: string): string | null | undefined {
        return this.policyFileTokensByCodebase.get(canonicalRoot);
    }

    hasPolicyFileToken(canonicalRoot: string): boolean {
        return this.policyFileTokensByCodebase.has(canonicalRoot);
    }

    setPolicyFileToken(canonicalRoot: string, token: string | null): void {
        this.policyFileTokensByCodebase.set(canonicalRoot, token);
    }

    deletePolicyFileToken(canonicalRoot: string): void {
        this.policyFileTokensByCodebase.delete(canonicalRoot);
    }

    getPolicyDocumentDigest(canonicalRoot: string): string | undefined {
        return this.policyDocumentDigestsByCodebase.get(canonicalRoot);
    }

    setPolicyDocumentDigest(canonicalRoot: string, digest: string): void {
        this.policyDocumentDigestsByCodebase.set(canonicalRoot, digest);
    }

    getPolicyRuntimeCompatibility(canonicalRoot: string): boolean | undefined {
        return this.policyRuntimeCompatibilityByCodebase.get(canonicalRoot);
    }

    isCustomPolicyLoaded(canonicalRoot: string): boolean {
        return this.loadedCustomPolicyRoots.has(canonicalRoot);
    }

    /**
     * Compose the effective supported extensions for a profile: profile
     * defaults, configured overlays, then per-codebase runtime custom
     * extensions (from the activated custom policy document).
     */
    buildSupportedExtensions(profile: IndexProfile, canonicalRoot?: string): string[] {
        return normalizeSupportedExtensions([
            ...getSupportedExtensionsForIndexProfile(profile),
            ...this.configuredExtensionOverlays,
            ...(canonicalRoot ? this.runtimeCustomExtensionsByCodebase.get(canonicalRoot) ?? [] : []),
        ]);
    }

    /**
     * Resolve the filesystem observation token of the custom policy document
     * for a codebase; null when no document is present.
     */
    resolveCustomIndexPolicyFileToken(canonicalRoot: string): string | null {
        return this.resolveFilesystemObservationToken(this.resolvePolicyPath(canonicalRoot));
    }

    /**
     * Resolve and verify the durable policy document's digest, throwing when
     * the document requires reindex, is unsupported, or is invalid.
     */
    resolveVerifiedIndexPolicyDocumentDigest(policyPath: string): string {
        const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as unknown;
        const canonicalRoot = this.canonicalizeCodebasePath(
            typeof (parsed as { canonicalRoot?: unknown })?.canonicalRoot === 'string'
                ? (parsed as { canonicalRoot: string }).canonicalRoot
                : '',
        );
        const inspected = inspectIndexPolicyDocument(parsed, canonicalRoot);
        if (inspected.status === 'requires_reindex') {
            throw new IndexFormatRequiresReindexError(inspected.reason);
        }
        if (inspected.status === 'unsupported') {
            throw new UnsupportedIndexAuthorityError(inspected.reason);
        }
        if (inspected.status !== 'current') {
            throw new Error('Index policy document digest is invalid.');
        }
        return inspected.value.documentDigest;
    }

    /**
     * Evaluate whether a resolved policy is compatible with the current
     * runtime profile, configured overlays, and base ignore patterns.
     */
    isPolicyRuntimeCompatible(policy: ResolvedIndexPolicy): boolean {
        const runtimeProfile = this.indexProfilesByCodebase.get(policy.canonicalRoot) ?? policy.profile;
        const expectedExtensions = normalizeSupportedExtensions([
            ...getSupportedExtensionsForIndexProfile(runtimeProfile),
            ...this.configuredExtensionOverlays,
            ...policy.customExtensions,
        ]);
        const expectedIgnorePatterns = [
            ...this.getIgnoreRuleService().getBasePatterns(),
            ...policy.customIgnorePatterns,
            ...policy.fileBasedIgnorePatterns,
        ];
        return policy.profile === runtimeProfile
            && JSON.stringify(policy.supportedExtensions) === JSON.stringify(expectedExtensions)
            && JSON.stringify(policy.effectiveIgnorePatterns) === JSON.stringify(expectedIgnorePatterns);
    }

    /**
     * Record the runtime compatibility outcome for a codebase. Context passes
     * the published resolved policy (or undefined to clear); the compatibility
     * state itself is owned here.
     */
    recomputePolicyRuntimeCompatibility(
        canonicalRoot: string,
        policy: ResolvedIndexPolicy | undefined,
    ): void {
        if (!policy) {
            this.policyRuntimeCompatibilityByCodebase.delete(canonicalRoot);
            return;
        }
        this.policyRuntimeCompatibilityByCodebase.set(
            canonicalRoot,
            this.isPolicyRuntimeCompatible(policy),
        );
    }

    /**
     * Load the custom policy document for a codebase into runtime state when
     * the document's observation token changed. Clears runtime state when the
     * document is absent.
     */
    loadCustomIndexPolicy(canonicalRoot: string): void {
        const currentToken = this.resolveCustomIndexPolicyFileToken(canonicalRoot);
        if (
            this.policyFileTokensByCodebase.has(canonicalRoot)
            && this.policyFileTokensByCodebase.get(canonicalRoot) === currentToken
        ) {
            return;
        }
        if (currentToken === null) {
            this.clearResolvedIndexPolicyRuntime(canonicalRoot);
            this.policyFileTokensByCodebase.set(canonicalRoot, null);
            return;
        }
        const document = fs.readFileSync(this.resolvePolicyPath(canonicalRoot), 'utf8');
        try {
            const parsed = JSON.parse(document) as unknown;
            const inspected = inspectIndexPolicyDocument(parsed, canonicalRoot);
            if (inspected.status === 'requires_reindex') {
                throw new IndexFormatRequiresReindexError(inspected.reason);
            }
            if (inspected.status === 'unsupported') {
                throw new UnsupportedIndexAuthorityError(inspected.reason);
            }
            if (inspected.status !== 'current') {
                throw new Error(inspected.reason);
            }
            const payload = inspected.value;
            const expectedPolicyHash = computeIndexPolicyHash(
                payload.profile,
                payload.supportedExtensions,
                payload.effectiveIgnorePatterns,
            );
            if (payload.policyHash !== expectedPolicyHash) {
                throw new Error('Custom index policy hash does not match its effective inputs.');
            }
            this.activateResolvedIndexPolicy({
                canonicalRoot,
                profile: payload.profile,
                customExtensions: payload.customExtensions,
                customIgnorePatterns: payload.customIgnorePatterns,
                fileBasedIgnorePatterns: payload.fileBasedIgnorePatterns,
                supportedExtensions: payload.supportedExtensions,
                effectiveIgnorePatterns: payload.effectiveIgnorePatterns,
                policyHash: payload.policyHash,
                ...(payload.schemaVersion === 'satori_index_policy_v5'
                    ? { controlSignature: payload.controlSignature }
                    : {}),
            }, {
                collectionName: payload.collectionName,
                navigation: { ...payload.navigation },
                ...(payload.schemaVersion === 'satori_index_policy_v4' || payload.schemaVersion === 'satori_index_policy_v5'
                    ? { publication: structuredClone(payload.publication) }
                    : {}),
            });
            this.loadedCustomPolicyRoots.add(canonicalRoot);
            this.policyFileTokensByCodebase.set(canonicalRoot, currentToken);
            this.policyDocumentDigestsByCodebase.set(canonicalRoot, payload.documentDigest);
        } catch (error) {
            this.loadedCustomPolicyRoots.delete(canonicalRoot);
            this.policyFileTokensByCodebase.delete(canonicalRoot);
            this.policyRuntimeCompatibilityByCodebase.delete(canonicalRoot);
            this.policyDocumentDigestsByCodebase.delete(canonicalRoot);
            if (
                error instanceof IndexFormatRequiresReindexError
                || error instanceof UnsupportedIndexAuthorityError
            ) throw error;
            throw new IndexPolicyAuthorityError(
                `Malformed custom index policy for '${canonicalRoot}': ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }
    }

    /**
     * Clear the runtime policy view for a codebase: custom extensions, runtime
     * custom ignore patterns, file-based patterns, compatibility outcome,
     * document digest, and loaded-root marker. Notifies Context so published
     * binding state is cleared by its owner.
     */
    clearResolvedIndexPolicyRuntime(canonicalRoot: string): void {
        this.runtimeCustomExtensionsByCodebase.delete(canonicalRoot);
        this.getIgnoreRuleService().deleteRuntimeCustomPatterns(canonicalRoot);
        this.policyRuntimeCompatibilityByCodebase.delete(canonicalRoot);
        this.policyDocumentDigestsByCodebase.delete(canonicalRoot);
        this.loadedCustomPolicyRoots.delete(canonicalRoot);
        this.getIgnoreRuleService().setFileBasedPatterns(canonicalRoot, []);
        this.onClearPublishedIndexPolicy(canonicalRoot);
    }

    captureRuntimePolicyState(canonicalRoot: string): IndexPolicyRuntimeStateSnapshot {
        const ignoreRuleService = this.getIgnoreRuleService();
        return {
            customExtensions: this.runtimeCustomExtensionsByCodebase.has(canonicalRoot)
                ? [...(this.runtimeCustomExtensionsByCodebase.get(canonicalRoot) ?? [])]
                : null,
            customIgnorePatterns: ignoreRuleService.hasRuntimeCustomPatterns(canonicalRoot)
                ? ignoreRuleService.getRuntimeCustomPatterns(canonicalRoot)
                : null,
            profile: this.indexProfilesByCodebase.get(canonicalRoot),
            ignoreState: ignoreRuleService.captureCodebaseState(canonicalRoot),
            wasLoaded: this.loadedCustomPolicyRoots.has(canonicalRoot),
            fileToken: this.policyFileTokensByCodebase.get(canonicalRoot),
            hadFileToken: this.policyFileTokensByCodebase.has(canonicalRoot),
            runtimeCompatible: this.policyRuntimeCompatibilityByCodebase.get(canonicalRoot),
            documentDigest: this.policyDocumentDigestsByCodebase.get(canonicalRoot),
        };
    }

    restoreRuntimePolicyState(
        canonicalRoot: string,
        previousRuntimeState: IndexPolicyRuntimeStateSnapshot,
    ): void {
        const ignoreRuleService = this.getIgnoreRuleService();
        if (previousRuntimeState.customExtensions) {
            this.runtimeCustomExtensionsByCodebase.set(canonicalRoot, [...previousRuntimeState.customExtensions]);
        } else {
            this.runtimeCustomExtensionsByCodebase.delete(canonicalRoot);
        }
        if (previousRuntimeState.customIgnorePatterns) {
            ignoreRuleService.setRuntimeCustomPatterns(
                canonicalRoot,
                previousRuntimeState.customIgnorePatterns,
            );
        } else {
            ignoreRuleService.deleteRuntimeCustomPatterns(canonicalRoot);
        }
        if (previousRuntimeState.profile) {
            this.indexProfilesByCodebase.set(canonicalRoot, previousRuntimeState.profile);
        } else {
            this.indexProfilesByCodebase.delete(canonicalRoot);
        }
        ignoreRuleService.restoreCodebaseState(
            canonicalRoot,
            previousRuntimeState.ignoreState,
        );
        if (previousRuntimeState.wasLoaded) {
            this.loadedCustomPolicyRoots.add(canonicalRoot);
        } else {
            this.loadedCustomPolicyRoots.delete(canonicalRoot);
        }
        if (previousRuntimeState.hadFileToken) {
            this.policyFileTokensByCodebase.set(canonicalRoot, previousRuntimeState.fileToken ?? null);
        } else {
            this.policyFileTokensByCodebase.delete(canonicalRoot);
        }
        if (previousRuntimeState.runtimeCompatible !== undefined) {
            this.policyRuntimeCompatibilityByCodebase.set(canonicalRoot, previousRuntimeState.runtimeCompatible);
        } else {
            this.policyRuntimeCompatibilityByCodebase.delete(canonicalRoot);
        }
        if (previousRuntimeState.documentDigest) {
            this.policyDocumentDigestsByCodebase.set(canonicalRoot, previousRuntimeState.documentDigest);
        } else {
            this.policyDocumentDigestsByCodebase.delete(canonicalRoot);
        }
    }

    /**
     * Activate a resolved policy into runtime state (custom extensions,
     * runtime ignore composition, profile, compatibility) and notify Context
     * through the activation hook so published binding state is recorded.
     */
    activateResolvedIndexPolicy(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
    ): void {
        const canonicalRoot = policy.canonicalRoot;
        this.runtimeCustomExtensionsByCodebase.set(canonicalRoot, [...policy.customExtensions]);
        this.getIgnoreRuleService().setRuntimeCustomPatterns(
            canonicalRoot,
            policy.customIgnorePatterns,
        );
        this.indexProfilesByCodebase.set(canonicalRoot, policy.profile);
        this.loadedCustomPolicyRoots.add(canonicalRoot);
        this.policyRuntimeCompatibilityByCodebase.set(
            canonicalRoot,
            this.isPolicyRuntimeCompatible(policy),
        );
        this.getIgnoreRuleService().setFileBasedPatterns(
            canonicalRoot,
            policy.fileBasedIgnorePatterns,
        );
        this.onActivateResolvedIndexPolicy(policy, binding);
    }
}

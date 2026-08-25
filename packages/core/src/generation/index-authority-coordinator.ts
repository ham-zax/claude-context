/**
 * Process-local runtime policy hydration for the selected Publication.
 *
 * Durable authority lives in PublicationStore. This owner intentionally keeps
 * no generation proofs, read tokens, retention gates, or physical GC state.
 */
import type {
    IndexPolicyRuntimeBinding,
    ResolvedIndexPolicy,
} from '../policy/index-policy-runtime-service';

export class IndexAuthorityCoordinator {
    private readonly publishedPolicyBindingsByCodebase = new Map<
        string,
        IndexPolicyRuntimeBinding & { policyHash: string }
    >();
    private readonly publishedResolvedPoliciesByCodebase = new Map<string, ResolvedIndexPolicy>();

    getPublishedPolicyBinding(canonicalRoot: string): (IndexPolicyRuntimeBinding & { policyHash: string }) | undefined {
        return this.publishedPolicyBindingsByCodebase.get(canonicalRoot);
    }

    getPublishedResolvedPolicy(canonicalRoot: string): ResolvedIndexPolicy | undefined {
        return this.publishedResolvedPoliciesByCodebase.get(canonicalRoot);
    }

    hasPublishedResolvedPolicy(canonicalRoot: string): boolean {
        return this.publishedResolvedPoliciesByCodebase.has(canonicalRoot);
    }

    publishedResolvedPolicyRoots(): IterableIterator<string> {
        return this.publishedResolvedPoliciesByCodebase.keys();
    }

    activatePublishedIndexPolicy(policy: ResolvedIndexPolicy, binding: IndexPolicyRuntimeBinding): void {
        const canonicalRoot = policy.canonicalRoot;
        this.publishedPolicyBindingsByCodebase.set(canonicalRoot, {
            ...binding,
            navigation: { ...binding.navigation },
            policyHash: policy.policyHash,
        });
        this.publishedResolvedPoliciesByCodebase.set(canonicalRoot, {
            ...policy,
            customExtensions: [...policy.customExtensions],
            customIgnorePatterns: [...policy.customIgnorePatterns],
            fileBasedIgnorePatterns: [...policy.fileBasedIgnorePatterns],
            supportedExtensions: [...policy.supportedExtensions],
            effectiveIgnorePatterns: [...policy.effectiveIgnorePatterns],
        });
    }

    clearPublishedIndexPolicyRuntime(canonicalRoot: string): void {
        this.publishedPolicyBindingsByCodebase.delete(canonicalRoot);
        this.publishedResolvedPoliciesByCodebase.delete(canonicalRoot);
    }
}

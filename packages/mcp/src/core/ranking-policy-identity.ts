export const BASELINE_RANKING_POLICY_IDENTITY = 'search_candidate_final_score_v2' as const;
export const LEARNED_RANKING_POLICY_IDENTITY = 'search_ranking_policy_v3' as const;
export const DISABLED_RERANKER_IDENTITY_V1 = 'reranker_disabled_v1' as const;

export function rankingPolicyIdentityV1(input: { mode: 'disabled' | 'provider_derived'; configuredRerankerIdentity?: string }): {
    policyIdentity: typeof LEARNED_RANKING_POLICY_IDENTITY;
    rerankerIdentity: string;
} {
    if (input.mode === 'disabled') return { policyIdentity: LEARNED_RANKING_POLICY_IDENTITY, rerankerIdentity: DISABLED_RERANKER_IDENTITY_V1 };
    if (typeof input.configuredRerankerIdentity !== 'string' || input.configuredRerankerIdentity.length === 0) throw new Error('provider-derived identity requires configured reranker identity.');
    return { policyIdentity: LEARNED_RANKING_POLICY_IDENTITY, rerankerIdentity: input.configuredRerankerIdentity };
}

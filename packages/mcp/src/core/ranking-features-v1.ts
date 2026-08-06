export const RANKING_FEATURE_ORDER_V1 = [
    'baselineFinalScore','backendScore','fusionScore','exactLexicalMatch','exactMatchPinned',
    'passesMatchedMust','rerankAdjusted','retrievalPassCount','denseSeen','lexicalSeen',
    'rawDenseRank','rawDenseRankMissing','rawLexicalRank','rawLexicalRankMissing',
    'rawFallbackLexicalRank','rawFallbackLexicalRankMissing','coreFusionRank','coreFusionRankMissing',
    'mcpUnionRank','mcpUnionRankMissing','postEligibilityRank','postEligibilityRankMissing',
    'rerankerAdmissionRank','rerankerAdmissionRankMissing','intentConfidenceLow','intentConfidenceMedium',
    'intentConfidenceHigh','testIntent','implementationIntent','writerIntent','docsRoute',
    'explicitGeneratedOrPathIntent','isTestPath','isDocsPath','isGeneratedPath','isFixturePath',
    'testPathXTestIntent','testPathXImplementationIntent','docsPathXDocsRoute',
    'generatedXExplicitGeneratedOrPathIntent',
] as const;
export type RankingFeatureNameV1 = typeof RANKING_FEATURE_ORDER_V1[number];
export interface RankingFeatureInputV1 {
    baselineFinalScore: number; backendScore: number; fusionScore: number;
    exactLexicalMatch: boolean; exactMatchPinned: boolean; passesMatchedMust: boolean; rerankAdjusted: boolean;
    retrievalPassCount: number; denseSeen: boolean; lexicalSeen: boolean;
    rawDenseRank?: number | null; rawLexicalRank?: number | null; rawFallbackLexicalRank?: number | null;
    coreFusionRank?: number | null; mcpUnionRank?: number | null; postEligibilityRank?: number | null; rerankerAdmissionRank?: number | null;
    intentConfidence: 'low' | 'medium' | 'high'; testIntent: boolean; implementationIntent: boolean; writerIntent: boolean;
    docsRoute: boolean; explicitGeneratedOrPathIntent: boolean; isTestPath: boolean; isDocsPath: boolean; isGeneratedPath: boolean; isFixturePath: boolean;
}
export interface RankingFeatureVectorV1 { featureSchema: 'search_features_v1'; featureOrder: typeof RANKING_FEATURE_ORDER_V1; values: number[]; }
function finite(value: number, label: string): number { if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`); return value; }
function bool(value: boolean): number { return value ? 1 : 0; }
function rank(value: number | null | undefined, label: string): [number, number] {
    if (value === null || value === undefined) return [0, 1];
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be missing or a positive safe integer.`);
    return [value, 0];
}
export function extractRankingFeaturesV1(input: RankingFeatureInputV1): RankingFeatureVectorV1 {
    const rd=rank(input.rawDenseRank,'rawDenseRank'), rl=rank(input.rawLexicalRank,'rawLexicalRank'), rf=rank(input.rawFallbackLexicalRank,'rawFallbackLexicalRank');
    const cf=rank(input.coreFusionRank,'coreFusionRank'), mu=rank(input.mcpUnionRank,'mcpUnionRank'), pe=rank(input.postEligibilityRank,'postEligibilityRank'), ra=rank(input.rerankerAdmissionRank,'rerankerAdmissionRank');
    const values = [
        finite(input.baselineFinalScore,'baselineFinalScore'), finite(input.backendScore,'backendScore'), finite(input.fusionScore,'fusionScore'),
        bool(input.exactLexicalMatch),bool(input.exactMatchPinned),bool(input.passesMatchedMust),bool(input.rerankAdjusted),
        finite(input.retrievalPassCount,'retrievalPassCount'),bool(input.denseSeen),bool(input.lexicalSeen),
        ...rd,...rl,...rf,...cf,...mu,...pe,...ra,
        bool(input.intentConfidence==='low'),bool(input.intentConfidence==='medium'),bool(input.intentConfidence==='high'),
        bool(input.testIntent),bool(input.implementationIntent),bool(input.writerIntent),bool(input.docsRoute),bool(input.explicitGeneratedOrPathIntent),
        bool(input.isTestPath),bool(input.isDocsPath),bool(input.isGeneratedPath),bool(input.isFixturePath),
        bool(input.isTestPath&&input.testIntent),bool(input.isTestPath&&input.implementationIntent),bool(input.isDocsPath&&input.docsRoute),bool(input.isGeneratedPath&&input.explicitGeneratedOrPathIntent),
    ];
    if (values.length !== RANKING_FEATURE_ORDER_V1.length) throw new Error('Ranking feature vector length does not match sealed feature order.');
    return { featureSchema: 'search_features_v1', featureOrder: RANKING_FEATURE_ORDER_V1, values };
}

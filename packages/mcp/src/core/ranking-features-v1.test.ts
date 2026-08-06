import assert from 'node:assert/strict';
import test from 'node:test';
import { RANKING_FEATURE_ORDER_V1, extractRankingFeaturesV1, type RankingFeatureNameV1 } from './ranking-features-v1.js';

test('feature_order_and_missing_indicators_match_sealed_contract', () => {
    const output = extractRankingFeaturesV1({
        baselineFinalScore: 0.3,
        backendScore: 0.2,
        fusionScore: 0.1,
        exactLexicalMatch: true,
        exactMatchPinned: false,
        passesMatchedMust: true,
        rerankAdjusted: false,
        retrievalPassCount: 2,
        denseSeen: true,
        lexicalSeen: true,
        rawDenseRank: 1,
        rawLexicalRank: null,
        rawFallbackLexicalRank: undefined,
        coreFusionRank: 2,
        mcpUnionRank: 3,
        postEligibilityRank: 1,
        rerankerAdmissionRank: null,
        intentConfidence: 'high',
        testIntent: true,
        implementationIntent: false,
        writerIntent: false,
        docsRoute: false,
        explicitGeneratedOrPathIntent: false,
        isTestPath: true,
        isDocsPath: false,
        isGeneratedPath: false,
        isFixturePath: false,
    });
    assert.deepEqual(output.featureOrder, RANKING_FEATURE_ORDER_V1);
    assert.equal(output.values.length, RANKING_FEATURE_ORDER_V1.length);
    const index = (name: RankingFeatureNameV1) => RANKING_FEATURE_ORDER_V1.indexOf(name);
    assert.equal(output.values[index('rawLexicalRank')], 0);
    assert.equal(output.values[index('rawLexicalRankMissing')], 1);
    assert.equal(output.values[index('rerankerAdmissionRankMissing')], 1);
    assert.equal(output.values[index('testPathXTestIntent')], 1);
});

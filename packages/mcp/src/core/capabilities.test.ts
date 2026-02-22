import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityResolver } from './capabilities.js';
import { ContextMcpConfig } from '../config.js';

function baseConfig(overrides: Partial<ContextMcpConfig> = {}): ContextMcpConfig {
    return {
        name: 'test',
        version: '1.0.0',
        encoderProvider: 'VoyageAI',
        encoderModel: 'voyage-4-large',
        encoderOutputDimension: 1024,
        milvusEndpoint: 'https://example.zilliz.com',
        milvusApiToken: 'token',
        voyageKey: 'voyage-key',
        rankerModel: 'rerank-2.5',
        ...overrides,
    };
}

test('capability resolver auto-reranks when flag is omitted on fast profile', () => {
    const resolver = new CapabilityResolver(baseConfig());
    const decision = resolver.resolveRerankDecision(undefined);

    assert.equal(resolver.hasReranker(), true);
    assert.equal(resolver.getPerformanceProfile(), 'fast');
    assert.equal(decision.enabled, true);
    assert.equal(decision.blockedByMissingCapability, false);
});

test('capability resolver respects explicit useReranker=false', () => {
    const resolver = new CapabilityResolver(baseConfig());
    const decision = resolver.resolveRerankDecision(false);

    assert.equal(decision.enabled, false);
    assert.equal(decision.blockedByMissingCapability, false);
});

test('capability resolver blocks explicit rerank request when reranker capability is missing', () => {
    const resolver = new CapabilityResolver(baseConfig({ voyageKey: undefined }));
    const decision = resolver.resolveRerankDecision(true);

    assert.equal(resolver.hasReranker(), false);
    assert.equal(decision.enabled, false);
    assert.equal(decision.blockedByMissingCapability, true);
});

test('capability resolver disables auto-rerank on slow profile when omitted', () => {
    const resolver = new CapabilityResolver(baseConfig({
        encoderProvider: 'Ollama',
        voyageKey: 'voyage-key'
    }));
    const decision = resolver.resolveRerankDecision(undefined);

    assert.equal(resolver.getPerformanceProfile(), 'slow');
    assert.equal(decision.enabled, false);
    assert.equal(decision.blockedByMissingCapability, false);
});

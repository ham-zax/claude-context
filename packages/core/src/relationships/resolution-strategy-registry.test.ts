import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DefaultLanguageResolutionStrategyRegistry,
    defaultResolutionStrategyRegistry,
} from './resolution-strategy-registry';

test('defaultResolutionStrategyRegistry maps canonical languages to their correct strategy', () => {
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('python'), 'python_native');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('py'), 'python_native');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('javascript'), 'syntactic');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('js'), 'syntactic');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('typescript'), 'syntactic');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('ts'), 'syntactic');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('tsx'), 'syntactic');
    
    // In Phase A, Go, Rust, Java, C++, etc. map to 'none'
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('go'), 'none');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('rust'), 'none');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('rs'), 'none');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('java'), 'none');
    assert.equal(defaultResolutionStrategyRegistry.strategyForLanguage('unknown-lang'), 'none');
});

test('DefaultLanguageResolutionStrategyRegistry accepts custom strategy overrides', () => {
    const custom = new DefaultLanguageResolutionStrategyRegistry({
        go: 'cbm_semantic',
        python: 'none',
    });
    assert.equal(custom.strategyForLanguage('go'), 'cbm_semantic');
    assert.equal(custom.strategyForLanguage('python'), 'none');
    assert.equal(custom.strategyForLanguage('py'), 'none');
    assert.equal(custom.strategyForLanguage('typescript'), 'syntactic');
    assert.equal(custom.strategyForLanguage('rust'), 'none');
});


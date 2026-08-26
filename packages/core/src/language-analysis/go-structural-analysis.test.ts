import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GO_STRUCTURAL_ANALYSIS_VERSION,
    analyzeGoSymbolStructure,
} from './tree-sitter-adapter';
import { createLanguageAnalysisService } from './service';

async function extractedGoSymbol(content: string, qualifiedName: string) {
    const result = await createLanguageAnalysisService().analyze({
        content,
        language: 'go',
        relativePath: 'service.go',
    });
    assert.equal(result.structuralStatus, 'complete');
    const symbol = result.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    assert.ok(symbol);
    return symbol;
}

test('Go structural v1 reports the same callable metrics surface as Python', async () => {
    const content = `package service

type Service struct{}

func (s *Service) Analyze(a, b int, items ...string) (int, error) {
    for i := 0; i < a; i++ {
        if b > 0 && i > 0 {
            for range items {
                b++
            }
        }
    }
    switch b {
    case 0:
        b++
    case 1:
        b--
    default:
        b = 0
    }
    nested := func() {
        for {
            break
        }
    }
    _ = nested
    return b, nil
}
`;
    const symbol = await extractedGoSymbol(content, 'Service.Analyze');

    const result = await analyzeGoSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name ?? '',
            qualifiedName: symbol.qualifiedName ?? '',
            span: symbol.span,
        },
    });

    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.analysis.analysisVersion, GO_STRUCTURAL_ANALYSIS_VERSION);
    assert.equal(result.analysis.language, 'go');
    assert.equal(result.analysis.sourceBinding, 'current_source');
    assert.equal(result.analysis.metrics.parameterCount.value, 3);
    assert.equal(result.analysis.metrics.loopCount.value, 2);
    assert.equal(result.analysis.metrics.maxLoopDepth.value, 2);
    assert.equal(result.analysis.metrics.cyclomaticComplexity.value, 7);
    assert.equal(
        result.analysis.metrics.signature.value,
        'func (s *Service) Analyze(a, b int, items ...string) (int, error)',
    );
    assert.equal(result.analysis.metrics.declaredReturnType.value, '(int, error)');
});

test('Go structural v1 distinguishes absent return syntax and canonical symbol identity', async () => {
    const content = `package service

func Zero() {}
`;
    const symbol = await extractedGoSymbol(content, 'Zero');

    const result = await analyzeGoSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name ?? '',
            qualifiedName: symbol.qualifiedName ?? '',
            span: symbol.span,
        },
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
        assert.equal(result.analysis.metrics.parameterCount.value, 0);
        assert.equal(result.analysis.metrics.declaredReturnType.value, null);
    }

    const stale = await analyzeGoSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name ?? '',
            qualifiedName: 'Other.Zero',
            span: symbol.span,
        },
    });
    assert.deepEqual(stale, { status: 'unavailable', reason: 'symbol_not_found' });
});

test('Go structural v1 fails closed for unsupported symbol kinds', async () => {
    const content = `package service

type Service struct{}
`;
    const symbol = await extractedGoSymbol(content, 'Service');
    const result = await analyzeGoSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name ?? '',
            qualifiedName: symbol.qualifiedName ?? '',
            span: symbol.span,
        },
    });
    assert.deepEqual(result, { status: 'unavailable', reason: 'unsupported_symbol_kind' });
});

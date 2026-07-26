import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PYTHON_STRUCTURAL_ANALYSIS_VERSION,
    analyzePythonSymbolStructure,
} from './tree-sitter-adapter';
import { createLanguageAnalysisService } from './service';

async function extractedPythonSymbol(
    content: string,
    qualifiedName: string,
) {
    const result = await createLanguageAnalysisService().analyze({
        content,
        language: 'python',
        relativePath: 'src/analysis.py',
    });
    assert.equal(result.structuralStatus, 'complete');
    const symbol = result.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    assert.ok(symbol);
    return symbol;
}

test('Python structural v1 reports deterministic callable syntax and complexity', async () => {
    const content = [
        '@trace',
        'async def analyze(',
        '    self,',
        '    value: int,',
        '    /,',
        '    *items: str,',
        '    flag=True,',
        '    **options,',
        ') -> list[str]:',
        '    flattened = [item for group in items for item in group if item]',
        '    if value > 0 and flag:',
        '        for item in items:',
        '            while item:',
        '                break',
        '    elif options:',
        '        try:',
        '            use(options)',
        '        except ValueError:',
        '            recover()',
        '    match value:',
        '        case 0:',
        '            reset()',
        '        case _:',
        '            keep()',
        '    def nested(ignored):',
        '        for value in ignored:',
        '            use(value)',
        '    return flattened if flag else []',
        '',
    ].join('\n');
    const symbol = await extractedPythonSymbol(content, 'analyze');

    const result = await analyzePythonSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name,
            qualifiedName: symbol.qualifiedName,
            span: symbol.span,
        },
    });

    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.analysis.analysisVersion, PYTHON_STRUCTURAL_ANALYSIS_VERSION);
    assert.equal(result.analysis.sourceBinding, 'current_source');
    assert.deepEqual(result.analysis.metrics.parameterCount, {
        derivationKind: 'exact_syntax',
        availability: 'available',
        value: 5,
    });
    assert.deepEqual(result.analysis.metrics.loopCount, {
        derivationKind: 'structural_metric',
        availability: 'available',
        value: 4,
    });
    assert.deepEqual(result.analysis.metrics.maxLoopDepth, {
        derivationKind: 'structural_metric',
        availability: 'available',
        value: 2,
    });
    assert.deepEqual(result.analysis.metrics.cyclomaticComplexity, {
        derivationKind: 'structural_metric',
        availability: 'available',
        value: 13,
    });
    assert.equal(
        result.analysis.metrics.signature.value,
        [
            'async def analyze(',
            '    self,',
            '    value: int,',
            '    /,',
            '    *items: str,',
            '    flag=True,',
            '    **options,',
            ') -> list[str]:',
        ].join('\n'),
    );
    assert.equal(result.analysis.metrics.declaredReturnType.value, 'list[str]');
});

test('Python structural v1 distinguishes zero and absent return syntax', async () => {
    const content = 'def zero():\n    return None\n';
    const symbol = await extractedPythonSymbol(content, 'zero');

    const result = await analyzePythonSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name,
            qualifiedName: symbol.qualifiedName,
            span: symbol.span,
        },
    });

    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.analysis.metrics.parameterCount.value, 0);
    assert.equal(result.analysis.metrics.loopCount.value, 0);
    assert.equal(result.analysis.metrics.maxLoopDepth.value, 0);
    assert.equal(result.analysis.metrics.cyclomaticComplexity.value, 1);
    assert.equal(result.analysis.metrics.declaredReturnType.availability, 'available');
    assert.equal(result.analysis.metrics.declaredReturnType.value, null);
});

test('Python structural v1 fails closed for unsupported symbols and stale identity', async () => {
    const content = 'def owner(value):\n    return value\n';
    const symbol = await extractedPythonSymbol(content, 'owner');

    assert.deepEqual(await analyzePythonSymbolStructure({
        content,
        symbol: {
            kind: 'class',
            name: symbol.name,
            qualifiedName: symbol.qualifiedName,
            span: symbol.span,
        },
    }), {
        status: 'unavailable',
        reason: 'unsupported_symbol_kind',
    });

    assert.deepEqual(await analyzePythonSymbolStructure({
        content,
        symbol: {
            kind: symbol.kind,
            name: symbol.name,
            qualifiedName: symbol.qualifiedName,
            span: {
                ...symbol.span,
                startByte: (symbol.span.startByte ?? 0) + 1,
            },
        },
    }), {
        status: 'unavailable',
        reason: 'symbol_not_found',
    });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    buildSymbolRegistry,
    buildSymbolRecordsForFile,
    type SymbolRecord,
    type SymbolRegistryManifest,
} from '../../symbols';
import { createLanguageAnalysisService } from '../../language-analysis';
import { syntacticResolutionContributionEngine } from './syntactic';

test('SyntacticResolutionContributionEngine resolves direct TS calls and creates derived TESTS edges', async () => {
    const sources = new Map([
        ['src/math.ts', 'export function add(a: number, b: number): number { return a + b; }\n'],
        ['src/app.ts', 'import { add } from "./math";\nexport function main() { return add(1, 2); }\n'],
        ['tests/app.test.ts', 'import { add } from "../src/math";\nexport function testAdd() { return add(2, 3); }\n'],
    ]);
    const analyzer = createLanguageAnalysisService();
    const analysisByFile = new Map(await Promise.all([...sources.entries()].map(async ([path, content]) => [
        path,
        await analyzer.analyze({ content, language: 'typescript', relativePath: path }),
    ] as const)));

    const symbols: SymbolRecord[] = [];
    const files: SymbolRegistryManifest['files'] = [];
    for (const [path, content] of sources.entries()) {
        const analysis = analysisByFile.get(path)!;
        const fileSymbols = buildSymbolRecordsForFile({
            relativePath: path,
            language: 'typescript',
            content,
            fileHash: `hash-${path}`,
            extractorVersion: 'test-v1',
            chunks: [],
            extractedSymbols: analysis.symbols,
        });
        symbols.push(...fileSymbols);
        files.push({
            path,
            language: 'typescript',
            hash: `hash-${path}`,
            symbolCount: fileSymbols.length,
            definitionStatus: 'definitions_present',
        });
    }

    const registry = buildSymbolRegistry({
        manifest: {
            schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
            normalizedRootPath: '/repo',
            rootFingerprint: 'root-fingerprint',
            indexPolicyHash: 'policy-hash',
            languageRouterVersion: 'router-v1',
            extractorVersion: 'test-extractor-v1',
            relationshipVersion: 'relationship-v1',
            builtAt: '2026-06-17T00:00:00.000Z',
            files,
        },
        symbols,
    });


    const result = syntacticResolutionContributionEngine.resolveCalls({
        registry,
        analysisByFile,
    });

    const appCalls = result.records.filter((r) => r.file === 'src/app.ts' && r.type === 'CALLS');
    assert.equal(appCalls.length, 1);

    const testCalls = result.records.filter((r) => r.file === 'tests/app.test.ts' && r.type === 'CALLS');
    const testTests = result.records.filter((r) => r.file === 'tests/app.test.ts' && r.type === 'TESTS');
    assert.equal(testCalls.length, 1);
    assert.equal(testTests.length, 1);
    assert.equal(testCalls[0].targetInstanceId, testTests[0].targetInstanceId);
    assert.equal(testCalls[0].confidence, 'low');
    assert.equal(testTests[0].confidence, 'low');

});

test('SyntacticResolutionContributionEngine qualifies Scala direct calls and abstains on member or ambiguous targets', async () => {
    const sources = new Map([
        ['src/Math.scala', 'package demo\ndef twice(x: Int): Int = x * 2\n'],
        ['src/DuplicateA.scala', 'package demo\ndef duplicate(x: Int): Int = x\n'],
        ['src/DuplicateB.scala', 'package other\ndef duplicate(x: Int): Int = x + 1\n'],
        ['tests/ScalaSpec.scala', 'package demo\ndef testTwice(): Int = twice(2)\n'],
        ['src/Main.scala', [
            'package demo',
            'object Box { def value(): Int = 1; def local(): Int = Box.value() }',
            'def run(): Int = twice(21)',
            'def ambiguous(): Int = duplicate(1)',
            '',
        ].join('\n')],
    ]);
    const analyzer = createLanguageAnalysisService();
    const analysisByFile = new Map(await Promise.all([...sources.entries()].map(async ([path, content]) => [
        path,
        await analyzer.analyze({ content, language: 'scala', relativePath: path }),
    ] as const)));

    const symbols: SymbolRecord[] = [];
    const files: SymbolRegistryManifest['files'] = [];
    for (const [path, content] of sources.entries()) {
        const analysis = analysisByFile.get(path)!;
        const fileSymbols = buildSymbolRecordsForFile({
            relativePath: path,
            language: 'scala',
            content,
            fileHash: `hash-${path}`,
            extractorVersion: 'test-v1',
            chunks: [],
            extractedSymbols: analysis.symbols,
        });
        symbols.push(...fileSymbols);
        files.push({
            path,
            language: 'scala',
            hash: `hash-${path}`,
            symbolCount: fileSymbols.length,
            definitionStatus: 'definitions_present',
        });
    }

    const registry = buildSymbolRegistry({
        manifest: {
            schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
            normalizedRootPath: '/repo',
            rootFingerprint: 'root-fingerprint',
            indexPolicyHash: 'policy-hash',
            languageRouterVersion: 'router-v1',
            extractorVersion: 'test-extractor-v1',
            relationshipVersion: 'relationship-v1',
            builtAt: '2026-08-28T00:00:00.000Z',
            files,
        },
        symbols,
    });

    const result = syntacticResolutionContributionEngine.resolveCalls({
        registry,
        analysisByFile,
    });
    const calls = result.records.filter((record) => record.type === 'CALLS');
    assert.equal(calls.length, 2);
    assert.equal(result.records.some((record) => record.type === 'TESTS'), false);

    const call = calls.find((record) => record.file === 'src/Main.scala');
    assert.ok(call);
    const source = registry.symbols.find((symbol) => symbol.symbolInstanceId === call.sourceInstanceId);
    const target = registry.symbols.find((symbol) => symbol.symbolInstanceId === call.targetInstanceId);
    assert.equal(source?.qualifiedName, 'demo.run');
    assert.equal(target?.qualifiedName, 'demo.twice');
    assert.equal(call.file, 'src/Main.scala');
    assert.equal(call.confidence, 'low');
    assert.deepEqual(call.span, {
        startLine: 3,
        endLine: 3,
        startByte: 98,
        endByte: 107,
        startColumn: 17,
        endColumn: 26,
    });
});

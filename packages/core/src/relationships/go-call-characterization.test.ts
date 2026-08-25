import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WasmSemanticProjectAnalyzer } from '../semantic/wasm/wasm-analyzer';
import { buildRelationshipsForRegistry } from './builder';
import type { SymbolRecord, SymbolRegistry } from '../symbols';


function createGoTestRegistry(files: Array<{ path: string; symbols: SymbolRecord[] }>): SymbolRegistry {
    const allSymbols: SymbolRecord[] = [];
    const symbolsByFile = new Map<string, SymbolRecord[]>();
    const manifestFiles = [];

    for (const f of files) {
        manifestFiles.push({
            path: f.path,
            hash: 'hash-' + f.path,
            language: 'go',
            symbolCount: f.symbols.length,
            definitionStatus: 'definitions_present' as const,
        });
        symbolsByFile.set(f.path, f.symbols);
        allSymbols.push(...f.symbols);
    }

    return {
        manifest: {
            schemaVersion: 'symbol_registry_v3',
            normalizedRootPath: '/project',
            rootFingerprint: 'rfp',
            indexPolicyHash: 'iph',
            languageRouterVersion: 'lr-v2',
            extractorVersion: 'v1',
            relationshipVersion: 'v1',
            builtAt: '2026-08-14T00:00:00.000Z',
            files: manifestFiles,
        },

        symbols: allSymbols,
        symbolsByFile,
        symbolsByInstanceId: new Map(allSymbols.map((s) => [s.symbolInstanceId, s])),
        symbolsByKey: new Map(allSymbols.map((s) => [s.symbolKey, [s]])),
        symbolsByLabel: new Map(allSymbols.map((s) => [s.label, [s]])),
        symbolsByQualifiedName: new Map(allSymbols.map((s) => [s.qualifiedName, [s]])),
        warnings: [],
    };
}



test('Go call characterization: production calls_v0 admits only direct calls', async () => {
    const mainGo = `package main

type Service struct{}

func (s *Service) Execute() string {
    return "executed"
}

func Helper() int {
    return 42
}

func main() {
    svc := &Service{}
    _ = svc.Execute()
    _ = Helper()
}
`;

    const serviceTestGo = `package main

import "testing"

func TestService(t *testing.T) {
    svc := &Service{}
    _ = svc.Execute()
}
`;

    const symbols: SymbolRecord[] = [
        {
            symbolKey: 'main.go#Service',
            symbolInstanceId: 'inst-svc',
            name: 'Service',
            label: 'Service',
            qualifiedName: 'Service',
            kind: 'type',
            file: 'main.go',
            language: 'go',
            span: { startByte: 14, endByte: 35, startLine: 3, endLine: 3, startColumn: 0, endColumn: 21 },
            parentQualifiedNamePath: [],
            fileHash: 'fh-main',
            extractorVersion: 'v1',
        },
        {
            symbolKey: 'main.go#Execute',
            symbolInstanceId: 'inst-exec',
            name: 'Execute',
            label: 'Execute',
            qualifiedName: 'Service.Execute',
            kind: 'method',
            file: 'main.go',
            language: 'go',
            span: { startByte: 37, endByte: 97, startLine: 5, endLine: 7, startColumn: 0, endColumn: 1 },
            parentQualifiedNamePath: ['Service'],
            fileHash: 'fh-main',
            extractorVersion: 'v1',
        },
        {
            symbolKey: 'main.go#Helper',
            symbolInstanceId: 'inst-helper',
            name: 'Helper',
            label: 'Helper',
            qualifiedName: 'Helper',
            kind: 'function',
            file: 'main.go',
            language: 'go',
            span: { startByte: 99, endByte: 134, startLine: 9, endLine: 11, startColumn: 0, endColumn: 1 },
            parentQualifiedNamePath: [],
            fileHash: 'fh-main',
            extractorVersion: 'v1',
        },
        {
            symbolKey: 'main.go#main',
            symbolInstanceId: 'inst-main',
            name: 'main',
            label: 'main',
            qualifiedName: 'main',
            kind: 'function',
            file: 'main.go',
            language: 'go',
            span: { startByte: 136, endByte: 212, startLine: 13, endLine: 17, startColumn: 0, endColumn: 1 },
            parentQualifiedNamePath: [],
            fileHash: 'fh-main',
            extractorVersion: 'v1',
        },
        {
            symbolKey: 'service_test.go#TestService',
            symbolInstanceId: 'inst-test-svc',
            name: 'TestService',
            label: 'TestService',
            qualifiedName: 'TestService',
            kind: 'function',
            file: 'service_test.go',
            language: 'go',
            span: { startByte: 32, endByte: 110, startLine: 5, endLine: 8, startColumn: 0, endColumn: 1 },
            parentQualifiedNamePath: [],
            fileHash: 'fh-test',
            extractorVersion: 'v1',
        },
    ];


    const registry = createGoTestRegistry([
        {
            path: 'main.go',
            symbols: [symbols[0], symbols[1], symbols[2], symbols[3]],
        },
        {
            path: 'service_test.go',
            symbols: [symbols[4]],
        },
    ]);

    const analyzer = new WasmSemanticProjectAnalyzer();
    const evidence = await analyzer.analyze({
        language: 'go',
        auxiliaryFiles: [],
        sourceFiles: [
            { path: 'main.go', source: mainGo, sourceHash: 'hash-main' },
            { path: 'service_test.go', source: serviceTestGo, sourceHash: 'hash-test' },
        ],
    });

    const analysisByFile = new Map();
    analysisByFile.set('main.go', { moduleBindings: [], callSites: [] });
    analysisByFile.set('service_test.go', { moduleBindings: [], callSites: [] });

    const records = buildRelationshipsForRegistry({
        registry,
        analysisByFile,
        semanticEvidenceByLanguage: new Map([['go', evidence]]),
    });

    const calls = records.filter((record) => record.type === 'CALLS');
    assert.equal(calls.length, 1);

    const mainHelperCall = calls.find(
        (r) => r.sourceKey === 'main.go#main' && r.targetKey === 'main.go#Helper',
    );
    assert.ok(mainHelperCall, 'main -> Helper direct CALLS edge must exist');
    assert.equal(mainHelperCall.resolutionAuthority, 'direct_binding');

    assert.equal(
        calls.some((record) => record.targetKey === 'main.go#Execute'),
        false,
        'receiver/type-dispatch evidence must abstain at Tier 3',
    );
    assert.equal(
        calls.some((record) => record.sourceKey === 'service_test.go#TestService'),
        false,
        '_test.go callers must not produce initial Go v2 CALLS',
    );
    assert.equal(records.some((record) => record.type === 'TESTS'), false);
});

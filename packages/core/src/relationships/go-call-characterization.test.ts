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



test('Go call characterization: direct calls, method dispatch, and test edges end-to-end', async () => {
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
            span: { startByte: 15, endByte: 37, startLine: 3, endLine: 3, startColumn: 0, endColumn: 22 },
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
            span: { startByte: 39, endByte: 107, startLine: 5, endLine: 7, startColumn: 0, endColumn: 1 },
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
            span: { startByte: 109, endByte: 147, startLine: 9, endLine: 11, startColumn: 0, endColumn: 1 },
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
            span: { startByte: 149, endByte: 235, startLine: 13, endLine: 17, startColumn: 0, endColumn: 1 },
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
            span: { startByte: 32, endByte: 115, startLine: 5, endLine: 8, startColumn: 0, endColumn: 1 },
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

    assert.ok(records.length >= 3, `Expected at least 3 relationship records, saw ${records.length}`);

    // Verify main -> Execute
    const mainExecCall = records.find(
        (r) => r.sourceKey === 'main.go#main' && r.targetKey === 'main.go#Execute' && r.type === 'CALLS',
    );
    assert.ok(mainExecCall, 'main -> Execute CALLS edge must exist');
    assert.equal(mainExecCall.resolutionAuthority, 'direct_binding');

    // Verify main -> Helper
    const mainHelperCall = records.find(
        (r) => r.sourceKey === 'main.go#main' && r.targetKey === 'main.go#Helper' && r.type === 'CALLS',
    );
    assert.ok(mainHelperCall, 'main -> Helper CALLS edge must exist');
    assert.equal(mainHelperCall.resolutionAuthority, 'direct_binding');

    // Verify TestService -> Execute (TESTS edge)
    const testExec = records.find(
        (r) => r.sourceKey === 'service_test.go#TestService' && r.targetKey === 'main.go#Execute' && r.type === 'TESTS',
    );
    assert.ok(testExec, 'TestService -> Execute TESTS edge must exist');
    assert.equal(testExec.resolutionAuthority, 'direct_binding');
});

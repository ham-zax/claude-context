import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CbmSemanticContributionEngine } from './cbm';
import type { SymbolRecord, SymbolRegistry } from '../../symbols';
import type { SemanticProjectEvidence } from '../../semantic/contracts';
import type { SemanticLanguageDescriptor } from '../../semantic/descriptor';

function createMockRegistry(): SymbolRegistry {
    const callerSpan = { startByte: 50, endByte: 150, startLine: 5, endLine: 10, startColumn: 0, endColumn: 1 };
    const targetSpan = { startByte: 10, endByte: 45, startLine: 1, endLine: 4, startColumn: 0, endColumn: 1 };

    const symbols: SymbolRecord[] = [
        {
            symbolKey: 'main.go#main',
            symbolInstanceId: 'inst-main',
            name: 'main',
            label: 'main',
            qualifiedName: 'main',
            kind: 'function' as const,
            file: 'main.go',
            language: 'go',
            span: callerSpan,
            parentQualifiedNamePath: [],
            fileHash: 'fh-main',
            extractorVersion: 'v1',
        },
        {
            symbolKey: 'main.go#Process',
            symbolInstanceId: 'inst-process',
            name: 'Process',
            label: 'Process',
            qualifiedName: 'Process',
            kind: 'function' as const,
            file: 'main.go',
            language: 'go',
            span: targetSpan,
            parentQualifiedNamePath: [],
            fileHash: 'fh-main',
            extractorVersion: 'v1',
        },
        {
            symbolKey: 'user.go#Greet',
            symbolInstanceId: 'inst-greet',
            name: 'Greet',
            label: 'Greet',
            qualifiedName: 'User.Greet',
            kind: 'method' as const,
            file: 'user.go',
            language: 'go',
            span: { startByte: 20, endByte: 60, startLine: 2, endLine: 5, startColumn: 0, endColumn: 1 },
            parentQualifiedNamePath: ['User'],
            fileHash: 'fh-user',
            extractorVersion: 'v1',
        },
    ];

    const symbolsByFile = new Map<string, SymbolRecord[]>();
    symbolsByFile.set('main.go', [symbols[0], symbols[1]]);
    symbolsByFile.set('user.go', [symbols[2]]);

    return {
        manifest: {
            schemaVersion: 'symbol_registry_v3',
            normalizedRootPath: '/repo',
            rootFingerprint: 'rfp',
            indexPolicyHash: 'iph',
            languageRouterVersion: 'lr-v2',
            extractorVersion: 'v1',
            relationshipVersion: 'v1',
            builtAt: '2026-08-14T00:00:00.000Z',
            files: [
                { path: 'main.go', hash: 'h1', language: 'go', symbolCount: 2, definitionStatus: 'definitions_present' },
                { path: 'user.go', hash: 'h2', language: 'go', symbolCount: 1, definitionStatus: 'definitions_present' },
            ],
        },
        symbols,
        symbolsByFile,
        symbolsByInstanceId: new Map(symbols.map((s) => [s.symbolInstanceId, s])),
        symbolsByKey: new Map(symbols.map((s) => [s.symbolKey, [s]])),
        symbolsByLabel: new Map(symbols.map((s) => [s.label, [s]])),
        symbolsByQualifiedName: new Map(symbols.map((s) => [s.qualifiedName, [s]])),
        warnings: [],
    };
}

test('CbmSemanticContributionEngine resolves direct function calls with exact span match and attaches structured proof', () => {
    const engine = new CbmSemanticContributionEngine('go');
    const registry = createMockRegistry();

    const semanticEvidence: SemanticProjectEvidence = {
        language: 'go',
        occurrencesByFile: new Map([
            [
                'main.go',
                [
                    {
                        sourceFile: 'main.go',
                        callSpan: { startByte: 70, endByte: 85, startLine: 7, endLine: 7, startColumn: 4, endColumn: 19 },
                        targetProvenance: {
                            file: 'main.go',
                            span: { startByte: 10, endByte: 45, startLine: 1, endLine: 4, startColumn: 0, endColumn: 1 },
                            name: 'Process',
                            kind: 'function',
                        },
                        proof: {
                            strategy: 'direct_call',
                            packageBinding: {
                                importPath: 'main',
                            },
                        },
                        decision: 'resolved',
                        confidence: 1.0,
                    },
                ],
            ],
        ]),
    };

    const result = engine.resolveCalls({
        registry,
        analysisByFile: new Map(),
        semanticEvidence,
    });

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].sourceKey, 'main.go#main');
    assert.equal(result.records[0].targetKey, 'main.go#Process');
    assert.equal(result.records[0].type, 'CALLS');
    assert.equal(result.records[0].confidence, 'high');

    const claims = result.claimsByFile?.get('main.go');
    assert.ok(claims && claims.length === 1);
    assert.equal(claims[0].decision, 'resolved');
    assert.equal(claims[0].targetSymbol, 'Process');
    assert.equal(claims[0].resolutionAuthority, 'direct_binding');
});

test('CbmSemanticContributionEngine seamlessly supports any CBM language descriptor', () => {
    const customDescriptor: SemanticLanguageDescriptor = {
        language: 'rust',
        canonicalLanguage: 'rust',
        extensions: ['.rs'],
        semanticRevision: 'rust-v1',
        grammar: 'tree-sitter-rust',
        auxiliaryFiles: [{ pattern: '**/Cargo.toml', role: 'manifest' }],
        providerId: 'satori-cbm-semantic-rust',
        providerVersion: 'cbm-rust-v1',
        environmentConfigId: 'cbm-rust-config-v1',
    };

    const engine = new CbmSemanticContributionEngine('rust', customDescriptor);
    const registry: SymbolRegistry = {
        manifest: {
            schemaVersion: 'symbol_registry_v3',
            normalizedRootPath: '/repo',
            rootFingerprint: 'rfp',
            indexPolicyHash: 'iph',
            languageRouterVersion: 'lr-v2',
            extractorVersion: 'v1',
            relationshipVersion: 'v1',
            builtAt: '2026-08-14T00:00:00.000Z',
            files: [{ path: 'lib.rs', hash: 'h1', language: 'rust', symbolCount: 2, definitionStatus: 'definitions_present' }],
        },
        symbols: [
            {
                symbolKey: 'lib.rs#run',
                symbolInstanceId: 'inst-rust-run',
                name: 'run',
                label: 'run',
                qualifiedName: 'run',
                kind: 'function',
                file: 'lib.rs',
                language: 'rust',
                span: { startByte: 0, endByte: 100, startLine: 1, endLine: 10, startColumn: 0, endColumn: 1 },
                parentQualifiedNamePath: [],
                fileHash: 'fh-rust',
                extractorVersion: 'v1',
            },
            {
                symbolKey: 'lib.rs#helper',
                symbolInstanceId: 'inst-rust-helper',
                name: 'helper',
                label: 'helper',
                qualifiedName: 'helper',
                kind: 'function',
                file: 'lib.rs',
                language: 'rust',
                span: { startByte: 110, endByte: 200, startLine: 12, endLine: 20, startColumn: 0, endColumn: 1 },
                parentQualifiedNamePath: [],
                fileHash: 'fh-rust',
                extractorVersion: 'v1',
            },
        ],
        symbolsByFile: new Map([
            ['lib.rs', [
                {
                    symbolKey: 'lib.rs#run',
                    symbolInstanceId: 'inst-rust-run',
                    name: 'run',
                    label: 'run',
                    qualifiedName: 'run',
                    kind: 'function',
                    file: 'lib.rs',
                    language: 'rust',
                    span: { startByte: 0, endByte: 100, startLine: 1, endLine: 10, startColumn: 0, endColumn: 1 },
                    parentQualifiedNamePath: [],
                    fileHash: 'fh-rust',
                    extractorVersion: 'v1',
                },
                {
                    symbolKey: 'lib.rs#helper',
                    symbolInstanceId: 'inst-rust-helper',
                    name: 'helper',
                    label: 'helper',
                    qualifiedName: 'helper',
                    kind: 'function',
                    file: 'lib.rs',
                    language: 'rust',
                    span: { startByte: 110, endByte: 200, startLine: 12, endLine: 20, startColumn: 0, endColumn: 1 },
                    parentQualifiedNamePath: [],
                    fileHash: 'fh-rust',
                    extractorVersion: 'v1',
                },
            ]],
        ]),
        symbolsByInstanceId: new Map(),
        symbolsByKey: new Map(),
        symbolsByLabel: new Map(),
        symbolsByQualifiedName: new Map(),
        warnings: [],
    };

    const evidence: SemanticProjectEvidence = {
        language: 'rust',
        occurrencesByFile: new Map([
            [
                'lib.rs',
                [
                    {
                        sourceFile: 'lib.rs',
                        callSpan: { startByte: 30, endByte: 45, startLine: 3, endLine: 3, startColumn: 4, endColumn: 19 },
                        targetProvenance: {
                            file: 'lib.rs',
                            span: { startByte: 110, endByte: 200, startLine: 12, endLine: 20, startColumn: 0, endColumn: 1 },
                            name: 'helper',
                            kind: 'function',
                        },
                        proof: { strategy: 'direct_call' },
                        decision: 'resolved',
                        confidence: 1.0,
                    },
                ],
            ],
        ]),
    };

    const result = engine.resolveCalls({
        registry,
        analysisByFile: new Map(),
        semanticEvidence: evidence,
    });

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].sourceKey, 'lib.rs#run');
    assert.equal(result.records[0].targetKey, 'lib.rs#helper');
    assert.equal(result.records[0].type, 'CALLS');

    const claims = result.claimsByFile?.get('lib.rs');
    assert.ok(claims && claims.length === 1);
    assert.equal(claims[0].providerId, 'satori-cbm-semantic-rust');
    assert.equal(claims[0].providerVersion, 'cbm-rust-v1');
    assert.equal(claims[0].environmentConfigId, 'cbm-rust-config-v1');
});

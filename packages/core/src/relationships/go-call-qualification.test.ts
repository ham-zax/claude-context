import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSymbolRegistry,
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    type SymbolRecord,
} from '../symbols';
import { WasmSemanticProjectAnalyzer } from '../semantic/wasm/wasm-analyzer';
import { WasmSemanticEngine } from '../semantic/wasm/wasm-engine';
import { buildRelationshipsForRegistry } from './builder';

interface GoSource {
    readonly path: string;
    readonly source: string;
}

interface GoAuxiliary {
    readonly path: string;
    readonly role: 'manifest' | 'lockfile' | 'workspace';
    readonly source: string;
}

const enginePromise = WasmSemanticEngine.create();
const analyzer = new WasmSemanticProjectAnalyzer(() => enginePromise);

function lineForByte(source: string, byte: number): number {
    return 1 + (source.slice(0, byte).match(/\n/g)?.length ?? 0);
}

function columnForByte(source: string, byte: number): number {
    const previousNewline = source.lastIndexOf('\n', Math.max(0, byte - 1));
    return byte - (previousNewline + 1);
}

function functionSpan(source: string, marker: string) {
    const startByte = source.indexOf(marker);
    assert.notEqual(startByte, -1, `Missing function marker: ${marker}`);
    const bodyStart = source.indexOf('{', startByte);
    assert.notEqual(bodyStart, -1, `Missing function body for marker: ${marker}`);

    let depth = 0;
    let endByte = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) {
                endByte = i + 1;
                break;
            }
        }
    }
    assert.notEqual(endByte, -1, `Unterminated function body for marker: ${marker}`);

    return {
        startByte,
        endByte,
        startLine: lineForByte(source, startByte),
        endLine: lineForByte(source, endByte),
        startColumn: columnForByte(source, startByte),
        endColumn: columnForByte(source, endByte),
    };
}

function functionSymbol(input: {
    readonly file: string;
    readonly source: string;
    readonly name: string;
    readonly marker?: string;
    readonly qualifiedName?: string;
    readonly kind?: 'function' | 'method';
    readonly parentQualifiedNamePath?: readonly string[];
}): SymbolRecord {
    const qualifiedName = input.qualifiedName ?? input.name;
    return {
        symbolKey: `${input.file}#${qualifiedName}`,
        symbolInstanceId: `inst:${input.file}:${qualifiedName}`,
        name: input.name,
        label: input.name,
        qualifiedName,
        kind: input.kind ?? 'function',
        file: input.file,
        language: 'go',
        span: functionSpan(input.source, input.marker ?? `func ${input.name}(`),
        parentQualifiedNamePath: [...(input.parentQualifiedNamePath ?? [])],
        fileHash: `hash-${input.file}`,
        extractorVersion: 'go-qualification',
    };
}

function createRegistry(sources: readonly GoSource[], symbols: readonly SymbolRecord[]) {
    return buildSymbolRegistry({
        manifest: {
            schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
            normalizedRootPath: '/qualification',
            rootFingerprint: 'go-qualification-root',
            indexPolicyHash: 'go-qualification-policy',
            languageRouterVersion: 'go-qualification-router',
            extractorVersion: 'go-qualification',
            relationshipVersion: 'go-qualification',
            builtAt: '2026-08-25T00:00:00.000Z',
            files: sources.map((source) => ({
                path: source.path,
                hash: `hash-${source.path}`,
                language: 'go',
                symbolCount: symbols.filter((symbol) => symbol.file === source.path).length,
                definitionStatus: 'definitions_present' as const,
            })),
        },
        symbols: [...symbols],
    });
}

async function analyzeGo(sources: readonly GoSource[], auxiliaries: readonly GoAuxiliary[] = []) {
    return analyzer.analyze({
        language: 'go',
        sourceFiles: sources.map((source) => ({
            ...source,
            sourceHash: `hash-${source.path}`,
        })),
        auxiliaryFiles: auxiliaries.map((auxiliary) => ({
            ...auxiliary,
            sourceHash: `hash-${auxiliary.path}`,
        })),
    });
}

async function qualifyGo(
    sources: readonly GoSource[],
    symbols: readonly SymbolRecord[],
    auxiliaries: readonly GoAuxiliary[] = [],
) {
    const evidence = await analyzeGo(sources, auxiliaries);
    const registry = createRegistry(sources, symbols);
    const analysisByFile = new Map(
        sources.map((source) => [
            source.path,
            { moduleBindings: [], callSites: [], receiverTypeBindings: [], pythonFlowFacts: [] },
        ]),
    );
    const records = buildRelationshipsForRegistry({
        registry,
        analysisByFile,
        mode: {
            kind: 'qualification',
            enabledUnpromotedCallLanguages: new Set(['go']),
        },
        semanticEvidenceByLanguage: new Map([['go', evidence]]),
    });
    return { evidence, records };
}

function callRecords<T extends { readonly type: string }>(records: readonly T[]): T[] {
    return records.filter((record) => record.type === 'CALLS');
}

test('Go qualification admits same-file and cross-file same-package direct calls with exact target provenance', async () => {
    const mainSource = `package app

func Same() {}

func Run() {
    Same()
    Other()
}
`;
    const otherSource = `package app

func Other() {}
`;
    const sources = [
        { path: 'main.go', source: mainSource },
        { path: 'other.go', source: otherSource },
    ];
    const symbols = [
        functionSymbol({ file: 'main.go', source: mainSource, name: 'Same' }),
        functionSymbol({ file: 'main.go', source: mainSource, name: 'Run' }),
        functionSymbol({ file: 'other.go', source: otherSource, name: 'Other' }),
    ];

    const { evidence, records } = await qualifyGo(
        sources,
        symbols,
        [{ path: 'go.mod', role: 'manifest', source: 'module example.com/app\n\ngo 1.22\n' }],
    );

    const calls = callRecords(records);
    assert.equal(calls.length, 2);
    assert.ok(calls.some((record) => record.sourceKey === 'main.go#Run' && record.targetKey === 'main.go#Same'));
    assert.ok(calls.some((record) => record.sourceKey === 'main.go#Run' && record.targetKey === 'other.go#Other'));
    assert.equal(records.some((record) => record.type === 'TESTS'), false);

    const otherOccurrence = (evidence.occurrencesByFile.get('main.go') ?? [])
        .find((occurrence) => occurrence.targetProvenance?.file === 'other.go');
    assert.ok(otherOccurrence);
    assert.equal(otherOccurrence.proof.strategy, 'direct_call');
    assert.deepEqual(otherOccurrence.targetProvenance?.span, functionSpan(otherSource, 'func Other('));
    assert.equal(
        calls.find((record) => record.targetKey === 'other.go#Other')?.targetInstanceId,
        'inst:other.go:Other',
    );
});

test('Go qualification binds explicit import aliases and default selectors from declared package names', async () => {
    const callerSource = `package app

import (
    utilx "example.com/lib/util"
    "example.com/project/v2"
)

func Run() {
    utilx.Help()
    project.Build()
}
`;
    const utilSource = `package helpers

func Help() {}
`;
    const projectSource = `package project

func Build() {}
`;
    const sources = [
        { path: 'app/main.go', source: callerSource },
        { path: 'lib/util/util.go', source: utilSource },
        { path: 'project-v2/api.go', source: projectSource },
    ];
    const symbols = [
        functionSymbol({ file: 'app/main.go', source: callerSource, name: 'Run' }),
        functionSymbol({ file: 'lib/util/util.go', source: utilSource, name: 'Help' }),
        functionSymbol({ file: 'project-v2/api.go', source: projectSource, name: 'Build' }),
    ];
    const auxiliaries: GoAuxiliary[] = [
        { path: 'app/go.mod', role: 'manifest', source: 'module example.com/app\n\ngo 1.22\n' },
        { path: 'lib/go.mod', role: 'manifest', source: 'module example.com/lib\n\ngo 1.22\n' },
        { path: 'project-v2/go.mod', role: 'manifest', source: 'module example.com/project/v2\n\ngo 1.22\n' },
    ];

    const { evidence, records } = await qualifyGo(sources, symbols, auxiliaries);
    const calls = callRecords(records);
    assert.equal(calls.length, 2);
    assert.ok(calls.some((record) => record.targetKey === 'lib/util/util.go#Help'));
    assert.ok(calls.some((record) => record.targetKey === 'project-v2/api.go#Build'));

    const occurrences = evidence.occurrencesByFile.get('app/main.go') ?? [];
    const aliasCall = occurrences.find((occurrence) => occurrence.targetProvenance?.name === 'Help');
    const defaultCall = occurrences.find((occurrence) => occurrence.targetProvenance?.name === 'Build');
    assert.equal(aliasCall?.proof.packageBinding?.importPath, 'example.com/lib/util');
    assert.equal(defaultCall?.proof.packageBinding?.importPath, 'example.com/project/v2');
    assert.equal(defaultCall?.targetProvenance?.file, 'project-v2/api.go');
});

test('Go qualification uses nearest go.mod ownership and does not cross-bind same short package/function names', async () => {
    const callerSource = `package main

import "example.com/child/lib"

func Run() {
    lib.Work()
}
`;
    const nestedTarget = `package lib

func Work() {}
`;
    const rootDecoy = `package lib

func Work() {}
`;
    const sources = [
        { path: 'services/child/cmd/main.go', source: callerSource },
        { path: 'services/child/lib/work.go', source: nestedTarget },
        { path: 'lib/work.go', source: rootDecoy },
    ];
    const symbols = [
        functionSymbol({ file: 'services/child/cmd/main.go', source: callerSource, name: 'Run' }),
        functionSymbol({ file: 'services/child/lib/work.go', source: nestedTarget, name: 'Work' }),
        functionSymbol({ file: 'lib/work.go', source: rootDecoy, name: 'Work' }),
    ];
    const auxiliaries: GoAuxiliary[] = [
        { path: 'go.mod', role: 'manifest', source: 'module example.com/root\n\ngo 1.22\n' },
        { path: 'services/child/go.mod', role: 'manifest', source: 'module example.com/child\n\ngo 1.22\n' },
    ];

    const { evidence, records } = await qualifyGo(sources, symbols, auxiliaries);
    const calls = callRecords(records);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].targetKey, 'services/child/lib/work.go#Work');
    assert.equal(calls[0].targetInstanceId, 'inst:services/child/lib/work.go:Work');
    const occurrence = (evidence.occurrencesByFile.get('services/child/cmd/main.go') ?? [])[0];
    assert.equal(occurrence?.targetProvenance?.file, 'services/child/lib/work.go');
    assert.equal(occurrence?.proof.packageBinding?.importPath, 'example.com/child/lib');
});

test('Go qualification isolates separate module-root package main namespaces', async () => {
    const aMain = `package main

func main() {
    Shared()
}
`;
    const aHelper = `package main

func Shared() {}
`;
    const bMain = `package main

func main() {
    Shared()
}
`;
    const bHelper = `package main

func Shared() {}
`;
    const sources = [
        { path: 'a/main.go', source: aMain },
        { path: 'a/helper.go', source: aHelper },
        { path: 'b/main.go', source: bMain },
        { path: 'b/helper.go', source: bHelper },
    ];
    const symbols = [
        functionSymbol({ file: 'a/main.go', source: aMain, name: 'main' }),
        functionSymbol({ file: 'a/helper.go', source: aHelper, name: 'Shared' }),
        functionSymbol({ file: 'b/main.go', source: bMain, name: 'main' }),
        functionSymbol({ file: 'b/helper.go', source: bHelper, name: 'Shared' }),
    ];
    const auxiliaries: GoAuxiliary[] = [
        { path: 'a/go.mod', role: 'manifest', source: 'module example.com/a\n\ngo 1.22\n' },
        { path: 'b/go.mod', role: 'manifest', source: 'module example.com/b\n\ngo 1.22\n' },
    ];

    const { records } = await qualifyGo(sources, symbols, auxiliaries);
    const calls = callRecords(records);
    assert.equal(calls.length, 2);
    assert.ok(calls.some((record) => record.sourceKey === 'a/main.go#main' && record.targetKey === 'a/helper.go#Shared'));
    assert.ok(calls.some((record) => record.sourceKey === 'b/main.go#main' && record.targetKey === 'b/helper.go#Shared'));
    assert.equal(calls.some((record) => record.sourceKey.startsWith('a/') && record.targetKey?.startsWith('b/') === true), false);
    assert.equal(calls.some((record) => record.sourceKey.startsWith('b/') && record.targetKey?.startsWith('a/') === true), false);
});

test('Go qualification preserves non-direct native evidence but admits zero Tier-3 CALLS', async () => {
    const source = `package main

type Base struct{}
func (Base) Embedded() {}

type Child struct{ Base }

type Service struct{}
func (Service) Method() {}

type I interface { Interface() }
type Impl struct{}
func (Impl) Interface() {}

func Callback() {}

func Run(i I) {
    var service Service
    service.Method()
    var child Child
    child.Embedded()
    i.Interface()
    callback := Callback
    callback()
}
`;
    const sources = [{ path: 'main.go', source }];
    const symbols = [
        functionSymbol({ file: 'main.go', source, name: 'Embedded', marker: 'func (Base) Embedded(', qualifiedName: 'Base.Embedded', kind: 'method', parentQualifiedNamePath: ['Base'] }),
        functionSymbol({ file: 'main.go', source, name: 'Method', marker: 'func (Service) Method(', qualifiedName: 'Service.Method', kind: 'method', parentQualifiedNamePath: ['Service'] }),
        functionSymbol({ file: 'main.go', source, name: 'Interface', marker: 'func (Impl) Interface(', qualifiedName: 'Impl.Interface', kind: 'method', parentQualifiedNamePath: ['Impl'] }),
        functionSymbol({ file: 'main.go', source, name: 'Callback' }),
        functionSymbol({ file: 'main.go', source, name: 'Run' }),
    ];

    const { evidence, records } = await qualifyGo(sources, symbols);
    const strategies = new Set((evidence.occurrencesByFile.get('main.go') ?? []).map((occurrence) => occurrence.proof.strategy));
    assert.equal(strategies.has('type_dispatch'), true);
    assert.equal(strategies.has('unknown'), true, 'callable alias/callback evidence must stay unknown at the semantic boundary');
    assert.equal(callRecords(records).length, 0);
});

test('Go qualification fails closed for unresolved and duplicate callable targets', async () => {
    const targetA = `package app

func Target() {}
`;
    const targetB = `package app

func Target() {}
`;
    const caller = `package app

func Run() {
    Target()
    Missing()
}
`;
    const sources = [
        { path: 'a.go', source: targetA },
        { path: 'b.go', source: targetB },
        { path: 'caller.go', source: caller },
    ];
    const symbols = [
        functionSymbol({ file: 'a.go', source: targetA, name: 'Target' }),
        functionSymbol({ file: 'b.go', source: targetB, name: 'Target' }),
        functionSymbol({ file: 'caller.go', source: caller, name: 'Run' }),
    ];

    const { evidence, records } = await qualifyGo(
        sources,
        symbols,
        [{ path: 'go.mod', role: 'manifest', source: 'module example.com/app\n\ngo 1.22\n' }],
    );

    assert.equal(callRecords(records).length, 0);
    const occurrences = evidence.occurrencesByFile.get('caller.go') ?? [];
    const targetStart = caller.indexOf('Target()');
    const ambiguous = occurrences.find((occurrence) => occurrence.callSpan.startByte === targetStart);
    assert.equal(ambiguous?.decision, 'ambiguous');
    assert.equal(ambiguous?.targetProvenance, undefined);
    const missingStart = caller.indexOf('Missing()');
    assert.equal(occurrences.some((occurrence) => occurrence.callSpan.startByte === missingStart && occurrence.decision === 'resolved'), false);
});

test('Go qualification excludes build-tagged, platform, architecture, and cgo files as authoritative sources and targets', async () => {
    const caller = `package app

func Run() {
    Tagged()
    Legacy()
    LinuxOnly()
    Amd64Only()
    ComboOnly()
    CgoOnly()
}
`;
    const stable = `package app

func Stable() {}
`;
    const tagged = `//go:build special

package app

func Tagged() {}
func TaggedCaller() { Stable() }
`;
    const legacy = `// +build special

package app

func Legacy() {}
func LegacyCaller() { Stable() }
`;
    const linux = `package app

func LinuxOnly() {}
func LinuxCaller() { Stable() }
`;
    const amd64 = `package app

func Amd64Only() {}
func Amd64Caller() { Stable() }
`;
    const combo = `package app

func ComboOnly() {}
func ComboCaller() { Stable() }
`;
    const cgo = `package app

import "C"

func CgoOnly() {}
func CgoCaller() { Stable() }
`;
    const platformTest = `package app

func TestLinuxOnly() { Stable() }
`;
    const sources = [
        { path: 'caller.go', source: caller },
        { path: 'stable.go', source: stable },
        { path: 'tagged.go', source: tagged },
        { path: 'legacy.go', source: legacy },
        { path: 'platform_linux.go', source: linux },
        { path: 'arch_amd64.go', source: amd64 },
        { path: 'combo_linux_amd64.go', source: combo },
        { path: 'cgo.go', source: cgo },
        { path: 'platform_linux_test.go', source: platformTest },
    ];
    const symbols = [
        functionSymbol({ file: 'caller.go', source: caller, name: 'Run' }),
        functionSymbol({ file: 'stable.go', source: stable, name: 'Stable' }),
        functionSymbol({ file: 'tagged.go', source: tagged, name: 'Tagged' }),
        functionSymbol({ file: 'tagged.go', source: tagged, name: 'TaggedCaller' }),
        functionSymbol({ file: 'legacy.go', source: legacy, name: 'Legacy' }),
        functionSymbol({ file: 'legacy.go', source: legacy, name: 'LegacyCaller' }),
        functionSymbol({ file: 'platform_linux.go', source: linux, name: 'LinuxOnly' }),
        functionSymbol({ file: 'platform_linux.go', source: linux, name: 'LinuxCaller' }),
        functionSymbol({ file: 'arch_amd64.go', source: amd64, name: 'Amd64Only' }),
        functionSymbol({ file: 'arch_amd64.go', source: amd64, name: 'Amd64Caller' }),
        functionSymbol({ file: 'combo_linux_amd64.go', source: combo, name: 'ComboOnly' }),
        functionSymbol({ file: 'combo_linux_amd64.go', source: combo, name: 'ComboCaller' }),
        functionSymbol({ file: 'cgo.go', source: cgo, name: 'CgoOnly' }),
        functionSymbol({ file: 'cgo.go', source: cgo, name: 'CgoCaller' }),
        functionSymbol({ file: 'platform_linux_test.go', source: platformTest, name: 'TestLinuxOnly' }),
    ];

    const { evidence, records } = await qualifyGo(
        sources,
        symbols,
        [{ path: 'go.mod', role: 'manifest', source: 'module example.com/app\n\ngo 1.22\n' }],
    );

    assert.equal(callRecords(records).length, 0);
    for (const constrainedPath of ['tagged.go', 'legacy.go', 'platform_linux.go', 'arch_amd64.go', 'combo_linux_amd64.go', 'cgo.go', 'platform_linux_test.go']) {
        assert.equal(evidence.occurrencesByFile.get(constrainedPath)?.length ?? 0, 0, `${constrainedPath} must not emit authoritative call evidence`);
    }
});

test('Go qualification derives TESTS from same-package and explicitly imported external test calls', async () => {
    const prod = `package foo

func Prod() {}
`;
    const samePackageTest = `package foo

func TestSamePackage() { Prod() }
`;
    const externalTest = `package foo_test

import foo "example.com/foo"

func TestExternal() { foo.Prod() }
`;
    const sources = [
        { path: 'prod.go', source: prod },
        { path: 'prod_test.go', source: samePackageTest },
        { path: 'external_test.go', source: externalTest },
    ];
    const symbols = [
        functionSymbol({ file: 'prod.go', source: prod, name: 'Prod' }),
        functionSymbol({ file: 'prod_test.go', source: samePackageTest, name: 'TestSamePackage' }),
        functionSymbol({ file: 'external_test.go', source: externalTest, name: 'TestExternal' }),
    ];

    const { records } = await qualifyGo(
        sources,
        symbols,
        [{ path: 'go.mod', role: 'manifest', source: 'module example.com/foo\n\ngo 1.22\n' }],
    );

    const calls = callRecords(records);
    const tests = records.filter((record) => record.type === 'TESTS');
    assert.equal(calls.length, 2);
    assert.equal(tests.length, 2);
    for (const sourceKey of ['prod_test.go#TestSamePackage', 'external_test.go#TestExternal']) {
        assert.ok(calls.some((record) => record.sourceKey === sourceKey && record.targetKey === 'prod.go#Prod'));
        assert.ok(tests.some((record) => record.sourceKey === sourceKey && record.targetKey === 'prod.go#Prod'));
    }
});

test('Go qualification keeps external test package locals isolated from production package resolution', async () => {
    const caller = `package foo

func Run() {
    Prod()
}
`;
    const prod = `package foo

func Prod() {}
`;
    const externalTest = `package foo_test

func Prod() {}
func TestCall() { Prod() }
`;
    const sources = [
        { path: 'run.go', source: caller },
        { path: 'prod.go', source: prod },
        { path: 'prod_test.go', source: externalTest },
    ];
    const symbols = [
        functionSymbol({ file: 'run.go', source: caller, name: 'Run' }),
        functionSymbol({ file: 'prod.go', source: prod, name: 'Prod' }),
        functionSymbol({ file: 'prod_test.go', source: externalTest, name: 'Prod' }),
        functionSymbol({ file: 'prod_test.go', source: externalTest, name: 'TestCall' }),
    ];

    const { evidence, records } = await qualifyGo(
        sources,
        symbols,
        [{ path: 'go.mod', role: 'manifest', source: 'module example.com/foo\n\ngo 1.22\n' }],
    );

    const calls = callRecords(records);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceKey, 'run.go#Run');
    assert.equal(calls[0].targetKey, 'prod.go#Prod');
    const testOccurrences = evidence.occurrencesByFile.get('prod_test.go') ?? [];
    assert.equal(testOccurrences.some((occurrence) => occurrence.decision === 'resolved'), false);
    assert.equal(records.some((record) => record.type === 'TESTS'), false);
});

test('Go qualification does not let a source outside every module borrow an unrelated module package', async () => {
    const moduleTarget = `package shared

func Target() {}
`;
    const outsideCaller = `package shared

func Run() {
    Target()
}
`;
    const sources = [
        { path: 'module/target.go', source: moduleTarget },
        { path: 'outside/main.go', source: outsideCaller },
    ];
    const symbols = [
        functionSymbol({ file: 'module/target.go', source: moduleTarget, name: 'Target' }),
        functionSymbol({ file: 'outside/main.go', source: outsideCaller, name: 'Run' }),
    ];

    const { evidence, records } = await qualifyGo(
        sources,
        symbols,
        [{ path: 'module/go.mod', role: 'manifest', source: 'module example.com/module\n\ngo 1.22\n' }],
    );

    assert.equal(callRecords(records).length, 0);
    const outsideOccurrences = evidence.occurrencesByFile.get('outside/main.go') ?? [];
    assert.equal(outsideOccurrences.some((occurrence) => occurrence.decision === 'resolved'), false);
});

test('Go qualification rejects malformed and conflicting module metadata instead of falling back', async () => {
    const source = [{ path: 'main.go', source: 'package main\n\nfunc main() {}\n' }];

    await assert.rejects(
        () => analyzeGo(source, [{ path: 'go.mod', role: 'manifest', source: 'go 1.22\n' }]),
        /Malformed or conflicting Go module metadata/,
    );

    await assert.rejects(
        () => analyzeGo(source, [
            { path: 'go.mod', role: 'manifest', source: 'module example.com/one\n' },
            { path: 'go.mod', role: 'manifest', source: 'module example.com/two\n' },
        ]),
        /Malformed or conflicting Go module metadata/,
    );
});

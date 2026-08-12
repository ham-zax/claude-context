import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    buildSymbolRegistry,
    buildSymbolRecordsForFile,
} from '../symbols';
import type { SymbolRecord, SymbolRegistryManifest } from '../symbols';
import { createLanguageAnalysisService } from '../language-analysis';
import { getLanguageIdFromFilename } from '../language';
import {
    resolvePythonRelationships,
    type PythonResolutionAnalysisInput,
} from './python-resolution';

async function analyzeFiles(
    sources: Map<string, string> | Record<string, string>,
) {
    const analyzer = createLanguageAnalysisService();
    const entries = sources instanceof Map ? [...sources.entries()] : Object.entries(sources);
    return new Map(await Promise.all(entries.map(async ([relativePath, content]) => [
        relativePath,
        await analyzer.analyze({
            content,
            language: getLanguageIdFromFilename(relativePath, 'text'),
            relativePath,
        }),
    ] as const)));
}

async function buildAnalyzedPythonRegistry(
    sources: Map<string, string> | Record<string, string>,
) {
    const entries = (sources instanceof Map ? [...sources.entries()] : Object.entries(sources))
        .sort(([left], [right]) => left.localeCompare(right));
    const analysisByFile = await analyzeFiles(new Map(entries));
    const symbols: SymbolRecord[] = [];
    const files: SymbolRegistryManifest['files'] = [];

    for (const [relativePath, content] of entries) {
        const analysis = analysisByFile.get(relativePath);
        assert.ok(analysis);
        const fileHash = `hash-${relativePath}`;
        const fileSymbols = buildSymbolRecordsForFile({
            relativePath,
            language: 'python',
            content,
            fileHash,
            extractorVersion: 'test-extractor-v1',
            chunks: [],
            extractedSymbols: analysis.symbols,
        });
        symbols.push(...fileSymbols);
        files.push({
            path: relativePath,
            hash: fileHash,
            language: 'python',
            symbolCount: fileSymbols.length,
            definitionStatus: analysis.structuralStatus === 'complete'
                ? 'definitions_present'
                : 'structural_unavailable',
        });
    }

    return {
        analysisByFile: analysisByFile as Map<string, PythonResolutionAnalysisInput>,
        registry: buildSymbolRegistry({
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
        }),
    };
}

const ledgerSource = [
    'class SignalLedger:',
    '    def record(self): pass',
    '',
    'class OtherLedger:',
    '    def record(self): pass',
].join('\n');
const servicesSource = [
    'class Services:',
    '    pass',
    '',
    'def consume(services: Services):',
    '    services.signal_ledger.record()',
].join('\n');
const engineSource = [
    'from .ledger import OtherLedger, SignalLedger',
    'from .services import Services',
    '',
    'class Engine:',
    '    def __init__(self):',
    '        self.signal_ledger = SignalLedger()',
    '',
    'def build_services(engine: Engine):',
    '    return Services(signal_ledger=engine.signal_ledger)',
    '',
    'def run():',
    '    engine = Engine()',
    '    build_services(engine=engine)',
].join('\n');

test('resolvePythonRelationships resolves direct imported calls with exact binding proof', async () => {
    const { registry, analysisByFile } = await buildAnalyzedPythonRegistry({
        'src/util.py': 'def helper(): return 1\n',
        'src/app.py': 'from .util import helper\n\ndef run():\n    return helper()\n',
    });
    const result = resolvePythonRelationships({ registry, analysisByFile });
    const symbolsById = registry.symbolsByInstanceId;

    assert.deepEqual(
        result.records.map((record) => [
            record.file,
            record.type,
            symbolsById.get(record.sourceInstanceId || '')?.qualifiedName,
            symbolsById.get(record.targetInstanceId || '')?.qualifiedName,
            record.confidence,
            record.resolutionAuthority,
        ]),
        [
            ['src/app.py', 'CALLS', 'run', 'helper', 'low', 'direct_binding'],
        ],
    );

    const claims = result.claimsByFile.get('src/app.py') ?? [];
    assert.equal(claims.length, 1);
    const [claim] = claims;
    assert.equal(claim.decision, 'resolved');
    assert.equal(claim.relationshipType, 'CALLS');
    assert.equal(claim.resolutionAuthority, 'direct_binding');
    assert.equal(claim.flowHops, 0);
    assert.deepEqual(claim.proofSteps.map((step) => step.kind), [
        'call_site',
        'containing_caller',
        'relative_import',
    ]);
    assert.deepEqual(claim.dependencyKeys, []);
});

test('resolvePythonRelationships resolves typed member calls with parameter proof', async () => {
    const { registry, analysisByFile } = await buildAnalyzedPythonRegistry({
        'src/ledger.py': 'class SignalLedger:\n    def record(self): pass\n',
        'src/caller.py': 'from .ledger import SignalLedger\n\ndef typed(ledger: SignalLedger):\n    ledger.record()\n',
    });
    const result = resolvePythonRelationships({ registry, analysisByFile });
    const symbolsById = registry.symbolsByInstanceId;

    assert.deepEqual(
        result.records.map((record) => [
            record.file,
            record.type,
            symbolsById.get(record.sourceInstanceId || '')?.qualifiedName,
            symbolsById.get(record.targetInstanceId || '')?.qualifiedName,
            record.confidence,
            record.resolutionAuthority,
        ]),
        [
            ['src/caller.py', 'CALLS', 'typed', 'SignalLedger.record', 'low', 'direct_binding'],
        ],
    );

    const claims = result.claimsByFile.get('src/caller.py') ?? [];
    assert.equal(claims.length, 1);
    const [claim] = claims;
    assert.equal(claim.decision, 'resolved');
    assert.equal(claim.relationshipType, 'CALLS');
    assert.equal(claim.resolutionAuthority, 'direct_binding');
    assert.deepEqual(claim.proofSteps.map((step) => step.kind), [
        'call_site',
        'containing_caller',
        'parameter_annotation',
    ]);
    assert.deepEqual(claim.dependencyKeys, []);
});

test('resolvePythonRelationships resolves flow-origin member calls with ordered flow_hop proof', async () => {
    const { registry, analysisByFile } = await buildAnalyzedPythonRegistry({
        'src/ledger.py': ledgerSource,
        'src/services.py': servicesSource,
        'src/engine.py': engineSource,
    });
    const result = resolvePythonRelationships({ registry, analysisByFile });
    const symbolsById = registry.symbolsByInstanceId;

    assert.deepEqual(
        result.records
            .filter((record) => record.file === 'src/services.py')
            .map((record) => [
                symbolsById.get(record.sourceInstanceId || '')?.qualifiedName,
                symbolsById.get(record.targetInstanceId || '')?.qualifiedName,
                record.type,
                record.confidence,
                record.resolutionAuthority,
            ]),
        [
            ['consume', 'SignalLedger.record', 'CALLS', 'low', 'origin_flow'],
        ],
    );

    const claims = result.claimsByFile.get('src/services.py') ?? [];
    assert.equal(claims.length, 1);
    const [claim] = claims;
    assert.equal(claim.decision, 'resolved');
    assert.equal(claim.relationshipType, 'CALLS');
    assert.equal(claim.resolutionAuthority, 'origin_flow');
    assert.equal(claim.flowHops, 2);
    assert.deepEqual(claim.proofSteps.map((step) => step.kind), [
        'call_site',
        'containing_caller',
        'parameter_annotation',
        'allocation_origin',
        'constructor_origin',
        'flow_hop',
        'field_origin',
        'flow_hop',
        'allocation_origin',
    ]);
    assert.deepEqual(
        claim.proofSteps.filter((step) => step.kind === 'flow_hop').map((step) => step.hop),
        [1, 2],
    );
    assert.equal(claim.dependencyKeys.length, 2);
    assert.ok(claim.dependencyKeys.every((key) => key.startsWith('src/engine.py:')));

    const engineClaims = result.claimsByFile.get('src/engine.py') ?? [];
    assert.equal(engineClaims.length, 4);
    assert.ok(engineClaims.every((engineClaim) => (
        engineClaim.decision === 'resolved' && engineClaim.resolutionAuthority === 'direct_binding'
    )));
});

test('resolvePythonRelationships reports ambiguous member calls as REFERENCES claims without records', async () => {
    const { registry, analysisByFile } = await buildAnalyzedPythonRegistry({
        'src/caller.py': [
            'class Alpha:',
            '    def run(self): pass',
            '',
            'class Beta:',
            '    def run(self): pass',
            '',
            'def invoke(service):',
            '    service.run()',
        ].join('\n'),
    });
    const result = resolvePythonRelationships({ registry, analysisByFile });

    assert.deepEqual(result.records, []);

    const claims = result.claimsByFile.get('src/caller.py') ?? [];
    assert.equal(claims.length, 1);
    const [claim] = claims;
    assert.equal(claim.decision, 'ambiguous');
    assert.equal(claim.relationshipType, 'REFERENCES');
    assert.equal(claim.resolutionAuthority, 'ambiguous');
    assert.equal(claim.flowHops, 0);
    assert.deepEqual(claim.proofSteps.map((step) => step.kind), [
        'call_site',
        'containing_caller',
        'ambiguity',
    ]);
    assert.equal(claim.dependencyKeys.length, 1);
    assert.ok(claim.dependencyKeys[0].startsWith('src/caller.py:'));
    assert.ok(claim.dependencyKeys[0].includes('service:run'));
});

test('resolvePythonRelationships reports unresolved direct calls as REFERENCES claims without records', async () => {
    const { registry, analysisByFile } = await buildAnalyzedPythonRegistry({
        'src/caller.py': 'def run():\n    return missing_helper()\n',
    });
    const result = resolvePythonRelationships({ registry, analysisByFile });

    assert.deepEqual(result.records, []);

    const claims = result.claimsByFile.get('src/caller.py') ?? [];
    assert.equal(claims.length, 1);
    const [claim] = claims;
    assert.equal(claim.decision, 'unresolved');
    assert.equal(claim.relationshipType, 'REFERENCES');
    assert.equal(claim.resolutionAuthority, 'unresolved');
    assert.equal(claim.flowHops, 0);
    assert.deepEqual(claim.proofSteps.map((step) => step.kind), [
        'call_site',
        'containing_caller',
        'unresolved_dependency',
    ]);
    assert.equal(claim.dependencyKeys.length, 1);
    assert.ok(claim.dependencyKeys[0].includes('missing_helper'));
});

test('resolvePythonRelationships is side-effect free and deterministically ordered', async () => {
    const { registry, analysisByFile } = await buildAnalyzedPythonRegistry({
        'src/ledger.py': ledgerSource,
        'src/services.py': servicesSource,
        'src/engine.py': engineSource,
        'src/unresolved.py': 'def run():\n    return missing_helper()\n',
    });
    const snapshotAnalysis = () => JSON.stringify(
        [...analysisByFile.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
    const snapshotRegistry = () => JSON.stringify({
        manifest: registry.manifest,
        symbols: [...registry.symbols].sort((left, right) => (
            left.symbolKey.localeCompare(right.symbolKey)
        )),
        warnings: registry.warnings,
    });
    const beforeAnalysis = snapshotAnalysis();
    const beforeRegistry = snapshotRegistry();

    const first = resolvePythonRelationships({ registry, analysisByFile });

    // The engine publishes nothing: inputs are not mutated and no claims are
    // attached to analysis evidence (the builder facade performs attachment
    // during emit).
    assert.equal(snapshotAnalysis(), beforeAnalysis);
    assert.equal(snapshotRegistry(), beforeRegistry);
    for (const evidence of analysisByFile.values()) {
        assert.equal((evidence as { resolutionClaims?: unknown }).resolutionClaims, undefined);
    }

    // A run on fresh but identical inputs yields identical records and
    // claims, including claim ordering and proof-step order.
    const secondInput = await buildAnalyzedPythonRegistry({
        'src/ledger.py': ledgerSource,
        'src/services.py': servicesSource,
        'src/engine.py': engineSource,
        'src/unresolved.py': 'def run():\n    return missing_helper()\n',
    });
    const second = resolvePythonRelationships({
        registry: secondInput.registry,
        analysisByFile: secondInput.analysisByFile,
    });
    assert.deepEqual(second.records, first.records);
    assert.deepEqual(second.claimsByFile, first.claimsByFile);
    assert.ok(first.claimsByFile.size > 0);
});

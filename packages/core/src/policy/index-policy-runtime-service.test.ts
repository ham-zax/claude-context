import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    IndexPolicyAuthorityError,
    IndexFormatRequiresReindexError,
    IndexPolicyRuntimeService,
    UnsupportedIndexAuthorityError,
    computeIndexPolicyHash,
    type IndexPolicyRuntimeBinding,
    type ResolvedIndexPolicy,
} from './index-policy-runtime-service';
import { IgnoreRuleService } from '../core/ignore-rule-service';
import {
    buildCanonicalIndexPolicyDocument,
    type CanonicalIndexPolicyDocument,
} from '../core/persisted-index-authority';
import { normalizeSupportedExtensions } from '../config/index-policy';
import {
    getSupportedExtensionsForIndexProfile,
    type IndexProfile,
} from '../config/defaults';

function createRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'satori-policy-runtime-'));
}

function resolveFilesystemObservationToken(targetPath: string): string | null {
    try {
        const stat = fs.statSync(targetPath, { bigint: true });
        return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
            .map((value) => value.toString())
            .join(':');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
}

interface Harness {
    root: string;
    policyPath: string;
    service: IndexPolicyRuntimeService;
    ignoreRuleService: IgnoreRuleService;
    activated: Array<{ policy: ResolvedIndexPolicy; binding: IndexPolicyRuntimeBinding }>;
    cleared: string[];
}

function createHarness(options: {
    overlays?: string[];
    basePatterns?: string[];
} = {}): Harness {
    const root = createRoot();
    const policyPath = path.join(root, 'index-policy.json');
    const activated: Harness['activated'] = [];
    const cleared: Harness['cleared'] = [];
    const ignoreRuleService = new IgnoreRuleService({
        basePatterns: options.basePatterns ?? ['node_modules/**'],
        canonicalizeCodebasePath: (codebasePath) => path.resolve(codebasePath),
        resolveCollectionName: (codebasePath) => path.resolve(codebasePath),
        ensureRuntimePolicyLoaded: () => undefined,
    });
    const service = new IndexPolicyRuntimeService({
        configuredExtensionOverlays: options.overlays ?? [],
        getIgnoreRuleService: () => ignoreRuleService,
        canonicalizeCodebasePath: (codebasePath) => path.resolve(codebasePath),
        resolvePolicyPath: () => policyPath,
        resolveFilesystemObservationToken,
        onActivateResolvedIndexPolicy: (policy, binding) => {
            activated.push({ policy, binding });
        },
        onClearPublishedIndexPolicy: (canonicalRoot) => {
            cleared.push(canonicalRoot);
        },
    });
    return { root, policyPath, service, ignoreRuleService, activated, cleared };
}

function buildPolicyDocument(
    canonicalRoot: string,
    options: {
        profile?: IndexProfile;
        customExtensions?: string[];
        customIgnorePatterns?: string[];
        fileBasedIgnorePatterns?: string[];
        supportedExtensions?: string[];
        effectiveIgnorePatterns?: string[];
        collectionName?: string;
        overlays?: string[];
        basePatterns?: string[];
        policyHash?: string;
    } = {},
): CanonicalIndexPolicyDocument {
    const profile = options.profile ?? 'default';
    const customExtensions = options.customExtensions ?? ['.custom'];
    const customIgnorePatterns = options.customIgnorePatterns ?? ['custom/**'];
    const fileBasedIgnorePatterns = options.fileBasedIgnorePatterns ?? ['file-based/**'];
    const overlays = options.overlays ?? [];
    const basePatterns = options.basePatterns ?? ['node_modules/**'];
    const supportedExtensions = options.supportedExtensions ?? normalizeSupportedExtensions([
        ...getSupportedExtensionsForIndexProfile(profile),
        ...overlays,
        ...customExtensions,
    ]);
    const effectiveIgnorePatterns = options.effectiveIgnorePatterns ?? [
        ...basePatterns,
        ...customIgnorePatterns,
        ...fileBasedIgnorePatterns,
    ];
    const policyHash = options.policyHash
        ?? computeIndexPolicyHash(profile, supportedExtensions, effectiveIgnorePatterns);
    return buildCanonicalIndexPolicyDocument({
        canonicalRoot,
        schemaVersion: 'satori_index_policy_v5',
        customExtensions,
        customIgnorePatterns,
        fileBasedIgnorePatterns,
        profile,
        supportedExtensions,
        effectiveIgnorePatterns,
        policyHash,
        collectionName: options.collectionName ?? 'fixture-collection',
        navigation: {
            status: 'sealed',
            generationId: 'gen-1',
            sealHash: 'a'.repeat(64),
        },
        publication: {
            activationId: 'activation-1',
            sourceCheckpoint: {
                collectionName: options.collectionName ?? 'fixture-collection',
                markerRunId: 'marker-1',
                indexPolicyHash: policyHash,
                merkleRoot: 'b'.repeat(64),
                documentDigest: 'c'.repeat(64),
            },
            graph: { kind: 'relationship_manifest_v2', manifestHash: 'd'.repeat(64) },
            receipt: { ownerId: 'test', generation: 1, operationId: 'op-1' },
        },
        controlSignature: 'v1:default',
    });
}

test('policy hash resolution is deterministic and scoped to effective inputs', () => {
    const first = computeIndexPolicyHash('default', ['.ts', '.tsx'], ['node_modules/**']);
    const repeated = computeIndexPolicyHash('default', ['.ts', '.tsx'], ['node_modules/**']);
    assert.equal(first, repeated);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(
        first,
        computeIndexPolicyHash('default', ['.ts'], ['node_modules/**']),
    );
    assert.notEqual(
        first,
        computeIndexPolicyHash('default', ['.ts', '.tsx'], ['dist/**']),
    );
    assert.notEqual(
        first,
        computeIndexPolicyHash('all-text', ['.ts', '.tsx'], ['node_modules/**']),
    );
});

test('buildSupportedExtensions composes profile defaults, overlays, and runtime custom extensions', () => {
    const harness = createHarness({ overlays: ['.overlay'] });
    const { root, service } = harness;
    try {
        const defaultExtensions = service.buildSupportedExtensions('default');
        assert.deepEqual(defaultExtensions, normalizeSupportedExtensions([
            ...getSupportedExtensionsForIndexProfile('default'),
            '.overlay',
        ]));
        assert.deepEqual(defaultExtensions, service.buildSupportedExtensions('default', root));

        const document = buildPolicyDocument(root, { customExtensions: ['.custom'] });
        fs.writeFileSync(harness.policyPath, JSON.stringify(document));
        service.loadCustomIndexPolicy(root);

        const composed = service.buildSupportedExtensions('default', root);
        assert.deepEqual(composed, normalizeSupportedExtensions([
            ...getSupportedExtensionsForIndexProfile('default'),
            '.overlay',
            '.custom',
        ]));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('loadCustomIndexPolicy activates runtime composition and caches by file token', () => {
    const harness = createHarness({ overlays: ['.overlay'] });
    const { root, service, ignoreRuleService, activated, cleared } = harness;
    try {
        const document = buildPolicyDocument(root, { overlays: ['.overlay'] });
        fs.writeFileSync(harness.policyPath, JSON.stringify(document));
        service.loadCustomIndexPolicy(root);

        assert.equal(activated.length, 1);
        const { policy, binding } = activated[0];
        assert.equal(policy.canonicalRoot, root);
        assert.equal(policy.profile, 'default');
        assert.deepEqual(policy.customExtensions, ['.custom']);
        assert.deepEqual(policy.customIgnorePatterns, ['custom/**']);
        assert.deepEqual(policy.fileBasedIgnorePatterns, ['file-based/**']);
        assert.equal(policy.policyHash, document.policyHash);
        assert.equal(
            policy.policyHash,
            computeIndexPolicyHash(policy.profile, policy.supportedExtensions, policy.effectiveIgnorePatterns),
        );
        assert.equal(binding.collectionName, 'fixture-collection');
        assert.deepEqual(binding.navigation, {
            status: 'sealed',
            generationId: 'gen-1',
            sealHash: 'a'.repeat(64),
        });
        assert.notEqual(binding.publication, undefined);

        assert.deepEqual(ignoreRuleService.getRuntimeCustomPatterns(root), ['custom/**']);
        assert.deepEqual(ignoreRuleService.getActivePatterns(root), [
            'node_modules/**',
            'custom/**',
            'file-based/**',
        ]);
        assert.equal(service.getIndexProfile(root), 'default');
        assert.equal(service.getPolicyDocumentDigest(root), document.documentDigest);
        assert.equal(service.hasPolicyFileToken(root), true);
        assert.equal(
            service.getPolicyFileToken(root),
            resolveFilesystemObservationToken(harness.policyPath),
        );
        assert.equal(service.isCustomPolicyLoaded(root), true);
        assert.equal(service.getPolicyRuntimeCompatibility(root), true);
        assert.equal(cleared.length, 0);

        // Same file token: loading again must not re-activate.
        service.loadCustomIndexPolicy(root);
        assert.equal(activated.length, 1);

        // Changed document: reload activates the new runtime composition.
        const updated = buildPolicyDocument(root, {
            overlays: ['.overlay'],
            customExtensions: ['.updated'],
            customIgnorePatterns: ['updated/**'],
            fileBasedIgnorePatterns: ['updated-file/**'],
        });
        fs.writeFileSync(harness.policyPath, JSON.stringify(updated));
        service.loadCustomIndexPolicy(root);
        assert.equal(activated.length, 2);
        assert.deepEqual(activated[1].policy.customExtensions, ['.updated']);
        assert.deepEqual(ignoreRuleService.getRuntimeCustomPatterns(root), ['updated/**']);
        assert.equal(service.getPolicyDocumentDigest(root), updated.documentDigest);

        // Removed document: runtime state is cleared and Context is notified.
        fs.rmSync(harness.policyPath);
        service.loadCustomIndexPolicy(root);
        assert.deepEqual(cleared, [root]);
        assert.equal(activated.length, 2);
        assert.equal(service.hasPolicyFileToken(root), true);
        assert.equal(service.getPolicyFileToken(root), null);
        assert.equal(service.isCustomPolicyLoaded(root), false);
        assert.equal(service.getPolicyRuntimeCompatibility(root), undefined);
        assert.equal(service.getPolicyDocumentDigest(root), undefined);
        assert.equal(ignoreRuleService.hasRuntimeCustomPatterns(root), false);
        assert.deepEqual(
            service.buildSupportedExtensions('default', root),
            normalizeSupportedExtensions([
                ...getSupportedExtensionsForIndexProfile('default'),
                '.overlay',
            ]),
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('loadCustomIndexPolicy rejects malformed documents with wrapped authority errors', () => {
    const harness = createHarness();
    const { root, service } = harness;
    try {
        fs.writeFileSync(harness.policyPath, 'not json', 'utf8');
        assert.throws(
            () => service.loadCustomIndexPolicy(root),
            (error: unknown) => (
                error instanceof IndexPolicyAuthorityError
                && error.message.includes('Malformed custom index policy')
            ),
        );

        // Self-consistent document whose policy hash does not match its inputs.
        fs.writeFileSync(
            harness.policyPath,
            JSON.stringify(buildPolicyDocument(root, { policyHash: 'a'.repeat(64) })),
        );
        assert.throws(
            () => service.loadCustomIndexPolicy(root),
            (error: unknown) => (
                error instanceof IndexPolicyAuthorityError
                && error.message.includes('does not match its effective inputs')
            ),
        );

        // v2 documents require reindex; future versions are unsupported.
        fs.writeFileSync(
            harness.policyPath,
            JSON.stringify({
                schemaVersion: 'satori_index_policy_v2',
                canonicalRoot: root,
                policyHash: '0'.repeat(64),
            }),
        );
        assert.throws(
            () => service.loadCustomIndexPolicy(root),
            (error: unknown) => error instanceof IndexFormatRequiresReindexError,
        );
        fs.writeFileSync(harness.policyPath, JSON.stringify({ schemaVersion: 'satori_index_policy_v6' }));
        assert.throws(
            () => service.loadCustomIndexPolicy(root),
            (error: unknown) => error instanceof UnsupportedIndexAuthorityError,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('v5 documents activate control signature and publication binding', () => {
    const harness = createHarness();
    const { root, service, activated } = harness;
    try {
        const base = buildPolicyDocument(root);
        const document = buildCanonicalIndexPolicyDocument({
            canonicalRoot: root,
            schemaVersion: 'satori_index_policy_v5',
            customExtensions: base.customExtensions,
            customIgnorePatterns: base.customIgnorePatterns,
            fileBasedIgnorePatterns: base.fileBasedIgnorePatterns,
            profile: base.profile,
            supportedExtensions: base.supportedExtensions,
            effectiveIgnorePatterns: base.effectiveIgnorePatterns,
            policyHash: base.policyHash,
            collectionName: 'fixture-collection',
            navigation: { status: 'sealed', generationId: 'generation-1', sealHash: 'a'.repeat(64) },
            publication: {
                activationId: 'activation-1',
                sourceCheckpoint: {
                    collectionName: 'fixture-collection',
                    markerRunId: 'run-1',
                    indexPolicyHash: base.policyHash,
                    merkleRoot: 'b'.repeat(64),
                    documentDigest: 'c'.repeat(64),
                },
                graph: {
                    kind: 'relationship_manifest_v2',
                    manifestHash: 'd'.repeat(64),
                },
                receipt: {
                    ownerId: 'owner-1',
                    generation: 1,
                    operationId: 'operation-1',
                },
            },
            controlSignature: 'v1:control-signature',
        });
        if (document.schemaVersion !== 'satori_index_policy_v5') {
            throw new Error('expected a v5 fixture document');
        }
        fs.writeFileSync(harness.policyPath, JSON.stringify(document));
        service.loadCustomIndexPolicy(root);

        assert.equal(activated.length, 1);
        assert.equal(activated[0].policy.controlSignature, 'v1:control-signature');
        assert.deepEqual(activated[0].binding.publication, document.publication);
        assert.deepEqual(
            activated[0].binding.navigation,
            { status: 'sealed', generationId: 'generation-1', sealHash: 'a'.repeat(64) },
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('resolveVerifiedIndexPolicyDocumentDigest resolves and rejects invalid documents', () => {
    const harness = createHarness();
    const { root, service } = harness;
    try {
        const document = buildPolicyDocument(root);
        fs.writeFileSync(harness.policyPath, JSON.stringify(document));
        assert.equal(
            service.resolveVerifiedIndexPolicyDocumentDigest(harness.policyPath),
            document.documentDigest,
        );

        // Tampered payload no longer matches its document digest.
        const tampered = { ...document, customExtensions: ['.tampered'] };
        fs.writeFileSync(harness.policyPath, JSON.stringify(tampered));
        assert.throws(
            () => service.resolveVerifiedIndexPolicyDocumentDigest(harness.policyPath),
            /Index policy document digest is invalid/,
        );

        fs.writeFileSync(
            harness.policyPath,
            JSON.stringify({
                schemaVersion: 'satori_index_policy_v2',
                canonicalRoot: root,
                policyHash: '0'.repeat(64),
            }),
        );
        assert.throws(
            () => service.resolveVerifiedIndexPolicyDocumentDigest(harness.policyPath),
            (error: unknown) => error instanceof IndexFormatRequiresReindexError,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('runtime compatibility evaluation follows profile, extensions, and ignore inputs', () => {
    const harness = createHarness({ overlays: ['.overlay'] });
    const { root, service, ignoreRuleService } = harness;
    try {
        const document = buildPolicyDocument(root, { overlays: ['.overlay'] });
        fs.writeFileSync(harness.policyPath, JSON.stringify(document));
        service.loadCustomIndexPolicy(root);
        const { policy } = harness.activated[0];
        assert.equal(service.getPolicyRuntimeCompatibility(root), true);
        assert.equal(service.isPolicyRuntimeCompatible(policy), true);

        // Runtime profile drift makes the published policy incompatible.
        service.setIndexProfileForCodebase(root, 'all-text');
        assert.equal(service.isPolicyRuntimeCompatible(policy), false);
        service.recomputePolicyRuntimeCompatibility(root, policy);
        assert.equal(service.getPolicyRuntimeCompatibility(root), false);

        // Restoring the runtime profile restores compatibility.
        service.setIndexProfileForCodebase(root, 'default');
        service.recomputePolicyRuntimeCompatibility(root, policy);
        assert.equal(service.getPolicyRuntimeCompatibility(root), true);

        // Base ignore drift makes the published policy incompatible.
        ignoreRuleService.setBasePatterns(['other/**']);
        assert.equal(service.isPolicyRuntimeCompatible(policy), false);
        service.recomputePolicyRuntimeCompatibility(root, policy);
        assert.equal(service.getPolicyRuntimeCompatibility(root), false);

        // Clearing the published policy clears the compatibility outcome.
        service.recomputePolicyRuntimeCompatibility(root, undefined);
        assert.equal(service.getPolicyRuntimeCompatibility(root), undefined);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('capture and restore preserve the full runtime policy state', () => {
    const harness = createHarness();
    const { root, service, ignoreRuleService } = harness;
    try {
        const document = buildPolicyDocument(root);
        fs.writeFileSync(harness.policyPath, JSON.stringify(document));
        service.loadCustomIndexPolicy(root);
        const snapshot = service.captureRuntimePolicyState(root);
        assert.deepEqual(snapshot.customExtensions, ['.custom']);
        assert.deepEqual(snapshot.customIgnorePatterns, ['custom/**']);
        assert.equal(snapshot.profile, 'default');
        assert.equal(snapshot.wasLoaded, true);
        assert.equal(snapshot.hadFileToken, true);
        assert.equal(snapshot.fileToken, resolveFilesystemObservationToken(harness.policyPath));
        assert.equal(snapshot.runtimeCompatible, true);
        assert.equal(snapshot.documentDigest, document.documentDigest);

        service.clearResolvedIndexPolicyRuntime(root);
        assert.equal(service.isCustomPolicyLoaded(root), false);
        assert.equal(service.getPolicyRuntimeCompatibility(root), undefined);
        assert.equal(ignoreRuleService.hasRuntimeCustomPatterns(root), false);

        service.restoreRuntimePolicyState(root, snapshot);
        assert.deepEqual(service.getRuntimeCustomExtensions(root), ['.custom']);
        assert.equal(service.getIndexProfile(root), 'default');
        assert.equal(service.isCustomPolicyLoaded(root), true);
        assert.equal(service.getPolicyRuntimeCompatibility(root), true);
        assert.equal(service.getPolicyDocumentDigest(root), document.documentDigest);
        assert.equal(service.hasPolicyFileToken(root), true);
        assert.equal(service.getPolicyFileToken(root), snapshot.fileToken);
        assert.deepEqual(ignoreRuleService.getRuntimeCustomPatterns(root), ['custom/**']);
        assert.deepEqual(ignoreRuleService.getActivePatterns(root), [
            'node_modules/**',
            'custom/**',
            'file-based/**',
        ]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

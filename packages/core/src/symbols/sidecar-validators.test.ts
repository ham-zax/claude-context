import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isRelationshipAnalysisEvidence,
    isRelationshipRecord,
    isResolutionClaim,
    isSymbolRecord,
    parseNavigationGenerationSeal,
} from './sidecar-validators';
import { isSymbolRecord as isSidecarSymbolRecord } from './sidecar';
import { isSymbolRecord as isSymbolsIndexSymbolRecord } from './index';
import { createSynthesizedFileSymbol } from './registry';

test('sidecar validator extraction preserves classifications and façade exports', () => {
    const symbol = createSynthesizedFileSymbol({
        relativePath: 'src/auth.ts',
        language: 'typescript',
        content: 'export const auth = true;\n',
        fileHash: 'hash-auth',
        extractorVersion: 'extractor-v1',
    });
    assert.equal(isSymbolRecord(symbol), true);
    assert.equal(isSidecarSymbolRecord(symbol), true);
    assert.equal(isSymbolsIndexSymbolRecord(symbol), true);
    assert.equal(isSymbolRecord({ ...symbol, file: '' }), false);

    assert.equal(isRelationshipRecord({
        sourceKey: symbol.symbolKey,
        targetPath: 'src/other.ts',
        type: 'REFERENCES',
        file: 'src/auth.ts',
        confidence: 'medium',
    }), true);
    assert.equal(isRelationshipRecord({
        sourceKey: symbol.symbolKey,
        targetPath: 'src/other.ts',
        type: 'UNKNOWN',
        file: 'src/auth.ts',
        confidence: 'medium',
    }), false);

    assert.equal(isRelationshipAnalysisEvidence({
        moduleBindings: [],
        callSites: [],
        receiverTypeBindings: [],
    }), true);
    assert.equal(isRelationshipAnalysisEvidence({
        moduleBindings: [],
        callSites: [],
        receiverTypeBindings: [],
        unexpected: true,
    }), false);
    assert.equal(isResolutionClaim({}), false);

    const seal = {
        schemaVersion: 'navigation_generation_seal_v1',
        generationId: 'generation-a',
        symbolRegistryManifestHash: `symmanifest_${'a'.repeat(32)}`,
        relationshipManifestHash: 'b'.repeat(64),
        artifactSetHash: 'c'.repeat(64),
        symbolQuality: {
            indexedFileCount: 0,
            languages: [],
        },
    };
    assert.ok(parseNavigationGenerationSeal(seal));
    assert.equal(parseNavigationGenerationSeal({ ...seal, artifactSetHash: 'invalid' }), null);
});

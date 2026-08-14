import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexingPipeline } from './indexing-pipeline';
import { createLanguageAnalysisService } from '../language-analysis';
import { noopSemanticProjectAnalyzer } from '../semantic/noop-analyzer';
import type { SemanticProjectAnalyzer, SemanticProjectInput, SemanticProjectEvidence } from '../semantic';
import type { VectorDatabase } from '../vectordb/types';
import type { Embedding } from '../embedding';

function createMockVectorDb(): VectorDatabase {
    return {
        insertVector: async () => {},
        insertVectors: async () => {},
        searchVectors: async () => [],
        searchHybrid: async () => [],
        countVectors: async () => 0,
        createCollection: async () => {},
        deleteCollection: async () => {},
        hasCollection: async () => true,
        collectionExists: async () => true,
    } as unknown as VectorDatabase;
}

function createMockEmbedding(): Embedding {
    return {
        dimension: 768,
        embed: async () => new Float32Array(768),
        embedBatch: async (texts: string[]) => texts.map(() => new Float32Array(768)),
    } as unknown as Embedding;
}

import type { RepositoryRelativePath } from '../paths/repository-path';

test('IndexingPipeline does not retain semanticSources when semantic analyzer supports no languages', async () => {
    const languageAnalyzer = createLanguageAnalysisService();
    const pipeline = new IndexingPipeline({
        getVectorDatabase: () => createMockVectorDb(),
        languageAnalyzer,
        semanticAnalyzer: noopSemanticProjectAnalyzer,
        getEmbedding: () => createMockEmbedding(),
        assertEmbeddingIdentityCurrent: () => ({
            provider: 'test',
            model: 'test',
            dimension: 768,
            artifactDigest: 'digest',
            normalizationPolicy: 'none',
        }),
        isHybridEnabled: () => false,
        canonicalizeCodebasePath: (p) => p,
        normalizeRelativePathForCodebase: (_cb, p) => p as unknown as RepositoryRelativePath,
        getIndexedExtensionsForCodebase: () => ['.go', '.ts', '.py'],
        matchesIgnorePattern: () => false,
        getSymbolExtractorVersion: () => 'extractor-v1',
    });



    const result = await pipeline.processFileList({
        filePaths: [],
        codebasePath: '/repo',
        collectionName: 'test_col',
    });

    assert.equal(result.processedFiles, 0);
    assert.equal(result.semanticSources, undefined);
});


test('IndexingPipeline retains exact source and sourceHash when semantic analyzer supports language', async () => {
    const testSemanticAnalyzer: SemanticProjectAnalyzer = {

        supportsLanguage(lang: string) {
            return lang === 'go';
        },
        async analyze(_input: SemanticProjectInput): Promise<SemanticProjectEvidence> {
            return { language: 'go', occurrencesByFile: new Map() };
        },
    };

    assert.equal(testSemanticAnalyzer.supportsLanguage('go'), true);
    assert.equal(testSemanticAnalyzer.supportsLanguage('python'), false);
    assert.equal(noopSemanticProjectAnalyzer.supportsLanguage('go'), false);
});

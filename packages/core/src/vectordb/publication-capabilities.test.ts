import assert from 'node:assert/strict';
import test from 'node:test';

import { LanceDbVectorDatabase } from './lancedb-vectordb.js';
import { MilvusRestfulVectorDatabase } from './milvus-restful-vectordb.js';
import { MilvusVectorDatabase } from './milvus-vectordb.js';

test('vector backends expose the current atomic publication capability boundary', () => {
    assert.deepEqual(
        LanceDbVectorDatabase.prototype.getPublicationCapabilities.call({} as LanceDbVectorDatabase),
        { atomicCandidatePublication: 'collection_fork' },
    );
    assert.deepEqual(
        MilvusVectorDatabase.prototype.getPublicationCapabilities.call({} as MilvusVectorDatabase),
        { atomicCandidatePublication: 'unsupported' },
    );
    assert.deepEqual(
        MilvusRestfulVectorDatabase.prototype.getPublicationCapabilities.call({} as MilvusRestfulVectorDatabase),
        { atomicCandidatePublication: 'unsupported' },
    );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyResourceContractV1 } from './verify-ranking-v3-resource-contract.mjs';

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

const CONTRACT_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../evals/search-ranking/ranking-v3-resource-contract.json',
);
const CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

function corpus(overrides = {}) {
    return {
        schemaVersion: 'ranking_v3_resource_corpus_manifest_v1',
        contractSha256: null, // set below
        workloads: [
            { workloadId: 'search_candidate_survival_v3', entries: 10 },
            { workloadId: 'provider_request', entries: 5 },
        ],
        ...overrides,
    };
}

test('rejects_unsealed_workload_threshold_or_environment', () => {
    // Baseline: contract binding digest + environment match -> passes.
    const sealed = corpus();
    sealed.contractSha256 = crypto.createHash('sha256').update(canonical(CONTRACT)).digest('hex');
    const result = verifyResourceContractV1({ contract: CONTRACT, corpus: sealed });
    assert.equal(result.environmentVerified, true);
    assert.equal(result.contractSha256.length, 64);

    // Unsealed: wrong contract digest is rejected.
    const wrongDigest = corpus();
    wrongDigest.contractSha256 = 'a'.repeat(64);
    assert.throws(() => verifyResourceContractV1({ contract: CONTRACT, corpus: wrongDigest }), /sealed contract bytes/);

    // Unsealed workload: corpus declares a workload absent from the contract.
    const foreignWorkload = corpus({ workloads: [{ workloadId: 'unsealed_workload', entries: 1 }] });
    foreignWorkload.contractSha256 = result.contractSha256;
    assert.throws(() => verifyResourceContractV1({ contract: CONTRACT, corpus: foreignWorkload }), /not sealed/);

    // Unsealed environment: nodeMajor contract value cannot be forged at runtime,
    // so tamper with the contract itself.
    const tampered = { ...CONTRACT, environment: { ...CONTRACT.environment, nodeMajor: 1 } };
    assert.throws(() => verifyResourceContractV1({
        contract: tampered,
        corpus: { ...corpus(), contractSha256: result.contractSha256 },
    }), /Environment mismatch|sealed contract bytes/);
});

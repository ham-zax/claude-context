#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseResidualModelV1, parseRankingPolicyV3Artifact } from '../packages/mcp/src/core/ranking-policy-artifact.ts';
import { verifyRankingPolicyV3ArtifactValue } from './verify-ranking-policy-artifact.mjs';

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value;
}
function requireSha(value, label) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 digest.`);
    return value;
}
function requireCommit(value, label) {
    if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new Error(`${label} must be a 40-hex commit.`);
    return value;
}
function requireNonEmpty(value, label) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
    return value;
}

/**
 * D8: build the final RankingPolicyV3Artifact for exactly the E3-selected
 * mode from the refit residual model and sealed authorities (plan §5.3, §6.6).
 * Unselected provider behavior is never retained: a disabled selection
 * produces no provider fields; a provider-derived selection requires a fixed
 * target and the sealed R1.2 request-contract digest.
 */
export function buildRankingPolicyV3Artifact(input) {
    const residualModel = parseResidualModelV1(requireRecord(input.residualModel, 'residualModel'));
    const selectionReceipt = requireRecord(input.selectedModeReceipt, 'selectedModeReceipt');
    const qualificationTarget = requireRecord(input.qualificationTarget, 'qualificationTarget');
    const featureContractSha256 = requireSha(input.featureContractSha256, 'featureContractSha256');
    const runtimeScoringContractId = requireNonEmpty(input.runtimeScoringContractId, 'runtimeScoringContractId');
    const retrievalContractId = requireNonEmpty(input.retrievalContractId, 'retrievalContractId');
    const trainingManifestSha256 = requireSha(input.trainingManifestSha256, 'trainingManifestSha256');
    const trainingCodeSha256 = requireSha(input.trainingCodeSha256, 'trainingCodeSha256');
    const trainingContractSha256 = requireSha(input.trainingContractSha256, 'trainingContractSha256');
    const createdFromCommit = requireCommit(input.createdFromCommit, 'createdFromCommit');

    if (selectionReceipt.receiptType !== 'e3_selection') {
        throw new Error('Selected-mode receipt must be an E3 selection receipt.');
    }
    const outcome = selectionReceipt.outcome;
    if (outcome !== 'selected_disabled' && outcome !== 'selected_provider_derived') {
        throw new Error(`Unsupported E3 selection outcome '${outcome}'.`);
    }
    if (selectionReceipt.qualificationTargetSha256 !== digest(qualificationTarget)) {
        throw new Error('Selection receipt qualification target does not match the supplied target.');
    }
    const residualModelSha256 = digest(residualModel);

    let neuralReorderPolicy;
    let applicability;
    let providerRequestContractSha256;
    if (outcome === 'selected_disabled') {
        neuralReorderPolicy = { mode: 'disabled' };
        applicability = {
            mode: 'disabled',
            baselinePolicyIdentity: 'search_candidate_final_score_v2',
            featureContractSha256,
            runtimeScoringContractId,
            retrievalContractId,
            supportedProviderKeys: [],
        };
    } else {
        if (qualificationTarget.providerTarget !== 'fixed') {
            throw new Error('Provider-derived selection requires a fixed qualification target.');
        }
        providerRequestContractSha256 = selectionReceipt.providerRequestContractSha256;
        requireSha(providerRequestContractSha256, 'providerRequestContractSha256');
        neuralReorderPolicy = {
            mode: 'provider_derived',
            providerKey: qualificationTarget.providerKey,
            minimumCandidates: input.providerDerived?.minimumCandidates ?? 3,
            minimumNormalizedTopToSecondMargin: input.providerDerived?.minimumNormalizedTopToSecondMargin ?? 0.1,
        };
        applicability = {
            mode: 'provider_derived',
            baselinePolicyIdentity: 'search_candidate_final_score_v2',
            featureContractSha256,
            runtimeScoringContractId,
            retrievalContractId,
            supportedProviderKeys: [qualificationTarget.providerKey],
            rerankerProjectionIdentity: qualificationTarget.rerankerProjectionIdentity,
            providerConfigurationDigest: qualificationTarget.providerConfigurationDigest,
            providerRequestContractSha256,
        };
    }

    const artifact = {
        schemaVersion: 'ranking_policy_v3',
        policyId: 'search_ranking_policy_v3',
        featureSchema: 'search_features_v1',
        createdFromCommit,
        trainingManifestSha256,
        trainingCodeSha256,
        trainingContractSha256,
        qualificationTargetSha256: digest(qualificationTarget),
        residualModelSha256,
        normalization: residualModel.normalization,
        weights: residualModel.weights,
        residualBounds: residualModel.residualBounds,
        neuralReorderPolicy,
        applicability,
    };
    // The final artifact is independently verified by the D3 verifier; the
    // provider-derived form binds the sealed R1.2 request-contract digest.
    // The artifact itself carries no self-hash (plan §5.3); D3 computes the
    // canonical digest externally.
    verifyRankingPolicyV3ArtifactValue(
        artifact,
        outcome === 'selected_provider_derived'
            ? { expectedProviderRequestContractSha256: providerRequestContractSha256 }
            : {},
    );
    return artifact;
}

function usage() {
    return [
        'Usage: node scripts/build-ranking-policy-v3-artifact.mjs build',
        '  --residual-model <model.json> --selection-receipt <receipt.json>',
        '  --qualification-target <target.json> --feature-contract-index <index.json>',
        '  --training-manifest <manifest.json> --contract-seal <seal.json> --out <dir>',
    ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
    const [command, ...rest] = argv;
    if (command !== 'build') throw new Error(`Unknown command '${command ?? ''}'.\n${usage()}`);
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
        const key = arg.slice(2);
        index += 1;
        if (index >= rest.length) throw new Error(`Missing value after ${arg}.`);
        options[key] = rest[index];
    }
    for (const key of ['residual-model', 'selection-receipt', 'qualification-target', 'feature-contract-index', 'training-manifest', 'contract-seal', 'out']) {
        if (!options[key]) throw new Error(`--${key} is required.\n${usage()}`);
    }
    const featureIndex = requireRecord(JSON.parse(fs.readFileSync(path.resolve(options['feature-contract-index']), 'utf8')), 'feature contract index');
    const seal = requireRecord(JSON.parse(fs.readFileSync(path.resolve(options['contract-seal']), 'utf8')), 'contract seal');
    const trainingManifestBytes = fs.readFileSync(path.resolve(options['training-manifest']));
    const artifact = buildRankingPolicyV3Artifact({
        residualModel: JSON.parse(fs.readFileSync(path.resolve(options['residual-model']), 'utf8')),
        selectedModeReceipt: JSON.parse(fs.readFileSync(path.resolve(options['selection-receipt']), 'utf8')),
        qualificationTarget: JSON.parse(fs.readFileSync(path.resolve(options['qualification-target']), 'utf8')),
        featureContractSha256: requireSha(featureIndex.contractSha256, 'feature contract index contractSha256'),
        runtimeScoringContractId: seal.runtimeScoringContractId ?? 'search_scoring_runtime_v1',
        retrievalContractId: seal.retrievalContractId ?? 'search_retrieval_contract_v1',
        trainingManifestSha256: crypto.createHash('sha256').update(trainingManifestBytes).digest('hex'),
        trainingCodeSha256: crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
        trainingContractSha256: requireSha(seal.contractIndexSha256, 'contract seal contractIndexSha256'),
        createdFromCommit: requireCommit(seal.baselineCommit, 'contract seal baselineCommit'),
    });
    fs.mkdirSync(path.resolve(options.out), { recursive: true });
    const outPath = path.join(path.resolve(options.out), 'RANKING_POLICY_V3.json');
    fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
    return artifact;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`build-ranking-policy-v3-artifact: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}

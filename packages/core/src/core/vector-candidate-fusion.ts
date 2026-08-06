import { isDeepStrictEqual } from 'node:util';

import type { VectorCandidate } from '../vectordb';
import { compareContractStrings } from '../utils/compare-contract-strings';
import type { SemanticSearchCandidateTraceV2 } from './semantic-search-candidate-trace';

type RankedCandidate = {
    document: VectorCandidate['document'];
    score: number;
};

type FusionInput = {
    readonly dense: readonly VectorCandidate[];
    readonly lexical: readonly VectorCandidate[];
    readonly fallbackLexical?: readonly VectorCandidate[];
    readonly k: number;
    readonly limit: number;
};

export interface VectorCandidateFusionEvidenceV1 {
    candidates: VectorCandidate[];
    traces: SemanticSearchCandidateTraceV2[];
}

/** Backend-arm RRF policy v1. MCP multi-pass fusion has a separate policy. */
export const VECTOR_CANDIDATE_RRF_K_V1 = 100;

function assertValidCandidate(candidate: VectorCandidate): void {
    if (candidate.document.id.length === 0) {
        throw new Error('Vector candidate document ID must be non-empty.');
    }
    if (!Number.isFinite(candidate.score)) {
        throw new Error(`Vector candidate '${candidate.document.id}' has a non-finite score.`);
    }
}

function documentsMatch(
    left: VectorCandidate['document'],
    right: VectorCandidate['document'],
): boolean {
    return left.id === right.id
        && left.relativePath === right.relativePath
        && left.startLine === right.startLine
        && left.endLine === right.endLine
        && left.fileExtension === right.fileExtension
        && left.content === right.content
        && isDeepStrictEqual(left.metadata, right.metadata);
}

function assertMatchingDocument(
    existing: VectorCandidate['document'],
    candidate: VectorCandidate['document'],
): void {
    if (!documentsMatch(existing, candidate)) {
        throw new Error(`Vector candidate '${candidate.id}' has conflicting document payloads.`);
    }
}

export function orderVectorCandidateArm(arm: readonly VectorCandidate[]): VectorCandidate[] {
    for (const candidate of arm) assertValidCandidate(candidate);
    return [...arm].sort((left, right) => (
        right.score - left.score
        || compareContractStrings(left.document.id, right.document.id)
    ));
}

export function vectorCandidateOwnerId(candidate: VectorCandidate): string {
    const ownerSymbolInstanceId = candidate.document.metadata.ownerSymbolInstanceId;
    return typeof ownerSymbolInstanceId === 'string' && ownerSymbolInstanceId.length > 0
        ? JSON.stringify(['symbol', candidate.document.relativePath, ownerSymbolInstanceId])
        : JSON.stringify(['file', candidate.document.relativePath]);
}

function rankedUniqueArm(arm: readonly VectorCandidate[]): Array<{ candidate: VectorCandidate; rank: number }> {
    const seenDocumentsById = new Map<string, VectorCandidate['document']>();
    const seenOwnerIds = new Set<string>();
    const ranked: Array<{ candidate: VectorCandidate; rank: number }> = [];
    for (const candidate of orderVectorCandidateArm(arm)) {
        const priorArmDocument = seenDocumentsById.get(candidate.document.id);
        if (priorArmDocument) {
            assertMatchingDocument(priorArmDocument, candidate.document);
            continue;
        }
        seenDocumentsById.set(candidate.document.id, candidate.document);
        const ownerId = vectorCandidateOwnerId(candidate);
        if (seenOwnerIds.has(ownerId)) continue;
        seenOwnerIds.add(ownerId);
        ranked.push({ candidate, rank: ranked.length + 1 });
    }
    return ranked;
}

export function fuseVectorCandidatesWithRrfEvidence(input: FusionInput): VectorCandidateFusionEvidenceV1 {
    if (!Number.isFinite(input.k) || input.k <= 0) {
        throw new Error('RRF k must be a positive finite number.');
    }
    if (!Number.isSafeInteger(input.limit) || input.limit < 0) {
        throw new Error('RRF result limit must be a non-negative safe integer.');
    }

    const candidatesById = new Map<string, RankedCandidate>();
    const denseRanks = new Map<string, number>();
    const lexicalRanks = new Map<string, number>();
    const fallbackRanks = new Map<string, number>();
    const addRankedArm = (
        arm: readonly VectorCandidate[],
        ranks: Map<string, number>,
        contributes: boolean,
    ): void => {
        for (const { candidate, rank } of rankedUniqueArm(arm)) {
            ranks.set(candidate.document.id, rank);
            if (!contributes) continue;
            const score = 1 / (input.k + rank);
            const existing = candidatesById.get(candidate.document.id);
            if (existing) {
                assertMatchingDocument(existing.document, candidate.document);
                candidatesById.set(candidate.document.id, { ...existing, score: existing.score + score });
            } else {
                candidatesById.set(candidate.document.id, { document: candidate.document, score });
            }
        }
    };

    addRankedArm(input.dense, denseRanks, true);
    const useFallbackLexical = input.lexical.length === 0 && (input.fallbackLexical?.length ?? 0) > 0;
    addRankedArm(input.lexical, lexicalRanks, !useFallbackLexical);
    addRankedArm(input.fallbackLexical ?? [], fallbackRanks, useFallbackLexical);

    const fullyRanked = Array.from(candidatesById.values()).sort((left, right) => (
        right.score - left.score
        || compareContractStrings(left.document.id, right.document.id)
    ));
    const coreRanks = new Map(fullyRanked.map((candidate, index) => [candidate.document.id, index + 1]));
    const ids = [...new Set([
        ...denseRanks.keys(), ...lexicalRanks.keys(), ...fallbackRanks.keys(), ...coreRanks.keys(),
    ])].sort(compareContractStrings);
    const traces = ids.map((candidateId): SemanticSearchCandidateTraceV2 => ({
        schemaVersion: 'semantic_search_candidate_trace_v2',
        candidateId,
        rawDenseRank: denseRanks.get(candidateId) ?? null,
        rawLexicalRank: lexicalRanks.get(candidateId) ?? null,
        rawFallbackLexicalRank: fallbackRanks.get(candidateId) ?? null,
        coreFusionRank: coreRanks.get(candidateId) ?? null,
    }));
    return {
        candidates: fullyRanked.slice(0, input.limit).map(({ document, score }) => ({ document, score })),
        traces,
    };
}

export function fuseVectorCandidatesWithRrf(input: FusionInput): VectorCandidate[] {
    return fuseVectorCandidatesWithRrfEvidence(input).candidates;
}

import { isDeepStrictEqual } from 'node:util';

import type { VectorCandidate } from '../vectordb';
import type { SemanticSearchCandidateTraceV2 } from './semantic-search-candidate-trace';
import { compareContractStrings } from '../utils/compare-contract-strings';

type RankedCandidate = {
    document: VectorCandidate['document'];
    score: number;
};

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

export function fuseVectorCandidatesWithRrf(input: {
    readonly dense: readonly VectorCandidate[];
    readonly lexical: readonly VectorCandidate[];
    readonly k: number;
    readonly limit: number;
    /** Advisory-only trace sink for per-candidate raw arm and fusion ranks. */
    readonly traceV2?: (trace: SemanticSearchCandidateTraceV2) => void;
    /** When the caller substituted a fallback lexical arm, its ordered ranks by candidate id. */
    readonly fallbackLexicalRanks?: ReadonlyMap<string, number>;
}): VectorCandidate[] {
    if (!Number.isFinite(input.k) || input.k <= 0) {
        throw new Error('RRF k must be a positive finite number.');
    }
    if (!Number.isSafeInteger(input.limit) || input.limit < 0) {
        throw new Error('RRF result limit must be a non-negative safe integer.');
    }

    const candidatesById = new Map<string, RankedCandidate>();
    const rawRanksByCandidateId = new Map<string, {
        rawDenseRank: number | null;
        rawLexicalRank: number | null;
        rawFallbackLexicalRank: number | null;
    }>();
    const orderedDense = orderVectorCandidateArm(input.dense);
    const orderedLexical = orderVectorCandidateArm(input.lexical);
    orderedDense.forEach((candidate, index) => {
        const prior = rawRanksByCandidateId.get(candidate.document.id) ?? {
            rawDenseRank: null,
            rawLexicalRank: null,
            rawFallbackLexicalRank: null,
        };
        prior.rawDenseRank = index + 1;
        rawRanksByCandidateId.set(candidate.document.id, prior);
    });
    orderedLexical.forEach((candidate, index) => {
        const prior = rawRanksByCandidateId.get(candidate.document.id) ?? {
            rawDenseRank: null,
            rawLexicalRank: null,
            rawFallbackLexicalRank: null,
        };
        prior.rawLexicalRank = index + 1;
        rawRanksByCandidateId.set(candidate.document.id, prior);
    });
    if (input.fallbackLexicalRanks) {
        for (const [candidateId, rank] of input.fallbackLexicalRanks) {
            const prior = rawRanksByCandidateId.get(candidateId) ?? {
                rawDenseRank: null,
                rawLexicalRank: null,
                rawFallbackLexicalRank: null,
            };
            prior.rawFallbackLexicalRank = rank;
            rawRanksByCandidateId.set(candidateId, prior);
        }
    }
    const addRankedArm = (arm: readonly VectorCandidate[]): void => {
        const seenDocumentsById = new Map<string, VectorCandidate['document']>();
        const seenOwnerIds = new Set<string>();
        let rank = 0;
        for (const candidate of orderVectorCandidateArm(arm)) {
            const priorArmDocument = seenDocumentsById.get(candidate.document.id);
            if (priorArmDocument) {
                assertMatchingDocument(priorArmDocument, candidate.document);
                continue;
            }
            seenDocumentsById.set(candidate.document.id, candidate.document);
            const ownerId = vectorCandidateOwnerId(candidate);
            if (seenOwnerIds.has(ownerId)) {
                continue;
            }
            seenOwnerIds.add(ownerId);
            rank++;
            const score = 1 / (input.k + rank);
            const existing = candidatesById.get(candidate.document.id);
            if (existing) {
                assertMatchingDocument(existing.document, candidate.document);
                candidatesById.set(candidate.document.id, {
                    ...existing,
                    score: existing.score + score,
                });
            } else {
                candidatesById.set(candidate.document.id, {
                    document: candidate.document,
                    score,
                });
            }
        }
    };

    addRankedArm(input.dense);
    addRankedArm(input.lexical);

    return Array.from(candidatesById.values())
        .sort((left, right) => (
            right.score - left.score
            || compareContractStrings(left.document.id, right.document.id)
        ))
        .slice(0, input.limit)
        .map(({ document, score }, index) => {
            const trace = input.traceV2;
            if (trace) {
                const raw = rawRanksByCandidateId.get(document.id);
                trace({
                    schemaVersion: 'semantic_search_candidate_trace_v2',
                    candidateId: document.id,
                    rawDenseRank: raw?.rawDenseRank ?? null,
                    rawLexicalRank: raw?.rawLexicalRank ?? null,
                    rawFallbackLexicalRank: raw?.rawFallbackLexicalRank ?? null,
                    coreFusionRank: index + 1,
                });
            }
            return { document, score };
        });
}

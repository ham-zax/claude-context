import crypto from "node:crypto";

/**
 * Phase 8.3 - single source of truth for Satori collection-name grammar.
 * Pure: no vector-store I/O. The listing layer (collection-family-listing)
 * applies this policy over a narrow vector-store port.
 */

export const SATORI_COLLECTION_FAMILY_PREFIXES = [
    "code_chunks_",
    "hybrid_code_chunks_",
] as const;

export const GENERATION_COLLECTION_SEPARATOR = "__gen_";

export function resolveActiveCollectionFamilyName(
    isHybrid: boolean,
    canonicalPath: string,
): string {
    const hash = crypto.createHash("md5").update(canonicalPath).digest("hex");
    const prefix = isHybrid === true ? "hybrid_code_chunks" : "code_chunks";
    return `${prefix}_${hash.substring(0, 8)}`;
}

export function resolveAlternateCollectionFamilyName(activeFamilyName: string): string {
    const hash = activeFamilyName.substring(activeFamilyName.lastIndexOf("_") + 1);
    return activeFamilyName.startsWith("hybrid_code_chunks_")
        ? `code_chunks_${hash}`
        : `hybrid_code_chunks_${hash}`;
}

export function normalizeCollectionGenerationId(generationId: string): string {
    const normalized = generationId
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (normalized.length === 0) {
        throw new Error("generationId must contain at least one alphanumeric character.");
    }
    return normalized;
}

export function resolveStagedCollectionName(
    familyName: string,
    generationId: string,
): string {
    return `${familyName}${GENERATION_COLLECTION_SEPARATOR}${normalizeCollectionGenerationId(generationId)}`;
}

export function belongsToCollectionFamily(
    collectionName: string,
    familyName: string,
): boolean {
    return collectionName === familyName
        || collectionName.startsWith(`${familyName}${GENERATION_COLLECTION_SEPARATOR}`);
}

export function isStagedGenerationCollectionName(collectionName: string): boolean {
    return collectionName.includes(GENERATION_COLLECTION_SEPARATOR);
}

export function collectionFamilyName(collectionName: string): string {
    const separatorIndex = collectionName.indexOf(GENERATION_COLLECTION_SEPARATOR);
    return separatorIndex === -1
        ? collectionName
        : collectionName.slice(0, separatorIndex);
}

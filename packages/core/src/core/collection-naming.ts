import crypto from "node:crypto";

/**
 * Single source of truth for Satori vector collection-name grammar.
 * Publication descriptors, not sibling-name ordering, own current authority.
 */

export const SATORI_COLLECTION_FAMILY_PREFIXES = [
    "code_chunks_",
    "hybrid_code_chunks_",
] as const;

export const PUBLICATION_COLLECTION_SEPARATOR = "__gen_";

export function resolveCollectionFamilyName(
    isHybrid: boolean,
    canonicalPath: string,
): string {
    const hash = crypto.createHash("md5").update(canonicalPath).digest("hex");
    const prefix = isHybrid === true ? "hybrid_code_chunks" : "code_chunks";
    return `${prefix}_${hash.substring(0, 8)}`;
}

function normalizePublicationId(publicationId: string): string {
    const normalized = publicationId
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (normalized.length === 0) {
        throw new Error("publicationId must contain at least one alphanumeric character.");
    }
    return normalized;
}

export function resolvePublicationCollectionName(
    familyName: string,
    publicationId: string,
): string {
    return `${familyName}${PUBLICATION_COLLECTION_SEPARATOR}${normalizePublicationId(publicationId)}`;
}

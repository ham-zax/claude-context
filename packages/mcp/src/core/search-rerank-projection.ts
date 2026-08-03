import path from "node:path";
import type {
    SymbolRecord,
    SymbolRegistry,
} from "@zokizuan/satori-core";
import { readCurrentSourceEvidence } from "./current-source-symbols.js";
import type { SearchResultLike } from "./search-lexical-scoring.js";
import { buildSearchRerankDocumentV2 } from "./search-rerank-document-v2.js";

type CurrentSourceEvidenceReader = typeof readCurrentSourceEvidence;

function resolveCanonicalOwner(
    result: SearchResultLike,
    registry: SymbolRegistry,
): SymbolRecord | undefined {
    const instanceId = typeof result.ownerSymbolInstanceId === "string"
        ? result.ownerSymbolInstanceId.trim()
        : "";
    if (instanceId) return registry.symbolsByInstanceId.get(instanceId);

    const symbolKey = typeof result.ownerSymbolKey === "string"
        ? result.ownerSymbolKey.trim()
        : "";
    if (!symbolKey) return undefined;
    const matches = (registry.symbolsByKey.get(symbolKey) ?? []).filter(
        (symbol) => symbol.file === result.relativePath,
    );
    return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Build the frozen projection-v2 bytes only from a registry-owned candidate and
 * hash-matched current source. The candidate span is retained because it is part
 * of the qualified L3 projection, but it must remain inside the canonical owner.
 */
export async function buildPublicationBoundSearchRerankDocumentV2(input: {
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<string | undefined> {
    const owner = resolveCanonicalOwner(input.result, input.registry);
    const startLine = input.result.startLine;
    const endLine = input.result.endLine;
    if (
        !owner
        || owner.file !== input.result.relativePath
        || !/^[a-f0-9]{64}$/.test(owner.fileHash)
        || !Number.isSafeInteger(startLine)
        || !Number.isSafeInteger(endLine)
        || (startLine as number) < owner.span.startLine
        || (endLine as number) > owner.span.endLine
        || (endLine as number) < (startLine as number)
    ) {
        return undefined;
    }

    const evidence = await (input.readSourceEvidence ?? readCurrentSourceEvidence)(
        input.codebaseRoot,
        owner.file,
    );
    if (
        !evidence
        || evidence.relativeFile !== owner.file
        || evidence.observedHash !== owner.fileHash
    ) {
        return undefined;
    }

    try {
        return buildSearchRerankDocumentV2({
            relativePath: input.result.relativePath,
            language: input.result.language,
            symbolKind: input.result.symbolKind ?? "file",
            canonicalSymbolLabel:
                input.result.symbolLabel ?? path.posix.basename(input.result.relativePath),
            content: evidence.source,
            symbolSpan: {
                startLine: startLine as number,
                endLine: endLine as number,
            },
            query: input.semanticQuery,
        }).text;
    } catch {
        return undefined;
    }
}

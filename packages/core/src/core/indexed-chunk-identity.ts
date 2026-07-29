import crypto from "node:crypto";
import type { CodeChunk } from "../language-analysis";

export function buildIndexedChunkId(
    relativePath: string,
    chunk: CodeChunk,
    fileChunkIndex: number,
): string {
    const identity = JSON.stringify([
        relativePath,
        fileChunkIndex,
        chunk.metadata.startByte ?? null,
        chunk.metadata.endByte ?? null,
        chunk.metadata.startLine,
        chunk.metadata.endLine,
        chunk.content,
    ]);
    const hash = crypto.createHash("sha256").update(identity, "utf8").digest("hex");
    return `chunk_${hash.substring(0, 16)}`;
}

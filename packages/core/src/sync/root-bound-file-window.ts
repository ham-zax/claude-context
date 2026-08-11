import * as crypto from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import {
    canonicalizeRepositoryRelativePath,
    type RepositoryRelativePath,
} from '../paths/repository-path';
import {
    canPublishRootBoundFileIdentity,
    observeRootBoundFileIdentity,
    openRegularFileInsideRootNoFollow,
    RootBoundFileError,
    trimTrailingSeparators,
    type RootBoundFileIdentity,
    verifyStableFileObservation,
} from './root-bound-fs';

const LINE_FEED_BYTE = 0x0a;
const CARRIAGE_RETURN_BYTE = 0x0d;
const STREAM_CHUNK_BYTES = 64 * 1024;

export interface RootBoundFileLineRange {
    readonly startLine: number;
    readonly endLine: number;
}

export interface RootBoundFileWindowRequest {
    readonly canonicalRoot: string;
    readonly relativePath: string;
    readonly requestedLineRange: RootBoundFileLineRange;
    readonly maxFileBytes: number;
    readonly maxWindowBytes: number;
}

export type RootBoundFileWindowLimitCode =
    | 'file_size_limit_exceeded'
    | 'window_size_limit_exceeded';

export class RootBoundFileWindowLimitError extends Error {
    constructor(
        readonly code: RootBoundFileWindowLimitCode,
        message: string,
    ) {
        super(message);
        this.name = 'RootBoundFileWindowLimitError';
    }
}

export interface RootBoundFileWindowLineMapping {
    readonly localLine: number;
    readonly originalLine: number;
    /** End-exclusive UTF-16 offsets into `utf8Window`, including any line ending. */
    readonly startUtf16Offset: number;
    readonly endUtf16Offset: number;
}

export interface RootBoundFileWindowEvidence {
    readonly canonicalRoot: string;
    readonly normalizedRelativePath: RepositoryRelativePath;
    readonly rawByteSha256: string;
    readonly observedByteSize: number;
    readonly identity: RootBoundFileIdentity;
    readonly totalLineCount: number;
    readonly requestedLineRange: RootBoundFileLineRange;
    readonly originalLineRange: RootBoundFileLineRange | null;
    readonly utf8Window: string;
    readonly lineMappings: readonly RootBoundFileWindowLineMapping[];
}

interface StreamedFileWindow {
    readonly hash: crypto.Hash;
    readonly capturedChunks: readonly Buffer[];
    readonly capturedByteLength: number;
    readonly totalLineCount: number;
}

interface StreamedLineState {
    readonly currentLine: number;
    readonly pendingCarriageReturn: boolean;
}

function normalizeCanonicalRoot(canonicalRoot: string): string {
    if (
        typeof canonicalRoot !== 'string'
        || canonicalRoot.length === 0
        || canonicalRoot.includes('\0')
        || !path.isAbsolute(canonicalRoot)
    ) {
        throw new TypeError('canonicalRoot must be an absolute canonical path.');
    }
    return trimTrailingSeparators(path.normalize(canonicalRoot));
}

function normalizeRelativePath(
    canonicalRoot: string,
    relativePath: string,
): RepositoryRelativePath {
    if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
        throw new TypeError('relativePath must be repository-relative.');
    }
    const normalized = canonicalizeRepositoryRelativePath(canonicalRoot, relativePath);
    if (normalized === null) {
        throw new TypeError('relativePath must resolve to a file inside canonicalRoot.');
    }
    return normalized;
}

function validateLineRange(lineRange: RootBoundFileLineRange): RootBoundFileLineRange {
    if (
        lineRange === null
        || typeof lineRange !== 'object'
        || !Number.isSafeInteger(lineRange.startLine)
        || !Number.isSafeInteger(lineRange.endLine)
        || lineRange.startLine < 1
        || lineRange.endLine < lineRange.startLine
    ) {
        throw new RangeError('requestedLineRange must be a valid inclusive 1-based line range.');
    }
    return {
        startLine: lineRange.startLine,
        endLine: lineRange.endLine,
    };
}

function validateMaximumBytes(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
    return value;
}

function captureRequestedChunkBytes(input: {
    chunk: Buffer;
    lineState: StreamedLineState;
    requestedLineRange: RootBoundFileLineRange;
    capturedChunks: Buffer[];
    remainingWindowBytes: number;
}): { lineState: StreamedLineState; capturedByteLength: number } {
    const { chunk, requestedLineRange, capturedChunks } = input;
    let { currentLine, pendingCarriageReturn } = input.lineState;
    let captureStart = -1;
    let captureEnd = -1;

    const captureByte = (byteIndex: number): void => {
        if (
            currentLine >= requestedLineRange.startLine
            && currentLine <= requestedLineRange.endLine
        ) {
            captureStart = captureStart === -1 ? byteIndex : captureStart;
            captureEnd = byteIndex + 1;
        }
    };

    for (let byteIndex = 0; byteIndex < chunk.length; byteIndex += 1) {
        const byte = chunk[byteIndex];
        if (pendingCarriageReturn) {
            if (byte === LINE_FEED_BYTE) {
                captureByte(byteIndex);
                currentLine += 1;
                pendingCarriageReturn = false;
                continue;
            }
            currentLine += 1;
            pendingCarriageReturn = false;
        }

        captureByte(byteIndex);
        if (byte === CARRIAGE_RETURN_BYTE) {
            pendingCarriageReturn = true;
        } else if (byte === LINE_FEED_BYTE) {
            currentLine += 1;
        }
    }

    if (captureStart === -1 || captureEnd <= captureStart) {
        return {
            lineState: { currentLine, pendingCarriageReturn },
            capturedByteLength: 0,
        };
    }

    // Copy only the requested span so a tiny window cannot retain whole stream chunks.
    const captured = Buffer.from(chunk.subarray(captureStart, captureEnd));
    if (captured.length > input.remainingWindowBytes) {
        throw new RootBoundFileWindowLimitError(
            'window_size_limit_exceeded',
            'Requested source window exceeds maxWindowBytes.',
        );
    }
    capturedChunks.push(captured);
    return {
        lineState: { currentLine, pendingCarriageReturn },
        capturedByteLength: captured.length,
    };
}

async function streamObservedFileWindow(
    handle: fsp.FileHandle,
    observedByteSize: number,
    requestedLineRange: RootBoundFileLineRange,
    maxWindowBytes: number,
): Promise<StreamedFileWindow> {
    const hash = crypto.createHash('sha256');
    const capturedChunks: Buffer[] = [];
    let capturedByteLength = 0;
    let totalBytes = 0;
    let lineState: StreamedLineState = {
        currentLine: 1,
        pendingCarriageReturn: false,
    };
    const stream = handle.createReadStream({
        autoClose: false,
        start: 0,
        highWaterMark: STREAM_CHUNK_BYTES,
        // Node's end offset is inclusive. One extra byte makes growth observable.
        end: observedByteSize,
    });

    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const nextTotalBytes = totalBytes + buffer.length;
        if (nextTotalBytes > observedByteSize) {
            throw new RootBoundFileError(
                'source_changed_during_inspection',
                'File grew beyond the observed size while being projected.',
            );
        }

        hash.update(buffer);
        const captured = captureRequestedChunkBytes({
            chunk: buffer,
            lineState,
            requestedLineRange,
            capturedChunks,
            remainingWindowBytes: maxWindowBytes - capturedByteLength,
        });
        lineState = captured.lineState;
        capturedByteLength += captured.capturedByteLength;
        totalBytes = nextTotalBytes;
    }

    if (totalBytes !== observedByteSize) {
        throw new RootBoundFileError(
            'source_changed_during_inspection',
            `File byte length ${totalBytes} does not match the observed size ${observedByteSize}.`,
        );
    }

    const totalLineCount = lineState.pendingCarriageReturn
        ? lineState.currentLine + 1
        : lineState.currentLine;

    return {
        hash,
        capturedChunks,
        capturedByteLength,
        totalLineCount,
    };
}

function resolveOriginalLineRange(
    requestedLineRange: RootBoundFileLineRange,
    totalLineCount: number,
): RootBoundFileLineRange | null {
    if (requestedLineRange.startLine > totalLineCount) {
        return null;
    }
    return {
        startLine: requestedLineRange.startLine,
        endLine: Math.min(requestedLineRange.endLine, totalLineCount),
    };
}

function buildLineMappings(
    utf8Window: string,
    originalLineRange: RootBoundFileLineRange | null,
): RootBoundFileWindowLineMapping[] {
    if (originalLineRange === null) {
        return [];
    }

    const mappings: RootBoundFileWindowLineMapping[] = [];
    const lineCount = originalLineRange.endLine - originalLineRange.startLine + 1;
    let startUtf16Offset = 0;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        let endUtf16Offset = utf8Window.length;
        for (let offset = startUtf16Offset; offset < utf8Window.length; offset += 1) {
            const character = utf8Window[offset];
            if (character === '\n') {
                endUtf16Offset = offset + 1;
                break;
            }
            if (character === '\r') {
                endUtf16Offset = utf8Window[offset + 1] === '\n'
                    ? offset + 2
                    : offset + 1;
                break;
            }
        }
        mappings.push({
            localLine: lineIndex + 1,
            originalLine: originalLineRange.startLine + lineIndex,
            startUtf16Offset,
            endUtf16Offset,
        });
        startUtf16Offset = endUtf16Offset;
    }
    return mappings;
}

/**
 * Hash a stable root-bound regular file while retaining only one requested
 * inclusive line window. Evidence is returned only after descriptor metadata
 * and the current no-follow pathname are rebound to the original observation.
 */
export async function readStableRootBoundFileWindow(
    request: RootBoundFileWindowRequest,
): Promise<RootBoundFileWindowEvidence> {
    const canonicalRoot = normalizeCanonicalRoot(request.canonicalRoot);
    const normalizedRelativePath = normalizeRelativePath(canonicalRoot, request.relativePath);
    const requestedLineRange = validateLineRange(request.requestedLineRange);
    const maxFileBytes = validateMaximumBytes(request.maxFileBytes, 'maxFileBytes');
    const maxWindowBytes = validateMaximumBytes(request.maxWindowBytes, 'maxWindowBytes');
    const filePath = path.resolve(canonicalRoot, ...normalizedRelativePath.split('/'));
    const handle = await openRegularFileInsideRootNoFollow(filePath, canonicalRoot);

    try {
        const observedStat = await handle.stat();
        if (!Number.isSafeInteger(observedStat.size) || observedStat.size < 0) {
            throw new RangeError('Observed file size must be a non-negative safe integer.');
        }
        if (observedStat.size > maxFileBytes) {
            throw new RootBoundFileWindowLimitError(
                'file_size_limit_exceeded',
                'Observed file size exceeds maxFileBytes.',
            );
        }
        const identity = await observeRootBoundFileIdentity(handle, canonicalRoot);
        if (!canPublishRootBoundFileIdentity(identity)) {
            throw new RootBoundFileError(
                'path_identity_unavailable',
                'Stable source-file identity is unavailable for projection.',
            );
        }

        const streamed = await streamObservedFileWindow(
            handle,
            observedStat.size,
            requestedLineRange,
            maxWindowBytes,
        );
        await verifyStableFileObservation(
            handle,
            filePath,
            canonicalRoot,
            observedStat,
            { rejectFinalSymlink: true },
        );

        const originalLineRange = resolveOriginalLineRange(
            requestedLineRange,
            streamed.totalLineCount,
        );
        const utf8Window = streamed.capturedByteLength === 0
            ? ''
            : Buffer.concat(streamed.capturedChunks, streamed.capturedByteLength).toString('utf8');
        return {
            canonicalRoot,
            normalizedRelativePath,
            rawByteSha256: streamed.hash.digest('hex'),
            observedByteSize: observedStat.size,
            identity,
            totalLineCount: streamed.totalLineCount,
            requestedLineRange,
            originalLineRange,
            utf8Window,
            lineMappings: buildLineMappings(utf8Window, originalLineRange),
        };
    } finally {
        await handle.close().catch(() => undefined);
    }
}

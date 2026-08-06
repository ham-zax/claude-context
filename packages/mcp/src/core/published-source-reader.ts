import fs from "node:fs";
import {
    RootBoundFileError,
    beginSourceMeasurementObservation,
    readFileHandleExactly,
    verifyStableFileObservation,
    type RootBoundFileIdentity,
    type SourceIoOwner,
} from "@zokizuan/satori-core";
import { openAuthorizedPublishedFile } from "./published-file-authorization.js";
import type { SessionWorkspacePolicy } from "./session-workspace-policy.js";

/**
 * Whole-file byte ceiling for navigation source reads. Mirrors the read_file
 * contract (config READ_FILE_MAX_BYTES; default 8 MiB) so file_outline and
 * call_graph never allocate or serve source bytes above the same ceiling.
 */
export const READ_FILE_MAX_BYTES_DEFAULT = 8 * 1024 * 1024;

export type AuthorizedSourceReadErrorCode = "FILE_TOO_LARGE" | "FILE_REPLACED";

/**
 * Structured failure raised by readAuthorizedPublishedSource after a file was
 * authorized. Tools map the code onto their own denial envelope; the error
 * never carries source content.
 */
export class AuthorizedSourceReadError extends Error {
    readonly code: AuthorizedSourceReadErrorCode;
    readonly maxBytes?: number;
    readonly observedSize?: number;

    constructor(
        code: AuthorizedSourceReadErrorCode,
        message: string,
        extra?: { maxBytes?: number; observedSize?: number },
    ) {
        super(message);
        this.name = "AuthorizedSourceReadError";
        this.code = code;
        if (extra?.maxBytes !== undefined) {
            this.maxBytes = extra.maxBytes;
        }
        if (extra?.observedSize !== undefined) {
            this.observedSize = extra.observedSize;
        }
    }
}

export type AuthorizedSourceRead = Readonly<{
    bytes: Buffer;
    codebaseRoot: string;
    absolutePath: string;
    relativePath: string;
    observedStat: fs.Stats;
    identity: RootBoundFileIdentity;
    /**
     * The measurement observation the reader created when sourceMeasurement
     * was supplied; consumers use it for their own processing bookkeeping
     * (for example read_file's selector record).
     */
    sourceMeasurementObservation?: import("@zokizuan/satori-core").SourceMeasurementObservation;
}>;

/**
 * Read one authorized published file under the navigation byte ceiling.
 *
 * Composition, in order:
 *
 * 1. openAuthorizedPublishedFile performs the full publication authorization
 *    (workspace policy, codebase-root containment, manifest membership, final
 *    symlink/regular-file checks, descriptor-bound root binding). It is
 *    unchanged; this reader only composes it.
 * 2. The byte ceiling is enforced on the observed stat BEFORE any allocation
 *    or content read (FILE_TOO_LARGE).
 * 3. The optional onAuthorized hook runs after the ceiling check and before
 *    the content read (read_file uses it to touch the resolved codebase root;
 *    navigation handlers do not need it).
 * 4. The content read is descriptor-bound and capped at the observed byte
 *    length (readFileHandleExactly), so concurrent growth can never allocate
 *    beyond the ceiling and is detected as a change.
 * 5. verifyStableFileObservation re-checks the descriptor stat and reopens the
 *    pathname to confirm it still names the same file; any drift fails closed
 *    as FILE_REPLACED.
 * 6. The descriptor is closed on success AND failure; the caller never owns a
 *    handle and no pathname-based read ever happens here.
 */
export async function readAuthorizedPublishedSource(input: {
    workspacePolicy: SessionWorkspacePolicy;
    codebaseRoot: string;
    requestedPath: string;
    publishedRelativePaths: ReadonlySet<string>;
    maxBytes?: number;
    onAuthorized?: () => Promise<void> | void;
    sourceMeasurement?: {
        owner: SourceIoOwner;
        filePath: string;
        scanKind: "complete" | "partial";
    };
}): Promise<AuthorizedSourceRead> {
    const maxBytes = Math.max(1, input.maxBytes ?? READ_FILE_MAX_BYTES_DEFAULT);
    const authorized = await openAuthorizedPublishedFile({
        workspacePolicy: input.workspacePolicy,
        codebaseRoot: input.codebaseRoot,
        requestedPath: input.requestedPath,
        publishedRelativePaths: input.publishedRelativePaths,
    });
    const { handle, codebaseRoot, absolutePath, relativePath, observedStat, identity } = authorized;
    try {
        // Hard pre-read byte ceiling: deny before allocating a whole-file
        // buffer or reading any content.
        if (observedStat.size > maxBytes) {
            throw new AuthorizedSourceReadError(
                "FILE_TOO_LARGE",
                `File size ${observedStat.size} exceeds READ_FILE_MAX_BYTES (${maxBytes}).`,
                { maxBytes, observedSize: observedStat.size },
            );
        }

        await input.onAuthorized?.();

        const measurementObservation = input.sourceMeasurement
            ? beginSourceMeasurementObservation({
                owner: input.sourceMeasurement.owner,
                filePath: input.sourceMeasurement.filePath,
                logicalBytesRequested: observedStat.size,
                scanKind: input.sourceMeasurement.scanKind,
            })
            : undefined;

        // Descriptor-bound read capped at the observed byte length: growth or
        // truncation during the read surfaces as a RootBoundFileError and
        // readFileHandleExactly finalizes the measurement observation on every
        // path (completed / partial / failed).
        const bytes = await readFileHandleExactly(
            handle,
            observedStat.size,
            measurementObservation,
        );

        // Verify the stable descriptor/pathname observation after the read and
        // before returning content: replacement or truncation during the read
        // fails closed instead of serving mixed content.
        try {
            await verifyStableFileObservation(handle, absolutePath, codebaseRoot, observedStat);
        } catch (error) {
            if (error instanceof RootBoundFileError) {
                throw new AuthorizedSourceReadError("FILE_REPLACED", error.message);
            }
            throw error;
        }

        return Object.freeze({
            bytes,
            codebaseRoot,
            absolutePath,
            relativePath,
            observedStat,
            identity,
            ...(measurementObservation ? { sourceMeasurementObservation: measurementObservation } : {}),
        });
    } finally {
        // The descriptor is released on success, denial, and error alike.
        await handle.close().catch(() => undefined);
    }
}

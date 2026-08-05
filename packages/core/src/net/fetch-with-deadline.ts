/**
 * Bounded HTTP request utility shared by remote vector-backend adapters
 * (Milvus REST, Zilliz management) and any future raw `fetch` user.
 *
 * The utility owns one boundary: every attempt is bounded in time, retries
 * are bounded in count and classification, caller cancellation is never
 * wrapped or retried, and response bodies are bounded in bytes during
 * consumption. Provider-specific policies (timeouts, retry lists, byte
 * limits) are supplied by the caller so this module carries no
 * provider-specific constants.
 */

import { ReadableStream } from "node:stream/web";

export type HttpFailureKind =
    | "timeout"
    | "transient_http"
    | "permanent_http"
    | "network"
    | "invalid_response"
    | "response_too_large";

export class BoundedHttpError extends Error {
    readonly kind: HttpFailureKind;
    readonly status: number | null;
    readonly attempts: number;

    constructor(kind: HttpFailureKind, status: number | null, attempts: number, message: string) {
        super(message);
        this.name = "BoundedHttpError";
        this.kind = kind;
        this.status = status;
        this.attempts = attempts;
    }
}

function errorCode(error: unknown): string | undefined {
    const direct = error as { code?: unknown; cause?: unknown } | undefined;
    if (typeof direct?.code === "string") {
        return direct.code;
    }
    const cause = direct?.cause as { code?: unknown } | undefined;
    return typeof cause?.code === "string" ? cause.code : undefined;
}

function isAbortLikeError(error: unknown): boolean {
    const direct = error as { name?: unknown; cause?: unknown } | undefined;
    const name = typeof direct?.name === "string" ? direct.name : undefined;
    if (name === "AbortError" || name === "TimeoutError") {
        return true;
    }
    const cause = direct?.cause as { name?: unknown } | undefined;
    return typeof cause?.name === "string"
        && (cause.name === "AbortError" || cause.name === "TimeoutError");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function delayBeforeRetry(retryDelayMs: number, signal?: AbortSignal): Promise<void> {
    if (retryDelayMs <= 0) {
        return Promise.resolve();
    }
    if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, retryDelayMs);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
    });
}

/**
 * Wraps a response body so consumption (text/json/arrayBuffer) enforces the
 * byte limit incrementally — the stream errors with `response_too_large`
 * without ever buffering the whole body — and so the attempt deadline keeps
 * covering body consumption after the headers arrived. The body must be
 * consumed within the attempt deadline; a caller that defers consumption
 * past it receives a `timeout` failure.
 */
function boundResponseBody(
    response: Response,
    callerSignal: AbortSignal | undefined,
    attemptSignal: AbortSignal,
    maxResponseBytes: number,
    attempts: number,
): Response {
    if (response.body === null) {
        return new Response(null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    }

    const reader = response.body.getReader();
    let bytesRead = 0;
    let settled = false;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            attemptSignal.addEventListener("abort", () => {
                if (settled) {
                    return;
                }
                settled = true;
                if (callerSignal?.aborted) {
                    // Caller cancellation is never wrapped.
                    controller.error(callerSignal.reason ?? new DOMException("The operation was aborted", "AbortError"));
                } else {
                    controller.error(new BoundedHttpError(
                        "timeout",
                        null,
                        attempts,
                        "HTTP response body consumption timed out after the attempt deadline",
                    ));
                }
            }, { once: true });
        },
        async pull(controller) {
            if (settled) {
                return;
            }
            let chunk: Awaited<ReturnType<typeof reader.read>>;
            try {
                chunk = await reader.read();
            } catch (error) {
                if (settled) {
                    return;
                }
                settled = true;
                if (callerSignal?.aborted) {
                    // Caller cancellation is never wrapped.
                    controller.error(callerSignal.reason ?? error);
                } else if (isAbortLikeError(error)) {
                    controller.error(new BoundedHttpError(
                        "timeout",
                        null,
                        attempts,
                        `HTTP response body consumption timed out: ${errorMessage(error)}`,
                    ));
                } else {
                    controller.error(new BoundedHttpError(
                        "invalid_response",
                        null,
                        attempts,
                        `HTTP response body read failed: ${errorMessage(error)}`,
                    ));
                }
                return;
            }
            if (chunk.done) {
                settled = true;
                controller.close();
                return;
            }
            bytesRead += chunk.value.byteLength;
            if (bytesRead > maxResponseBytes) {
                settled = true;
                controller.error(new BoundedHttpError(
                    "response_too_large",
                    null,
                    attempts,
                    `HTTP response body exceeded ${maxResponseBytes} bytes`,
                ));
                return;
            }
            controller.enqueue(chunk.value);
        },
        cancel(reason) {
            return reader.cancel(reason);
        },
    });

    return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

export async function fetchWithDeadline(input: {
    url: string;
    init: RequestInit;
    signal?: AbortSignal;
    attemptTimeoutMs: number;
    maxAttempts: number;
    retryDelayMs: number;
    maxResponseBytes: number;
    retryableStatuses: ReadonlySet<number>;
    retryableNetworkCodes: ReadonlySet<string>;
}): Promise<Response> {
    const attempts = Math.max(1, Math.floor(input.maxAttempts));

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (input.signal?.aborted) {
            // Caller cancellation is never wrapped and never retried.
            throw input.signal.reason ?? new DOMException("The operation was aborted", "AbortError");
        }

        // The whole attempt — headers, body consumption and validation —
        // sits inside one deadline so a stall after the headers still
        // classifies as a timeout.
        const attemptSignal = input.signal
            ? AbortSignal.any([input.signal, AbortSignal.timeout(input.attemptTimeoutMs)])
            : AbortSignal.timeout(input.attemptTimeoutMs);

        try {
            const response = await fetch(input.url, {
                ...input.init,
                signal: attemptSignal,
            });

            if (input.retryableStatuses.has(response.status)) {
                if (attempt < attempts) {
                    // Release the socket before waiting for the retry.
                    await response.body?.cancel().catch(() => undefined);
                    await delayBeforeRetry(input.retryDelayMs, input.signal);
                    continue;
                }
                throw new BoundedHttpError(
                    "transient_http",
                    response.status,
                    attempt,
                    `HTTP ${response.status} after ${attempt} attempt(s)`,
                );
            }

            // Non-retryable statuses are returned as-is so the caller keeps
            // its existing response mapping (e.g. `response.ok` checks);
            // only the body is wrapped with the byte limit and deadline.
            return boundResponseBody(
                response,
                input.signal,
                attemptSignal,
                input.maxResponseBytes,
                attempt,
            );
        } catch (error) {
            if (input.signal?.aborted) {
                // Caller cancellation is never wrapped and never retried.
                throw input.signal.reason ?? error;
            }
            if (error instanceof BoundedHttpError) {
                throw error;
            }
            const timedOut = isAbortLikeError(error);
            const code = errorCode(error);
            const retryable = timedOut
                || (code !== undefined && input.retryableNetworkCodes.has(code));
            if (retryable && attempt < attempts) {
                await delayBeforeRetry(input.retryDelayMs, input.signal);
                continue;
            }
            const kind: HttpFailureKind = timedOut ? "timeout" : "network";
            throw new BoundedHttpError(
                kind,
                null,
                attempt,
                timedOut
                    ? `HTTP request timed out after ${input.attemptTimeoutMs}ms`
                    : `HTTP request failed (${code ?? "unknown"}): ${errorMessage(error)}`,
            );
        }
    }

    throw new Error("Unreachable: fetchWithDeadline attempt loop exhausted without returning or throwing.");
}

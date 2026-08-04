/**
 * VoyageAI Reranker
 * 
 * Reranks search results using VoyageAI's neural reranker models.
 * Supports rerank-2.5 (best quality) and rerank-2.5-lite (faster).
 */

import type {
    Reranker,
    RerankerIdentity,
    RerankOptions,
    RerankResult,
} from "./reranker";

export type VoyageRerankerModel = 'rerank-2.5' | 'rerank-2.5-lite' | 'rerank-2' | 'rerank-2-lite';

export const RERANK_TIMEOUT_MS = 30_000;
export const RERANK_MAX_ATTEMPTS = 2;
export const RERANK_RETRY_DELAY_MS = 250;

/**
 * Bounded failure classification for VoyageAI rerank requests.
 * `timeout` covers a single attempt exceeding the attempt timeout;
 * `transient_http` covers 408/425/429/5xx; `permanent_http` covers other
 * HTTP statuses; `network` covers transport failures (only
 * ETIMEDOUT/ECONNRESET/EAI_AGAIN are retried); `invalid_response` covers
 * well-formed HTTP with an invalid body. Caller cancellation is never
 * wrapped and never retried.
 */
export type RerankerFailureKind =
    | "timeout"
    | "transient_http"
    | "permanent_http"
    | "network"
    | "invalid_response";

export class RerankerRequestError extends Error {
    readonly kind: RerankerFailureKind;
    readonly status: number | null;
    readonly attempts: number;

    constructor(kind: RerankerFailureKind, status: number | null, attempts: number, message: string) {
        super(message);
        this.name = "RerankerRequestError";
        this.kind = kind;
        this.status = status;
        this.attempts = attempts;
    }
}

const RETRYABLE_NETWORK_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]);

interface RerankerFailureClassification {
    kind: RerankerFailureKind;
    retryable: boolean;
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

function classifyRerankerFailure(
    error: unknown,
    timedOut: boolean,
    status: number | null,
): RerankerFailureClassification {
    if (timedOut) {
        return { kind: "timeout", retryable: true };
    }
    if (status !== null) {
        if (status === 408 || status === 425 || status === 429 || status >= 500) {
            return { kind: "transient_http", retryable: true };
        }
        return { kind: "permanent_http", retryable: false };
    }
    const code = errorCode(error);
    if (code !== undefined && RETRYABLE_NETWORK_CODES.has(code)) {
        return { kind: "network", retryable: true };
    }
    return { kind: "network", retryable: false };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export interface VoyageAIRerankerConfig {
    apiKey: string;
    model?: VoyageRerankerModel;
    /** Per-attempt timeout in milliseconds (default RERANK_TIMEOUT_MS). */
    timeoutMs?: number;
    /** Delay between retry attempts (default RERANK_RETRY_DELAY_MS). */
    retryDelayMs?: number;
}

export class VoyageAIReranker implements Reranker {
    private apiKey: string;
    private model: VoyageRerankerModel;
    private baseUrl = 'https://api.voyageai.com/v1';
    private timeoutMs: number;
    private retryDelayMs: number;

    constructor(config: VoyageAIRerankerConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'rerank-2.5-lite';
        this.timeoutMs = Number.isFinite(config.timeoutMs) && (config.timeoutMs as number) > 0
            ? config.timeoutMs as number
            : RERANK_TIMEOUT_MS;
        this.retryDelayMs = Number.isFinite(config.retryDelayMs) && (config.retryDelayMs as number) >= 0
            ? config.retryDelayMs as number
            : RERANK_RETRY_DELAY_MS;
    }

    getIdentity(): Readonly<RerankerIdentity> {
        return Object.freeze({
            provider: 'voyage',
            model: this.model,
            profile: 'voyage_reranker_api_v1',
        });
    }

    /**
     * Rerank documents based on relevance to a query
     * @param query The search query
     * @param documents Array of document texts to rerank
     * @param options Reranking options
     * @returns Array of reranked results sorted by relevance score (descending)
     */
    async rerank(
        query: string,
        documents: string[],
        options: RerankOptions = {}
    ): Promise<RerankResult[]> {
        const { topK, returnDocuments = false, truncation = true, signal } = options;

        if (!documents || documents.length === 0) {
            return [];
        }

        if (!query || query.trim().length === 0) {
            throw new Error('Query cannot be empty');
        }

        console.log(`[VoyageAI Reranker] Reranking ${documents.length} documents with model: ${this.model}`);

        const requestBody: Record<string, unknown> = {
            query,
            documents,
            model: this.model,
            return_documents: returnDocuments,
            truncation,
        };

        if (topK !== undefined && topK > 0) {
            requestBody.top_k = topK;
        }

        for (let attempt = 1; attempt <= RERANK_MAX_ATTEMPTS; attempt += 1) {
            if (signal?.aborted) {
                throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
            }

            const attemptSignal = signal
                ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
                : AbortSignal.timeout(this.timeoutMs);
            let response: Response;
            try {
                response = await fetch(`${this.baseUrl}/rerank`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal: attemptSignal,
                });
            } catch (error) {
                if (signal?.aborted) {
                    // Caller cancellation is independent of the attempt timeout and is never retried.
                    throw signal.reason ?? error;
                }
                const timedOut = isAbortLikeError(error);
                const classification = classifyRerankerFailure(error, timedOut, null);
                if (attempt < RERANK_MAX_ATTEMPTS && classification.retryable) {
                    await this.delayBeforeRetry();
                    continue;
                }
                throw new RerankerRequestError(
                    classification.kind,
                    null,
                    attempt,
                    `VoyageAI Rerank request failed (${classification.kind}): ${errorMessage(error)}`,
                );
            }

            if (!response.ok) {
                const status = response.status;
                const classification = classifyRerankerFailure(null, false, status);
                const errorText = await response.text().catch(() => '');
                if (attempt < RERANK_MAX_ATTEMPTS && classification.retryable) {
                    await this.delayBeforeRetry();
                    continue;
                }
                throw new RerankerRequestError(
                    classification.kind,
                    status,
                    attempt,
                    `VoyageAI Rerank API error (${status}): ${errorText}`,
                );
            }

            try {
                const result = await response.json() as { data?: unknown };

                if (!result.data || !Array.isArray(result.data)) {
                    throw new Error('VoyageAI Rerank API returned invalid response');
                }

                const rerankResults: RerankResult[] = result.data.map((item, responseIndex) => {
                    if (!item || typeof item !== 'object') {
                        throw new Error(`VoyageAI Rerank API returned invalid response row at index ${responseIndex}`);
                    }

                    const row = item as Record<string, unknown>;
                    if (!Number.isInteger(row.index) || (row.index as number) < 0 || (row.index as number) >= documents.length) {
                        throw new Error(`VoyageAI Rerank API returned invalid response row at index ${responseIndex}`);
                    }
                    if (typeof row.relevance_score !== 'number' || !Number.isFinite(row.relevance_score)) {
                        throw new Error(`VoyageAI Rerank API returned invalid response row at index ${responseIndex}`);
                    }

                    const mapped: RerankResult = {
                        index: row.index as number,
                        relevanceScore: row.relevance_score,
                    };
                    if (returnDocuments && Object.prototype.hasOwnProperty.call(row, 'document')) {
                        if (typeof row.document !== 'string') {
                            throw new Error(`VoyageAI Rerank API returned invalid response row at index ${responseIndex}`);
                        }
                        mapped.document = row.document;
                    }
                    return mapped;
                });

                console.log(`[VoyageAI Reranker] ✅ Reranked ${rerankResults.length} results. Top score: ${rerankResults[0]?.relevanceScore?.toFixed(4) || 'N/A'}`);

                return rerankResults;
            } catch (error) {
                // A well-formed HTTP response with an invalid body is never retried.
                throw new RerankerRequestError(
                    'invalid_response',
                    response.status,
                    attempt,
                    `VoyageAI Rerank returned an invalid response: ${errorMessage(error)}`,
                );
            }
        }

        throw new Error('Unreachable: rerank attempts loop exhausted without returning or throwing.');
    }

    private async delayBeforeRetry(): Promise<void> {
        if (this.retryDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
    }

    /**
     * Get the current model
     */
    getModel(): VoyageRerankerModel {
        return this.model;
    }

    /**
     * Set the model
     */
    setModel(model: VoyageRerankerModel): void {
        this.model = model;
    }

    /**
     * Get supported models with their specifications
     */
    static getSupportedModels(): Record<VoyageRerankerModel, { maxQueryTokens: number; maxDocQueryTokens: number; description: string }> {
        return {
            'rerank-2.5': {
                maxQueryTokens: 8000,
                maxDocQueryTokens: 32000,
                description: 'Best quality reranker'
            },
            'rerank-2.5-lite': {
                maxQueryTokens: 8000,
                maxDocQueryTokens: 32000,
                description: 'Fast and cost-effective reranker (recommended)'
            },
            'rerank-2': {
                maxQueryTokens: 4000,
                maxDocQueryTokens: 16000,
                description: 'Previous generation reranker'
            },
            'rerank-2-lite': {
                maxQueryTokens: 2000,
                maxDocQueryTokens: 8000,
                description: 'Previous generation lite reranker'
            }
        };
    }
}

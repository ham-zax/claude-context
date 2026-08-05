export interface RerankResult {
    index: number;
    relevanceScore: number;
    document?: string;
}

export interface RerankerIdentity {
    provider: string;
    model: string;
    profile: string;
}

export interface RerankOptions {
    topK?: number;
    returnDocuments?: boolean;
    truncation?: boolean;
    /**
     * Stable candidate identities used only for deterministic score ties.
     * Providers that already return a complete order may ignore this field.
     */
    identities?: readonly string[];
    /** Cancels queued or executing provider work. Providers must not return partial results. */
    signal?: AbortSignal;
    /**
     * Bounded execution telemetry reported once per rerank() call on
     * successful completion or terminal provider failure, so callers can
     * count retries that were hidden by a later successful attempt. Not
     * reported for caller cancellation, and must never throw: a throwing
     * callback is ignored so telemetry cannot alter ranking behavior.
     */
    onExecutionDiagnostics?: (diagnostics: {
        attempts: number;
        retries: number;
        timeouts: number;
    }) => void;
}

export interface Reranker {
    getIdentity(): Readonly<RerankerIdentity>;
    rerank(
        query: string,
        documents: string[],
        options?: RerankOptions,
    ): Promise<RerankResult[]>;
    /** Provider-qualified upper bound for one request. */
    getMaxDocuments?(): number | undefined;
    /** Identity-bearing document projection required by this provider profile. */
    getDocumentProjectionVersion?(): string | undefined;
    close?(): Promise<void>;
}

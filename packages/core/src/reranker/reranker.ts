export interface RerankResult {
    index: number;
    relevanceScore: number;
    document?: string;
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
}

export interface Reranker {
    rerank(
        query: string,
        documents: string[],
        options?: RerankOptions,
    ): Promise<RerankResult[]>;
    /** Provider-qualified upper bound for one request. */
    getMaxDocuments?(): number | undefined;
    close?(): Promise<void>;
}

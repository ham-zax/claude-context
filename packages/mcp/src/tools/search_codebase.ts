import { z } from "zod";
import { McpTool, ToolContext, ToolResponse, formatZodError } from "./types.js";
import { emitSearchTelemetry } from "../telemetry/search.js";

interface SearchDiagnostics {
    resultsBeforeFilter: number;
    resultsAfterFilter: number;
    excludedByIgnore: number;
    resultsReturned: number;
}

function getProfile(ctx: ToolContext): string {
    const locality = ctx.capabilities.getEmbeddingLocality();
    const profile = ctx.capabilities.getPerformanceProfile();
    return `${locality}_${profile}`;
}

function getErrorMessage(response: ToolResponse): string {
    const text = response.content?.[0]?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
        return text;
    }
    return 'Unknown error';
}

function safeNumber(value: unknown, fallback = 0): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return value;
}

function extractDiagnostics(response: ToolResponse): SearchDiagnostics {
    const fallback: SearchDiagnostics = {
        resultsBeforeFilter: 0,
        resultsAfterFilter: 0,
        excludedByIgnore: 0,
        resultsReturned: 0,
    };

    const metaDiagnostics = (response as any)?.meta?.searchDiagnostics;
    if (metaDiagnostics && typeof metaDiagnostics === 'object') {
        const afterFilter = safeNumber(metaDiagnostics.resultsAfterFilter, 0);
        return {
            resultsBeforeFilter: safeNumber(metaDiagnostics.resultsBeforeFilter, afterFilter),
            resultsAfterFilter: afterFilter,
            excludedByIgnore: safeNumber(metaDiagnostics.excludedByIgnore, 0),
            resultsReturned: afterFilter,
        };
    }

    const text = response.content?.[0]?.text;
    if (typeof text !== 'string') {
        return fallback;
    }

    try {
        const parsed = JSON.parse(text);
        const resultCount = safeNumber(parsed.resultCount, 0);
        return {
            resultsBeforeFilter: safeNumber(parsed.resultsBeforeFilter, resultCount),
            resultsAfterFilter: safeNumber(parsed.resultsAfterFilter, resultCount),
            excludedByIgnore: safeNumber(parsed.excludedByIgnore, 0),
            resultsReturned: resultCount,
        };
    } catch {
        // fall through
    }

    const match = text.match(/Found\s+(\d+)\s+results/i);
    const resultsReturned = match ? parseInt(match[1], 10) : 0;

    return {
        resultsBeforeFilter: resultsReturned,
        resultsAfterFilter: resultsReturned,
        excludedByIgnore: 0,
        resultsReturned,
    };
}

const buildSearchSchema = (ctx: ToolContext) => z.object({
    path: z.string().min(1).describe("ABSOLUTE path to an indexed codebase or subdirectory."),
    query: z.string().min(1).describe("Natural-language query."),
    limit: z.number().int().positive().max(ctx.capabilities.getMaxSearchLimit()).default(ctx.capabilities.getDefaultSearchLimit()).optional().describe("Maximum results to return."),
    extensionFilter: z.array(z.string()).default([]).optional().describe("Optional file-extension filter (e.g. ['.ts','.py'])."),
    useIgnoreFiles: z.boolean().default(true).optional().describe("Apply repo ignore files at search-time."),
    excludePatterns: z.array(z.string()).default([]).optional().describe("Optional query-time exclude patterns."),
    returnRaw: z.boolean().default(false).optional().describe("Return machine-readable JSON results."),
    showScores: z.boolean().default(false).optional().describe("Include similarity scores in formatted output."),
    useReranker: z.boolean().optional().describe("Optional override: true=force rerank, false=disable rerank, omitted=resolver default."),
});

export const searchCodebaseTool: McpTool = {
    name: "search_codebase",
    description: (ctx: ToolContext) => {
        const rerankSupport = ctx.capabilities.hasReranker()
            ? "Reranker is available. If useReranker is omitted, reranking is enabled automatically for fast/standard profiles."
            : "Reranker is not configured. useReranker=true will return a capability error.";

        return `Unified semantic search tool. Supports optional reranking and query-time excludes. ${rerankSupport}`;
    },
    inputSchemaZod: (ctx: ToolContext) => buildSearchSchema(ctx),
    execute: async (args: unknown, ctx: ToolContext) => {
        const schema = buildSearchSchema(ctx);
        const parsed = schema.safeParse(args || {});
        if (!parsed.success) {
            return {
                content: [{
                    type: "text",
                    text: formatZodError("search_codebase", parsed.error)
                }],
                isError: true
            };
        }

        const input = parsed.data;
        const startedAt = Date.now();
        const limit = Math.max(1, Math.min(ctx.capabilities.getMaxSearchLimit(), input.limit ?? ctx.capabilities.getDefaultSearchLimit()));
        const profile = getProfile(ctx);

        const emit = (params: {
            rerankerUsed: boolean;
            diagnostics: SearchDiagnostics;
            error?: string;
        }) => {
            emitSearchTelemetry({
                event: 'search_executed',
                tool_name: 'search_codebase',
                profile,
                query_length: input.query.length,
                limit_requested: limit,
                results_before_filter: params.diagnostics.resultsBeforeFilter,
                results_after_filter: params.diagnostics.resultsAfterFilter,
                results_returned: params.diagnostics.resultsReturned,
                excluded_by_ignore: params.diagnostics.excludedByIgnore,
                reranker_used: params.rerankerUsed,
                latency_ms: Date.now() - startedAt,
                ...(params.error ? { error: params.error } : {})
            });
        };

        if (input.returnRaw === true) {
            const response = await ctx.toolHandlers.handleSearchCode({ ...input, limit, returnRaw: true });
            emit({
                rerankerUsed: false,
                diagnostics: extractDiagnostics(response),
                ...(response.isError ? { error: getErrorMessage(response) } : {})
            });
            return response;
        }

        const rerankDecision = ctx.capabilities.resolveRerankDecision(input.useReranker);
        if (rerankDecision.blockedByMissingCapability) {
            const response: ToolResponse = {
                content: [{
                    type: "text",
                    text: "Error: Reranking is unavailable in this runtime. Remove useReranker=true or configure reranker capability."
                }],
                isError: true
            };
            emit({
                rerankerUsed: false,
                diagnostics: {
                    resultsBeforeFilter: 0,
                    resultsAfterFilter: 0,
                    excludedByIgnore: 0,
                    resultsReturned: 0,
                },
                error: getErrorMessage(response)
            });
            return response;
        }

        if (!rerankDecision.enabled || !ctx.reranker) {
            const response = await ctx.toolHandlers.handleSearchCode({ ...input, limit, returnRaw: false });
            emit({
                rerankerUsed: false,
                diagnostics: extractDiagnostics(response),
                ...(response.isError ? { error: getErrorMessage(response) } : {})
            });
            return response;
        }

        try {
            const initialLimit = Math.max(limit, Math.min(ctx.capabilities.getMaxSearchLimit(), limit * 2));
            const rawSearchResponse = await ctx.toolHandlers.handleSearchCode({
                ...input,
                limit: initialLimit,
                returnRaw: true
            });

            if (rawSearchResponse.isError) {
                emit({
                    rerankerUsed: false,
                    diagnostics: extractDiagnostics(rawSearchResponse),
                    error: getErrorMessage(rawSearchResponse)
                });
                return rawSearchResponse;
            }

            const rawText = rawSearchResponse.content?.[0]?.text;
            if (typeof rawText !== 'string') {
                const response: ToolResponse = {
                    content: [{ type: 'text', text: 'Error: search response is missing expected raw payload.' }],
                    isError: true
                };
                emit({
                    rerankerUsed: false,
                    diagnostics: extractDiagnostics(rawSearchResponse),
                    error: getErrorMessage(response)
                });
                return response;
            }

            let rawData: any;
            try {
                rawData = JSON.parse(rawText);
            } catch {
                const response: ToolResponse = {
                    content: [{ type: 'text', text: 'Error: failed to parse raw search payload.' }],
                    isError: true
                };
                emit({
                    rerankerUsed: false,
                    diagnostics: extractDiagnostics(rawSearchResponse),
                    error: getErrorMessage(response)
                });
                return response;
            }

            const rawDocuments = Array.isArray(rawData.documentsForReranking)
                ? rawData.documentsForReranking
                : [];

            if (rawDocuments.length === 0) {
                const fallbackResponse = await ctx.toolHandlers.handleSearchCode({
                    ...input,
                    limit,
                    returnRaw: false
                });
                emit({
                    rerankerUsed: false,
                    diagnostics: extractDiagnostics(rawSearchResponse),
                    ...(fallbackResponse.isError ? { error: getErrorMessage(fallbackResponse) } : {})
                });
                return fallbackResponse;
            }

            const validDocs = rawDocuments
                .map((doc: string, index: number) => ({ doc, index }))
                .filter((entry: { doc: string; index: number }) => entry.doc && entry.doc.trim().length > 0)
                .slice(0, 100);

            if (validDocs.length === 0) {
                const fallbackResponse = await ctx.toolHandlers.handleSearchCode({
                    ...input,
                    limit,
                    returnRaw: false
                });
                emit({
                    rerankerUsed: false,
                    diagnostics: extractDiagnostics(rawSearchResponse),
                    ...(fallbackResponse.isError ? { error: getErrorMessage(fallbackResponse) } : {})
                });
                return fallbackResponse;
            }

            const reranked = await ctx.reranker.rerank(
                rawData.query || input.query,
                validDocs.map((entry: { doc: string; index: number }) => entry.doc),
                {
                    topK: Math.min(limit, validDocs.length),
                    returnDocuments: true
                }
            );

            const mapped = reranked.map((item, index) => {
                const originalIndex = validDocs[item.index].index;
                const original = rawData.results?.[originalIndex];
                if (!original) {
                    return `${index + 1}. [Relevance: ${item.relevanceScore.toFixed(4)}]\n   (No source metadata available)`;
                }

                const contentPreview = String(original.content || '').slice(0, 2000);
                return `${index + 1}. [Relevance: ${item.relevanceScore.toFixed(4)}] ${original.language}\n` +
                    `   📍 ${original.location}\n` +
                    `   \`\`\`${original.language}\n${contentPreview}${String(original.content || '').length > 2000 ? '...' : ''}\n\`\`\``;
            }).join('\n\n');

            const autoModeNote = input.useReranker === undefined
                ? ' (auto-enabled by capability resolver)'
                : '';

            const response: ToolResponse = {
                content: [{
                    type: 'text',
                    text: `## Search Results\n\n**Query**: "${input.query}"\n**Reranker**: ${ctx.reranker.getModel()}${autoModeNote}\n**Results**: ${reranked.length}\n\n${mapped}`
                }]
            };

            const diagnosticsFromRaw: SearchDiagnostics = {
                resultsBeforeFilter: safeNumber(rawData.resultsBeforeFilter, safeNumber(rawData.resultCount, 0)),
                resultsAfterFilter: safeNumber(rawData.resultsAfterFilter, safeNumber(rawData.resultCount, 0)),
                excludedByIgnore: safeNumber(rawData.excludedByIgnore, 0),
                resultsReturned: reranked.length,
            };

            emit({
                rerankerUsed: true,
                diagnostics: diagnosticsFromRaw,
            });

            return response;
        } catch (error: any) {
            const response: ToolResponse = {
                content: [{
                    type: 'text',
                    text: `Error in search_codebase rerank path: ${error?.message || String(error)}`
                }],
                isError: true
            };
            emit({
                rerankerUsed: true,
                diagnostics: {
                    resultsBeforeFilter: 0,
                    resultsAfterFilter: 0,
                    excludedByIgnore: 0,
                    resultsReturned: 0,
                },
                error: getErrorMessage(response)
            });
            return response;
        }
    }
};

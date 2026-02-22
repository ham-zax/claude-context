#!/usr/bin/env node

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY to avoid interfering with MCP JSON protocol
// Only MCP protocol messages should go to stdout
console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@zokizuan/claude-context-core";
import { MilvusVectorDatabase, VoyageAIReranker } from "@zokizuan/claude-context-core";

import {
    buildRuntimeIndexFingerprint,
    createMcpConfig,
    IndexFingerprint,
    logConfigurationSummary,
    showHelpMessage,
    ContextMcpConfig
} from "./config.js";
import { createEmbeddingInstance, logEmbeddingProviderInfo } from "./embedding.js";
import { SnapshotManager } from "./core/snapshot.js";
import { SyncManager } from "./core/sync.js";
import { ToolHandlers } from "./core/handlers.js";
import { CapabilityResolver } from "./core/capabilities.js";

const SUPPORTED_TOOLS = ["manage_index", "search_codebase", "read_file", "list_codebases"] as const;

class ContextMcpServer {
    private server: Server;
    private context: Context;
    private snapshotManager: SnapshotManager;
    private syncManager: SyncManager;
    private toolHandlers: ToolHandlers;
    private reranker: VoyageAIReranker | null = null;
    private config: ContextMcpConfig;
    private capabilities: CapabilityResolver;
    private runtimeFingerprint: IndexFingerprint;

    constructor(config: ContextMcpConfig) {
        this.server = new Server(
            {
                name: config.name,
                version: config.version
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        console.log(`[EMBEDDING] Initializing embedding provider: ${config.encoderProvider}`);
        console.log(`[EMBEDDING] Using model: ${config.encoderModel}`);

        const embedding = createEmbeddingInstance(config);
        logEmbeddingProviderInfo(config, embedding);

        this.capabilities = new CapabilityResolver(config);
        this.runtimeFingerprint = buildRuntimeIndexFingerprint(config, embedding.getDimension());
        console.log(`[FINGERPRINT] Runtime index fingerprint: ${JSON.stringify(this.runtimeFingerprint)}`);

        const vectorDatabase = new MilvusVectorDatabase({
            address: config.milvusEndpoint,
            ...(config.milvusApiToken && { token: config.milvusApiToken })
        });

        this.context = new Context({
            embedding,
            vectorDatabase
        });

        this.snapshotManager = new SnapshotManager(this.runtimeFingerprint);
        this.syncManager = new SyncManager(this.context, this.snapshotManager);
        this.toolHandlers = new ToolHandlers(this.context, this.snapshotManager, this.syncManager, this.runtimeFingerprint);
        this.config = config;

        if (this.capabilities.hasReranker()) {
            this.reranker = new VoyageAIReranker({
                apiKey: config.voyageKey as string,
                model: config.rankerModel || 'rerank-2.5'
            });
            console.log(`[RERANKER] VoyageAI Reranker initialized with model: ${config.rankerModel || 'rerank-2.5'}`);
        }

        this.snapshotManager.loadCodebaseSnapshot();

        this.verifyCloudState().catch(err => {
            console.error('[STARTUP] Error verifying cloud state:', err.message);
        });

        this.setupTools();
    }

    /**
     * Verify cloud state and fix interrupted indexing snapshots.
     */
    private async verifyCloudState(): Promise<void> {
        console.log('[STARTUP] 🔍 Verifying cloud state against local snapshot...');

        const vectorDb = this.context.getVectorStore();
        const collections = await vectorDb.listCollections();
        const cloudCodebases = new Set<string>();

        for (const collectionName of collections) {
            if (!collectionName.startsWith('code_chunks_') && !collectionName.startsWith('hybrid_code_chunks_')) {
                continue;
            }

            try {
                const results = await vectorDb.query(collectionName, '', ['metadata'], 1);
                if (results && results.length > 0 && results[0].metadata) {
                    const metadata = JSON.parse(results[0].metadata);
                    if (metadata.codebasePath) {
                        cloudCodebases.add(metadata.codebasePath);
                    }
                }
            } catch {
                // Best-effort startup reconciliation.
            }
        }

        const indexingCodebases = this.snapshotManager.getIndexingCodebases();
        let fixedCount = 0;

        for (const codebasePath of indexingCodebases) {
            if (cloudCodebases.has(codebasePath) || await this.context.hasIndexedCollection(codebasePath)) {
                console.log(`[STARTUP] 🔄 Fixing interrupted indexing: ${codebasePath} -> marked as indexed`);
                const info = this.snapshotManager.getCodebaseInfo(codebasePath) as any;
                this.snapshotManager.setCodebaseIndexed(codebasePath, {
                    indexedFiles: info?.indexedFiles || 0,
                    totalChunks: info?.totalChunks || 0,
                    status: 'completed'
                }, this.runtimeFingerprint, 'verified');
                fixedCount++;
            }
        }

        if (fixedCount > 0) {
            this.snapshotManager.saveCodebaseSnapshot();
            console.log(`[STARTUP] ✅ Fixed ${fixedCount} interrupted indexing state(s)`);
        } else {
            console.log('[STARTUP] ✅ Cloud state matches local snapshot');
        }
    }

    private setupTools() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const rerankSupport = this.capabilities.hasReranker()
                ? 'Reranker is available. If `useReranker` is omitted, reranking is enabled automatically for fast/standard profiles.'
                : 'Reranker is not configured. `useReranker=true` will return a capability error.';

            return {
                tools: [
                    {
                        name: "manage_index",
                        description: `Manage index lifecycle operations (create/sync/status/clear) for a codebase path.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    enum: ["create", "sync", "status", "clear"],
                                    description: "Required operation to run"
                                },
                                path: {
                                    type: "string",
                                    description: "ABSOLUTE path to the target codebase (required for all actions in this version)."
                                },
                                force: {
                                    type: "boolean",
                                    description: "Only for action='create'. Force rebuild from scratch.",
                                    default: false
                                },
                                splitter: {
                                    type: "string",
                                    description: "Only for action='create'. Code splitter: 'ast' or 'langchain'.",
                                    enum: ["ast", "langchain"],
                                    default: "ast"
                                },
                                customExtensions: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Only for action='create'. Additional file extensions to include.",
                                    default: []
                                },
                                ignorePatterns: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Only for action='create'. Additional ignore patterns.",
                                    default: []
                                }
                            },
                            required: ["action", "path"]
                        }
                    },
                    {
                        name: "search_codebase",
                        description: `Unified semantic search tool. Supports optional reranking and query-time excludes. ${rerankSupport}`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "ABSOLUTE path to an indexed codebase (or subdirectory of one)."
                                },
                                query: {
                                    type: "string",
                                    description: "Natural-language query"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum results to return",
                                    default: this.capabilities.getDefaultSearchLimit(),
                                    maximum: this.capabilities.getMaxSearchLimit()
                                },
                                extensionFilter: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Optional file extension filter, e.g. ['.ts', '.py']",
                                    default: []
                                },
                                useIgnoreFiles: {
                                    type: "boolean",
                                    description: "Apply repo ignore files at search-time",
                                    default: true
                                },
                                excludePatterns: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Optional query-time exclude patterns",
                                    default: []
                                },
                                returnRaw: {
                                    type: "boolean",
                                    description: "Return machine-readable JSON results",
                                    default: false
                                },
                                showScores: {
                                    type: "boolean",
                                    description: "Include relevance scores in formatted output",
                                    default: false
                                },
                                useReranker: {
                                    type: "boolean",
                                    description: "Optional override. true=force rerank, false=disable rerank, omitted=resolver default."
                                }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "read_file",
                        description: "Read full content of a file from the local filesystem.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "ABSOLUTE path to file"
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "list_codebases",
                        description: "List tracked codebases and their indexing state.",
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "manage_index":
                    return this.toolHandlers.handleManageIndex(args || {});
                case "search_codebase":
                    return this.handleSearchCodebase(args || {});
                case "read_file":
                    return this.toolHandlers.handleReadCode(args || {});
                case "list_codebases":
                    return this.handleListCodebases();
                default:
                    return {
                        content: [{
                            type: "text",
                            text: `Unknown tool: ${name}. Supported tools: ${SUPPORTED_TOOLS.join(', ')}`
                        }],
                        isError: true
                    };
            }
        });
    }

    private async handleSearchCodebase(args: any) {
        const limitInput = typeof args.limit === 'number' ? args.limit : this.capabilities.getDefaultSearchLimit();
        const maxLimit = this.capabilities.getMaxSearchLimit();
        const limit = Math.max(1, Math.min(maxLimit, limitInput));
        const useReranker = typeof args.useReranker === 'boolean' ? args.useReranker : undefined;

        // Raw mode is primarily for machine-readable debugging/results piping.
        // Keep it deterministic and bypass reranking so schema remains stable.
        if (args.returnRaw === true) {
            return this.toolHandlers.handleSearchCodebase({ ...args, limit });
        }

        const rerankDecision = this.capabilities.resolveRerankDecision(useReranker);
        if (rerankDecision.blockedByMissingCapability) {
            return {
                content: [{
                    type: "text",
                    text: "Error: Reranking is unavailable in this runtime. Remove useReranker=true or configure reranker capability."
                }],
                isError: true
            };
        }

        if (!rerankDecision.enabled || !this.reranker) {
            return this.toolHandlers.handleSearchCodebase({ ...args, limit });
        }

        try {
            const initialLimit = Math.max(limit, Math.min(maxLimit, limit * 2));
            const rawSearchResponse = await this.toolHandlers.handleSearchCodebase({
                ...args,
                limit: initialLimit,
                returnRaw: true
            });

            const rawText = rawSearchResponse.content?.[0]?.text;
            if (rawSearchResponse.isError || typeof rawText !== 'string') {
                return rawSearchResponse;
            }

            const rawData = JSON.parse(rawText);
            const rawDocuments = Array.isArray(rawData.documentsForReranking)
                ? rawData.documentsForReranking
                : [];

            if (rawDocuments.length === 0) {
                return this.toolHandlers.handleSearchCodebase({ ...args, limit });
            }

            const validDocs = rawDocuments
                .map((doc: string, index: number) => ({ doc, index }))
                .filter((entry: { doc: string; index: number }) => entry.doc && entry.doc.trim().length > 0)
                .slice(0, 100);

            if (validDocs.length === 0) {
                return this.toolHandlers.handleSearchCodebase({ ...args, limit });
            }

            const reranked = await this.reranker.rerank(
                rawData.query || args.query,
                validDocs.map((entry: { doc: string; index: number }) => entry.doc),
                {
                    topK: Math.min(limit, validDocs.length),
                    returnDocuments: true
                }
            );

            const mapped = reranked.map((item, i) => {
                const originalIndex = validDocs[item.index].index;
                const original = rawData.results?.[originalIndex];
                if (!original) {
                    return `${i + 1}. [Relevance: ${item.relevanceScore.toFixed(4)}]\n   (No source metadata available)`;
                }

                const contentPreview = String(original.content || '').slice(0, 2000);
                return `${i + 1}. [Relevance: ${item.relevanceScore.toFixed(4)}] ${original.language}\n` +
                    `   📍 ${original.location}\n` +
                    `   \`\`\`${original.language}\n${contentPreview}${String(original.content || '').length > 2000 ? '...' : ''}\n\`\`\``;
            }).join('\n\n');

            const autoModeNote = useReranker === undefined
                ? ' (auto-enabled by capability resolver)'
                : '';

            return {
                content: [{
                    type: "text",
                    text: `## Search Results\n\n**Query**: "${args.query}"\n**Reranker**: ${this.reranker.getModel()}${autoModeNote}\n**Results**: ${reranked.length}\n\n${mapped}`
                }]
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error in search_codebase rerank path: ${error?.message || String(error)}`
                }],
                isError: true
            };
        }
    }

    private async handleListCodebases() {
        const all = this.snapshotManager.getAllCodebases();

        if (all.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "No codebases are currently tracked.\n\nUse manage_index with action='create' to index one."
                }]
            };
        }

        const lines: string[] = [];
        lines.push('## Codebases');
        lines.push('');

        const byStatus = {
            indexed: all.filter((e) => e.info.status === 'indexed' || e.info.status === 'sync_completed'),
            indexing: all.filter((e) => e.info.status === 'indexing'),
            requiresReindex: all.filter((e) => e.info.status === 'requires_reindex'),
            failed: all.filter((e) => e.info.status === 'indexfailed'),
        };

        if (byStatus.indexed.length > 0) {
            lines.push('### ✅ Ready');
            for (const item of byStatus.indexed) {
                lines.push(`- \`${item.path}\``);
            }
            lines.push('');
        }

        if (byStatus.indexing.length > 0) {
            lines.push('### 🔄 Indexing');
            for (const item of byStatus.indexing) {
                const progress = 'indexingPercentage' in item.info ? item.info.indexingPercentage.toFixed(1) : '0.0';
                lines.push(`- \`${item.path}\` (${progress}%)`);
            }
            lines.push('');
        }

        if (byStatus.requiresReindex.length > 0) {
            lines.push('### ⚠️ Requires Reindex');
            for (const item of byStatus.requiresReindex) {
                const reason = 'reindexReason' in item.info && item.info.reindexReason ? item.info.reindexReason : 'unknown';
                lines.push(`- \`${item.path}\` (${reason})`);
            }
            lines.push('');
        }

        if (byStatus.failed.length > 0) {
            lines.push('### ❌ Failed');
            for (const item of byStatus.failed) {
                const reason = 'errorMessage' in item.info ? item.info.errorMessage : 'unknown';
                lines.push(`- \`${item.path}\` (${reason})`);
            }
            lines.push('');
        }

        lines.push(`Total tracked: ${all.length}`);

        return {
            content: [{
                type: "text",
                text: lines.join('\n')
            }]
        };
    }

    async start() {
        console.log('Starting Context MCP server...');

        const transport = new StdioServerTransport();
        await this.server.connect(transport);

        console.log("MCP server started and listening on stdio.");
        this.syncManager.startBackgroundSync();
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        showHelpMessage();
        process.exit(0);
    }

    const config = createMcpConfig();
    logConfigurationSummary(config);

    const server = new ContextMcpServer(config);
    await server.start();
}

process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

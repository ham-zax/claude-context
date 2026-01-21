#!/usr/bin/env node

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY to avoid interfering with MCP JSON protocol
// Only MCP protocol messages should go to stdout
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

// console.error already goes to stderr by default

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@zilliz/claude-context-core";
import { MilvusVectorDatabase } from "@zilliz/claude-context-core";

// Import our modular components
import { createMcpConfig, logConfigurationSummary, showHelpMessage, ContextMcpConfig } from "./config.js";
import { createEmbeddingInstance, logEmbeddingProviderInfo } from "./embedding.js";
import { SnapshotManager } from "./snapshot.js";
import { SyncManager } from "./sync.js";
import { ToolHandlers } from "./handlers.js";
import { VoyageAIReranker } from "@zilliz/claude-context-core";

class ContextMcpServer {
    private server: Server;
    private context: Context;
    private snapshotManager: SnapshotManager;
    private syncManager: SyncManager;
    private toolHandlers: ToolHandlers;
    private reranker: VoyageAIReranker | null = null;
    private config: ContextMcpConfig;

    constructor(config: ContextMcpConfig) {
        // Initialize MCP server
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

        // Initialize embedding provider
        console.log(`[EMBEDDING] Initializing embedding provider: ${config.embeddingProvider}`);
        console.log(`[EMBEDDING] Using model: ${config.embeddingModel}`);

        const embedding = createEmbeddingInstance(config);
        logEmbeddingProviderInfo(config, embedding);

        // Initialize vector database
        const vectorDatabase = new MilvusVectorDatabase({
            address: config.milvusAddress,
            ...(config.milvusToken && { token: config.milvusToken })
        });

        // Initialize Claude Context
        this.context = new Context({
            embedding,
            vectorDatabase
        });

        // Initialize managers
        this.snapshotManager = new SnapshotManager();
        this.syncManager = new SyncManager(this.context, this.snapshotManager);
        this.toolHandlers = new ToolHandlers(this.context, this.snapshotManager);
        this.config = config;

        // Initialize VoyageAI reranker if API key is available
        if (config.voyageaiApiKey) {
            this.reranker = new VoyageAIReranker({
                apiKey: config.voyageaiApiKey,
                model: config.rerankerModel || 'rerank-2.5-lite'
            });
            console.log(`[RERANKER] VoyageAI Reranker initialized with model: ${config.rerankerModel || 'rerank-2.5-lite'}`);
        }

        // Load existing codebase snapshot on startup
        this.snapshotManager.loadCodebaseSnapshot();

        // CRITICAL: Verify cloud state and fix any interrupted indexing states
        // This ensures the snapshot matches reality after unexpected shutdowns
        this.verifyCloudState().catch(err => {
            console.error('[STARTUP] Error verifying cloud state:', err.message);
        });

        this.setupTools();
    }

    /**
     * Verify cloud state and fix any mismatches between local snapshot and cloud index
     * This is called on startup to ensure graceful recovery from interrupted indexing
     */
    private async verifyCloudState(): Promise<void> {
        console.log('[STARTUP] 🔍 Verifying cloud state against local snapshot...');

        // Get the vector database
        const vectorDb = this.context.getVectorDatabase();
        const collections = await vectorDb.listCollections();

        const cloudCodebases = new Set<string>();

        // Build set of codebases that exist in cloud
        for (const collectionName of collections) {
            if (!collectionName.startsWith('code_chunks_') && !collectionName.startsWith('hybrid_code_chunks_')) {
                continue;
            }

            try {
                const results = await vectorDb.query(
                    collectionName,
                    '',
                    ['metadata'],
                    1
                );

                if (results && results.length > 0 && results[0].metadata) {
                    const metadata = JSON.parse(results[0].metadata);
                    if (metadata.codebasePath) {
                        cloudCodebases.add(metadata.codebasePath);
                    }
                }
            } catch (e) {
                // Skip this collection
            }
        }

        // Check each codebase in the snapshot
        const allCodebases = this.snapshotManager.getIndexedCodebases();
        const indexingCodebases = this.snapshotManager.getIndexingCodebases();

        let fixedCount = 0;

        // Fix codebases that are "indexing" but exist in cloud
        for (const codebasePath of indexingCodebases) {
            if (cloudCodebases.has(codebasePath) || await this.context.hasIndex(codebasePath)) {
                console.log(`[STARTUP] 🔄 Fixing interrupted indexing: ${codebasePath} → marked as indexed`);
                const info = this.snapshotManager.getCodebaseInfo(codebasePath);
                this.snapshotManager.setCodebaseIndexed(codebasePath, {
                    indexedFiles: (info as any)?.indexedFiles || 0,
                    totalChunks: (info as any)?.totalChunks || 0,
                    status: 'completed'
                });
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
        const index_description = `
Index a codebase directory to enable semantic search using a configurable code splitter.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path to the target codebase.

🔧 **Tool Selection Guide** (VERY IMPORTANT):
- **First time indexing** → Use this tool (index_codebase)
- **Refresh/update sync** → Use **sync_codebase** tool instead (preferred for "reindex", "refresh", "update index" requests)
- **Force rebuild** → Use force=true only when user explicitly says "force reindex" or "rebuild index from scratch"

💡 **When to use this tool**:
- The codebase has never been indexed before
- You need to start fresh with a completely new index

💡 **When to use sync_codebase instead**:
- The codebase is already indexed and you want to update it with recent changes
- User says "reindex", "refresh", or "update index" (defaults to incremental)
`;


        const search_description = `
Search the indexed codebase using natural language queries within a specified absolute path.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path.

🔧 **Tool Behavior**:
- **If indexed**: Returns search results immediately
- **If indexing in progress**: Returns partial results with a warning that indexing is still running
- **If not indexed**: Returns error telling you to use index_codebase first

🎯 **When to Use**:
This tool is versatile and can be used before completing various tasks to retrieve relevant context:
- **Code search**: Find specific functions, classes, or implementations
- **Context-aware assistance**: Gather relevant code context before making changes
- **Issue identification**: Locate problematic code sections or bugs
- **Code review**: Understand existing implementations and patterns
- **Refactoring**: Find all related code pieces that need to be updated
- **Feature development**: Understand existing architecture and similar implementations

🔄 **Reranking Workflow** (for higher precision):
1. Call search_code with returnRaw=true to get JSON output
2. Extract the 'documentsForReranking' array from the response
3. Pass that array to rerank_results tool with the same query
4. Get results reordered by neural relevance scoring

💡 **Pro Tips**:
- Use returnRaw=true when you plan to rerank results for better precision
- Use extensionFilter to narrow down results by file type (e.g., ['.ts', '.py'])
- Works even while indexing is in progress (returns partial results)
`;

        // Define available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "index_codebase",
                        description: index_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to index.`
                                },
                                force: {
                                    type: "boolean",
                                    description: "Force re-indexing even if already indexed",
                                    default: false
                                },
                                splitter: {
                                    type: "string",
                                    description: "Code splitter to use: 'ast' for syntax-aware splitting with automatic fallback, 'langchain' for character-based splitting",
                                    enum: ["ast", "langchain"],
                                    default: "ast"
                                },
                                customExtensions: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: Additional file extensions to include beyond defaults (e.g., ['.vue', '.svelte', '.astro']). Extensions should include the dot prefix or will be automatically added",
                                    default: []
                                },
                                ignorePatterns: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: Additional ignore patterns to exclude specific files/directories beyond defaults. Only include this parameter if the user explicitly requests custom ignore patterns (e.g., ['static/**', '*.tmp', 'private/**'])",
                                    default: []
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "search_code",
                        description: search_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to search in.`
                                },
                                query: {
                                    type: "string",
                                    description: "Natural language query to search for in the codebase"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return",
                                    default: 10,
                                    maximum: 50
                                },
                                extensionFilter: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: List of file extensions to filter results. (e.g., ['.ts','.py']).",
                                    default: []
                                },
                                returnRaw: {
                                    type: "boolean",
                                    description: "If true, returns raw document array in JSON format (useful for reranking). Default: false",
                                    default: false
                                },
                                showScores: {
                                    type: "boolean",
                                    description: "If true, shows relevance scores (0.00-1.00) in the output. Default: false",
                                    default: false
                                }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "clear_index",
                        description: `Clear the search index. IMPORTANT: You MUST provide an absolute path.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to clear.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "get_indexing_status",
                        description: `Get the current indexing status of a codebase. Shows progress percentage for actively indexing codebases and completion status for indexed codebases. Also shows last sync result with changes detected.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to check status for.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "sync_codebase",
                        description: `Manually trigger incremental sync for an indexed codebase. Checks for file changes since last sync and updates the index accordingly. Use this to ensure your index is up-to-date with recent changes.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to sync.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "rerank_results",
                        description: `Rerank search results using VoyageAI's neural reranker for improved relevance precision.

🎯 **When to Use**:
- After search_code when you need the MOST relevant results
- When initial search returns many results and you need to prioritize
- For complex queries where semantic similarity alone isn't enough

🔄 **Workflow**:
1. First call search_code with returnRaw=true, limit=20
2. Parse the JSON response and extract 'documentsForReranking' array
3. Call this tool with: query (same as search), documents (the array), topK (how many to return)
4. Results are reordered by neural relevance score

💡 **Example**:
After search_code returns: { "documentsForReranking": ["code1...", "code2..."] }
Call: rerank_results(query="auth logic", documents=["code1...", "code2..."], topK=5)

⚠️ Requires VOYAGEAI_API_KEY to be configured.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "The original search query (same one used in search_code)"
                                },
                                documents: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Array of document texts from search_code's 'documentsForReranking' field"
                                },
                                topK: {
                                    type: "number",
                                    description: "Number of top results to return after reranking",
                                    default: 5
                                },
                                model: {
                                    type: "string",
                                    enum: ["rerank-2.5", "rerank-2.5-lite"],
                                    description: "Reranker model: 'rerank-2.5' (best quality) or 'rerank-2.5-lite' (faster)",
                                    default: "rerank-2.5-lite"
                                }
                            },
                            required: ["query", "documents"]
                        }
                    },
                    {
                        name: "list_indexed_codebases",
                        description: `List all indexed codebases that are available for search.

🎯 **When to Use**:
- At the start of a session to discover what codebases are indexed
- When unsure which paths are available for search_code
- To check indexing status of multiple codebases

📋 **Returns**:
- List of all indexed codebase paths with their status
- Indexing progress for codebases currently being indexed
- Last sync/index timestamp for each codebase

💡 **Tip**: Use this before search_code to know which paths are valid.`,
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: "search_and_rerank",
                        description: `Search and rerank in ONE call - best for high-precision code search.

🎯 **When to Use**:
- When you need the MOST relevant code results
- For complex queries where you want neural reranking automatically
- To simplify workflow (combines search_code + rerank_results)

⚡ **How it works**:
1. Searches the codebase with your query
2. Automatically reranks results using VoyageAI neural reranker
3. Returns top results ordered by neural relevance score

📋 **Returns**:
- Reranked code snippets with location and relevance scores
- Higher precision than search_code alone

⚠️ Requires VOYAGEAI_API_KEY for reranking.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "ABSOLUTE path to the codebase directory to search in"
                                },
                                query: {
                                    type: "string",
                                    description: "Natural language query to search for"
                                },
                                limit: {
                                    type: "number",
                                    description: "Number of initial results to fetch before reranking",
                                    default: 20
                                },
                                topK: {
                                    type: "number",
                                    description: "Number of top results to return after reranking",
                                    default: 5
                                },
                                extensionFilter: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Optional: List of file extensions to filter (e.g., ['.ts', '.py'])",
                                    default: []
                                }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "read_file",
                        description: `Read the full content of a file from the local filesystem.
                        
🎯 **When to Use**:
- After search_code returns a snippet and you need the full context
- To read a file at a specific path provided by search results
- To inspect code implementation details

⚠️ **Constraints**:
- Path must be absolute
- Use this when 'search_code' truncation prevents seeing full logic`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "ABSOLUTE path to the file to read."
                                }
                            },
                            required: ["path"]
                        }
                    }
                ]
            };
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "index_codebase":
                    return await this.toolHandlers.handleIndexCodebase(args);
                case "search_code":
                    return await this.toolHandlers.handleSearchCode(args);
                case "clear_index":
                    return await this.toolHandlers.handleClearIndex(args);
                case "get_indexing_status":
                    return await this.toolHandlers.handleGetIndexingStatus(args);
                case "sync_codebase":
                    return await this.toolHandlers.handleSyncCodebase(args);
                case "rerank_results":
                    return await this.handleRerankResults(args);
                case "list_indexed_codebases":
                    return await this.handleListIndexedCodebases();
                case "search_and_rerank":
                    return await this.handleSearchAndRerank(args);
                case "read_file":
                    return await this.toolHandlers.handleReadCode(args);

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    private async handleSearchAndRerank(args: any) {
        const { path: codebasePath, query, limit = 20, topK = 5, extensionFilter } = args;

        // Check if reranker is available
        if (!this.reranker) {
            return {
                content: [{
                    type: "text",
                    text: "Error: VoyageAI Reranker not configured. Please set VOYAGEAI_API_KEY environment variable."
                }],
                isError: true
            };
        }

        try {
            // Step 1: Search with returnRaw
            const searchResult = await this.toolHandlers.handleSearchCode({
                path: codebasePath,
                query,
                limit,
                extensionFilter,
                returnRaw: true
            });

            // Parse the search result
            const searchContent = searchResult.content?.[0]?.text;
            if (searchResult.isError || !searchContent) {
                return searchResult; // Return error as-is
            }

            const searchData = JSON.parse(searchContent);

            if (!searchData.documentsForReranking || searchData.documentsForReranking.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `No results found for query: "${query}" in codebase '${codebasePath}'`
                    }]
                };
            }

            // Filter out empty documents BUT keep track of original indices
            const validDocuments = searchData.documentsForReranking
                .map((doc: string, index: number) => ({ doc, index }))
                .filter((item: any) => item.doc && item.doc.trim().length > 0);

            if (validDocuments.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Results found but all documents were empty. Query: "${query}" in codebase '${codebasePath}'`
                    }]
                };
            }

            // Extract just the document strings for the API
            let docsToRerank = validDocuments.map((item: any) => item.doc);

            // Cap at 100 documents to prevent VoyageAI API errors
            if (docsToRerank.length > 100) {
                docsToRerank = docsToRerank.slice(0, 100);
            }

            // Step 2: Rerank the results
            const rerankedResults = await this.reranker.rerank(
                query,
                docsToRerank,
                { topK: Math.min(topK, docsToRerank.length), returnDocuments: true }
            );

            // Step 3: Map reranked results back to original search results using the preserved index
            const formattedResults = rerankedResults.map((r, i) => {
                // r.index is the index in docsToRerank, so we first find the original index
                const originalIndex = validDocuments[r.index].index;
                const originalResult = searchData.results[originalIndex];

                return `${i + 1}. [Relevance: ${r.relevanceScore.toFixed(4)}] ${originalResult.language}\n` +
                    `   📍 ${originalResult.location}\n` +
                    `   \`\`\`${originalResult.language}\n${originalResult.content.substring(0, 2000)}${originalResult.content.length > 2000 ? '...' : ''}\n\`\`\`\n`;
            }).join('\n');

            return {
                content: [{
                    type: "text",
                    text: `## Search + Rerank Results\n\n**Query**: "${query}"\n**Model**: ${this.reranker.getModel()}\n**Results**: ${rerankedResults.length} (from ${searchData.resultCount} initial matches)\n\n${formattedResults}`
                }]
            };

        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `Error in search_and_rerank: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    private async handleListIndexedCodebases() {
        const indexedCodebases = this.snapshotManager.getIndexedCodebases();
        const indexingCodebases = this.snapshotManager.getIndexingCodebases();

        if (indexedCodebases.length === 0 && indexingCodebases.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "No codebases are currently indexed.\n\n💡 Use index_codebase tool to index a codebase first."
                }]
            };
        }

        let response = "## Indexed Codebases\n\n";

        // List fully indexed codebases
        if (indexedCodebases.length > 0) {
            response += "### ✅ Ready for Search\n";
            for (const codebasePath of indexedCodebases) {
                const info = this.snapshotManager.getCodebaseInfo(codebasePath);
                const lastUpdated = info?.lastUpdated ? new Date(info.lastUpdated).toLocaleString() : 'Unknown';
                response += `- \`${codebasePath}\`\n  Last updated: ${lastUpdated}\n`;
            }
        }

        // List codebases being indexed
        if (indexingCodebases.length > 0) {
            response += "\n### 🔄 Currently Indexing\n";
            for (const codebasePath of indexingCodebases) {
                const progress = this.snapshotManager.getIndexingProgress(codebasePath) || 0;
                response += `- \`${codebasePath}\` (${progress.toFixed(1)}% complete)\n`;
            }
        }

        response += `\n**Total**: ${indexedCodebases.length} indexed, ${indexingCodebases.length} indexing`;

        return {
            content: [{
                type: "text",
                text: response
            }]
        };
    }

    private async handleRerankResults(args: any) {
        const { query, documents, topK = 5, model } = args;

        if (!this.reranker) {
            return {
                content: [{
                    type: "text",
                    text: "Error: VoyageAI Reranker not configured. Please set VOYAGEAI_API_KEY environment variable."
                }],
                isError: true
            };
        }

        if (!query || !documents || !Array.isArray(documents) || documents.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "Error: Both 'query' and 'documents' (non-empty array) are required."
                }],
                isError: true
            };
        }

        try {
            // Set model if specified
            if (model) {
                this.reranker.setModel(model);
            }

            // Filter out empty documents BUT keep track of original indices to return correct result
            const validDocuments = documents
                .map((doc: string, index: number) => ({ doc, index }))
                .filter((item: any) => item.doc && item.doc.trim().length > 0);

            if (validDocuments.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Results found but all documents were empty.`
                    }]
                };
            }

            // Extract just the document strings for the API
            let docsToRerank = validDocuments.map((item: any) => item.doc);

            // Cap at 100 documents to prevent VoyageAI API errors
            if (docsToRerank.length > 100) {
                docsToRerank = docsToRerank.slice(0, 100);
            }

            // Call reranker
            const results = await this.reranker.rerank(query, docsToRerank, {
                topK: Math.min(topK, docsToRerank.length),
                returnDocuments: true
            });

            // Map results back to original structure
            const mappedResults = results.map(r => ({
                ...r,
                index: validDocuments[r.index].index // Restore original index
            }));

            // Format for display if called directly
            const formattedResults = mappedResults.map((r, i) =>
                `${i + 1}. [Score: ${r.relevanceScore.toFixed(4)}] ${r.document?.substring(0, 200)}...`
            ).join('\n\n');

            return {
                content: [{
                    type: "text",
                    text: `## Reranked Results (${results.length} items)\n\nUsing model: ${this.reranker.getModel()}\n\n${formattedResults}`
                }]
            };

        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `Error reranking results: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    async start() {
        console.log('[SYNC-DEBUG] MCP server start() method called');
        console.log('Starting Context MCP server...');

        const transport = new StdioServerTransport();
        console.log('[SYNC-DEBUG] StdioServerTransport created, attempting server connection...');

        await this.server.connect(transport);
        console.log("MCP server started and listening on stdio.");
        console.log('[SYNC-DEBUG] Server connection established successfully');

        // Start background sync after server is connected
        console.log('[SYNC-DEBUG] Initializing background sync...');
        this.syncManager.startBackgroundSync();
        console.log('[SYNC-DEBUG] MCP server initialization complete');
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
        showHelpMessage();
        process.exit(0);
    }

    // Create configuration
    const config = createMcpConfig();
    logConfigurationSummary(config);

    const server = new ContextMcpServer(config);
    await server.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

// Always start the server - this is designed to be the main entry point
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

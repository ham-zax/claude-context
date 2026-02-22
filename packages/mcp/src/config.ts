import { envManager } from "@zokizuan/claude-context-core";

export interface ContextMcpConfig {
    name: string;
    version: string;
    // Embedding provider configuration
    encoderProvider: 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama';
    encoderModel: string;
    encoderOutputDimension?: number;  // For VoyageAI: 256, 512, 1024, 2048
    // Provider-specific API keys
    openaiKey?: string;
    openaiEndpoint?: string;
    voyageKey?: string;
    geminiKey?: string;
    geminiEndpoint?: string;
    // Ollama configuration
    ollamaEncoderModel?: string;
    ollamaEndpoint?: string;
    // Vector database configuration
    milvusEndpoint?: string; // Optional, can be auto-resolved from token
    milvusApiToken?: string;
    // Reranker configuration
    rankerModel?: 'rerank-2.5' | 'rerank-2.5-lite' | 'rerank-2' | 'rerank-2-lite';
}

// Legacy format (v1) - for backward compatibility
export interface CodebaseSnapshotV1 {
    indexedCodebases: string[];
    indexingCodebases: string[] | Record<string, number>;  // Array (legacy) or Map of codebase path to progress percentage
    lastUpdated: string;
}

// New format (v2) - structured with codebase information

// Base interface for common fields
interface CodebaseInfoBase {
    lastUpdated: string;
}

// Indexing state - when indexing is in progress
export interface CodebaseInfoIndexing extends CodebaseInfoBase {
    status: 'indexing';
    indexingPercentage: number;  // Current progress percentage
}

// Indexed state - when indexing completed successfully
export interface CodebaseInfoIndexed extends CodebaseInfoBase {
    status: 'indexed';
    indexedFiles: number;        // Number of files indexed
    totalChunks: number;         // Total number of chunks generated
    indexStatus: 'completed' | 'limit_reached';  // Status from indexing result
}

// Index failed state - when indexing failed
export interface CodebaseInfoIndexFailed extends CodebaseInfoBase {
    status: 'indexfailed';
    errorMessage: string;        // Error message from the failure
    lastAttemptedPercentage?: number;  // Progress when failure occurred
}

// Sync completed state - when incremental sync completed
export interface CodebaseInfoSyncCompleted extends CodebaseInfoBase {
    status: 'sync_completed';
    added: number;               // Number of new files added
    removed: number;             // Number of files removed
    modified: number;            // Number of files modified
    totalChanges: number;        // Total number of changes
}

// Union type for all codebase information states
export type CodebaseInfo = CodebaseInfoIndexing | CodebaseInfoIndexed | CodebaseInfoIndexFailed | CodebaseInfoSyncCompleted;

export interface CodebaseSnapshotV2 {
    formatVersion: 'v2';
    codebases: Record<string, CodebaseInfo>;  // codebasePath -> CodebaseInfo
    lastUpdated: string;
}

// Union type for all supported formats
export type CodebaseSnapshot = CodebaseSnapshotV1 | CodebaseSnapshotV2;

// Helper function to get default model for each provider
export function getDefaultModelForProvider(provider: string): string {
    switch (provider) {
        case 'OpenAI':
            return 'text-embedding-3-small';
        case 'VoyageAI':
            return 'voyage-code-3';
        case 'Gemini':
            return 'gemini-embedding-001';
        case 'Ollama':
            return 'nomic-embed-text';
        default:
            return 'text-embedding-3-small';
    }
}

// Helper function to get embedding model with provider-specific environment variable priority
export function getEmbeddingModelForProvider(provider: string): string {
    switch (provider) {
        case 'Ollama':
            // For Ollama, prioritize OLLAMA_MODEL over EMBEDDING_MODEL for backward compatibility
            const ollamaEncoderModel = envManager.get('OLLAMA_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            return ollamaEncoderModel;
        case 'OpenAI':
        case 'VoyageAI':
        case 'Gemini':
        default:
            // For all other providers, use EMBEDDING_MODEL or default
            const selectedModel = envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            return selectedModel;
    }
}

export function createMcpConfig(): ContextMcpConfig {
    // Parse output dimension from env var
    const outputDimensionStr = envManager.get('EMBEDDING_OUTPUT_DIMENSION');
    let encoderOutputDimension: number | undefined;
    if (outputDimensionStr) {
        const parsed = parseInt(outputDimensionStr, 10);
        if ([256, 512, 1024, 2048].includes(parsed)) {
            encoderOutputDimension = parsed;
        } else {
            console.warn(`[WARN] Invalid EMBEDDING_OUTPUT_DIMENSION value: ${outputDimensionStr}. Must be 256, 512, 1024, or 2048.`);
        }
    }

    // Parse reranker model from env var
    const rankerModelEnv = envManager.get('VOYAGEAI_RERANKER_MODEL');
    let rankerModel: 'rerank-2.5' | 'rerank-2.5-lite' | 'rerank-2' | 'rerank-2-lite' | undefined;
    if (rankerModelEnv && ['rerank-2.5', 'rerank-2.5-lite', 'rerank-2', 'rerank-2-lite'].includes(rankerModelEnv)) {
        rankerModel = rankerModelEnv as typeof rankerModel;
    }

    const config: ContextMcpConfig = {
        name: envManager.get('MCP_SERVER_NAME') || "Context MCP Server",
        version: envManager.get('MCP_SERVER_VERSION') || "1.0.0",
        // Embedding provider configuration
        encoderProvider: (envManager.get('EMBEDDING_PROVIDER') as 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama') || 'OpenAI',
        encoderModel: getEmbeddingModelForProvider(envManager.get('EMBEDDING_PROVIDER') || 'OpenAI'),
        encoderOutputDimension,
        // Provider-specific API keys
        openaiKey: envManager.get('OPENAI_API_KEY'),
        openaiEndpoint: envManager.get('OPENAI_BASE_URL'),
        voyageKey: envManager.get('VOYAGEAI_API_KEY'),
        geminiKey: envManager.get('GEMINI_API_KEY'),
        geminiEndpoint: envManager.get('GEMINI_BASE_URL'),
        // Ollama configuration
        ollamaEncoderModel: envManager.get('OLLAMA_MODEL'),
        ollamaEndpoint: envManager.get('OLLAMA_HOST'),
        // Vector database configuration - address can be auto-resolved from token
        milvusEndpoint: envManager.get('MILVUS_ADDRESS'), // Optional, can be resolved from token
        milvusApiToken: envManager.get('MILVUS_TOKEN'),
        // Reranker configuration
        rankerModel,
    };

    return config;
}

export function logConfigurationSummary(config: ContextMcpConfig): void {
    // Log configuration summary before starting server
    console.log(`[MCP] 🚀 Starting Context MCP Server`);
    console.log(`[MCP] Configuration Summary:`);
    console.log(`[MCP]   Server: ${config.name} v${config.version}`);
    console.log(`[MCP]   Embedding Provider: ${config.encoderProvider}`);
    console.log(`[MCP]   Embedding Model: ${config.encoderModel}`);
    console.log(`[MCP]   Milvus Address: ${config.milvusEndpoint || (config.milvusApiToken ? '[Auto-resolve from token]' : '[Not configured]')}`);

    // Log provider-specific configuration without exposing sensitive data
    switch (config.encoderProvider) {
        case 'OpenAI':
            console.log(`[MCP]   OpenAI API Key: ${config.openaiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.openaiEndpoint) {
                console.log(`[MCP]   OpenAI Base URL: ${config.openaiEndpoint}`);
            }
            break;
        case 'VoyageAI':
            console.log(`[MCP]   VoyageAI API Key: ${config.voyageKey ? '✅ Configured' : '❌ Missing'}`);
            break;
        case 'Gemini':
            console.log(`[MCP]   Gemini API Key: ${config.geminiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.geminiEndpoint) {
                console.log(`[MCP]   Gemini Base URL: ${config.geminiEndpoint}`);
            }
            break;
        case 'Ollama':
            console.log(`[MCP]   Ollama Host: ${config.ollamaEndpoint || 'http://127.0.0.1:11434'}`);
            console.log(`[MCP]   Ollama Model: ${config.encoderModel}`);
            break;
    }

    console.log(`[MCP] 🔧 Initializing server components...`);
}

export function showHelpMessage(): void {
    console.log(`
Context MCP Server

Usage: npx @zokizuan/claude-context-mcp@latest [options]

Options:
  --help, -h                          Show this help message

Environment Variables:
  MCP_SERVER_NAME         Server name
  MCP_SERVER_VERSION      Server version

  Embedding Provider Configuration:
  EMBEDDING_PROVIDER      Embedding provider: OpenAI, VoyageAI, Gemini, Ollama (default: OpenAI)
  EMBEDDING_MODEL         Embedding model name (works for all providers)

  Provider-specific API Keys:
  OPENAI_API_KEY          OpenAI API key (required for OpenAI provider)
  OPENAI_BASE_URL         OpenAI API base URL (optional, for custom endpoints)
  VOYAGEAI_API_KEY        VoyageAI API key (required for VoyageAI provider)
  GEMINI_API_KEY          Google AI API key (required for Gemini provider)
  GEMINI_BASE_URL         Gemini API base URL (optional, for custom endpoints)

  Ollama Configuration:
  OLLAMA_HOST             Ollama server host (default: http://127.0.0.1:11434)
  OLLAMA_MODEL            Ollama model name (alternative to EMBEDDING_MODEL for Ollama)

  Vector Database Configuration:
  MILVUS_ADDRESS          Milvus address (optional, can be auto-resolved from token)
  MILVUS_TOKEN            Milvus token (optional, used for authentication and address resolution)

Examples:
  # Start MCP server with OpenAI (default) and explicit Milvus address
  OPENAI_API_KEY=sk-xxx MILVUS_ADDRESS=localhost:19530 npx @zokizuan/claude-context-mcp@latest

  # Start MCP server with OpenAI and specific model
  OPENAI_API_KEY=sk-xxx EMBEDDING_MODEL=text-embedding-3-large MILVUS_TOKEN=your-token npx @zokizuan/claude-context-mcp@latest

  # Start MCP server with VoyageAI and specific model
  EMBEDDING_PROVIDER=VoyageAI VOYAGEAI_API_KEY=pa-xxx EMBEDDING_MODEL=voyage-3-large MILVUS_TOKEN=your-token npx @zokizuan/claude-context-mcp@latest

  # Start MCP server with Gemini and specific model
  EMBEDDING_PROVIDER=Gemini GEMINI_API_KEY=xxx EMBEDDING_MODEL=gemini-embedding-001 MILVUS_TOKEN=your-token npx @zokizuan/claude-context-mcp@latest

  # Start MCP server with Ollama and specific model (using OLLAMA_MODEL)
  EMBEDDING_PROVIDER=Ollama OLLAMA_MODEL=mxbai-embed-large MILVUS_TOKEN=your-token npx @zokizuan/claude-context-mcp@latest

  # Start MCP server with Ollama and specific model (using EMBEDDING_MODEL)
  EMBEDDING_PROVIDER=Ollama EMBEDDING_MODEL=nomic-embed-text MILVUS_TOKEN=your-token npx @zokizuan/claude-context-mcp@latest
        `);
}

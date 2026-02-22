import { z } from "zod";
import { Context, VoyageAIReranker } from "@zokizuan/claude-context-core";
import { CapabilityResolver } from "../core/capabilities.js";
import { SnapshotManager } from "../core/snapshot.js";
import { SyncManager } from "../core/sync.js";
import { IndexFingerprint } from "../config.js";
import { ToolHandlers } from "../core/handlers.js";

export interface ToolResponse {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
    [key: string]: unknown;
}

export interface ToolContext {
    context: Context;
    snapshotManager: SnapshotManager;
    syncManager: SyncManager;
    capabilities: CapabilityResolver;
    reranker: VoyageAIReranker | null;
    runtimeFingerprint: IndexFingerprint;
    toolHandlers: ToolHandlers;
    readFileMaxLines: number;
}

export interface McpTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
    name: string;
    description: (ctx: ToolContext) => string;
    inputSchemaZod: (ctx: ToolContext) => TSchema;
    execute: (args: unknown, ctx: ToolContext) => Promise<ToolResponse>;
}

export function formatZodError(toolName: string, error: z.ZodError): string {
    const issues = error.issues.map((issue) => {
        const key = issue.path.length > 0 ? issue.path.join('.') : 'input';
        return `${key}: ${issue.message}`;
    });

    return `Error: Invalid arguments for '${toolName}'. ${issues.join('; ')}`;
}

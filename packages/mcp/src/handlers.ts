import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { Context, COLLECTION_LIMIT_MESSAGE } from "@zokizuan/claude-context-core";
import { SnapshotManager } from "./snapshot.js";
import { ensureAbsolutePath, truncateContent, trackCodebasePath } from "./utils.js";
import { SyncManager } from "./sync.js";

export class ToolHandlers {
    private context: Context;
    private snapshotManager: SnapshotManager;
    private syncManager: SyncManager;
    private indexingStats: { indexedFiles: number; totalChunks: number } | null = null;
    private currentWorkspace: string;

    constructor(context: Context, snapshotManager: SnapshotManager, syncManager: SyncManager) {
        this.context = context;
        this.snapshotManager = snapshotManager;
        this.syncManager = syncManager;
        this.currentWorkspace = process.cwd();
        console.log(`[WORKSPACE] Current workspace: ${this.currentWorkspace}`);
    }

    private buildExcludePatternsFilterExpr(
        excludePatterns: any,
        effectiveRoot: string,
        absoluteSearchPath: string
    ): { filterExpr?: string; warning?: string } {
        if (!Array.isArray(excludePatterns) || excludePatterns.length === 0) return {};

        const raw = excludePatterns
            .filter((v: any) => typeof v === 'string')
            .map((v: string) => v.trim())
            .filter((v: string) => v.length > 0);
        if (raw.length === 0) return {};

        const unique: string[] = [];
        const seen = new Set<string>();
        for (const p of raw) {
            if (!seen.has(p)) {
                seen.add(p);
                unique.push(p);
            }
        }

        const searchRel = path
            .relative(effectiveRoot, absoluteSearchPath)
            .replace(/\\/g, '/')
            .replace(/^\/+|\/+$/g, '');
        const needsSubdirPrefix = searchRel.length > 0 && effectiveRoot !== absoluteSearchPath;

        const exprs: string[] = [];
        const ignored: string[] = [];
        let usedApproxStar = false;

        const escapeForLikeLiteral = (text: string): string => {
            // Escape LIKE metacharacters in literals.
            // We rely on Milvus supporting backslash escaping.
            return text
                .replace(/\\/g, '\\\\')
                .replace(/%/g, '\\%')
                .replace(/_/g, '\\_');
        };

        const escapeForStringLiteral = (text: string): string => {
            return text
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"');
        };

        const globToLikePatterns = (glob: string, maxVariants: number = 16): string[] => {
            const variants: string[] = [''];
            let i = 0;

            const push = (s: string) => {
                for (let k = 0; k < variants.length; k++) variants[k] += s;
            };

            while (i < glob.length) {
                if (glob.startsWith('**/', i)) {
                    const next: string[] = [];
                    for (const v of variants) {
                        next.push(v + '%/');
                        next.push(v);
                        if (next.length >= maxVariants) break;
                    }
                    variants.length = 0;
                    variants.push(...next.slice(0, maxVariants));
                    i += 3;
                    continue;
                }

                if (glob.startsWith('**', i)) {
                    push('%');
                    i += 2;
                    continue;
                }

                const ch = glob[i];
                if (ch === '*') {
                    usedApproxStar = true;
                    push('%');
                    i += 1;
                    continue;
                }

                if (ch === '?') {
                    push('_');
                    i += 1;
                    continue;
                }

                // Unsupported advanced glob syntax
                if (ch === '[' || ch === ']' || ch === '{' || ch === '}' || ch === '(' || ch === ')' || ch === '|') {
                    return [];
                }

                push(escapeForLikeLiteral(ch));
                i += 1;
            }

            return variants;
        };

        for (const p of unique) {
            let pattern = p.replace(/\\/g, '/');

            // Negation isn't supported at query-time (Milvus can't easily express it safely)
            if (pattern.startsWith('!')) {
                ignored.push(p);
                continue;
            }

            let anchored = false;
            if (pattern.startsWith('/')) {
                anchored = true;
                pattern = pattern.replace(/^\/+/, '');
            }

            pattern = pattern.replace(/^\.\/+/, '');
            pattern = pattern.replace(/^\/+/, '');

            if (pattern.endsWith('/')) {
                pattern = `${pattern}**`;
            }

            pattern = pattern.replace(/^\/+|\/+$/g, '');
            if (pattern.length === 0) {
                ignored.push(p);
                continue;
            }

            // Bare directory name (e.g. 'docs') means 'docs/**'
            if (!/[?*]/.test(pattern) && !pattern.includes('/')) {
                pattern = `${pattern}/**`;
            }

            if (needsSubdirPrefix && !anchored) {
                pattern = `${searchRel}/${pattern}`.replace(/\/+/, '/');
            }

            const likes = globToLikePatterns(pattern);
            if (likes.length === 0) {
                ignored.push(p);
                continue;
            }

            for (const likeRaw of likes) {
                const escaped = escapeForStringLiteral(likeRaw);
                exprs.push(`relativePath like "${escaped}"`);
            }
        }

        if (exprs.length === 0) {
            return {
                warning: ignored.length > 0 ? `Note: excludePatterns ignored (unsupported patterns): ${JSON.stringify(ignored)}.` : undefined
            };
        }

        const notes: string[] = [];
        if (ignored.length > 0) {
            notes.push(`Note: excludePatterns partially applied. Ignored (unsupported patterns): ${JSON.stringify(ignored)}.`);
        }
        if (usedApproxStar) {
            notes.push(`Note: excludePatterns uses Milvus LIKE; '*' may match across directories (use '**/' or anchor with '/' when needed).`);
        }

        return {
            filterExpr: `not (${exprs.join(' or ')})`,
            warning: notes.length > 0 ? notes.join(' ') : undefined
        };
    }

    /**
     * Sync indexed codebases from Zilliz Cloud collections
     * This method fetches all collections from the vector database,
     * gets the first document from each collection to extract codebasePath from metadata,
     * and updates the snapshot with discovered codebases.
     *
     * Logic: Compare mcp-codebase-snapshot.json with zilliz cloud collections
     * - If local snapshot has extra directories (not in cloud), remove them
     * - If local snapshot is missing directories (exist in cloud), ignore them
     */
    private async syncIndexedCodebasesFromCloud(): Promise<void> {
        try {
            console.log(`[SYNC-CLOUD] 🔄 Syncing indexed codebases from Zilliz Cloud...`);

            // Get all collections using the interface method
            const vectorDb = this.context.getVectorDatabase();

            // Use the new listCollections method from the interface
            const collections = await vectorDb.listCollections();

            console.log(`[SYNC-CLOUD] 📋 Found ${collections.length} collections in Zilliz Cloud`);

            if (collections.length === 0) {
                console.log(`[SYNC-CLOUD] ✅ No collections found in cloud`);
                // If no collections in cloud, remove all local codebases
                const localCodebases = this.snapshotManager.getIndexedCodebases();
                if (localCodebases.length > 0) {
                    console.log(`[SYNC-CLOUD] 🧹 Removing ${localCodebases.length} local codebases as cloud has no collections`);
                    for (const codebasePath of localCodebases) {
                        this.snapshotManager.removeIndexedCodebase(codebasePath);
                        console.log(`[SYNC-CLOUD] ➖ Removed local codebase: ${codebasePath}`);
                    }
                    this.snapshotManager.saveCodebaseSnapshot();
                    console.log(`[SYNC-CLOUD] 💾 Updated snapshot to match empty cloud state`);
                }
                return;
            }

            const cloudCodebases = new Set<string>();

            // Check each collection for codebase path
            for (const collectionName of collections) {
                try {
                    // Skip collections that don't match the code_chunks pattern (support both legacy and new collections)
                    if (!collectionName.startsWith('code_chunks_') && !collectionName.startsWith('hybrid_code_chunks_')) {
                        console.log(`[SYNC-CLOUD] ⏭️  Skipping non-code collection: ${collectionName}`);
                        continue;
                    }

                    console.log(`[SYNC-CLOUD] 🔍 Checking collection: ${collectionName}`);

                    // Query the first document to get metadata
                    const results = await vectorDb.query(
                        collectionName,
                        '', // Empty filter to get all results
                        ['metadata'], // Only fetch metadata field
                        1 // Only need one result to extract codebasePath
                    );

                    if (results && results.length > 0) {
                        const firstResult = results[0];
                        const metadataStr = firstResult.metadata;

                        if (metadataStr) {
                            try {
                                const metadata = JSON.parse(metadataStr);
                                const codebasePath = metadata.codebasePath;

                                if (codebasePath && typeof codebasePath === 'string') {
                                    console.log(`[SYNC-CLOUD] 📍 Found codebase path: ${codebasePath} in collection: ${collectionName}`);
                                    cloudCodebases.add(codebasePath);
                                } else {
                                    console.warn(`[SYNC-CLOUD] ⚠️  No codebasePath found in metadata for collection: ${collectionName}`);
                                }
                            } catch (parseError) {
                                console.warn(`[SYNC-CLOUD] ⚠️  Failed to parse metadata JSON for collection ${collectionName}:`, parseError);
                            }
                        } else {
                            console.warn(`[SYNC-CLOUD] ⚠️  No metadata found in collection: ${collectionName}`);
                        }
                    } else {
                        console.log(`[SYNC-CLOUD] ℹ️  Collection ${collectionName} is empty`);
                    }
                } catch (collectionError: any) {
                    console.warn(`[SYNC-CLOUD] ⚠️  Error checking collection ${collectionName}:`, collectionError.message || collectionError);
                    // Continue with next collection
                }
            }

            console.log(`[SYNC-CLOUD] 📊 Found ${cloudCodebases.size} valid codebases in cloud`);

            // Get current local codebases
            const localIndexedCodebases = new Set(this.snapshotManager.getIndexedCodebases());
            console.log(`[SYNC-CLOUD] 📊 Found ${localIndexedCodebases.size} locally indexed codebases in snapshot`);

            // Get codebases that are currently indexing (might have been interrupted)
            const indexingCodebases = this.snapshotManager.getIndexingCodebases();
            console.log(`[SYNC-CLOUD] 📊 Found ${indexingCodebases.length} codebases currently indexing`);

            let hasChanges = false;

            // Remove local codebases that don't exist in cloud
            for (const localCodebase of localIndexedCodebases) {
                if (!cloudCodebases.has(localCodebase)) {
                    this.snapshotManager.removeIndexedCodebase(localCodebase);
                    hasChanges = true;
                    console.log(`[SYNC-CLOUD] ➖ Removed local codebase (not in cloud): ${localCodebase}`);
                }
            }

            // FIX: Mark interrupted indexing codebases as indexed if they exist in cloud
            // This handles the case where indexing was interrupted but cloud index is complete
            for (const codebasePath of indexingCodebases) {
                if (cloudCodebases.has(codebasePath)) {
                    console.log(`[SYNC-CLOUD] 🔄 Marking interrupted indexing codebase as indexed: ${codebasePath}`);
                    // Get the last known stats from the snapshot info
                    const info = this.snapshotManager.getCodebaseInfo(codebasePath);
                    const indexedFiles = (info as any)?.indexedFiles || 0;
                    const totalChunks = (info as any)?.totalChunks || 0;

                    // Mark as indexed with known stats
                    this.snapshotManager.setCodebaseIndexed(codebasePath, {
                        indexedFiles,
                        totalChunks,
                        status: 'completed'
                    });
                    hasChanges = true;
                } else if (await this.context.hasIndex(codebasePath)) {
                    // Double-check with hasIndex method
                    console.log(`[SYNC-CLOUD] 🔄 hasIndex confirms cloud index exists for: ${codebasePath}`);
                    const info = this.snapshotManager.getCodebaseInfo(codebasePath);
                    const indexedFiles = (info as any)?.indexedFiles || 0;
                    const totalChunks = (info as any)?.totalChunks || 0;

                    this.snapshotManager.setCodebaseIndexed(codebasePath, {
                        indexedFiles,
                        totalChunks,
                        status: 'completed'
                    });
                    hasChanges = true;
                }
            }

            // Note: We don't add cloud codebases that are missing locally (as per user requirement)
            console.log(`[SYNC-CLOUD] ℹ️  Skipping addition of cloud codebases not present locally (per sync policy)`);

            if (hasChanges) {
                this.snapshotManager.saveCodebaseSnapshot();
                console.log(`[SYNC-CLOUD] 💾 Updated snapshot to match cloud state`);
            } else {
                console.log(`[SYNC-CLOUD] ✅ Local snapshot already matches cloud state`);
            }

            console.log(`[SYNC-CLOUD] ✅ Cloud sync completed successfully`);
        } catch (error: any) {
            console.error(`[SYNC-CLOUD] ❌ Error syncing codebases from cloud:`, error.message || error);
            // Don't throw - this is not critical for the main functionality
        }
    }

    public async handleIndexCodebase(args: any) {
        const { path: codebasePath, force, splitter, customExtensions, ignorePatterns } = args;
        const forceReindex = force || false;
        const splitterType = splitter || 'ast'; // Default to AST
        const customFileExtensions = customExtensions || [];
        const customIgnorePatterns = ignorePatterns || [];

        try {
            // Sync indexed codebases from cloud first
            await this.syncIndexedCodebasesFromCloud();

            // Validate splitter parameter
            if (splitterType !== 'ast' && splitterType !== 'langchain') {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Invalid splitter type '${splitterType}'. Must be 'ast' or 'langchain'.`
                    }],
                    isError: true
                };
            }
            // Force absolute path resolution - warn if relative path provided
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check if already indexing
            if (this.snapshotManager.getIndexingCodebases().includes(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Codebase '${absolutePath}' is already being indexed in the background. Please wait for completion.`
                    }],
                    isError: true
                };
            }

            //Check if the snapshot and cloud index are in sync
            if (this.snapshotManager.getIndexedCodebases().includes(absolutePath) !== await this.context.hasIndex(absolutePath)) {
                console.warn(`[INDEX-VALIDATION] ❌ Snapshot and cloud index mismatch: ${absolutePath}`);
            }

            // Check if already indexed (unless force is true)
            if (!forceReindex && this.snapshotManager.getIndexedCodebases().includes(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Codebase '${absolutePath}' is already indexed.

To update incrementally with recent changes: Use mcp__claude-context__sync_codebase
To force rebuild from scratch: Use mcp__claude-context__index_codebase with force=true

💡 Tip: sync_codebase is preferred for most "reindex" requests.`
                    }],
                    isError: true
                };
            }

            // If force reindex and codebase is already indexed, remove it
            if (forceReindex) {
                if (this.snapshotManager.getIndexedCodebases().includes(absolutePath)) {
                    console.log(`[FORCE-REINDEX] 🔄 Removing '${absolutePath}' from indexed list for re-indexing`);
                    this.snapshotManager.removeIndexedCodebase(absolutePath);
                }
                if (await this.context.hasIndex(absolutePath)) {
                    console.log(`[FORCE-REINDEX] 🔄 Clearing index for '${absolutePath}'`);
                    await this.context.clearIndex(absolutePath);
                }
            }

            // CRITICAL: Pre-index collection creation validation
            try {
                console.log(`[INDEX-VALIDATION] 🔍 Validating collection creation capability`);
                const canCreateCollection = await this.context.getVectorDatabase().checkCollectionLimit();

                if (!canCreateCollection) {
                    console.error(`[INDEX-VALIDATION] ❌ Collection limit validation failed: ${absolutePath}`);

                    // CRITICAL: Immediately return the COLLECTION_LIMIT_MESSAGE to MCP client
                    return {
                        content: [{
                            type: "text",
                            text: COLLECTION_LIMIT_MESSAGE
                        }],
                        isError: true
                    };
                }

                console.log(`[INDEX-VALIDATION] ✅  Collection creation validation completed`);
            } catch (validationError: any) {
                // Handle other collection creation errors
                console.error(`[INDEX-VALIDATION] ❌ Collection creation validation failed:`, validationError);
                return {
                    content: [{
                        type: "text",
                        text: `Error validating collection creation: ${validationError.message || validationError}`
                    }],
                    isError: true
                };
            }

            // Add custom extensions if provided
            if (customFileExtensions.length > 0) {
                console.log(`[CUSTOM-EXTENSIONS] Adding ${customFileExtensions.length} custom extensions: ${customFileExtensions.join(', ')}`);
                this.context.addCustomExtensions(customFileExtensions);
            }

            // Add custom ignore patterns if provided (before loading file-based patterns)
            if (customIgnorePatterns.length > 0) {
                console.log(`[IGNORE-PATTERNS] Adding ${customIgnorePatterns.length} custom ignore patterns: ${customIgnorePatterns.join(', ')}`);
                this.context.addCustomIgnorePatterns(customIgnorePatterns);
            }

            // Check current status and log if retrying after failure
            const currentStatus = this.snapshotManager.getCodebaseStatus(absolutePath);
            if (currentStatus === 'indexfailed') {
                const failedInfo = this.snapshotManager.getCodebaseInfo(absolutePath) as any;
                console.log(`[BACKGROUND-INDEX] Retrying indexing for previously failed codebase. Previous error: ${failedInfo?.errorMessage || 'Unknown error'}`);
            }

            // Set to indexing status and save snapshot immediately
            this.snapshotManager.setCodebaseIndexing(absolutePath, 0);
            this.snapshotManager.saveCodebaseSnapshot();

            // Track the codebase path for syncing
            trackCodebasePath(absolutePath);

            // Start background indexing - now safe to proceed
            this.startBackgroundIndexing(absolutePath, forceReindex, splitterType);

            const pathInfo = codebasePath !== absolutePath
                ? `\nNote: Input path '${codebasePath}' was resolved to absolute path '${absolutePath}'`
                : '';

            const extensionInfo = customFileExtensions.length > 0
                ? `\nUsing ${customFileExtensions.length} custom extensions: ${customFileExtensions.join(', ')}`
                : '';

            const ignoreInfo = customIgnorePatterns.length > 0
                ? `\nUsing ${customIgnorePatterns.length} custom ignore patterns: ${customIgnorePatterns.join(', ')}`
                : '';

            return {
                content: [{
                    type: "text",
                    text: `Started background indexing for codebase '${absolutePath}' using ${splitterType.toUpperCase()} splitter.${pathInfo}${extensionInfo}${ignoreInfo}\n\nIndexing is running in the background. You can search the codebase while indexing is in progress, but results may be incomplete until indexing completes.`
                }]
            };

        } catch (error: any) {
            // Enhanced error handling to prevent MCP service crash
            console.error('Error in handleIndexCodebase:', error);

            // Ensure we always return a proper MCP response, never throw
            return {
                content: [{
                    type: "text",
                    text: `Error starting indexing: ${error.message || error}`
                }],
                isError: true
            };
        }
    }

    private async startBackgroundIndexing(codebasePath: string, forceReindex: boolean, splitterType: string) {
        const absolutePath = codebasePath;
        let lastSaveTime = 0; // Track last save timestamp

        try {
            console.log(`[BACKGROUND-INDEX] Starting background indexing for: ${absolutePath}`);

            // Note: If force reindex, collection was already cleared during validation phase
            if (forceReindex) {
                console.log(`[BACKGROUND-INDEX] ℹ️  Force reindex mode - collection was already cleared during validation`);
            }

            // Use the existing Context instance for indexing.
            let contextForThisTask = this.context;
            if (splitterType !== 'ast') {
                console.warn(`[BACKGROUND-INDEX] Non-AST splitter '${splitterType}' requested; falling back to AST splitter`);
            }

            // Load ignore patterns from files first (including .ignore, .gitignore, etc.)
            await this.context.getLoadedIgnorePatterns(absolutePath);

            // Initialize file synchronizer with proper ignore patterns (including project-specific patterns)
            const { FileSynchronizer } = await import("@zokizuan/claude-context-core");
            const ignorePatterns = this.context.getIgnorePatterns() || [];
            console.log(`[BACKGROUND-INDEX] Using ignore patterns: ${ignorePatterns.join(', ')}`);
            const synchronizer = new FileSynchronizer(absolutePath, ignorePatterns);
            await synchronizer.initialize();

            // Store synchronizer in the context (let context manage collection names)
            await this.context.getPreparedCollection(absolutePath);
            const collectionName = this.context.getCollectionName(absolutePath);
            this.context.setSynchronizer(collectionName, synchronizer);
            if (contextForThisTask !== this.context) {
                contextForThisTask.setSynchronizer(collectionName, synchronizer);
            }

            console.log(`[BACKGROUND-INDEX] Starting indexing with ${splitterType} splitter for: ${absolutePath}`);

            // Log embedding provider information before indexing
            const embeddingProvider = this.context.getEmbedding();
            console.log(`[BACKGROUND-INDEX] 🧠 Using embedding provider: ${embeddingProvider.getProvider()} with dimension: ${embeddingProvider.getDimension()}`);

            // Start indexing with the appropriate context and progress tracking
            console.log(`[BACKGROUND-INDEX] 🚀 Beginning codebase indexing process...`);
            const stats = await contextForThisTask.indexCodebase(absolutePath, (progress) => {
                // Update progress in snapshot manager using new method
                this.snapshotManager.setCodebaseIndexing(absolutePath, progress.percentage);

                // Save snapshot periodically (every 2 seconds to avoid too frequent saves)
                const currentTime = Date.now();
                if (currentTime - lastSaveTime >= 2000) { // 2 seconds = 2000ms
                    this.snapshotManager.saveCodebaseSnapshot();
                    lastSaveTime = currentTime;
                    console.log(`[BACKGROUND-INDEX] 💾 Saved progress snapshot at ${progress.percentage.toFixed(1)}%`);
                }

                console.log(`[BACKGROUND-INDEX] Progress: ${progress.phase} - ${progress.percentage}% (${progress.current}/${progress.total})`);
            });
            console.log(`[BACKGROUND-INDEX] ✅ Indexing completed successfully! Files: ${stats.indexedFiles}, Chunks: ${stats.totalChunks}`);

            // Set codebase to indexed status with complete statistics
            this.snapshotManager.setCodebaseIndexed(absolutePath, stats);
            this.indexingStats = { indexedFiles: stats.indexedFiles, totalChunks: stats.totalChunks };

            // Save snapshot after updating codebase lists
            this.snapshotManager.saveCodebaseSnapshot();

            let message = `Background indexing completed for '${absolutePath}' using ${splitterType.toUpperCase()} splitter.\nIndexed ${stats.indexedFiles} files, ${stats.totalChunks} chunks.`;
            if (stats.status === 'limit_reached') {
                message += `\n⚠️  Warning: Indexing stopped because the chunk limit (450,000) was reached. The index may be incomplete.`;
            }

            console.log(`[BACKGROUND-INDEX] ${message}`);

        } catch (error: any) {
            console.error(`[BACKGROUND-INDEX] Error during indexing for ${absolutePath}:`, error);

            // Get the last attempted progress
            const lastProgress = this.snapshotManager.getIndexingProgress(absolutePath);

            // Set codebase to failed status with error information
            const errorMessage = error.message || String(error);
            this.snapshotManager.setCodebaseIndexFailed(absolutePath, errorMessage, lastProgress);
            this.snapshotManager.saveCodebaseSnapshot();

            // Log error but don't crash MCP service - indexing errors are handled gracefully
            console.error(`[BACKGROUND-INDEX] Indexing failed for ${absolutePath}: ${errorMessage}`);
        }
    }

    public async handleSearchCode(args: any) {
        const { path: codebasePath, query, limit = 10, extensionFilter, excludePatterns, returnRaw = false, showScores = false } = args;
        const resultLimit = limit || 10;

        try {
            // Sync indexed codebases from cloud first
            await this.syncIndexedCodebasesFromCloud();

            // Force absolute path resolution - warn if relative path provided
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            trackCodebasePath(absolutePath);

            // Check if this codebase is indexed or being indexed
            // Smart Path Resolution: Check if indexed, or if a parent is indexed
            let effectiveRoot = absolutePath;
            let subdirectoryFilter: string | null = null;

            const isIndexed = this.snapshotManager.getIndexedCodebases().includes(absolutePath);
            const isIndexing = this.snapshotManager.getIndexingCodebases().includes(absolutePath);

            if (!isIndexed && !isIndexing) {
                // Try to find an indexed parent
                const indexedCodebases = this.snapshotManager.getIndexedCodebases();
                const parents = indexedCodebases.filter(root => absolutePath.startsWith(root) && absolutePath !== root);

                if (parents.length > 0) {
                    // Sort by length desc (longest match is closest parent)
                    parents.sort((a: string, b: string) => b.length - a.length);
                    effectiveRoot = parents[0];
                    subdirectoryFilter = absolutePath;
                    console.log(`[SEARCH] Auto-resolved subdirectory '${absolutePath}' to indexed root '${effectiveRoot}'`);
                } else {
                    return {
                        content: [{
                            type: "text",
                            text: `Error: Codebase '${absolutePath}' (or any parent) is not indexed. Please index the root using the index_codebase tool.`
                        }],
                        isError: true
                    };
                }
            }

            // Sync Optimization: Ensure freshness (Smart Sync-on-Read)
            // This handles the "call 5 tools, only 1 syncs" requirement via coalescing
            await this.syncManager.ensureFreshness(effectiveRoot, 3 * 60 * 1000); // 3 minute threshold matching auto-sync

            // Show indexing status if codebase is being indexed
            let indexingStatusMessage = '';
            if (isIndexing) {
                indexingStatusMessage = `\n⚠️  **Indexing in Progress**: This codebase is currently being indexed in the background. Search results may be incomplete until indexing completes.`;
            }

            console.log(`[SEARCH] Searching in codebase: ${absolutePath}`);
            console.log(`[SEARCH] Query: "${query}"`);
            console.log(`[SEARCH] Indexing status: ${isIndexing ? 'In Progress' : 'Completed'}`);

            // Log embedding provider information before search
            const embeddingProvider = this.context.getEmbedding();
            console.log(`[SEARCH] 🧠 Using embedding provider: ${embeddingProvider.getProvider()} for search`);
            console.log(`[SEARCH] 🔍 Generating embeddings for query using ${embeddingProvider.getProvider()}...`);

            // Build filter expression from extensionFilter list
            let filterExpr: string | undefined = undefined;
            if (Array.isArray(extensionFilter) && extensionFilter.length > 0) {
                const cleaned = extensionFilter
                    .filter((v: any) => typeof v === 'string')
                    .map((v: string) => v.trim())
                    .filter((v: string) => v.length > 0);
                const invalid = cleaned.filter((e: string) => !(e.startsWith('.') && e.length > 1 && !/\s/.test(e)));
                if (invalid.length > 0) {
                    return {
                        content: [{ type: 'text', text: `Error: Invalid file extensions in extensionFilter: ${JSON.stringify(invalid)}. Use proper extensions like '.ts', '.py'.` }],
                        isError: true
                    };
                }
                const quoted = cleaned.map((e: string) => `'${e}'`).join(', ');
                filterExpr = `fileExtension in [${quoted}]`;
            }

            // Add query-time excludes (even if already indexed)
            const excludeBuilt = this.buildExcludePatternsFilterExpr(excludePatterns, effectiveRoot, absolutePath);
            if (excludeBuilt.filterExpr) {
                filterExpr = filterExpr
                    ? `(${filterExpr}) and (${excludeBuilt.filterExpr})`
                    : excludeBuilt.filterExpr;
            }

            // Search in the specified codebase (or resolved parent)
            let searchResults = await this.context.semanticSearch(
                effectiveRoot,
                query,
                Math.min(resultLimit, 50),
                0.3,
                filterExpr
            );

            // Filter by subdirectory if auto-resolved
            if (subdirectoryFilter) {
                const relativeFilter = path.relative(effectiveRoot, subdirectoryFilter).replace(/\\/g, '/');
                const originalCount = searchResults.length;

                searchResults = searchResults.filter((r: any) => {
                    const normalizedPath = r.relativePath.replace(/\\/g, '/');
                    return normalizedPath.startsWith(relativeFilter);
                });

                console.log(`[SEARCH] Filtered ${originalCount} -> ${searchResults.length} results by subdirectory '${relativeFilter}'`);
            }

            console.log(`[SEARCH] ✅ Search completed! Found ${searchResults.length} results using ${embeddingProvider.getProvider()} embeddings`);

            if (excludeBuilt.warning) {
                console.log(`[SEARCH] ⚠️  ${excludeBuilt.warning}`);
            }

            if (searchResults.length === 0) {
                let noResultsMessage = `No results found for query: "${query}" in codebase '${absolutePath}'`;
                if (isIndexing) {
                    noResultsMessage += `\n\nNote: This codebase is still being indexed. Try searching again after indexing completes, or the query may not match any indexed content.`;
                }
                return {
                    content: [{
                        type: "text",
                        text: noResultsMessage
                    }]
                };
            }

            // If returnRaw is true, return JSON format for reranking
            if (returnRaw) {
                const rawResults = searchResults.map((result: any, index: number) => ({
                    index,
                    location: `${result.relativePath}:${result.startLine}-${result.endLine}`,
                    language: result.language,
                    score: result.score,
                    content: result.content
                }));

                const status = isIndexing ? 'indexing' : 'ready';

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            query,
                            codebasePath: absolutePath,
                            resultCount: searchResults.length,
                            isIndexing,
                            indexingStatus: status,
                            excludePatternsWarning: excludeBuilt.warning,
                            results: rawResults,
                            documentsForReranking: rawResults.map((r: any) => r.content)
                        }, null, 2)
                    }]
                };
            }

            // Optimize: Merge overlapping/adjacent chunks to provide better context
            // This solves the issue of fragmented snippets for large functions
            const mergedResults: any[] = [];
            const processedFiles = new Set<string>();

            // Sort by score to prioritize high relevance, but process by file group
            const sortedByScore = [...searchResults].sort((a: any, b: any) => b.score - a.score);

            for (const result of sortedByScore) {
                if (processedFiles.has(result.relativePath)) continue;

                // Find all relevant chunks for this file from the original search results
                // We want to merge all chunks that are close to each other
                const fileChunks = searchResults.filter((r: any) => r.relativePath === result.relativePath);

                if (fileChunks.length > 1) {
                    // Sort by line number
                    fileChunks.sort((a: any, b: any) => a.startLine - b.startLine);

                    const clusters: any[][] = [];
                    let currentCluster = [fileChunks[0]];

                    for (let i = 1; i < fileChunks.length; i++) {
                        // Merge if within 20 lines (context window)
                        if (fileChunks[i].startLine <= currentCluster[currentCluster.length - 1].endLine + 20) {
                            currentCluster.push(fileChunks[i]);
                        } else {
                            clusters.push(currentCluster);
                            currentCluster = [fileChunks[i]];
                        }
                    }
                    clusters.push(currentCluster);

                    // Create merged result for each cluster
                    for (const cluster of clusters) {
                        const start = cluster[0].startLine;
                        const end = cluster[cluster.length - 1].endLine;
                        const maxScore = Math.max(...cluster.map((c: any) => c.score));

                        let mergedContent = "";
                        try {
                            const filePath = path.join(absolutePath, result.relativePath);
                            if (fs.existsSync(filePath)) {
                                const fileContent = fs.readFileSync(filePath, 'utf-8');
                                const lines = fileContent.split('\n');
                                // Ensure bounds
                                const startIdx = Math.max(0, start - 1);
                                const endIdx = Math.min(lines.length, end);
                                mergedContent = lines.slice(startIdx, endIdx).join('\n');
                            } else {
                                throw new Error("File not found");
                            }
                        } catch (e) {
                            // Fallback to joining snippets with divider
                            mergedContent = cluster.map((c: any) => c.content).join('\n\n... (gap) ...\n\n');
                        }

                        mergedResults.push({
                            ...result, // Keep metadata from primary match
                            startLine: start,
                            endLine: end,
                            content: mergedContent,
                            score: maxScore,
                            isMerged: cluster.length > 1
                        });
                    }
                } else {
                    mergedResults.push(result);
                }

                processedFiles.add(result.relativePath);
            }

            // Re-sort final merged results by score
            mergedResults.sort((a, b) => b.score - a.score);

            // Format results (Use mergedResults instead of searchResults)
            const formattedResults = mergedResults.map((result: any, index: number) => {
                const location = `${result.relativePath}:${result.startLine}-${result.endLine}`;
                const PREVIEW_LIMIT = 4000;
                let context = truncateContent(result.content, PREVIEW_LIMIT);

                // Add explicit hint for agents if content is truncated
                if (context.endsWith('...')) {
                    const fullFilePath = path.join(absolutePath, result.relativePath);
                    // Use forward slashes for cross-platform consistency in agent thought process
                    const cleanPath = fullFilePath.replace(/\\/g, '/');
                    const missingChars = result.content.length - PREVIEW_LIMIT;
                    context += `\n\n(Preview truncated: ${missingChars} more chars. To read full file, call read_file(path='${cleanPath}'))`;
                }

                // Identify exact line matches for query terms
                let matchInfo = "";
                try {
                    const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
                    if (queryTerms.length > 0) {
                        const matches: number[] = [];
                        const lines = result.content.split('\n');
                        lines.forEach((line: string, i: number) => {
                            const lowerLine = line.toLowerCase();
                            if (queryTerms.some((term: string) => lowerLine.includes(term))) {
                                matches.push(result.startLine + i);
                            }
                        });

                        if (matches.length > 0) {
                            // Deduplicate and limit
                            const unique = [...new Set(matches)].sort((a, b) => a - b);
                            const shown = unique.slice(0, 5).join(', ');
                            matchInfo = `\n   Matches at lines: ${shown}${unique.length > 5 ? '...' : ''}`;
                        }
                    }
                } catch (e) {
                    // Ignore matching errors
                }

                const codebaseInfo = path.basename(absolutePath);

                const scoreInfo = showScores ? ` [Score: ${result.score.toFixed(4)}]` : '';

                return `${index + 1}. Code snippet (${result.language}) [${codebaseInfo}]${scoreInfo}\n` +
                    `   Location: ${location}${matchInfo}\n` +
                    `   Rank: ${index + 1}\n` +
                    `   Context: \n\`\`\`${result.language}\n${context}\n\`\`\`\n`;
            }).join('\n');

            let resultMessage = `Found ${searchResults.length} results for query: "${query}" in codebase '${absolutePath}'${indexingStatusMessage}\n\n${formattedResults}`;

            if (excludeBuilt.warning) {
                resultMessage = `${excludeBuilt.warning}\n\n${resultMessage}`;
            }

            if (isIndexing) {
                resultMessage += `\n\n💡 **Tip**: This codebase is still being indexed. More results may become available as indexing progresses.`;
                resultMessage += `\nStatus: 🔄 Indexing in progress`;
            } else {
                resultMessage += `\nStatus: ✅ Indexing complete`;
            }

            return {
                content: [{
                    type: "text",
                    text: resultMessage
                }]
            };
        } catch (error) {
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));

            if (errorMessage === COLLECTION_LIMIT_MESSAGE || errorMessage.includes(COLLECTION_LIMIT_MESSAGE)) {
                return {
                    content: [{
                        type: "text",
                        text: COLLECTION_LIMIT_MESSAGE
                    }]
                };
            }

            return {
                content: [{
                    type: "text",
                    text: `Error searching code: ${errorMessage} Please check if the codebase has been indexed first.`
                }],
                isError: true
            };
        }
    }

    public async handleClearIndex(args: any) {
        const { path: codebasePath } = args;

        if (this.snapshotManager.getIndexedCodebases().length === 0 && this.snapshotManager.getIndexingCodebases().length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "No codebases are currently indexed or being indexed."
                }]
            };
        }

        try {
            // Force absolute path resolution - warn if relative path provided
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check if this codebase is indexed or being indexed
            const isIndexed = this.snapshotManager.getIndexedCodebases().includes(absolutePath);
            const isIndexing = this.snapshotManager.getIndexingCodebases().includes(absolutePath);

            if (!isIndexed && !isIndexing) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Codebase '${absolutePath}' is not indexed or being indexed.`
                    }],
                    isError: true
                };
            }

            console.log(`[CLEAR] Clearing codebase: ${absolutePath}`);

            try {
                await this.context.clearIndex(absolutePath);
                console.log(`[CLEAR] Successfully cleared index for: ${absolutePath}`);
            } catch (error: any) {
                const errorMsg = `Failed to clear ${absolutePath}: ${error.message}`;
                console.error(`[CLEAR] ${errorMsg}`);
                return {
                    content: [{
                        type: "text",
                        text: errorMsg
                    }],
                    isError: true
                };
            }

            // Completely remove the cleared codebase from snapshot
            this.snapshotManager.removeCodebaseCompletely(absolutePath);

            // Reset indexing stats if this was the active codebase
            this.indexingStats = null;

            // Save snapshot after clearing index
            this.snapshotManager.saveCodebaseSnapshot();

            let resultText = `Successfully cleared codebase '${absolutePath}'`;

            const remainingIndexed = this.snapshotManager.getIndexedCodebases().length;
            const remainingIndexing = this.snapshotManager.getIndexingCodebases().length;

            if (remainingIndexed > 0 || remainingIndexing > 0) {
                resultText += `\n${remainingIndexed} other indexed codebase(s) and ${remainingIndexing} indexing codebase(s) remain`;
            }

            return {
                content: [{
                    type: "text",
                    text: resultText
                }]
            };
        } catch (error) {
            // Check if this is the collection limit error
            // Handle both direct string throws and Error objects containing the message
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));

            if (errorMessage === COLLECTION_LIMIT_MESSAGE || errorMessage.includes(COLLECTION_LIMIT_MESSAGE)) {
                // Return the collection limit message as a successful response
                // This ensures LLM treats it as final answer, not as retryable error
                return {
                    content: [{
                        type: "text",
                        text: COLLECTION_LIMIT_MESSAGE
                    }]
                };
            }

            return {
                content: [{
                    type: "text",
                    text: `Error clearing index: ${errorMessage}`
                }],
                isError: true
            };
        }
    }

    public async handleGetIndexingStatus(args: any) {
        const { path: codebasePath } = args;

        try {
            // Force absolute path resolution
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check indexing status using new status system
            const status = this.snapshotManager.getCodebaseStatus(absolutePath);
            const info = this.snapshotManager.getCodebaseInfo(absolutePath);

            let statusMessage = '';

            switch (status) {
                case 'indexed':
                    if (info && 'indexedFiles' in info) {
                        const indexedInfo = info as any;
                        statusMessage = `✅ Codebase '${absolutePath}' is fully indexed and ready for search.`;
                        statusMessage += `\n📊 Statistics: ${indexedInfo.indexedFiles} files, ${indexedInfo.totalChunks} chunks`;
                        statusMessage += `\n📅 Status: ${indexedInfo.indexStatus}`;
                        statusMessage += `\n🕐 Last updated: ${new Date(indexedInfo.lastUpdated).toLocaleString()}`;
                    } else {
                        statusMessage = `✅ Codebase '${absolutePath}' is fully indexed and ready for search.`;
                    }
                    break;

                case 'indexing':
                    if (info && 'indexingPercentage' in info) {
                        const indexingInfo = info as any;
                        const progressPercentage = indexingInfo.indexingPercentage || 0;
                        statusMessage = `🔄 Codebase '${absolutePath}' is currently being indexed. Progress: ${progressPercentage.toFixed(1)}%`;

                        // Add more detailed status based on progress
                        if (progressPercentage < 10) {
                            statusMessage += ' (Preparing and scanning files...)';
                        } else if (progressPercentage < 100) {
                            statusMessage += ' (Processing files and generating embeddings...)';
                        }
                        statusMessage += `\n🕐 Last updated: ${new Date(indexingInfo.lastUpdated).toLocaleString()}`;
                    } else {
                        statusMessage = `🔄 Codebase '${absolutePath}' is currently being indexed.`;
                    }
                    break;

                case 'indexfailed':
                    if (info && 'errorMessage' in info) {
                        const failedInfo = info as any;
                        statusMessage = `❌ Codebase '${absolutePath}' indexing failed.`;
                        statusMessage += `\n🚨 Error: ${failedInfo.errorMessage}`;
                        if (failedInfo.lastAttemptedPercentage !== undefined) {
                            statusMessage += `\n📊 Failed at: ${failedInfo.lastAttemptedPercentage.toFixed(1)}% progress`;
                        }
                        statusMessage += `\n🕐 Failed at: ${new Date(failedInfo.lastUpdated).toLocaleString()}`;
                        statusMessage += `\n💡 You can retry indexing by running the index_codebase command again.`;
                    } else {
                        statusMessage = `❌ Codebase '${absolutePath}' indexing failed. You can retry indexing.`;
                    }
                    break;

                case 'sync_completed':
                    if (info && 'added' in info) {
                        const syncInfo = info as any;
                        statusMessage = `🔄 Codebase '${absolutePath}' sync completed.`;
                        statusMessage += `\n📊 Changes: +${syncInfo.added} added, -${syncInfo.removed} removed, ~${syncInfo.modified} modified`;
                        statusMessage += `\n🕐 Last synced: ${new Date(syncInfo.lastUpdated).toLocaleString()}`;
                    } else {
                        statusMessage = `🔄 Codebase '${absolutePath}' sync completed.`;
                    }
                    break;

                case 'not_found':
                default:
                    statusMessage = `❌ Codebase '${absolutePath}' is not indexed. Please use the index_codebase tool to index it first.`;
                    break;
            }

            const pathInfo = codebasePath !== absolutePath
                ? `\nNote: Input path '${codebasePath}' was resolved to absolute path '${absolutePath}'`
                : '';

            return {
                content: [{
                    type: "text",
                    text: statusMessage + pathInfo
                }]
            };

        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting indexing status: ${error.message || error}`
                }],
                isError: true
            };
        }
    }

    /**
     * Handle sync request - manually trigger incremental sync for a codebase
     */
    public async handleSyncCodebase(args: any) {
        const { path: codebasePath } = args;

        try {
            // Force absolute path resolution
            const absolutePath = ensureAbsolutePath(codebasePath);

            // Validate path exists
            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`
                    }],
                    isError: true
                };
            }

            // Check if it's a directory
            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Path '${absolutePath}' is not a directory`
                    }],
                    isError: true
                };
            }

            // Check if this codebase is indexed
            const isIndexed = this.snapshotManager.getIndexedCodebases().includes(absolutePath);
            if (!isIndexed) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Codebase '${absolutePath}' is not indexed. Please index it first using the index_codebase tool.`
                    }],
                    isError: true
                };
            }

            console.log(`[SYNC] Manually triggering incremental sync for: ${absolutePath}`);

            // Perform incremental sync
            const syncStats = await this.context.reindexByChange(absolutePath);

            // Store sync result in snapshot
            this.snapshotManager.setCodebaseSyncCompleted(absolutePath, syncStats);
            this.snapshotManager.saveCodebaseSnapshot();

            const totalChanges = syncStats.added + syncStats.removed + syncStats.modified;

            if (totalChanges === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `✅ No changes detected for codebase '${absolutePath}'. Index is up to date.`
                    }]
                };
            }

            const resultMessage = `🔄 Incremental sync completed for '${absolutePath}'.\n\n📊 Changes:\n+ ${syncStats.added} file(s) added\n- ${syncStats.removed} file(s) removed\n~ ${syncStats.modified} file(s) modified\n\nTotal changes: ${totalChanges}`;

            console.log(`[SYNC] ✅ Sync completed: +${syncStats.added}, -${syncStats.removed}, ~${syncStats.modified}`);

            return {
                content: [{
                    type: "text",
                    text: resultMessage
                }]
            };

        } catch (error: any) {
            console.error(`[SYNC] Error during sync:`, error);
            return {
                content: [{
                    type: "text",
                    text: `Error syncing codebase: ${error.message || error}`
                }],
                isError: true
            };
        }
    }
    public async handleReadCode(args: any) {
        const { path: filePath } = args;

        try {
            const absolutePath = ensureAbsolutePath(filePath);

            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{ type: "text", text: `Error: File '${absolutePath}' not found.` }],
                    isError: true
                };
            }

            const stat = fs.statSync(absolutePath);
            if (!stat.isFile()) {
                return {
                    content: [{ type: "text", text: `Error: '${absolutePath}' is not a file.` }],
                    isError: true
                };
            }

            // Read file
            const content = fs.readFileSync(absolutePath, 'utf-8');

            return {
                content: [{
                    type: "text",
                    text: content
                }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error reading file: ${error.message}` }],
                isError: true
            };
        }
    }
}

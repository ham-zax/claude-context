import * as fs from "fs";
import { Context } from "@zokizuan/claude-context-core";
import { SnapshotManager } from "./snapshot.js";

export class SyncManager {
    private context: Context;
    private snapshotManager: SnapshotManager;
    private activeSyncs: Map<string, Promise<void>> = new Map();
    private lastSyncTimes: Map<string, number> = new Map();
    // Removed isSyncing in favor of per-codebase activeSyncs

    constructor(context: Context, snapshotManager: SnapshotManager) {
        this.context = context;
        this.snapshotManager = snapshotManager;
    }

    /**
     * Ensures the codebase is fresh before use.
     * Unified entry point for ALL sync operations (manual, periodic, and on-read).
     */
    public async ensureFreshness(codebasePath: string, thresholdMs: number = 60000): Promise<void> {
        // 1. Coalescing: Join existing in-flight sync
        if (this.activeSyncs.has(codebasePath)) {
            console.log(`[SYNC] 🛡️ Request Coalesced: Attaching to active sync for '${codebasePath}'`);
            return this.activeSyncs.get(codebasePath);
        }

        // 2. Throttling: Skip if recently synced
        const lastSync = this.lastSyncTimes.get(codebasePath) || 0;
        const timeSince = Date.now() - lastSync;
        if (thresholdMs > 0 && timeSince < thresholdMs) {
            console.log(`[SYNC] ⏩ Skipped (Fresh): '${codebasePath}' was synced ${Math.round(timeSince / 1000)}s ago (Threshold: ${thresholdMs / 1000}s)`);
            return;
        }

        // 3. Execution Gate
        // console.log(`[SYNC] 🔄 Triggering Sync for '${codebasePath}' (Threshold: ${thresholdMs}ms)`);

        const syncPromise = (async () => {
            try {
                await this.syncCodebase(codebasePath);
            } catch (e) {
                // Log and rethrow to allow callers to handle/see failure
                console.error(`[SYNC] Error syncing '${codebasePath}':`, e);
                throw e;
            } finally {
                this.activeSyncs.delete(codebasePath);
            }
        })();

        this.activeSyncs.set(codebasePath, syncPromise);
        return syncPromise;
    }

    private async syncCodebase(codebasePath: string): Promise<void> {
        // Async existence check to avoid blocking event loop
        try {
            await fs.promises.access(codebasePath);
        } catch {
            // Path doesn't exist anymore - Clean up snapshot
            console.log(`[SYNC] 🗑️ Codebase '${codebasePath}' no longer exists. Removing from snapshot.`);
            try {
                this.snapshotManager.removeIndexedCodebase(codebasePath);
                this.snapshotManager.saveCodebaseSnapshot();
            } catch (e) {
                console.error(`[SYNC] Failed to clean snapshot for '${codebasePath}':`, e);
            }
            return;
        }

        try {
            // Incremental sync
            const stats = await this.context.reindexByChange(codebasePath);

            // Centralized State Update
            this.lastSyncTimes.set(codebasePath, Date.now());

            // Persist Snapshot
            this.snapshotManager.setCodebaseSyncCompleted(codebasePath, stats);
            this.snapshotManager.saveCodebaseSnapshot();

            if (stats.added > 0 || stats.removed > 0 || stats.modified > 0) {
                console.log(`[SYNC] ✅ Sync Result for '${codebasePath}': +${stats.added}, -${stats.removed}, ~${stats.modified}`);
            }
        } catch (error: any) {
            console.error(`[SYNC] Failed to sync '${codebasePath}':`, error);
            throw error; // Let ensureFreshness handle the catch/finally
        }
    }

    public async handleSyncIndex(): Promise<void> {
        const indexedCodebases = this.snapshotManager.getIndexedCodebases();
        if (indexedCodebases.length === 0) return;

        // console.log(`[SYNC-DEBUG] Starting periodic sync via unified gate...`);

        // Execute sequentially to avoid resource spikes, but through the ensureFreshness gate
        for (const codebasePath of indexedCodebases) {
            try {
                // thresholdMs = 0 forces a check (unless coalesced)
                await this.ensureFreshness(codebasePath, 0);
            } catch (e) {
                // Individual codebase failure shouldn't stop the loop
                console.error(`[SYNC] Periodic sync failed for '${codebasePath}':`, e);
            }
        }
    }

    public startBackgroundSync(): void {
        const run = async () => {
            await this.handleSyncIndex();

            // recursive schedule to prevent overlap
            setTimeout(run, 3 * 60 * 1000); // 3 minutes
        };

        // Initial delay
        setTimeout(run, 5000);
    }
}

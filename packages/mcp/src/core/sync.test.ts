import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncManager } from './sync.js';

type CodebaseStatus = 'indexed' | 'indexing' | 'indexfailed' | 'sync_completed' | 'requires_reindex' | 'not_found';

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sync-test-'));
}

function createSnapshot(statusByPath: Map<string, CodebaseStatus>) {
    return {
        getCodebaseStatus(codebasePath: string): CodebaseStatus {
            return statusByPath.get(codebasePath) || 'not_found';
        },
        getIndexedCodebases(): string[] {
            return Array.from(statusByPath.entries())
                .filter(([, status]) => status === 'indexed' || status === 'sync_completed')
                .map(([p]) => p);
        },
        setCodebaseSyncCompleted() { },
        saveCodebaseSnapshot() { },
        removeIndexedCodebase(codebasePath: string) {
            statusByPath.delete(codebasePath);
        },
    };
}

function createContext() {
    let calls = 0;
    return {
        get calls() {
            return calls;
        },
        getActiveIgnorePatterns() {
            return ['node_modules/**', 'dist/**', '.git/**'];
        },
        async reindexByChange() {
            calls += 1;
            return { added: 0, removed: 0, modified: 0 };
        }
    };
}

test('watch-triggered sync is dropped for non-searchable statuses', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexing']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as any, snapshot as any, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as any).watcherModeStarted = true;
    manager.scheduleWatcherSync(codebasePath, 'watch_event');
    await wait(80);

    assert.equal(context.calls, 0);
    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('watch-triggered sync coalesces burst changes into one sync', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as any, snapshot as any, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as any).watcherModeStarted = true;
    manager.scheduleWatcherSync(codebasePath, 'watch_event');
    manager.scheduleWatcherSync(codebasePath, 'watch_event');
    manager.scheduleWatcherSync(codebasePath, 'watch_event');
    await wait(120);

    assert.equal(context.calls, 1);
    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('stopWatcherMode closes active watchers and clears timers', async () => {
    const context = createContext();
    const snapshot = createSnapshot(new Map());
    const manager = new SyncManager(context as any, snapshot as any, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as any).watcherModeStarted = true;
    let closeCalls = 0;
    const fakeWatcher = {
        close: async () => {
            closeCalls += 1;
        }
    };

    const timer = setTimeout(() => { }, 2000);
    (manager as any).watchers.set('/tmp/repo', fakeWatcher);
    (manager as any).debounceTimers.set('/tmp/repo', timer);

    await manager.stopWatcherMode();

    assert.equal(closeCalls, 1);
    assert.equal((manager as any).watchers.size, 0);
    assert.equal((manager as any).debounceTimers.size, 0);
});

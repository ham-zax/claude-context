import fs from 'node:fs';

const target = 'packages/mcp/src/core/handlers.ts';
let text = fs.readFileSync(target, 'utf8');

const oldWrapper = `    private async prepareTrackedRootReadWithObservation(
        absolutePath: string,
        onPhase: (phase: ReadinessPhase, durationMs: number) => void,
        accessMode: 'semantic' | 'navigation' = 'semantic',
    ): Promise<TrackedRootReadinessState> {
        const state = await this.trackedRootReadiness.prepareTrackedRootForRead(
            absolutePath,
            accessMode,
            onPhase,
            { observePreparedRead: (root) => this.getPreparedAuthorityObservation(root) },
        );
        if (
            state.state === 'ready'
            && this.mutationLeaseCoordinator?.getActiveLease(state.root.path)
        ) {
            this.evictPreparedRead(state.root.path);
            const operation = this.getIndexingOperationForReadiness(state.root.path);
            return {
                state: 'indexing',
                codebasePath: state.root.path,
                ...(operation ? { operation } : {}),
                searchableGenerationAvailable: true,
            };
        }
        return state;
    }
`;

const newWrapper = `    private async prepareTrackedRootReadWithObservation(
        absolutePath: string,
        onPhase: (phase: ReadinessPhase, durationMs: number) => void,
        accessMode: 'semantic' | 'navigation' = 'semantic',
    ): Promise<TrackedRootReadinessState> {
        const state = await this.trackedRootReadiness.prepareTrackedRootForRead(
            absolutePath,
            accessMode,
            onPhase,
            { observePreparedRead: (root) => this.getPreparedAuthorityObservation(root) },
        );
        if (state.state !== 'ready') {
            return state;
        }

        const activeLease = this.mutationLeaseCoordinator?.getActiveLease(state.root.path);
        if (!activeLease) {
            return state;
        }

        this.evictPreparedRead(state.root.path);
        const durableOperation = this.readLatestOperationReceipt(state.root.path);
        const operation = this.getIndexingOperationForReadiness(state.root.path);
        const matchingActiveSync = Boolean(
            state.vectorReceipt
            && activeLease.action === 'sync'
            && operation?.action === 'sync'
            && operation.generation === activeLease.generation
            && durableOperation?.id === activeLease.operationId
        );

        if (process.env.SATORI_TASK7_DEBUG === '1') {
            console.error('[TASK7-DEBUG][readiness-wrapper] ' + JSON.stringify({
                root: state.root.path,
                accessMode,
                vectorReceipt: state.vectorReceipt
                    ? {
                        collectionName: state.vectorReceipt.collectionName,
                        markerRunId: state.vectorReceipt.marker?.runId ?? null,
                    }
                    : null,
                activeLease: {
                    action: activeLease.action,
                    generation: activeLease.generation,
                    operationId: activeLease.operationId,
                },
                durableOperation: durableOperation
                    ? {
                        id: durableOperation.id ?? null,
                        action: durableOperation.action,
                        generation: durableOperation.generation,
                        phase: durableOperation.phase,
                    }
                    : null,
                matchingActiveSync,
                decision: matchingActiveSync
                    ? 'preserve_searchable_read'
                    : 'strip_searchable_read',
            }));
        }

        return {
            state: 'indexing',
            codebasePath: state.root.path,
            ...(operation ? { operation } : {}),
            searchableGenerationAvailable: true,
            ...(matchingActiveSync ? { searchableRead: state } : {}),
        };
    }
`;

const oldReceipt = `    private readLatestOperationReceipt(codebasePath: string):
        | { action: string; phase: string; generation: number }
        | undefined {
        const reader = this.snapshotManager as unknown as {
            getLatestOperation?: (path: string) => { action: string; phase: string; generation: number } | undefined;
        };
        try {
            return reader.getLatestOperation?.(codebasePath);
        } catch {
            return undefined;
        }
    }
`;

const newReceipt = `    private readLatestOperationReceipt(codebasePath: string):
        | { id?: string; action: string; phase: string; generation: number }
        | undefined {
        const reader = this.snapshotManager as unknown as {
            getLatestOperation?: (path: string) => {
                id?: string;
                action: string;
                phase: string;
                generation: number;
            } | undefined;
        };
        try {
            return reader.getLatestOperation?.(codebasePath);
        } catch {
            return undefined;
        }
    }
`;

function replaceExactlyOnce(source, before, after, label) {
    const first = source.indexOf(before);
    const last = source.lastIndexOf(before);
    if (first < 0 || first !== last) {
        throw new Error(`${label}: expected exactly one source block`);
    }
    return source.slice(0, first) + after + source.slice(first + before.length);
}

text = replaceExactlyOnce(text, oldWrapper, newWrapper, 'readiness wrapper');
text = replaceExactlyOnce(text, oldReceipt, newReceipt, 'operation receipt reader');
fs.writeFileSync(target, text, 'utf8');
console.log('Applied exact Task-7 stale-sync readiness patch.');

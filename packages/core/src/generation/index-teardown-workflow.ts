/**
 * Phase 8.10 — destructive index teardown workflow.
 *
 * Owns the cross-domain clear transaction. Durable policy bytes, runtime
 * policy state, vector collections, navigation sidecars, synchronizer state,
 * ignore state, and compatibility state are each still owned by their
 * existing domain owner; this workflow owns only their teardown ordering and
 * the shared policy-mutation lock that fences the operation.
 */
import type { VerifiedCollectionDeleteOptions } from '../vectordb/remote-delete';

export type IndexTeardownProgressCallback = (
    progress: { phase: string; current: number; total: number; percentage: number },
) => void;

export type IndexTeardownWorkflowOptions = {
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
};

export interface IndexTeardownWorkflowPorts {
    canonicalizeCodebasePath(codebasePath: string): string;
    indexPolicyMutationCoordinator: {
        withLockAsync<T>(canonicalRoot: string, operation: () => Promise<T>): Promise<T>;
    };
    indexPolicyDocumentStore: {
        recoverTombstonesWhileLocked(canonicalRoot: string): void;
        deleteDocumentWhileLocked(canonicalRoot: string): void;
    };
    listRelatedCollectionNames(codebasePath: string): Promise<string[]>;
    deleteCollectionWithVerification(
        collectionName: string,
        options?: VerifiedCollectionDeleteOptions,
    ): Promise<void>;
    clearResolvedIndexPolicyRuntime(canonicalRoot: string): void;
    setPolicyFileToken(canonicalRoot: string, token: string | null): void;
    clearSymbolRegistryForCodebase(
        codebasePath: string,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void>;
    deleteSnapshot(codebasePath: string): Promise<void>;
    resolveCollectionName(codebasePath: string): string;
    clearSynchronizerForCollection(collectionName: string): void;
    deleteIgnoreCodebaseState(codebasePath: string): void;
    deleteIndexProfile(canonicalRoot: string): void;
    clearLegacyWriteCollectionOverride(canonicalRoot: string): void;
}

export class IndexTeardownWorkflow {
    constructor(private readonly ports: IndexTeardownWorkflowPorts) {}

    async clearIndex(
        codebasePath: string,
        progressCallback?: IndexTeardownProgressCallback,
        options: IndexTeardownWorkflowOptions = {},
    ): Promise<void> {
        console.log(`[Context] 🧹 Cleaning index data for ${codebasePath}...`);
        const canonicalRoot = this.ports.canonicalizeCodebasePath(codebasePath);

        progressCallback?.({ phase: 'Checking existing index...', current: 0, total: 100, percentage: 0 });

        progressCallback?.({ phase: 'Removing index data...', current: 50, total: 100, percentage: 50 });
        await this.ports.indexPolicyMutationCoordinator.withLockAsync(canonicalRoot, async () => {
            this.ports.indexPolicyDocumentStore.recoverTombstonesWhileLocked(canonicalRoot);

            for (const collectionName of await this.ports.listRelatedCollectionNames(codebasePath)) {
                await this.ports.deleteCollectionWithVerification(collectionName, {
                    beforeDropAttempt: options.assertMutationCurrent,
                });
            }

            // Preserve the accepted policy while remote deletion is unproven.
            // Once every related collection is confirmed absent, remove durable
            // authority before reconciling process-local policy state.
            options.assertMutationCurrent?.();
            this.ports.indexPolicyDocumentStore.deleteDocumentWhileLocked(canonicalRoot);
            this.ports.clearResolvedIndexPolicyRuntime(canonicalRoot);
            this.ports.setPolicyFileToken(canonicalRoot, null);

            await this.ports.clearSymbolRegistryForCodebase(
                codebasePath,
                options.assertMutationCurrent,
                options.publishMutation,
            );

            options.assertMutationCurrent?.();
            await this.ports.deleteSnapshot(codebasePath);
            const familyCollectionName = this.ports.resolveCollectionName(codebasePath);
            this.ports.clearSynchronizerForCollection(familyCollectionName);
            this.ports.deleteIgnoreCodebaseState(codebasePath);
            this.ports.clearLegacyWriteCollectionOverride(canonicalRoot);
            this.ports.deleteIndexProfile(canonicalRoot);
        });

        progressCallback?.({ phase: 'Index cleared', current: 100, total: 100, percentage: 100 });
        console.log('[Context] ✅ Index data cleaned');
    }
}

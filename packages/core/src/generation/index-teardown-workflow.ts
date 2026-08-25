/**
 * Phase 8.10 — destructive index teardown workflow.
 *
 * Owns destructive clear ordering across Publication-owned physical resources
 * and process-local runtime state. The root mutation lease supplied by
 * Context is the only writer fence; there is no secondary policy document.
 */
import type { RootMutationLease } from './root-mutation-coordinator';

export type IndexTeardownProgressCallback = (
    progress: { phase: string; current: number; total: number; percentage: number },
) => void;

export type IndexTeardownWorkflowOptions = {
    assertMutationCurrent?: () => void;
    rootMutationLease?: RootMutationLease;
};

export interface IndexTeardownWorkflowPorts {
    canonicalizeCodebasePath(codebasePath: string): string;
    clearCurrentPublication(canonicalRoot: string, lease: RootMutationLease): void;
    collectPublicationGarbage(canonicalRoot: string, lease: RootMutationLease): Promise<string[]>;
    clearResolvedIndexPolicyRuntime(canonicalRoot: string): void;
    resolveCollectionName(codebasePath: string): string;
    clearSynchronizerForCollection(collectionName: string): void;
    deleteIgnoreCodebaseState(codebasePath: string): void;
    deleteIndexProfile(canonicalRoot: string): void;
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

        const mutationLease = options.rootMutationLease;
        if (!mutationLease) {
            throw new Error(`Clearing '${canonicalRoot}' requires the Core root mutation lease.`);
        }
        options.assertMutationCurrent?.();
        this.ports.clearCurrentPublication(canonicalRoot, mutationLease);

        progressCallback?.({ phase: 'Removing index data...', current: 50, total: 100, percentage: 50 });
        await this.ports.collectPublicationGarbage(canonicalRoot, mutationLease);

        options.assertMutationCurrent?.();
        this.ports.clearResolvedIndexPolicyRuntime(canonicalRoot);
        const familyCollectionName = this.ports.resolveCollectionName(codebasePath);
        this.ports.clearSynchronizerForCollection(familyCollectionName);
        this.ports.deleteIgnoreCodebaseState(codebasePath);
        this.ports.deleteIndexProfile(canonicalRoot);

        progressCallback?.({ phase: 'Index cleared', current: 100, total: 100, percentage: 100 });
        console.log('[Context] ✅ Index data cleaned');
    }
}

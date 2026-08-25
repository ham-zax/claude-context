import { AsyncLocalStorage } from 'node:async_hooks';
import {
    MutationLeaseCoordinator,
    type MutationLeaseAction,
    type MutationOperationPhase,
    type RootMutationLease,
    type RootMutationOperation,
} from './root-mutation-coordinator';

export type RootMutationAction = MutationLeaseAction;

export type RootMutationActivity = Readonly<{
    id: string;
    action: RootMutationAction;
    canonicalRoot: string;
    generation: number;
    acceptedAt: string;
    pid: number;
}>;

export type RootMutationRuntimeOptions = Readonly<{
    stateDir?: string;
    ownerId?: string;
    now?: () => number;
}>;

export type RootMutationContinuation<T> = Readonly<{
    response: T;
    completion: Promise<void>;
}>;

export type RootMutationStart<T> = Readonly<{
    started: Promise<T>;
    completion: Promise<void>;
}>;

export function formatRootMutationBlockedMessage(activeMutation: RootMutationActivity): string {
    return `Mutation '${activeMutation.action}' is already in progress for '${activeMutation.canonicalRoot}' `
        + `(operation=${activeMutation.id}, generation=${activeMutation.generation}, pid=${activeMutation.pid}).`;
}

export class RootMutationInProgressError extends Error {
    constructor(readonly activeMutation: RootMutationActivity) {
        super(formatRootMutationBlockedMessage(activeMutation));
        this.name = 'RootMutationInProgressError';
    }
}

const coordinators = new WeakMap<RootMutationRuntime, MutationLeaseCoordinator>();
const operationScopes = new WeakMap<RootMutationRuntime, AsyncLocalStorage<RootMutationLease>>();

function isRootMutationContinuation<T>(value: unknown): value is RootMutationContinuation<T> {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    const completion = record.completion as { then?: unknown } | undefined;
    return 'response' in record && typeof completion?.then === 'function';
}

function activityFromLease(lease: RootMutationLease): RootMutationActivity {
    return Object.freeze({
        id: lease.operationId,
        action: lease.action,
        canonicalRoot: lease.canonicalRoot,
        generation: lease.generation,
        acceptedAt: lease.acquiredAt,
        pid: lease.pid,
    });
}

/**
 * Core-owned process runtime for the durable per-root writer fence and its
 * process-local operation projection. First-party integrations request a root
 * mutation through this owner; raw leases never cross the Core boundary.
 */
export class RootMutationRuntime {
    constructor(options: RootMutationRuntimeOptions = {}) {
        const coordinator = new MutationLeaseCoordinator({
            ...(options.stateDir ? { stateDir: options.stateDir } : {}),
            ...(options.ownerId ? { ownerId: options.ownerId } : {}),
            ...(options.now ? { now: options.now } : {}),
        });
        coordinators.set(this, coordinator);
        operationScopes.set(this, new AsyncLocalStorage<RootMutationLease>());
    }

    async run<T>(
        root: string,
        action: RootMutationAction,
        work: () => Promise<T> | T,
    ): Promise<T> {
        const coordinator = requireCoordinator(this);
        const scopes = requireOperationScopes(this);
        const current = scopes.getStore();
        if (current && coordinator.isLeaseForRoot(current, root)) {
            coordinator.assertCurrent(current);
            return await work();
        }

        const acquired = coordinator.acquire(root, action);
        if (!acquired.acquired) {
            throw new RootMutationInProgressError(activityFromLease(acquired.activeLease));
        }

        return await scopes.run(acquired.lease, async () => {
            try {
                return await work();
            } finally {
                coordinator.release(acquired.lease);
            }
        });
    }

    start<T>(
        root: string,
        action: RootMutationAction,
        prepare: () => Promise<T | RootMutationContinuation<T>> | T | RootMutationContinuation<T>,
    ): RootMutationStart<T> {
        let resolveStarted!: (value: T) => void;
        let rejectStarted!: (error: unknown) => void;
        let startedSettled = false;
        const started = new Promise<T>((resolve, reject) => {
            resolveStarted = resolve;
            rejectStarted = reject;
        });
        const completion = this.run(root, action, async () => {
            const prepared = await prepare();
            if (isRootMutationContinuation(prepared)) {
                startedSettled = true;
                resolveStarted(prepared.response);
                await prepared.completion;
                return;
            }
            startedSettled = true;
            resolveStarted(prepared);
        }).catch((error) => {
            if (!startedSettled) {
                startedSettled = true;
                rejectStarted(error);
            }
            throw error;
        });
        return Object.freeze({ started, completion });
    }

    getOperation(root: string): RootMutationOperation | undefined {
        return requireCoordinator(this).getOperation(root);
    }

    getCurrentOperation(root: string): RootMutationOperation | undefined {
        const lease = currentLeaseForRoot(this, root);
        return lease
            ? requireCoordinator(this).getOperationForLease(lease)
            : undefined;
    }

    getActiveMutation(root: string): RootMutationActivity | undefined {
        const lease = requireCoordinator(this).getActiveLease(root);
        return lease ? activityFromLease(lease) : undefined;
    }

    listActiveMutations(): RootMutationActivity[] {
        return requireCoordinator(this).listActiveLeases().map(activityFromLease);
    }

    assertCurrent(root: string): void {
        const lease = requireCurrentLeaseForRoot(this, root);
        requireCoordinator(this).assertCurrent(lease);
    }

    isCurrent(root: string): boolean {
        const lease = currentLeaseForRoot(this, root);
        return lease ? requireCoordinator(this).isCurrent(lease) : false;
    }

    updateCurrentOperation(
        root: string,
        phase: MutationOperationPhase,
        update: { progress?: number; error?: string } = {},
    ): RootMutationOperation {
        const lease = requireCurrentLeaseForRoot(this, root);
        return requireCoordinator(this).updateOperation(lease, phase, update);
    }
}

function requireCoordinator(runtime: RootMutationRuntime): MutationLeaseCoordinator {
    const coordinator = coordinators.get(runtime);
    if (!coordinator) throw new Error('Root mutation runtime is not initialized.');
    return coordinator;
}

function requireOperationScopes(runtime: RootMutationRuntime): AsyncLocalStorage<RootMutationLease> {
    const scopes = operationScopes.get(runtime);
    if (!scopes) throw new Error('Root mutation runtime is not initialized.');
    return scopes;
}

function currentLeaseForRoot(runtime: RootMutationRuntime, root: string): RootMutationLease | undefined {
    const coordinator = requireCoordinator(runtime);
    const lease = requireOperationScopes(runtime).getStore();
    return lease && coordinator.isLeaseForRoot(lease, root) ? lease : undefined;
}

function requireCurrentLeaseForRoot(runtime: RootMutationRuntime, root: string): RootMutationLease {
    const lease = currentLeaseForRoot(runtime, root);
    if (!lease) {
        throw new Error(`No Core root mutation scope is active for '${root}'.`);
    }
    return lease;
}

/** Internal Core-only accessors. Do not re-export from a package entrypoint. */
export function getRootMutationCoordinator(runtime: RootMutationRuntime): MutationLeaseCoordinator {
    return requireCoordinator(runtime);
}

export function getCurrentRootMutationLease(runtime: RootMutationRuntime, root: string): RootMutationLease {
    return requireCurrentLeaseForRoot(runtime, root);
}

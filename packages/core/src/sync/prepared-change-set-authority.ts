import type { PreparedFileChangeSet } from './synchronizer';

const authenticPreparedChangeSets = new WeakSet<PreparedFileChangeSet>();

export function registerAuthenticPreparedFileChangeSet(prepared: PreparedFileChangeSet): void {
    authenticPreparedChangeSets.add(prepared);
}

export function assertAuthenticPreparedFileChangeSet(prepared: PreparedFileChangeSet): void {
    if (!authenticPreparedChangeSets.has(prepared)) {
        throw new Error('[Context] Prepared change set is not an authentic synchronizer capability.');
    }
}

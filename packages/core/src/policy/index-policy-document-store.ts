import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IndexPolicyMutationCoordinator } from '../core/index-policy-mutation-coordinator';
import type { CanonicalIndexPolicyDocument } from '../core/persisted-index-authority';

/**
 * Captured durable policy document bytes: content plus its SHA-256 digest.
 */
export type IndexPolicyDocumentCapture = {
    content: string;
    digest: string;
};

export type IndexPolicyDocumentStoreConfig = Readonly<{
    /**
     * The existing policy mutation lock owner. The store reuses its lock,
     * path resolution, and tombstone recovery; it must not create a second
     * policy coordinator.
     */
    mutationCoordinator: IndexPolicyMutationCoordinator;
    /** Verify a policy document file and return its canonical digest. */
    verifyPolicyDocumentDigest: (policyPath: string) => string;
    /** Durable fsync hook (Context-owned so failure injection remains observable). */
    fsyncPath: (targetPath: string) => void;
}>;

/**
 * Owns durable index policy document I/O: atomic persist, capture/read,
 * tombstone recovery, removal with rollback, and lock-scoped deletion.
 *
 * Deliberately owns no active generation or published binding state; Context
 * remains the owner of runtime/published state and receives commit
 * notifications through the onCommitted callbacks. All mutation-lock
 * acquisition is delegated to the shared IndexPolicyMutationCoordinator so
 * durable formats and locking behavior stay unchanged.
 */
export class IndexPolicyDocumentStore {
    private readonly mutationCoordinator: IndexPolicyMutationCoordinator;
    private readonly verifyPolicyDocumentDigest: (policyPath: string) => string;
    private readonly fsyncPath: (targetPath: string) => void;

    constructor(config: IndexPolicyDocumentStoreConfig) {
        this.mutationCoordinator = config.mutationCoordinator;
        this.verifyPolicyDocumentDigest = config.verifyPolicyDocumentDigest;
        this.fsyncPath = config.fsyncPath;
    }

    resolvePolicyPath(canonicalRoot: string): string {
        return this.mutationCoordinator.resolvePolicyPath(canonicalRoot);
    }

    /**
     * Atomically persist a policy document. The document bytes are written to
     * a temporary sibling, fsynced, then renamed into place under the policy
     * mutation lock after pending removal tombstones are recovered. onCommitted
     * runs inside the lock after the rename; its failure still leaves the
     * document durably committed and propagates to the caller.
     */
    persistDocument(
        canonicalRoot: string,
        document: CanonicalIndexPolicyDocument,
        onCommitted?: () => void,
    ): void {
        const targetPath = this.resolvePolicyPath(canonicalRoot);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const temporaryPath = `${targetPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
        fs.writeFileSync(temporaryPath, JSON.stringify(document, null, 2));
        this.fsyncPath(temporaryPath);
        try {
            this.mutationCoordinator.withLock(canonicalRoot, () => {
                this.mutationCoordinator.recoverTombstonesWhileLocked(targetPath);
                fs.renameSync(temporaryPath, targetPath);
                onCommitted?.();
                this.fsyncPath(path.dirname(targetPath));
            });
        } finally {
            fs.rmSync(temporaryPath, { force: true });
        }
    }

    /**
     * Capture the durable policy document bytes and digest, or null when no
     * document is present.
     */
    captureDocument(canonicalRoot: string): IndexPolicyDocumentCapture | null {
        try {
            const content = fs.readFileSync(this.resolvePolicyPath(canonicalRoot), 'utf8');
            return {
                content,
                digest: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    /**
     * Remove the durable policy document under the mutation lock using the
     * tombstone protocol: the document is moved aside, its digest is verified
     * against the expected digest when one is provided, and the committed
     * tombstone is cleaned up. A digest mismatch rolls the document back into
     * place before throwing. onCommitted runs inside the lock once the removal
     * is durably committed and receives the removed document digest (null when
     * no document was present).
     */
    removeDocument(
        canonicalRoot: string,
        expectedDocumentDigest: string | undefined,
        onCommitted: (removedDocumentDigest: string | null) => void,
    ): void {
        const targetPath = this.resolvePolicyPath(canonicalRoot);
        this.mutationCoordinator.withLock(canonicalRoot, () => {
            let tombstonePath = `${targetPath}.removed-${process.pid}-${crypto.randomUUID()}`;
            let movedPolicy = false;
            let cleanupCommittedTombstone = false;
            try {
                this.mutationCoordinator.recoverTombstonesWhileLocked(targetPath);
                try {
                    fs.renameSync(targetPath, tombstonePath);
                    movedPolicy = true;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                }
                if (!movedPolicy && expectedDocumentDigest !== undefined) {
                    throw new Error(
                        `Index policy changed before removal; expected document '${expectedDocumentDigest}' but no document was present.`,
                    );
                }
                let digestError: unknown;
                let removedDocumentDigest: string | null = null;
                if (movedPolicy) {
                    try {
                        removedDocumentDigest = this.verifyPolicyDocumentDigest(tombstonePath);
                    } catch (error) {
                        digestError = error;
                    }
                }
                if (
                    expectedDocumentDigest !== undefined
                    && (digestError || removedDocumentDigest !== expectedDocumentDigest)
                ) {
                    const observed = digestError
                        ? (digestError instanceof Error ? digestError.message : String(digestError))
                        : `'${removedDocumentDigest}'`;
                    if (!fs.existsSync(targetPath)) {
                        try {
                            fs.renameSync(tombstonePath, targetPath);
                            movedPolicy = false;
                        } catch (restoreError) {
                            throw new Error(
                                `Index policy changed before removal and restoration failed; preserved tombstone '${tombstonePath}': ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
                            );
                        }
                    } else {
                        throw new Error(
                            `Index policy changed before removal; preserved conflicting tombstone '${tombstonePath}' because '${targetPath}' is occupied.`,
                        );
                    }
                    throw new Error(
                        `Index policy changed before removal; expected document '${expectedDocumentDigest}' but tombstoned ${observed}.`,
                    );
                }
                if (movedPolicy) {
                    const committedTombstonePath = `${targetPath}.removed-committed-${process.pid}-${crypto.randomUUID()}`;
                    fs.renameSync(tombstonePath, committedTombstonePath);
                    tombstonePath = committedTombstonePath;
                    cleanupCommittedTombstone = true;
                }
                onCommitted(removedDocumentDigest);
                if (digestError) throw digestError;
            } finally {
                if (cleanupCommittedTombstone) fs.rmSync(tombstonePath, { force: true });
            }
        });
    }

    /**
     * Recover pending removal tombstones for the policy document. Must be
     * called only while the caller already holds the policy mutation lock
     * (e.g. clearIndex holds it across collection removal).
     */
    recoverTombstonesWhileLocked(canonicalRoot: string): void {
        this.mutationCoordinator.recoverTombstonesWhileLocked(
            this.resolvePolicyPath(canonicalRoot),
        );
    }

    /**
     * Delete the durable policy document. Must be called only while the
     * caller already holds the policy mutation lock.
     */
    deleteDocumentWhileLocked(canonicalRoot: string): void {
        fs.rmSync(this.resolvePolicyPath(canonicalRoot), { force: true });
    }

}

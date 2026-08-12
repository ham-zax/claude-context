import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Mutation owner identity for a durable index authority restore transaction.
 */
export type DurableAuthorityMutationOwner = {
    ownerId: string;
    generation: number;
    operationId: string;
};

/**
 * Fenced recovery publisher for pending restore transactions. It must invoke
 * publish at most once per transaction and return whether the mutation fence
 * was acquired.
 */
export type DurableAuthorityRecoveryPublisher = (
    canonicalRoot: string,
    mutationOwner: DurableAuthorityMutationOwner | undefined,
    publish: () => void,
) => boolean;

/**
 * Captured durable authority artifact bytes plus their SHA-256 digest.
 */
export type DurableIndexAuthorityArtifact = {
    content: string;
    digest: string;
};

export type DurableAuthorityRestoreEntry = {
    targetPath: string;
    temporaryPath: string;
    displacedPath: string;
    content: string | null;
    digest: string | null;
    expectedDigest: string | null;
};

/**
 * Durable restore journal format (schemaVersion 1). The journal is the
 * persisted record of an in-flight authority restoration; its JSON shape and
 * phase semantics (prepared/swapping/committed) are a durable format contract
 * and must not change without separate authorization.
 */
export type DurableAuthorityRestoreTransaction = {
    schemaVersion: 1;
    id: string;
    canonicalRoot: string;
    phase: 'prepared' | 'swapping' | 'committed';
    nextEntry: number;
    mutationOwner?: DurableAuthorityMutationOwner;
    entries: DurableAuthorityRestoreEntry[];
};

/**
 * Narrow ports the restore transaction mechanics require from generation
 * authority (Context). The mechanics own no authority decisions; they only
 * parse, write, validate, and execute restore journals durably against the
 * paths and mutation lock the authority provides.
 */
export type DurableAuthorityRestoreTransactionConfig = Readonly<{
    /** Root under which the 'restore-transactions' journal directory lives. */
    indexPolicyStateRoot: string;
    /** Canonicalize a codebase path for journal identity and path checks. */
    canonicalizeCodebasePath: (codebasePath: string) => string;
    /** Resolve the durable policy document path for a canonical root. */
    resolvePolicyPath: (canonicalRoot: string) => string;
    /** Resolve the durable navigation pointer path for a canonical root. */
    resolveNavigationPointerPath: (canonicalRoot: string) => string;
    /** Run an operation under the authority's mutation fence for a root. */
    withMutationLock: (canonicalRoot: string, operation: () => void) => void;
}>;

/**
 * Durable restore transaction parser/writer/executor. Infrastructure
 * dependency of generation authority: it owns journal persistence, journal
 * parsing, state validation, swap execution, cleanup, and pending-transaction
 * recovery, but makes no authority decision itself.
 */
export class DurableAuthorityRestoreTransactionMechanics {
    private readonly indexPolicyStateRoot: string;
    private readonly canonicalizeCodebasePath: (codebasePath: string) => string;
    private readonly resolvePolicyPath: (canonicalRoot: string) => string;
    private readonly resolveNavigationPointerPath: (canonicalRoot: string) => string;
    private readonly withMutationLock: (canonicalRoot: string, operation: () => void) => void;

    constructor(config: DurableAuthorityRestoreTransactionConfig) {
        this.indexPolicyStateRoot = config.indexPolicyStateRoot;
        this.canonicalizeCodebasePath = config.canonicalizeCodebasePath;
        this.resolvePolicyPath = config.resolvePolicyPath;
        this.resolveNavigationPointerPath = config.resolveNavigationPointerPath;
        this.withMutationLock = config.withMutationLock;
    }

    journalRoot(): string {
        return path.join(this.indexPolicyStateRoot, 'restore-transactions');
    }

    private fsyncPath(targetPath: string): void {
        const fd = fs.openSync(targetPath, 'r');
        try {
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
    }

    writeDurableAuthorityRestoreTransaction(
        journalPath: string,
        transaction: DurableAuthorityRestoreTransaction,
    ): void {
        const temporaryJournalPath = `${journalPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
        fs.writeFileSync(temporaryJournalPath, JSON.stringify(transaction), 'utf8');
        this.fsyncPath(temporaryJournalPath);
        fs.renameSync(temporaryJournalPath, journalPath);
        this.fsyncPath(path.dirname(journalPath));
    }

    artifactMatchesPath(
        artifactPath: string,
        artifact: DurableIndexAuthorityArtifact | null,
    ): boolean {
        try {
            const content = fs.readFileSync(artifactPath, 'utf8');
            return Boolean(
                artifact
                && crypto.createHash('sha256').update(content, 'utf8').digest('hex') === artifact.digest
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return artifact === null;
            throw error;
        }
    }

    validateDurableAuthorityRestoreTransactionState(
        transaction: DurableAuthorityRestoreTransaction,
    ): void {
        if (
            (transaction.phase === 'prepared' && transaction.nextEntry !== 0)
            || (transaction.phase === 'committed'
                && transaction.nextEntry !== transaction.entries.length)
        ) {
            throw new Error(
                `Durable authority restoration '${transaction.id}' no longer owns current authority.`,
            );
        }

        const matchesDigest = (artifactPath: string, digest: string | null): boolean => (
            this.artifactMatchesPath(
                artifactPath,
                digest === null ? null : { content: '', digest },
            )
        );

        for (const [index, entry] of transaction.entries.entries()) {
            const targetExpected = matchesDigest(entry.targetPath, entry.expectedDigest);
            const targetDesired = matchesDigest(entry.targetPath, entry.digest);
            const targetAbsent = matchesDigest(entry.targetPath, null);
            const temporaryDesired = matchesDigest(entry.temporaryPath, entry.digest);
            const temporaryAbsent = matchesDigest(entry.temporaryPath, null);
            const displacedExpected = matchesDigest(entry.displacedPath, entry.expectedDigest);
            const displacedAbsent = matchesDigest(entry.displacedPath, null);

            let validState = false;
            if (transaction.phase === 'prepared') {
                // The journal is durable only after every desired temporary has
                // been written and before any target is touched.
                validState = targetExpected && temporaryDesired && displacedAbsent;
            } else if (transaction.phase === 'committed') {
                // Committed authority is final. Cleanup may have removed any
                // subset of the transaction's temporary and displaced paths.
                validState = targetDesired
                    && (temporaryDesired || temporaryAbsent)
                    && (displacedExpected || displacedAbsent);
            } else if (index < transaction.nextEntry) {
                // An entry whose progress is durable has its desired bytes at
                // the target. Its temporary may remain until final cleanup,
                // and its displaced bytes are either absent or the captured
                // pre-restore authority.
                validState = targetDesired
                    && (temporaryDesired || temporaryAbsent)
                    && (displacedExpected || displacedAbsent)
                    && (
                        entry.expectedDigest === null
                        || targetExpected
                        || displacedExpected
                    );
            } else if (index === transaction.nextEntry) {
                // The current entry may have been observed before, during, or
                // after its swap, but every surviving path must still contain
                // bytes recorded by this transaction.
                const targetIsOwned = targetExpected
                    || (
                        targetDesired
                        && (
                            entry.expectedDigest === null
                            || entry.digest !== null
                            || displacedExpected
                        )
                    )
                    || (targetAbsent && displacedExpected);
                validState = targetIsOwned
                    && (temporaryDesired || temporaryAbsent)
                    && (displacedExpected || displacedAbsent);
            } else {
                // Entries after the interruption point have not been touched.
                validState = targetExpected && temporaryDesired && displacedAbsent;
            }

            if (!validState) {
                throw new Error(
                    `Durable authority restoration '${transaction.id}' no longer owns current authority for entry ${index}.`,
                );
            }
        }
    }

    completeDurableAuthorityRestoreTransaction(
        journalPath: string,
        transaction: DurableAuthorityRestoreTransaction,
    ): void {
        this.validateDurableAuthorityRestoreTransactionState(transaction);
        if (transaction.phase === 'committed') {
            const removeOwnedArtifact = (artifactPath: string, digest: string | null): void => {
                const expected = digest === null ? null : { content: '', digest };
                if (!this.artifactMatchesPath(artifactPath, expected) && fs.existsSync(artifactPath)) {
                    throw new Error(
                        `Durable authority restoration '${transaction.id}' no longer owns cleanup artifact '${artifactPath}'.`,
                    );
                }
                fs.rmSync(artifactPath, { force: true });
            };

            for (const entry of transaction.entries) {
                removeOwnedArtifact(entry.temporaryPath, entry.digest);
                removeOwnedArtifact(entry.displacedPath, entry.expectedDigest);
                this.fsyncPath(path.dirname(entry.targetPath));
            }
            fs.rmSync(journalPath, { force: true });
            this.fsyncPath(path.dirname(journalPath));
            return;
        }
        transaction.phase = 'swapping';
        this.writeDurableAuthorityRestoreTransaction(journalPath, transaction);
        this.validateDurableAuthorityRestoreTransactionState(transaction);
        for (let index = transaction.nextEntry; index < transaction.entries.length; index += 1) {
            const entry = transaction.entries[index];
            if (!entry) throw new Error('Durable authority restoration entry is missing.');
            const desired = entry.content === null
                ? null
                : { content: entry.content, digest: entry.digest! };
            if (!this.artifactMatchesPath(entry.targetPath, desired)) {
                if (!fs.existsSync(entry.displacedPath) && fs.existsSync(entry.targetPath)) {
                    fs.renameSync(entry.targetPath, entry.displacedPath);
                    this.fsyncPath(path.dirname(entry.targetPath));
                }
                if (entry.content === null) {
                    fs.rmSync(entry.targetPath, { force: true });
                } else if (fs.existsSync(entry.temporaryPath)) {
                    fs.renameSync(entry.temporaryPath, entry.targetPath);
                } else {
                    fs.writeFileSync(entry.targetPath, entry.content, 'utf8');
                }
                if (entry.content !== null) this.fsyncPath(entry.targetPath);
                this.fsyncPath(path.dirname(entry.targetPath));
            }
            if (!this.artifactMatchesPath(entry.targetPath, desired)) {
                throw new Error(`Durable authority restoration digest verification failed for '${entry.targetPath}'.`);
            }
            transaction.nextEntry = index + 1;
            this.writeDurableAuthorityRestoreTransaction(journalPath, transaction);
        }
        transaction.phase = 'committed';
        this.writeDurableAuthorityRestoreTransaction(journalPath, transaction);
        for (const entry of transaction.entries) {
            fs.rmSync(entry.temporaryPath, { force: true });
            fs.rmSync(entry.displacedPath, { force: true });
            this.fsyncPath(path.dirname(entry.targetPath));
        }
        fs.rmSync(journalPath, { force: true });
        this.fsyncPath(path.dirname(journalPath));
    }

    parseDurableAuthorityRestoreTransaction(
        journalPath: string,
    ): DurableAuthorityRestoreTransaction {
        const parsed = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as DurableAuthorityRestoreTransaction;
        if (
            parsed?.schemaVersion !== 1
            || typeof parsed.id !== 'string'
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
            || typeof parsed.canonicalRoot !== 'string'
            || !['prepared', 'swapping', 'committed'].includes(parsed.phase)
            || !Number.isSafeInteger(parsed.nextEntry)
            || parsed.nextEntry < 0
            || !Array.isArray(parsed.entries)
            || parsed.entries.length !== 2
            || parsed.nextEntry > parsed.entries.length
        ) throw new Error(`Durable authority restoration journal '${journalPath}' is invalid.`);
        const canonicalRoot = this.canonicalizeCodebasePath(parsed.canonicalRoot);
        const expectedJournalPath = path.join(this.journalRoot(), `${parsed.id}.json`);
        if (
            canonicalRoot !== parsed.canonicalRoot
            || path.resolve(journalPath) !== path.resolve(expectedJournalPath)
        ) throw new Error(`Durable authority restoration journal '${journalPath}' is invalid.`);
        const expectedTargets = [
            this.resolvePolicyPath(canonicalRoot),
            this.resolveNavigationPointerPath(canonicalRoot),
        ];
        for (const [index, entry] of parsed.entries.entries()) {
            const expectedTarget = expectedTargets[index];
            if (
                !entry
                || !expectedTarget
                || entry.targetPath !== expectedTarget
                || entry.temporaryPath !== `${expectedTarget}.restore-${parsed.id}`
                || entry.displacedPath !== `${expectedTarget}.rollback-${parsed.id}`
                || (entry.content !== null && typeof entry.content !== 'string')
                || (entry.digest !== null && !/^[a-f0-9]{64}$/.test(entry.digest))
                || (entry.expectedDigest !== null && !/^[a-f0-9]{64}$/.test(entry.expectedDigest))
                || ((entry.content === null) !== (entry.digest === null))
                || (entry.content !== null
                    && crypto.createHash('sha256').update(entry.content, 'utf8').digest('hex') !== entry.digest)
            ) throw new Error(`Durable authority restoration journal '${journalPath}' has an invalid entry.`);
        }
        return parsed;
    }

    recoverDurableIndexAuthorityTransactions(
        recoveryPublisher: DurableAuthorityRecoveryPublisher | undefined,
    ): void {
        const journalRoot = this.journalRoot();
        if (!fs.existsSync(journalRoot)) return;
        const journalNames = fs.readdirSync(journalRoot)
            .filter((entry) => entry.endsWith('.json'))
            .sort();
        if (journalNames.length === 0) return;
        if (!recoveryPublisher) {
            throw new Error(
                `Durable authority recovery is required for ${journalNames.length} pending transaction(s), but no fenced recovery publisher is configured.`,
            );
        }
        for (const name of journalNames) {
            const journalPath = path.join(journalRoot, name);
            const transaction = this.parseDurableAuthorityRestoreTransaction(journalPath);
            let publicationCount = 0;
            const recovered = recoveryPublisher(
                transaction.canonicalRoot,
                transaction.mutationOwner,
                () => {
                    publicationCount += 1;
                    if (publicationCount > 1) {
                        throw new Error(`Durable authority recovery '${transaction.id}' published more than once.`);
                    }
                    this.withMutationLock(transaction.canonicalRoot, () => {
                        this.completeDurableAuthorityRestoreTransaction(journalPath, transaction);
                    });
                },
            );
            if ((recovered && publicationCount !== 1) || (!recovered && publicationCount !== 0)) {
                throw new Error(`Durable authority recovery publisher violated the publication contract for '${transaction.id}'.`);
            }
            if (!recovered) {
                throw new Error(
                    `Durable authority recovery '${transaction.id}' could not acquire the mutation fence.`,
                );
            }
        }
    }
}

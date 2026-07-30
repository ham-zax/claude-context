import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MALFORMED_LOCK_STALE_MILLISECONDS = 30_000;

type MutationLockMetadata = Readonly<{
    pid: number;
    processStartTime?: string;
    ownerToken: string;
    acquiredAt: string;
}>;

type MutationLockHandle = Readonly<{
    descriptor: number;
    lockPath: string;
    ownerToken: string;
}>;

type IndexPolicyMutationCoordinatorConfig = Readonly<{
    stateRoot: string;
    verifyPolicyDocumentDigest: (policyPath: string) => string;
}>;

function resolveLinuxProcessStartTime(pid: number): string | undefined {
    if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid <= 0) {
        return undefined;
    }
    try {
        const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const commandEnd = raw.lastIndexOf(')');
        if (commandEnd < 0) return undefined;
        const fieldsAfterCommand = raw.slice(commandEnd + 2).trim().split(/\s+/);
        return fieldsAfterCommand[19] || undefined;
    } catch {
        return undefined;
    }
}

function isProcessAlive(pid: number): boolean {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

function parseMutationLockMetadata(raw: string): MutationLockMetadata | null {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (
            !parsed
            || typeof parsed !== 'object'
            || !Number.isSafeInteger(parsed.pid)
            || Number(parsed.pid) <= 0
            || typeof parsed.ownerToken !== 'string'
            || parsed.ownerToken.length === 0
            || typeof parsed.acquiredAt !== 'string'
            || (
                parsed.processStartTime !== undefined
                && typeof parsed.processStartTime !== 'string'
            )
        ) {
            return null;
        }
        return {
            pid: Number(parsed.pid),
            ownerToken: parsed.ownerToken,
            acquiredAt: parsed.acquiredAt,
            ...(typeof parsed.processStartTime === 'string'
                ? { processStartTime: parsed.processStartTime }
                : {}),
        };
    } catch {
        return null;
    }
}

export class IndexPolicyMutationCoordinator {
    private readonly stateRoot: string;
    private readonly verifyPolicyDocumentDigest: (policyPath: string) => string;

    constructor(config: IndexPolicyMutationCoordinatorConfig) {
        this.stateRoot = config.stateRoot;
        this.verifyPolicyDocumentDigest = config.verifyPolicyDocumentDigest;
    }

    resolvePolicyPath(canonicalRoot: string): string {
        const digest = crypto.createHash('sha256').update(canonicalRoot).digest('hex');
        return path.join(this.stateRoot, `${digest}.json`);
    }

    withLock<T>(canonicalRoot: string, operation: () => T): T {
        const handle = this.acquireLock(canonicalRoot);
        try {
            return operation();
        } finally {
            this.releaseLock(handle);
        }
    }

    async withLockAsync<T>(
        canonicalRoot: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const handle = this.acquireLock(canonicalRoot);
        try {
            return await operation();
        } finally {
            this.releaseLock(handle);
        }
    }

    recoverTombstonesWhileLocked(targetPath: string): void {
        const directory = path.dirname(targetPath);
        const prefix = `${path.basename(targetPath)}.removed-`;
        let entries: string[];
        try {
            entries = fs.readdirSync(directory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
        const tombstones = entries
            .filter((entry) => entry.startsWith(prefix))
            .map((entry) => path.join(directory, entry));
        const committed = tombstones.filter((entry) => (
            path.basename(entry).startsWith(`${prefix}committed-`)
        ));
        for (const committedPath of committed) fs.rmSync(committedPath, { force: true });
        const pending = tombstones.filter((entry) => !committed.includes(entry));
        if (pending.length === 0) return;
        if (!fs.existsSync(targetPath)) {
            if (pending.length !== 1) {
                throw new Error(
                    `Cannot recover index policy removal: ${pending.length} pending tombstones exist while '${targetPath}' is absent.`,
                );
            }
            this.verifyPolicyDocumentDigest(pending[0]);
            fs.renameSync(pending[0], targetPath);
            return;
        }
        const targetDigest = this.verifyPolicyDocumentDigest(targetPath);
        for (const pendingPath of pending) {
            const pendingDigest = this.verifyPolicyDocumentDigest(pendingPath);
            if (pendingDigest !== targetDigest) {
                throw new Error(
                    `Conflicting index policy removal tombstone '${pendingPath}' was preserved beside '${targetPath}'.`,
                );
            }
            fs.rmSync(pendingPath, { force: true });
        }
    }

    private acquireLock(canonicalRoot: string): MutationLockHandle {
        fs.mkdirSync(this.stateRoot, { recursive: true });
        const lockPath = `${this.resolvePolicyPath(canonicalRoot)}.mutation.lock`;
        const ownerToken = crypto.randomUUID();
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const descriptor = fs.openSync(lockPath, 'wx');
                try {
                    const processStartTime = resolveLinuxProcessStartTime(process.pid);
                    fs.writeFileSync(descriptor, JSON.stringify({
                        pid: process.pid,
                        ...(processStartTime ? { processStartTime } : {}),
                        ownerToken,
                        acquiredAt: new Date().toISOString(),
                    }));
                } catch (error) {
                    fs.closeSync(descriptor);
                    fs.rmSync(lockPath, { force: true });
                    throw error;
                }
                return { descriptor, lockPath, ownerToken };
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
                if (this.tryRecoverAbandonedLock(lockPath)) continue;
                let metadata: MutationLockMetadata | null = null;
                try {
                    metadata = parseMutationLockMetadata(
                        fs.readFileSync(lockPath, 'utf8'),
                    );
                } catch {
                    // An unreadable live lock remains authoritative.
                }
                if (metadata?.pid === process.pid) {
                    throw new Error(
                        `Index policy mutation lock is already held in this process for '${canonicalRoot}'.`,
                    );
                }
                throw new Error(
                    `Index policy mutation lock is held by another live or unverified owner for '${canonicalRoot}' at '${lockPath}'.`,
                );
            }
        }
        throw new Error(
            `Index policy mutation lock recovery did not converge for '${canonicalRoot}' at '${lockPath}'.`,
        );
    }

    private tryRecoverAbandonedLock(lockPath: string): boolean {
        let raw: string;
        let observation: fs.Stats;
        try {
            observation = fs.statSync(lockPath);
            raw = fs.readFileSync(lockPath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
            throw error;
        }
        const metadata = parseMutationLockMetadata(raw);
        if (!metadata) {
            if (
                Date.now() - observation.mtimeMs
                < MALFORMED_LOCK_STALE_MILLISECONDS
            ) {
                return false;
            }
        } else if (isProcessAlive(metadata.pid)) {
            const observedStartTime = resolveLinuxProcessStartTime(metadata.pid);
            if (
                !metadata.processStartTime
                || !observedStartTime
                || metadata.processStartTime === observedStartTime
            ) {
                return false;
            }
        }
        const quarantinePath = `${lockPath}.stale-${process.pid}-${crypto.randomUUID()}`;
        try {
            fs.renameSync(lockPath, quarantinePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
            throw error;
        }
        try {
            const quarantined = fs.statSync(quarantinePath);
            const quarantinedRaw = fs.readFileSync(quarantinePath, 'utf8');
            const quarantinedMetadata = parseMutationLockMetadata(quarantinedRaw);
            const sameIdentity = observation.dev === quarantined.dev
                && observation.ino === quarantined.ino;
            const sameOwner = metadata === null
                ? quarantinedMetadata === null && quarantinedRaw === raw
                : quarantinedMetadata?.ownerToken === metadata.ownerToken
                    && quarantinedMetadata.pid === metadata.pid
                    && quarantinedMetadata.processStartTime === metadata.processStartTime;
            if (!sameIdentity || !sameOwner) {
                if (!fs.existsSync(lockPath)) fs.renameSync(quarantinePath, lockPath);
                throw new Error(
                    `Index policy mutation lock changed during abandoned-owner recovery at '${lockPath}'.`,
                );
            }
            fs.rmSync(quarantinePath, { force: true });
            return true;
        } catch (error) {
            if (fs.existsSync(quarantinePath) && !fs.existsSync(lockPath)) {
                try {
                    fs.renameSync(quarantinePath, lockPath);
                } catch {
                    // Preserve quarantine when recovery ownership is ambiguous.
                }
            }
            throw error;
        }
    }

    private releaseLock(handle: MutationLockHandle): void {
        try {
            fs.closeSync(handle.descriptor);
        } catch {
            // Best-effort close; ownership is verified before unlinking.
        }
        try {
            const metadata = parseMutationLockMetadata(
                fs.readFileSync(handle.lockPath, 'utf8'),
            );
            if (metadata?.ownerToken === handle.ownerToken) {
                fs.rmSync(handle.lockPath, { force: true });
            }
        } catch {
            // A missing or replaced lock must not be removed by the former owner.
        }
    }
}

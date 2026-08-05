import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
    SHARED_RUNTIME_PROTOCOL_VERSION,
    type SharedRuntimeIdentity,
    type SharedRuntimePaths,
} from "./shared-runtime-identity.js";

export type LinuxProcessIdentity = Readonly<{
    pid: number;
    bootId: string;
    startTime: string;
}>;

export type SharedRuntimeHostMetadata = Readonly<{
    formatVersion: 1;
    protocolVersion: number;
    hostPid: number;
    bootId: string;
    processStartTime: string;
    mcpVersion: string;
    sharedRuntimeIdentityHash: string;
    installedRuntimeRoot: string;
    /** Lifecycle-state ownership marker only; never used to authenticate launcher attach sessions. */
    ownershipToken: string;
    socketPath: string;
    socketDevice: number;
    socketInode: number;
    readyAt: string;
}>;

type LifecycleLockRecord = Readonly<{
    formatVersion: 1;
    pid: number;
    bootId: string;
    processStartTime: string;
    ownershipToken: string;
    acquiredAt: string;
}>;

export type LifecycleLock = Readonly<{
    ownershipToken: string;
    release(): void;
}>;

function readBootId(): string {
    return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
}

export function readLinuxProcessIdentity(pid = process.pid): LinuxProcessIdentity | null {
    try {
        const raw = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const commandEnd = raw.lastIndexOf(")");
        if (commandEnd < 0) return null;
        const fieldsAfterCommand = raw.slice(commandEnd + 2).trim().split(/\s+/);
        const startTime = fieldsAfterCommand[19];
        if (!startTime) return null;
        return Object.freeze({
            pid,
            bootId: readBootId(),
            startTime,
        });
    } catch {
        return null;
    }
}

export function isLinuxProcessIdentityLive(
    identity: Pick<LinuxProcessIdentity, "pid" | "bootId" | "startTime">,
): boolean {
    const current = readLinuxProcessIdentity(identity.pid);
    return current !== null
        && current.bootId === identity.bootId
        && current.startTime === identity.startTime;
}

function parseRecord(value: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

export function readHostMetadata(metadataPath: string): SharedRuntimeHostMetadata | null {
    try {
        const record = parseRecord(fs.readFileSync(metadataPath, "utf8"));
        if (
            !record
            || record.formatVersion !== 1
            || record.protocolVersion !== SHARED_RUNTIME_PROTOCOL_VERSION
            || typeof record.hostPid !== "number"
            || typeof record.bootId !== "string"
            || typeof record.processStartTime !== "string"
            || typeof record.mcpVersion !== "string"
            || typeof record.sharedRuntimeIdentityHash !== "string"
            || typeof record.installedRuntimeRoot !== "string"
            || typeof record.ownershipToken !== "string"
            || typeof record.socketPath !== "string"
            || typeof record.socketDevice !== "number"
            || typeof record.socketInode !== "number"
            || typeof record.readyAt !== "string"
        ) {
            return null;
        }
        return Object.freeze(record as unknown as SharedRuntimeHostMetadata);
    } catch {
        return null;
    }
}

export function writeHostMetadataAtomic(
    metadataPath: string,
    metadata: SharedRuntimeHostMetadata,
): void {
    const temporary = `${metadataPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(metadata)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    fs.renameSync(temporary, metadataPath);
}

function readLockRecord(lockPath: string): LifecycleLockRecord | null {
    try {
        const record = parseRecord(fs.readFileSync(lockPath, "utf8"));
        if (
            !record
            || record.formatVersion !== 1
            || typeof record.pid !== "number"
            || typeof record.bootId !== "string"
            || typeof record.processStartTime !== "string"
            || typeof record.ownershipToken !== "string"
            || typeof record.acquiredAt !== "string"
        ) {
            return null;
        }
        return Object.freeze(record as unknown as LifecycleLockRecord);
    } catch {
        return null;
    }
}

function sameFileIdentity(left: fs.Stats, right: fs.Stats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function removeStaleLockWithoutReplacingNewOwner(lockPath: string): boolean {
    const claimPath = `${lockPath}.${process.pid}.${crypto.randomUUID()}.stale-claim`;
    try {
        fs.linkSync(lockPath, claimPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return true;
        }
        throw error;
    }

    try {
        const claimedOwner = readLockRecord(claimPath);
        if (
            claimedOwner
            && isLinuxProcessIdentityLive({
                pid: claimedOwner.pid,
                bootId: claimedOwner.bootId,
                startTime: claimedOwner.processStartTime,
            })
        ) {
            return false;
        }

        let lockStat: fs.Stats;
        let claimStat: fs.Stats;
        try {
            lockStat = fs.lstatSync(lockPath);
            claimStat = fs.lstatSync(claimPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return true;
            }
            throw error;
        }
        if (!sameFileIdentity(lockStat, claimStat) || claimStat.nlink !== 2) {
            return false;
        }

        // Keep our hard-link claim until after unlinking the canonical name.
        // Any concurrent stale cleaner then observes either a different inode,
        // no canonical lock, or more than two links and cannot delete a
        // replacement owner's lock.
        fs.unlinkSync(lockPath);
        return true;
    } finally {
        try {
            fs.unlinkSync(claimPath);
        } catch {
            // The unique claim is non-authoritative after this attempt.
        }
    }
}

function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function acquireLifecycleLock(
    lockPath: string,
    timeoutMs = 10_000,
): Promise<LifecycleLock> {
    const current = readLinuxProcessIdentity();
    if (!current) {
        throw new Error("Cannot establish Linux process identity for shared runtime lifecycle lock.");
    }
    const ownershipToken = crypto.randomUUID();
    const record: LifecycleLockRecord = Object.freeze({
        formatVersion: 1,
        pid: current.pid,
        bootId: current.bootId,
        processStartTime: current.startTime,
        ownershipToken,
        acquiredAt: new Date().toISOString(),
    });
    const deadline = Date.now() + timeoutMs;

    for (;;) {
        const candidatePath = `${lockPath}.${current.pid}.${ownershipToken}.candidate`;
        try {
            fs.writeFileSync(candidatePath, `${JSON.stringify(record)}\n`, {
                encoding: "utf8",
                mode: 0o600,
                flag: "wx",
            });
            // A same-filesystem hard link publishes the complete owner record
            // atomically without the empty-file window of open(O_EXCL)+write.
            fs.linkSync(candidatePath, lockPath);
            fs.unlinkSync(candidatePath);
            let released = false;
            return Object.freeze({
                ownershipToken,
                release(): void {
                    if (released) return;
                    released = true;
                    const active = readLockRecord(lockPath);
                    if (active?.ownershipToken === ownershipToken) {
                        fs.unlinkSync(lockPath);
                    }
                },
            });
        } catch (error) {
            try {
                fs.unlinkSync(candidatePath);
            } catch (cleanupError) {
                if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw cleanupError;
                }
            }
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST") throw error;
        }

        const owner = readLockRecord(lockPath);
        const ownerLive = owner
            ? isLinuxProcessIdentityLive({
                pid: owner.pid,
                bootId: owner.bootId,
                startTime: owner.processStartTime,
            })
            : false;
        if (!ownerLive && removeStaleLockWithoutReplacingNewOwner(lockPath)) {
            continue;
        }
        if (Date.now() >= deadline) {
            throw new Error(`Timed out waiting for shared runtime lifecycle lock '${lockPath}'.`);
        }
        await wait(25);
    }
}

export function metadataMatchesIdentity(
    metadata: SharedRuntimeHostMetadata,
    identity: SharedRuntimeIdentity,
): boolean {
    return metadata.sharedRuntimeIdentityHash === identity.hash
        && metadata.mcpVersion === identity.mcpVersion
        && path.resolve(metadata.installedRuntimeRoot) === path.resolve(identity.installedRuntimeRoot);
}

export function removeOwnedLifecycleState(
    paths: SharedRuntimePaths,
    expected: Pick<
        SharedRuntimeHostMetadata,
        "hostPid" | "bootId" | "processStartTime" | "ownershipToken"
        | "sharedRuntimeIdentityHash" | "socketPath" | "socketDevice" | "socketInode"
    >,
): void {
    const current = readHostMetadata(paths.metadataPath);
    if (
        !current
        || current.hostPid !== expected.hostPid
        || current.bootId !== expected.bootId
        || current.processStartTime !== expected.processStartTime
        || current.ownershipToken !== expected.ownershipToken
        || current.sharedRuntimeIdentityHash !== expected.sharedRuntimeIdentityHash
        || current.socketPath !== expected.socketPath
        || current.socketDevice !== expected.socketDevice
        || current.socketInode !== expected.socketInode
    ) {
        return;
    }

    try {
        const socket = fs.lstatSync(expected.socketPath);
        if (
            socket.isSocket()
            && socket.dev === expected.socketDevice
            && socket.ino === expected.socketInode
        ) {
            fs.unlinkSync(expected.socketPath);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const stillCurrent = readHostMetadata(paths.metadataPath);
    if (stillCurrent?.ownershipToken === expected.ownershipToken) {
        fs.unlinkSync(paths.metadataPath);
    }
}

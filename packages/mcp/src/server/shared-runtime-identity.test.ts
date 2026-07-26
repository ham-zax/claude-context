import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    buildSharedRuntimeIdentity,
    isSharedOfflineRuntimeEligible,
    resolveSharedRuntimePaths,
} from "./shared-runtime-identity.js";
import {
    acquireLifecycleLock,
    isLinuxProcessIdentityLive,
    readLinuxProcessIdentity,
    removeOwnedLifecycleState,
    writeHostMetadataAtomic,
} from "./shared-runtime-lifecycle.js";

const runtimeEntry = path.resolve("dist/index.js");

function offlineEnv(root: string): NodeJS.ProcessEnv {
    return {
        SATORI_STATE_ROOT: root,
        XDG_RUNTIME_DIR: path.join(root, "xdg"),
        SATORI_RUNTIME_PROFILE: "offline",
        EMBEDDING_PROVIDER: "Potion",
        EMBEDDING_MODEL: "potion-test",
        EMBEDDING_OUTPUT_DIMENSION: "256",
        POTION_HELPER_PATH: path.join(root, "helper"),
        POTION_MODEL_PATH: path.join(root, "model"),
        POTION_REQUEST_TIMEOUT_MS: "5000",
        VECTOR_STORE_PROVIDER: "LanceDB",
        LANCEDB_PATH: path.join(root, "lancedb"),
        MCP_ENABLE_WATCHER: "true",
        MCP_WATCH_DEBOUNCE_MS: "5000",
    };
}

test("shared runtime identity is exact, non-secret, and bounded to eligible Linux configurations", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-identity-"));
    fs.mkdirSync(path.join(root, "xdg"), { mode: 0o700 });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const env = offlineEnv(root);
    env.VOYAGEAI_API_KEY = "must-not-be-hashed";

    assert.equal(isSharedOfflineRuntimeEligible(env, "linux", "x64"), true);
    assert.equal(isSharedOfflineRuntimeEligible(env, "win32", "x64"), false);
    assert.equal(isSharedOfflineRuntimeEligible({ ...env, EMBEDDING_PROVIDER: "Ollama" }), false);

    const identity = buildSharedRuntimeIdentity(runtimeEntry, env);
    const changed = buildSharedRuntimeIdentity(runtimeEntry, {
        ...env,
        MCP_WATCH_DEBOUNCE_MS: "6000",
    });
    assert.equal(identity.hash, changed.hash);
    assert.notEqual(
        buildSharedRuntimeIdentity(runtimeEntry, {
            ...env,
            CUSTOM_IGNORE_PATTERNS: "generated/**",
        }).hash,
        identity.hash,
    );
    assert.notEqual(
        buildSharedRuntimeIdentity(runtimeEntry, {
            ...env,
            SATORI_NAVIGATION_BACKEND: "sqlite",
        }).hash,
        identity.hash,
    );
    assert.equal(JSON.stringify(identity).includes("must-not-be-hashed"), false);
    assert.equal(identity.stateRoot, root);
    assert.notEqual(
        buildSharedRuntimeIdentity(runtimeEntry, {
            ...env,
            SATORI_STATE_ROOT: path.join(root, "different-state"),
        }).hash,
        identity.hash,
    );

    const paths = resolveSharedRuntimePaths(identity, env);
    assert.equal(paths.metadataPath.includes(identity.hash), true);
    assert.equal(Buffer.byteLength(paths.socketPath), Buffer.byteLength(paths.socketPath, "utf8"));
    assert.ok(Buffer.byteLength(paths.socketPath, "utf8") <= 100);
    assert.equal(fs.lstatSync(path.dirname(paths.socketPath)).mode & 0o077, 0);
});

test("shared runtime identity canonicalizes filesystem aliases", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-alias-"));
    const actual = path.join(root, "actual");
    const alias = path.join(root, "alias");
    fs.mkdirSync(actual);
    fs.symlinkSync(actual, alias, "dir");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const actualEnv = offlineEnv(actual);
    const aliasEnv = Object.fromEntries(Object.entries(actualEnv).map(([key, value]) => [
        key,
        value?.replace(actual, alias),
    ]));
    assert.equal(
        buildSharedRuntimeIdentity(runtimeEntry, actualEnv).hash,
        buildSharedRuntimeIdentity(runtimeEntry, aliasEnv).hash,
    );
});

test("lifecycle lock recovers a stale process owner and preserves a live owner", async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-lock-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockPath = path.join(root, "startup.lock");
    fs.writeFileSync(lockPath, JSON.stringify({
        formatVersion: 1,
        pid: 999_999_999,
        bootId: "dead",
        processStartTime: "0",
        ownershipToken: "stale",
        acquiredAt: new Date(0).toISOString(),
    }));

    const acquired = await acquireLifecycleLock(lockPath, 250);
    assert.equal(fs.existsSync(lockPath), true);
    acquired.release();
    assert.equal(fs.existsSync(lockPath), false);

    const current = readLinuxProcessIdentity();
    assert.ok(current);
    assert.equal(isLinuxProcessIdentityLive({
        pid: current.pid,
        bootId: `${current.bootId}-different`,
        startTime: current.startTime,
    }), false);
    assert.equal(isLinuxProcessIdentityLive({
        pid: current.pid,
        bootId: current.bootId,
        startTime: `${current.startTime}0`,
    }), false);
    fs.writeFileSync(lockPath, JSON.stringify({
        formatVersion: 1,
        pid: current.pid,
        bootId: current.bootId,
        processStartTime: current.startTime,
        ownershipToken: "live",
        acquiredAt: new Date().toISOString(),
    }));
    await assert.rejects(
        acquireLifecycleLock(lockPath, 50),
        /Timed out waiting/,
    );
});

test("concurrent stale-lock recovery never admits two lifecycle owners", async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-lock-race-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lockPath = path.join(root, "startup.lock");
    fs.writeFileSync(lockPath, JSON.stringify({
        formatVersion: 1,
        pid: 999_999_999,
        bootId: "dead",
        processStartTime: "0",
        ownershipToken: "stale",
        acquiredAt: new Date(0).toISOString(),
    }));

    let activeOwners = 0;
    let maximumActiveOwners = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
        const lock = await acquireLifecycleLock(lockPath, 2_000);
        activeOwners += 1;
        maximumActiveOwners = Math.max(maximumActiveOwners, activeOwners);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeOwners -= 1;
        lock.release();
    }));

    assert.equal(maximumActiveOwners, 1);
    assert.equal(fs.existsSync(lockPath), false);
});

test("lifecycle cleanup removes only the socket and metadata owned by the exiting host", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-cleanup-"));
    const xdg = path.join(root, "xdg");
    fs.mkdirSync(xdg, { mode: 0o700 });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const env = offlineEnv(root);
    env.XDG_RUNTIME_DIR = xdg;
    const identity = buildSharedRuntimeIdentity(runtimeEntry, env);
    const paths = resolveSharedRuntimePaths(identity, env);
    const current = readLinuxProcessIdentity();
    assert.ok(current);

    fs.writeFileSync(paths.socketPath, "not-a-socket");
    const socketStat = fs.lstatSync(paths.socketPath);
    const original = {
        formatVersion: 1 as const,
        protocolVersion: 1,
        hostPid: current.pid,
        bootId: current.bootId,
        processStartTime: current.startTime,
        mcpVersion: identity.mcpVersion,
        sharedRuntimeIdentityHash: identity.hash,
        installedRuntimeRoot: identity.installedRuntimeRoot,
        ownershipToken: "original-owner",
        socketPath: paths.socketPath,
        socketDevice: socketStat.dev,
        socketInode: socketStat.ino,
        readyAt: new Date().toISOString(),
    };
    writeHostMetadataAtomic(paths.metadataPath, original);
    removeOwnedLifecycleState(paths, original);
    assert.equal(fs.existsSync(paths.socketPath), true);
    assert.equal(fs.existsSync(paths.metadataPath), false);

    const replacement = {
        ...original,
        ownershipToken: "replacement-owner",
    };
    writeHostMetadataAtomic(paths.metadataPath, replacement);
    removeOwnedLifecycleState(paths, original);
    assert.equal(fs.existsSync(paths.socketPath), true);
    assert.equal(
        JSON.parse(fs.readFileSync(paths.metadataPath, "utf8")).ownershipToken,
        "replacement-owner",
    );
});

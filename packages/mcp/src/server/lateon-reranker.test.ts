import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    LATEON_RUNTIME_PROFILE_IDS,
    LateOnOperationalError,
    LateOnReranker,
    loadLateOnRuntimeProfile,
} from "./lateon-reranker.js";

type FakeWorkerOptions = Readonly<{
    readyDelayMilliseconds?: number;
    readinessMismatch?: boolean;
    pidLogPath?: string;
}>;

function createFakeWorker(t: test.TestContext, options: FakeWorkerOptions = {}): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "satori-lateon-worker-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const workerPath = path.join(directory, "worker.cjs");
    fs.writeFileSync(workerPath, `
const fs = require("node:fs");
const options = ${JSON.stringify(options)};
function sendResults(message) {
    if (message.query === "hang") return;
    if (message.query === "malformed") {
        process.send({
            type: "result",
            requestId: message.requestId,
            results: [{ index: 0, relevanceScore: 1 }, { index: 0, relevanceScore: 2 }],
        });
        return;
    }
    const respond = () => {
        const results = message.identities
            .map((identity, index) => ({
                index,
                identity,
                relevanceScore: message.documents[index].length,
            }))
            .sort((left, right) =>
                right.relevanceScore - left.relevanceScore
                || (left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0)
            )
            .map(({ index, relevanceScore }) => ({ index, relevanceScore }));
        process.send({ type: "result", requestId: message.requestId, results });
    };
    const delay = message.query.startsWith("slow:")
        ? Number(message.query.slice("slow:".length))
        : 0;
    setTimeout(respond, delay);
}
process.on("message", (message) => {
    if (message.type === "initialize") {
        if (options.pidLogPath) fs.appendFileSync(options.pidLogPath, String(process.pid) + "\\n");
        setTimeout(() => process.send({
            type: "ready",
            modelRevision: message.profile.identity.revision,
            profileDigest: options.readinessMismatch ? "0".repeat(64) : message.profileDigest,
            projectionVersion: message.profile.identity.projectionVersion,
            candidateDepth: message.profile.inference.candidateDepth,
        }), options.readyDelayMilliseconds || 0);
        return;
    }
    sendResults(message);
});
`, "utf8");
    return workerPath;
}

async function assertOperationalReason(
    promise: Promise<unknown>,
    reason: LateOnOperationalError["reason"],
): Promise<void> {
    await assert.rejects(promise, (error: unknown) => (
        error instanceof LateOnOperationalError && error.reason === reason
    ));
}

test("LateOn runtime profiles default to D32 while retaining explicit legacy and D16 contracts", () => {
    const defaultProfile = loadLateOnRuntimeProfile();
    const legacy = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.legacyD16);
    const d16 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.projectionV2D16);
    const d32 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32);

    assert.equal(defaultProfile.identity.projectionVersion, "search_rerank_document_v2");
    assert.equal(defaultProfile.inference.candidateDepth, 32);
    assert.equal(legacy.identity.projectionVersion, "search_rerank_document_v1");
    assert.equal(d16.identity.projectionVersion, "search_rerank_document_v2");
    assert.equal(d16.inference.candidateDepth, 16);
    assert.equal(d32.identity.projectionVersion, "search_rerank_document_v2");
    assert.equal(d32.inference.candidateDepth, 32);
    assert.equal(
        d32.schemaVersion === "satori_lateon_runtime_profile_v2"
            ? d32.operationalBounds.maximumQueueWaitMilliseconds
            : undefined,
        250,
    );
});

test("LateOn identity binds named profile selection and effective operational bounds", async (t) => {
    const workerPath = createFakeWorker(t);
    const defaultD32 = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath,
    });
    const stricterD32 = new LateOnReranker({
        modelDirectory: "/other",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        maximumQueueWaitMilliseconds: 100,
        workerPath,
    });
    const d16 = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.projectionV2D16,
        workerPath,
    });
    t.after(async () => Promise.all([
        defaultD32.close(),
        stricterD32.close(),
        d16.close(),
    ]).then(() => undefined));

    assert.equal(defaultD32.getMaxDocuments(), 32);
    assert.equal(d16.getMaxDocuments(), 16);
    assert.equal(defaultD32.getDocumentProjectionVersion(), "search_rerank_document_v2");
    assert.notEqual(defaultD32.getIdentity().profile, stricterD32.getIdentity().profile);
    assert.equal(
        defaultD32.getIdentity().profile,
        "f7d1043ac0606bc065cced6b53d3620cc3b8cf2f4b4dcf867aa76883f51ff222",
    );
    assert.notEqual(defaultD32.getIdentity().profile, d16.getIdentity().profile);
    assert.throws(() => new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        maximumQueueWaitMilliseconds: 251,
        workerPath,
    }), /cannot exceed/);
    assert.throws(() => new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        intraOpThreads: 4,
        workerPath,
    }), /thread policy is immutable/);
});

test("LateOn preserves the explicitly selected legacy v1 profile identity and startup behavior", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.legacyD16,
        workerPath: createFakeWorker(t, { readyDelayMilliseconds: 50 }),
    });
    t.after(() => reranker.close());

    assert.equal(
        reranker.getIdentity().profile,
        "3593ce0284d7a5aded475ec4be118b6cb738c47643ef27ca70660f67191f12f0",
    );
    assert.deepEqual(
        await reranker.rerank("legacy waits for eager startup", ["document"]),
        [{ index: 0, relevanceScore: 8 }],
    );
});

test("projection-v2 requests fall back immediately while eager readiness is incomplete", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: createFakeWorker(t, { readyDelayMilliseconds: 100 }),
    });
    t.after(() => reranker.close());

    await assertOperationalReason(
        reranker.rerank("find owner", ["document"]),
        "lateon_not_ready",
    );
    await reranker.waitUntilReady();
    assert.deepEqual(
        await reranker.rerank("find owner", ["document"]),
        [{ index: 0, relevanceScore: 8 }],
    );
});

test("LateOn fails closed when worker readiness identity mismatches the selected profile", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: createFakeWorker(t, { readinessMismatch: true }),
    });
    t.after(() => reranker.close());

    await assertOperationalReason(reranker.waitUntilReady(), "lateon_worker_failure");
    assert.equal(reranker.getOperationalState(), "unhealthy");
    await assertOperationalReason(
        reranker.rerank("find owner", ["document"]),
        "lateon_not_ready",
    );
});

test("LateOn admits one active and one queued request and rejects further overlap", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        maximumQueueWaitMilliseconds: 200,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    const active = reranker.rerank("slow:80", ["active"]);
    const queued = reranker.rerank("queued", ["queued"]);
    await assertOperationalReason(
        reranker.rerank("overflow", ["overflow"]),
        "lateon_capacity_fallback",
    );
    assert.deepEqual(await active, [{ index: 0, relevanceScore: 6 }]);
    assert.deepEqual(await queued, [{ index: 0, relevanceScore: 6 }]);
});

test("LateOn expires queued work without disturbing the active request", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        maximumQueueWaitMilliseconds: 30,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    const active = reranker.rerank("slow:80", ["active"]);
    await assertOperationalReason(
        reranker.rerank("queued", ["queued"]),
        "lateon_queue_timeout",
    );
    assert.deepEqual(await active, [{ index: 0, relevanceScore: 6 }]);
});

test("LateOn execution timeout joins the old worker before clean recovery", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "satori-lateon-pids-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const pidLogPath = path.join(directory, "worker-pids.txt");
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        requestDeadlineMilliseconds: 40,
        workerPath: createFakeWorker(t, { pidLogPath }),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();
    const firstPid = Number(fs.readFileSync(pidLogPath, "utf8").trim());

    await assertOperationalReason(
        reranker.rerank("hang", ["document"]),
        "lateon_execution_timeout",
    );
    assert.throws(() => process.kill(firstPid, 0), /ESRCH/);
    await reranker.waitUntilReady();
    const pids = fs.readFileSync(pidLogPath, "utf8").trim().split("\n").map(Number);
    assert.equal(pids.length, 2);
    assert.notEqual(pids[0], pids[1]);
    assert.deepEqual(
        await reranker.rerank("recover", ["document"]),
        [{ index: 0, relevanceScore: 8 }],
    );
});

test("LateOn invalid output is rejected transactionally and restarts the worker", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    await assertOperationalReason(
        reranker.rerank("malformed", ["first", "second"]),
        "lateon_invalid_output",
    );
    await reranker.waitUntilReady();
    assert.deepEqual(
        await reranker.rerank("recover", ["document"]),
        [{ index: 0, relevanceScore: 8 }],
    );
});

test("LateOn cancellation removes queued work and terminates executing work", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    const activeController = new AbortController();
    const queuedController = new AbortController();
    const active = reranker.rerank("hang", ["active"], {
        signal: activeController.signal,
    } as Parameters<LateOnReranker["rerank"]>[2]);
    const queued = reranker.rerank("queued", ["queued"], {
        signal: queuedController.signal,
    } as Parameters<LateOnReranker["rerank"]>[2]);
    queuedController.abort();
    await assertOperationalReason(queued, "lateon_cancelled");
    activeController.abort();
    await assertOperationalReason(active, "lateon_cancelled");
    await reranker.waitUntilReady();
});

test("LateOn close rejects active and queued work and joins its worker", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: createFakeWorker(t),
    });
    await reranker.waitUntilReady();

    const active = reranker.rerank("hang", ["active"]);
    const queued = reranker.rerank("queued", ["queued"]);
    const activeRejection = assertOperationalReason(active, "lateon_cancelled");
    const queuedRejection = assertOperationalReason(queued, "lateon_cancelled");
    await reranker.close();
    await activeRejection;
    await queuedRejection;
    assert.equal(reranker.getOperationalState(), "closed");
    assert.deepEqual(reranker.getOperationalSnapshot(), {
        state: "closed",
        closed: true,
        workerAttached: false,
        activeRequest: false,
        activeTask: false,
        queuedRequest: false,
        pendingWorkerRequests: 0,
        readinessTimerActive: false,
        terminationActive: false,
    });
});

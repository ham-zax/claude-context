import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { RerankExecutionDiagnostics } from "@zokizuan/satori-core";
import {
    LATEON_RUNTIME_PROFILE_IDS,
    LateOnOperationalError,
    LateOnReranker,
    loadLateOnRuntimeProfile,
} from "./lateon-reranker.js";
import { resolveSearchRerankQuery } from "../core/search-rerank-query-routing.js";
import { loadSearchRerankRequestContract } from "../core/search-rerank-request-contract.js";
import { buildSearchRerankDocumentV4 } from "../core/search-rerank-document-v4.js";
import { buildSearchRerankQueryV2 } from "../core/search-rerank-query-v2.js";

type FakeWorkerOptions = Readonly<{
    readyDelayMilliseconds?: number;
    readinessMismatch?: boolean;
    pidLogPath?: string;
}>;

function createFakeWorker(t: { after(fn: () => void): void }, options: FakeWorkerOptions = {}): string {
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

test("LateOn runtime profiles default to the V4 D32 context profile while retaining explicit legacy and D16/V2 contracts", () => {
    const defaultProfile = loadLateOnRuntimeProfile();
    const legacy = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.legacyD16);
    const d16 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.projectionV2D16);
    const d32 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32);
    const contextV3 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.contextV3D32);

    assert.equal(defaultProfile.schemaVersion, "satori_lateon_runtime_profile_v4");
    assert.equal(defaultProfile.identity.projectionVersion, "search_rerank_document_v4");
    assert.equal(defaultProfile.identity.queryProjectionVersion, "search_rerank_query_v2");
    assert.equal(defaultProfile.inference.candidateDepth, 32);
    assert.equal(contextV3.schemaVersion, "satori_lateon_runtime_profile_v3");
    if (contextV3.schemaVersion !== "satori_lateon_runtime_profile_v3") {
        throw new Error("expected the v3 runtime profile");
    }
    assert.equal(contextV3.identity.projectionVersion, "search_rerank_document_v3");
    assert.equal(contextV3.identity.queryProjectionVersion, "search_rerank_query_v1");
    assert.equal(contextV3.inference.candidateDepth, 32);
    assert.equal(contextV3.identity.repository, d32.identity.repository);
    assert.equal(contextV3.identity.revision, d32.identity.revision);
    assert.notEqual(contextV3.identity.projectionSha256, d32.identity.projectionSha256);
    assert.deepEqual(contextV3.artifacts, d32.artifacts);
    assert.deepEqual(contextV3.runtime, d32.runtime);
    assert.deepEqual(contextV3.inference, d32.inference);
    if (d32.schemaVersion !== "satori_lateon_runtime_profile_v2") {
        throw new Error("expected the v2 runtime profile");
    }
    assert.deepEqual(contextV3.execution, d32.execution);
    assert.deepEqual(contextV3.operationalBounds, d32.operationalBounds);
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

test("LateOn activated context-v3 profile carries truthful qualification with identical v3 request behavior", () => {
    const historical = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.contextV3D32);
    const activated = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.contextV3D32Activated);
    if (
        historical.schemaVersion !== "satori_lateon_runtime_profile_v3"
        || activated.schemaVersion !== "satori_lateon_runtime_profile_v3"
    ) {
        throw new Error("expected the v3 runtime profiles");
    }
    assert.equal(historical.profileId, "lateon_offline_quality_projection_v3_d32_v1");
    assert.equal(
        historical.qualificationStatus,
        "disabled_optional_not_track_o_or_held_out_candidate",
    );
    assert.equal(activated.profileId, "lateon_offline_quality_projection_v3_d32_v2");
    assert.equal(
        activated.qualificationStatus,
        "owner_activated_operationally_qualified_not_held_out",
    );
    assert.equal(activated.identity.projectionVersion, "search_rerank_document_v3");
    assert.equal(activated.identity.queryProjectionVersion, "search_rerank_query_v1");
    assert.equal(activated.identity.projectionSha256, historical.identity.projectionSha256);
    assert.deepEqual(activated.artifacts, historical.artifacts);
    assert.deepEqual(activated.execution, historical.execution);
    assert.deepEqual(activated.operationalBounds, historical.operationalBounds);
    assert.deepEqual(activated.inference, historical.inference);
});

test("LateOn context-v4 profile advertises query-v2 and document-v4 projections with identical operational bounds", () => {
    const v4 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.contextV4D32);
    const v3 = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.contextV3D32Activated);
    assert.equal(v4.schemaVersion, "satori_lateon_runtime_profile_v4");
    if (v4.schemaVersion !== "satori_lateon_runtime_profile_v4") {
        throw new Error("expected the v4 runtime profile");
    }
    assert.equal(v4.profileId, "lateon_offline_quality_projection_v4_d32_v1");
    assert.equal(
        v4.qualificationStatus,
        "owner_activated_operationally_qualified_not_held_out",
    );
    assert.equal(v4.identity.projectionVersion, "search_rerank_document_v4");
    assert.equal(v4.identity.queryProjectionVersion, "search_rerank_query_v2");
    assert.equal(
        v4.identity.projectionSha256,
        "a44e5ab565d186a586554b787ac1783facd9871374105dacd6cac29f812aa98a",
    );
    assert.equal(
        v4.identity.requestContractSha256,
        loadSearchRerankRequestContract().contractSha256,
    );
    if (v3.schemaVersion !== "satori_lateon_runtime_profile_v3") {
        throw new Error("expected the v3 activated runtime profile");
    }
    assert.deepEqual(v4.artifacts, v3.artifacts);
    assert.deepEqual(v4.execution, v3.execution);
    assert.deepEqual(v4.operationalBounds, v3.operationalBounds);
    assert.deepEqual(v4.inference, v3.inference);
});

test("LateOn reranker defaults to the V4 profile and reports qualified projection identities", async (t) => {
    const workerPath = createFakeWorker(t);
    const defaulted = new LateOnReranker({ modelDirectory: "/unused", workerPath });
    const explicitV2D32 = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath,
    });
    const legacy = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.legacyD16,
        workerPath,
    });
    const contextV4 = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.contextV4D32,
        workerPath,
    });
    t.after(async () => Promise.all([
        defaulted.close(),
        explicitV2D32.close(),
        legacy.close(),
        contextV4.close(),
    ]).then(() => undefined));

    assert.equal(defaulted.getProfileId(), LATEON_RUNTIME_PROFILE_IDS.contextV4D32);
    assert.equal(defaulted.getMaxDocuments(), 32);
    assert.equal(defaulted.getDocumentProjectionVersion(), "search_rerank_document_v4");
    assert.equal(defaulted.getQueryProjectionVersion(), "search_rerank_query_v2");
    assert.equal(explicitV2D32.getDocumentProjectionVersion(), "search_rerank_document_v2");
    assert.equal(explicitV2D32.getQueryProjectionVersion(), "semantic_query_raw_v1");
    assert.equal(legacy.getDocumentProjectionVersion(), "search_rerank_document_v1");
    assert.equal(legacy.getQueryProjectionVersion(), "semantic_query_raw_v1");
    assert.equal(contextV4.getProfileId(), LATEON_RUNTIME_PROFILE_IDS.contextV4D32);
    assert.equal(contextV4.getMaxDocuments(), 32);
    assert.equal(contextV4.getDocumentProjectionVersion(), "search_rerank_document_v4");
    assert.equal(contextV4.getQueryProjectionVersion(), "search_rerank_query_v2");
});

test("LateOn advertised query identities route to the promised query projection", async (t) => {
    const workerPath = createFakeWorker(t);
    const contextV4 = new LateOnReranker({ modelDirectory: "/unused", workerPath });
    const explicitV2D32 = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath,
    });
    const legacy = new LateOnReranker({
        modelDirectory: "/unused",
        profileId: LATEON_RUNTIME_PROFILE_IDS.legacyD16,
        workerPath,
    });
    t.after(async () => Promise.all([
        contextV4.close(),
        explicitV2D32.close(),
        legacy.close(),
    ]).then(() => undefined));

    const rawQuestion = "how does Shariah compliance checking block trades";
    const focusedV1 = "Question:\nhow does Shariah compliance checking block trades\n\nAnswer focus: implementation";
    const focusedV2 = "Question:\nhow does Shariah compliance checking block trades\n\nRequested answer type:\nproduction implementation, control flow, and integration path";

    for (const historical of [explicitV2D32, legacy]) {
        const resolved = resolveSearchRerankQuery({
            semanticQuery: rawQuestion,
            focusedQueryV1: focusedV1,
            projectionIdentity: historical.getQueryProjectionVersion(),
        });
        assert.equal(resolved.query, rawQuestion);
        assert.equal(resolved.queryProjectionIdentity, "semantic_query_raw_v1");
    }

    const v4 = resolveSearchRerankQuery({
        semanticQuery: rawQuestion,
        focusedQueryV1: focusedV1,
        focusedQueryV2: focusedV2,
        projectionIdentity: contextV4.getQueryProjectionVersion(),
    });
    assert.equal(v4.query, focusedV2);
    assert.equal(v4.queryProjectionIdentity, "search_rerank_query_v2");
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

test("LateOn successful execution reports queue wait, qualified deadlines, and observed wall", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    const profile = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32);
    const bounds = profile.schemaVersion === "satori_lateon_runtime_profile_v2"
        ? profile.operationalBounds
        : undefined;
    assert.ok(bounds);

    const reported: { diagnostics: RerankExecutionDiagnostics | null } = { diagnostics: null };
    assert.deepEqual(
        await reranker.rerank("scored", ["alpha", "alphabetic"], {
            onExecutionDiagnostics: (diagnostics) => { reported.diagnostics = diagnostics; },
        }),
        [{ index: 1, relevanceScore: 10 }, { index: 0, relevanceScore: 5 }],
    );

    assert.ok(reported.diagnostics);
    assert.equal(reported.diagnostics.attempts, 1);
    assert.equal(reported.diagnostics.retries, 0);
    assert.equal(reported.diagnostics.timeouts, 0);
    assert.ok(typeof reported.diagnostics.queueWaitMs === "number" && reported.diagnostics.queueWaitMs >= 0);
    assert.ok(
        reported.diagnostics.effectiveScoreDeadlineMs !== undefined
        && reported.diagnostics.effectiveScoreDeadlineMs > 0
        && reported.diagnostics.effectiveScoreDeadlineMs <= bounds.maximumScoreMilliseconds,
    );
    assert.ok(
        reported.diagnostics.effectiveStageDeadlineMs !== undefined
        && reported.diagnostics.effectiveStageDeadlineMs > 0
        && reported.diagnostics.effectiveStageDeadlineMs <= bounds.maximumRerankerStageMilliseconds,
    );
    assert.ok(typeof reported.diagnostics.observedWallMs === "number" && reported.diagnostics.observedWallMs >= 0);
    assert.equal(reported.diagnostics.deadlineLatenessMs, undefined);
});

test("LateOn execution timeout reports deadline lateness without relaxing any deadline", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        requestDeadlineMilliseconds: 40,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    const profile = loadLateOnRuntimeProfile(LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32);
    const bounds = profile.schemaVersion === "satori_lateon_runtime_profile_v2"
        ? profile.operationalBounds
        : undefined;
    assert.ok(bounds);

    const reported: { diagnostics: RerankExecutionDiagnostics | null } = { diagnostics: null };
    await assertOperationalReason(
        reranker.rerank("hang", ["document"], {
            onExecutionDiagnostics: (diagnostics) => { reported.diagnostics = diagnostics; },
        }),
        "lateon_execution_timeout",
    );

    assert.ok(reported.diagnostics);
    assert.equal(reported.diagnostics.attempts, 1);
    assert.equal(reported.diagnostics.retries, 0);
    assert.equal(reported.diagnostics.timeouts, 1);
    assert.ok(typeof reported.diagnostics.queueWaitMs === "number" && reported.diagnostics.queueWaitMs >= 0);
    assert.ok(
        reported.diagnostics.effectiveScoreDeadlineMs !== undefined
        && reported.diagnostics.effectiveScoreDeadlineMs <= 40,
    );
    assert.ok(
        reported.diagnostics.effectiveStageDeadlineMs !== undefined
        && reported.diagnostics.effectiveStageDeadlineMs > 0
        && reported.diagnostics.effectiveStageDeadlineMs <= bounds.maximumRerankerStageMilliseconds,
    );
    assert.ok(typeof reported.diagnostics.observedWallMs === "number" && reported.diagnostics.observedWallMs >= 40);
    assert.equal(
        reported.diagnostics.deadlineLatenessMs,
        Math.max(
            0,
            (reported.diagnostics.observedWallMs ?? 0)
            - (reported.diagnostics.effectiveScoreDeadlineMs ?? 0),
        ),
    );
});

test("LateOn diagnostics callback failure never changes rerank behavior", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        requestDeadlineMilliseconds: 40,
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());
    await reranker.waitUntilReady();

    const throwing = (): void => { throw new Error("telemetry boom"); };
    assert.deepEqual(
        await reranker.rerank("scored", ["document"], { onExecutionDiagnostics: throwing }),
        [{ index: 0, relevanceScore: 8 }],
    );
    await assertOperationalReason(
        reranker.rerank("hang", ["document"], { onExecutionDiagnostics: throwing }),
        "lateon_execution_timeout",
    );
});

const realLateOnModelDirectory = process.env.SATORI_LATEON_MODEL_PATH;
test("LateOn v4 accepts query-v2 and document-v4 through the real tokenizer and model", {
    skip: !realLateOnModelDirectory || !fs.existsSync(path.join(realLateOnModelDirectory, "model.onnx")),
}, async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: realLateOnModelDirectory as string,
        profileId: LATEON_RUNTIME_PROFILE_IDS.contextV4D32,
    });
    t.after(async () => reranker.close());
    await reranker.waitUntilReady();
    const query = buildSearchRerankQueryV2({
        semanticQuery: "how does Shariah compliance checking block trades",
        answerFocus: "implementation",
    });
    const documents = [
        buildSearchRerankDocumentV4({
            relativePath: "src/veto.ts",
            language: "typescript",
            candidateRole: "implementation",
            symbolKind: "function",
            canonicalSymbolLabel: "validate_order",
            symbolSpan: { startLine: 1, endLine: 3 },
            content: [
                "function validate_order(order) {",
                "    return check_shariah_compliance(order);",
                "}",
            ].join("\n"),
            query: "how does Shariah compliance checking block trades",
        }).text,
        buildSearchRerankDocumentV4({
            relativePath: "tests/veto.test.ts",
            language: "typescript",
            candidateRole: "test",
            symbolKind: "test",
            canonicalSymbolLabel: "validates_trade_veto",
            symbolSpan: { startLine: 1, endLine: 3 },
            content: [
                "test(\"validates trade veto\", () => {",
                "    assert.equal(validate_order(order), false);",
                "});",
            ].join("\n"),
            query: "how does Shariah compliance checking block trades",
        }).text,
    ];
    const results = await reranker.rerank(query, documents);
    assert.equal(results.length, documents.length);
    assert.deepEqual(results.map((result) => result.index).sort(), [0, 1]);
    assert.ok(results.every((result) => Number.isFinite(result.relevanceScore)));
});


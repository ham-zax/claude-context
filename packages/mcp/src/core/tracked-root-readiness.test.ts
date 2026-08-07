import test from "node:test";
import assert from "node:assert/strict";
import { TrackedRootReadiness, type TrackedRootReadinessHost } from "./tracked-root-readiness.js";
import type { CodebaseInfo } from "../config.js";

function createHost(options: { fingerprintMismatch?: boolean } = {}): TrackedRootReadinessHost {
    const root = "/repo";
    const info = {
        status: "indexed" as const,
        indexedFiles: 1,
        totalChunks: 1,
        indexStatus: "completed" as const,
        lastUpdated: "2026-01-01T00:00:00.000Z",
    } satisfies CodebaseInfo;
    return {
        refreshSnapshotStateFromDisk: () => undefined,
        isPathWithinCodebase: (targetPath, rootPath) => targetPath === rootPath || targetPath.startsWith(`${rootPath}/`),
        getTrackedRootEntryForPath: () => ({ path: root, info }),
        getMatchingBlockedRoot: () => null,
        getSnapshotAllCodebases: () => [{ path: root, info }],
        getSnapshotIndexedCodebases: () => [root],
        getSnapshotIndexingCodebases: () => [],
        getSnapshotCodebaseInfo: () => info,
        getSnapshotCodebaseStatus: () => "indexed",
        enforceFingerprintGate: () => options.fingerprintMismatch
            ? { blockedResponse: {}, message: "fingerprint mismatch", reason: "fingerprint_mismatch" }
            : {},
        validateCompletionProof: async () => ({
            outcome: "policy_incompatible",
            reason: "runtime_policy_incompatible",
        }),
        probeLocalSearchCollectionState: async () => ({ state: "ready", collectionName: "collection" }),
        buildCreateHint: (codebasePath) => ({ tool: "manage_index", args: { action: "create", path: codebasePath } }),
        buildStatusHint: (codebasePath) => ({ tool: "manage_index", args: { action: "status", path: codebasePath } }),
        buildManageIndexRecommendedAction: (action, codebasePath, rationale) => ({
            tool: "manage_index",
            args: { action, path: codebasePath },
            rationale,
            reason: rationale,
        }),
        buildStaleLocalMessage: () => "stale",
    };
}

test("tracked root readiness fails closed on runtime policy incompatibility for semantic reads", async () => {
    const readiness = new TrackedRootReadiness(createHost());

    const result = await readiness.prepareTrackedRootForRead("/repo/src/index.ts", "semantic");

    assert.equal(result.state, "requires_reindex");
    assert.equal(result.state === "requires_reindex" ? result.codebasePath : undefined, "/repo");
    assert.match(result.state === "requires_reindex" ? result.message ?? "" : "", /runtime policy inputs/i);
});

test("runtime policy incompatibility blocks navigation despite its fingerprint mismatch exception", async () => {
    const readiness = new TrackedRootReadiness(createHost({ fingerprintMismatch: true }));

    const result = await readiness.prepareTrackedRootForRead("/repo/src/index.ts", "navigation");

    assert.equal(result.state, "requires_reindex");
    assert.match(result.state === "requires_reindex" ? result.message ?? "" : "", /runtime policy inputs/i);
});

test("fingerprint-mismatch navigation retains the sealed marker binding explicitly", async () => {
    const host = createHost({ fingerprintMismatch: true });
    host.validateCompletionProof = async () => ({
        outcome: "fingerprint_mismatch",
        marker: {
            completedAt: "2026-06-17T00:00:00.000Z",
            navigation: {
                status: "sealed",
                generationId: "generation-p",
                symbolRegistryManifestHash: "registry-p",
                relationshipManifestHash: "relationships-p",
                sealHash: "seal-p",
            },
        } as never,
    });

    const result = await new TrackedRootReadiness(host).prepareTrackedRootForRead(
        "/repo/src/index.ts",
        "navigation",
        undefined,
        { observePreparedRead: () => "stable-authority-observation" },
    );

    assert.equal(result.state, "ready");
    if (result.state === "ready") {
        assert.equal(
            result.navigationAuthorityMode,
            "source_backed_fingerprint_compatibility",
        );
        assert.deepEqual(result.sourceBackedNavigationBinding, {
            generationId: "generation-p",
            symbolRegistryManifestHash: "registry-p",
            relationshipManifestHash: "relationships-p",
            navigationSealHash: "seal-p",
            builtAt: "2026-06-17T00:00:00.000Z",
        });
        assert.equal(result.preparedObservation, "stable-authority-observation");
    }
});

test("retired persisted authority routes directly to requires_reindex", async () => {
    const host = createHost();
    host.validateCompletionProof = async () => ({
        outcome: "stale_local",
        reason: "requires_reindex",
    });

    const result = await new TrackedRootReadiness(host).prepareTrackedRootForRead("/repo", "semantic");

    assert.equal(result.state, "requires_reindex");
});

test("unsupported future authority routes directly to requires_reindex", async () => {
    const host = createHost();
    host.validateCompletionProof = async () => ({
        outcome: "stale_local",
        reason: "unsupported_authority",
    });

    const result = await new TrackedRootReadiness(host).prepareTrackedRootForRead("/repo", "semantic");

    assert.equal(result.state, "requires_reindex");
});

test("tracked root readiness reports bounded phase timings", async () => {
    const phases: string[] = [];
    const host = createHost();
    host.validateCompletionProof = async () => ({ outcome: "valid" });
    host.onReadinessPhase = (phase, durationMs) => {
        phases.push(phase);
        assert.equal(Number.isFinite(durationMs), true);
        assert.equal(durationMs >= 0, true);
    };
    const readiness = new TrackedRootReadiness(host);

    const result = await readiness.prepareTrackedRootForRead("/repo/src/index.ts", "semantic");

    assert.equal(result.state, "ready");
    assert.deepEqual(phases, [
        "snapshot_reload",
        "tracked_root_resolution",
        "fingerprint_gate",
        "completion_proof",
        "collection_probe",
    ]);
});

test("validated bound collection proof avoids a duplicate collection probe", async () => {
    let collectionProbes = 0;
    const host = createHost();
    host.validateCompletionProof = async () => ({
        outcome: "valid",
        collectionName: "bound-generation",
        exactPayloadRecounts: 0,
        proofSource: 'activation',
    });
    host.probeLocalSearchCollectionState = async () => {
        collectionProbes += 1;
        return { state: "ready", collectionName: "bound-generation" };
    };

    const result = await new TrackedRootReadiness(host).prepareTrackedRootForRead("/repo", "semantic");

    assert.equal(result.state, "ready");
    assert.equal(collectionProbes, 0);
    assert.equal(result.state === 'ready' ? result.exactPayloadRecounts : undefined, 0);
});

test("tracked readiness binds one completion proof to one stable prepared-read observation", async () => {
    let completionProofCalls = 0;
    const host = createHost();
    host.validateCompletionProof = async () => {
        completionProofCalls += 1;
        return { outcome: "valid", collectionName: "bound-generation" };
    };

    const result = await new TrackedRootReadiness(host).prepareTrackedRootForRead(
        "/repo/src/index.ts",
        "semantic",
        undefined,
        { observePreparedRead: () => "stable-observation" },
    );

    assert.equal(result.state, "ready");
    assert.equal(result.state === "ready" ? result.preparedObservation : undefined, "stable-observation");
    assert.equal(completionProofCalls, 1);
});

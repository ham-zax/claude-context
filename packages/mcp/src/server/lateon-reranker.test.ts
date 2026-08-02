import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    LateOnReranker,
    loadLateOnRuntimeProfile,
} from "./lateon-reranker.js";

function createFakeWorker(t: test.TestContext): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "satori-lateon-worker-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const workerPath = path.join(directory, "worker.cjs");
    fs.writeFileSync(workerPath, `
process.on("message", (message) => {
    if (message.type === "initialize") {
        process.send({ type: "ready", modelRevision: message.profile.identity.revision });
        return;
    }
    if (message.query === "hang") return;
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
});
`, "utf8");
    return workerPath;
}

test("LateOn runtime profile freezes the qualified D-L16 contract", () => {
    const profile = loadLateOnRuntimeProfile();

    assert.equal(profile.identity.projectionVersion, "search_rerank_document_v1");
    assert.equal(profile.inference.candidateDepth, 16);
    assert.equal(profile.inference.documentBatchSize, 1);
    assert.equal(profile.measuredProfile.requestDeadlineMilliseconds, 2000);
});

test("LateOn reranker exposes the immutable model and runtime-profile identity", () => {
    const reranker = new LateOnReranker({ modelDirectory: "/unused" });
    const identity = reranker.getIdentity();

    assert.equal(identity.provider, "lateon");
    assert.equal(
        identity.model,
        "lightonai/LateOn-Code-edge@07ef20f406c86badca122464808f4cac2f6e4b25",
    );
    assert.equal(
        identity.profile,
        "3593ce0284d7a5aded475ec4be118b6cb738c47643ef27ca70660f67191f12f0",
    );
    assert.equal(Object.isFrozen(identity), true);
    assert.deepEqual(new LateOnReranker({ modelDirectory: "/other" }).getIdentity(), identity);
});

test("LateOn reranker returns a complete deterministic order from its worker", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        workerPath: createFakeWorker(t),
        requestDeadlineMilliseconds: 1000,
        intraOpThreads: 1,
    });
    t.after(() => reranker.close());

    const results = await reranker.rerank(
        "find owner",
        ["same", "longer", "same"],
        { identities: ["z", "middle", "a"] },
    );

    assert.deepEqual(results, [
        { index: 1, relevanceScore: 6 },
        { index: 2, relevanceScore: 4 },
        { index: 0, relevanceScore: 4 },
    ]);
});

test("LateOn timeout kills the worker and the next request starts cleanly", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        workerPath: createFakeWorker(t),
        requestDeadlineMilliseconds: 100,
        intraOpThreads: 1,
    });
    t.after(() => reranker.close());

    await assert.rejects(
        reranker.rerank("hang", ["document"]),
        /exceeded 100 ms/,
    );
    assert.deepEqual(
        await reranker.rerank("recover", ["document"]),
        [{ index: 0, relevanceScore: 8 }],
    );
});

test("LateOn rejects requests beyond its qualified candidate depth", async (t) => {
    const reranker = new LateOnReranker({
        modelDirectory: "/unused/by/fake-worker",
        workerPath: createFakeWorker(t),
    });
    t.after(() => reranker.close());

    await assert.rejects(
        reranker.rerank("query", Array.from({ length: 17 }, () => "document")),
        /at most 16 documents/,
    );
});

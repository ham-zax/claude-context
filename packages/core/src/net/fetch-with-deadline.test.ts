import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { BoundedHttpError, fetchWithDeadline } from "./fetch-with-deadline";

type Handler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void;

interface TestServer {
    url: string;
    requestCount: () => number;
    connectionCount: () => number;
    close: () => Promise<void>;
}

async function startServer(handler: Handler): Promise<TestServer> {
    const server = createServer(handler);
    let requests = 0;
    let connections = 0;
    server.on("request", () => {
        requests += 1;
    });
    server.on("connection", () => {
        connections += 1;
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        requestCount: () => requests,
        connectionCount: () => connections,
        close: async () => {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}

async function closedPort(): Promise<number> {
    const server: Server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
}

const basePolicy = {
    retryDelayMs: 5,
    maxResponseBytes: 8 * 1024 * 1024,
    retryableStatuses: new Set<number>([503]),
    retryableNetworkCodes: new Set<string>(["ECONNREFUSED"]),
};

test("times out a hung request", async (t) => {
    const server = await startServer(() => {
        // Never respond: the connection stays open until the deadline fires.
    });
    t.after(() => server.close());

    await assert.rejects(
        fetchWithDeadline({
            url: `${server.url}/hang`,
            init: { method: "GET" },
            attemptTimeoutMs: 150,
            maxAttempts: 2,
            ...basePolicy,
        }),
        (error: unknown) => {
            assert.ok(error instanceof BoundedHttpError);
            assert.equal(error.name, "BoundedHttpError");
            assert.equal(error.kind, "timeout");
            assert.equal(error.status, null);
            assert.equal(error.attempts, 2);
            return true;
        },
    );
});

test("retries one listed transient status", async (t) => {
    let served = 0;
    const server = await startServer((_req, res) => {
        served += 1;
        if (served === 1) {
            res.writeHead(503, { "Content-Type": "text/plain" });
            res.end("unavailable");
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
    });
    t.after(() => server.close());

    const response = await fetchWithDeadline({
        url: `${server.url}/retry`,
        init: { method: "GET" },
        attemptTimeoutMs: 1000,
        maxAttempts: 2,
        ...basePolicy,
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"ok":true}');
    assert.equal(server.requestCount(), 2);
});

test("does not retry an unlisted 401", async (t) => {
    const server = await startServer((_req, res) => {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("denied");
    });
    t.after(() => server.close());

    const response = await fetchWithDeadline({
        url: `${server.url}/denied`,
        init: { method: "GET" },
        attemptTimeoutMs: 1000,
        maxAttempts: 3,
        ...basePolicy,
    });

    assert.equal(response.status, 401);
    assert.equal(await response.text(), "denied");
    assert.equal(server.requestCount(), 1);
});

test("exhausted transient status fails with transient_http and the last status", async (t) => {
    const server = await startServer((_req, res) => {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("unavailable");
    });
    t.after(() => server.close());

    await assert.rejects(
        fetchWithDeadline({
            url: `${server.url}/always-503`,
            init: { method: "GET" },
            attemptTimeoutMs: 1000,
            maxAttempts: 2,
            ...basePolicy,
        }),
        (error: unknown) => {
            assert.ok(error instanceof BoundedHttpError);
            assert.equal(error.kind, "transient_http");
            assert.equal(error.status, 503);
            assert.equal(error.attempts, 2);
            return true;
        },
    );
    assert.equal(server.requestCount(), 2);
});

test("does not retry caller cancellation", async (t) => {
    const server = await startServer(() => {
        // Hang so only cancellation can terminate the attempt.
    });
    t.after(() => server.close());

    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(new Error("caller cancelled"));
    }, 60);

    try {
        await assert.rejects(
            fetchWithDeadline({
                url: `${server.url}/hang`,
                init: { method: "GET" },
                signal: controller.signal,
                attemptTimeoutMs: 10_000,
                maxAttempts: 3,
                ...basePolicy,
            }),
            (error: unknown) => error instanceof Error && error.message === "caller cancelled",
        );
        assert.equal(server.connectionCount(), 1);
    } finally {
        clearTimeout(timer);
    }
});

test("rejects a response body above the byte limit", async (t) => {
    const server = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("x".repeat(4096));
    });
    t.after(() => server.close());

    const response = await fetchWithDeadline({
        url: `${server.url}/large`,
        init: { method: "GET" },
        attemptTimeoutMs: 1000,
        maxAttempts: 1,
        ...basePolicy,
        maxResponseBytes: 1024,
    });

    assert.equal(response.status, 200);
    await assert.rejects(
        () => response.text(),
        (error: unknown) => {
            assert.ok(error instanceof BoundedHttpError);
            assert.equal(error.kind, "response_too_large");
            assert.equal(error.status, null);
            return true;
        },
    );
});

test("preserves response status and headers on success", async (t) => {
    const server = await startServer((_req, res) => {
        res.writeHead(201, {
            "Content-Type": "application/json",
            "X-Custom": "yes",
        });
        res.end('{"ok":true}');
    });
    t.after(() => server.close());

    const response = await fetchWithDeadline({
        url: `${server.url}/ok`,
        init: { method: "GET" },
        attemptTimeoutMs: 1000,
        maxAttempts: 1,
        ...basePolicy,
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(response.headers.get("x-custom"), "yes");
    assert.equal(await response.text(), '{"ok":true}');
});

test("times out a stalled response body after the headers", async (t) => {
    const server = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.flushHeaders();
        // Never write the body: the deadline must cover body consumption.
    });
    t.after(() => server.close());

    const response = await fetchWithDeadline({
        url: `${server.url}/stall-body`,
        init: { method: "GET" },
        attemptTimeoutMs: 150,
        maxAttempts: 1,
        ...basePolicy,
    });

    assert.equal(response.status, 200);
    await assert.rejects(
        () => response.text(),
        (error: unknown) => {
            assert.ok(error instanceof BoundedHttpError);
            assert.equal(error.kind, "timeout");
            return true;
        },
    );
});

test("retries a listed retryable network error up to maxAttempts", async (_t) => {
    const port = await closedPort();

    await assert.rejects(
        fetchWithDeadline({
            url: `http://127.0.0.1:${port}/refused`,
            init: { method: "GET" },
            attemptTimeoutMs: 1000,
            maxAttempts: 2,
            ...basePolicy,
        }),
        (error: unknown) => {
            assert.ok(error instanceof BoundedHttpError);
            assert.equal(error.kind, "network");
            assert.equal(error.status, null);
            assert.equal(error.attempts, 2);
            return true;
        },
    );
});

test("does not retry an unlisted network error", async (_t) => {
    const port = await closedPort();

    await assert.rejects(
        fetchWithDeadline({
            url: `http://127.0.0.1:${port}/refused`,
            init: { method: "GET" },
            attemptTimeoutMs: 1000,
            maxAttempts: 3,
            ...basePolicy,
            retryableNetworkCodes: new Set<string>(),
        }),
        (error: unknown) => {
            assert.ok(error instanceof BoundedHttpError);
            assert.equal(error.kind, "network");
            assert.equal(error.attempts, 1);
            return true;
        },
    );
});

#!/usr/bin/env node

import { Writable } from "node:stream";

type ServerHandle = {
    shutdown: () => Promise<void>;
};

let activeServer: ServerHandle | null = null;
let shuttingDown = false;
let guardDisabledWarningEmitted = false;
const bootstrapKeepAlive = setInterval(() => {
    // Node may otherwise exit before top-level async ESM imports finish and stdio transport connects.
    // The server owns steady-state lifetime after startMcpServerFromEnv resolves.
}, 60 * 60 * 1000);

function resolveRunMode(): "mcp" | "cli" | "postflight" | "host" {
    if (process.env.SATORI_RUN_MODE === "host") {
        return "host";
    }
    if (process.env.SATORI_RUN_MODE === "cli") {
        return "cli";
    }
    if (process.env.SATORI_RUN_MODE === "postflight") {
        return "postflight";
    }
    return "mcp";
}

function resolveGuardMode(): "drop" | "redirect" | "off" {
    const value = process.env.SATORI_CLI_STDOUT_GUARD?.trim().toLowerCase();
    if (value === "redirect") {
        return "redirect";
    }
    if (value === "off" || value === "false" || value === "0" || value === "disable") {
        return "off";
    }
    return "drop";
}

function createProtocolStdout(originalWrite: typeof process.stdout.write): Writable {
    return new Writable({
        write(chunk, encoding, callback) {
            try {
                originalWrite(chunk, encoding as BufferEncoding, (error?: Error | null) => {
                    callback(error ?? undefined);
                });
            } catch (error) {
                callback(error as Error);
            }
        }
    });
}

async function handleShutdown(reason: "SIGINT" | "SIGTERM" | "STDIN_EOF"): Promise<void> {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    console.error(`Received ${reason}, shutting down gracefully...`);
    try {
        if (activeServer) {
            await activeServer.shutdown();
        }
    } catch (error) {
        console.error("Error during graceful shutdown:", error);
    } finally {
        process.exit(0);
    }
}

async function main(): Promise<void> {
    const runMode = resolveRunMode();
    if (runMode === "host") {
        const { startSharedRuntimeHostFromEnv } = await import("./server/shared-runtime-host.js");
        activeServer = await startSharedRuntimeHostFromEnv();
        return;
    }
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const protocolStdout = createProtocolStdout(originalStdoutWrite);

    const { installBootstrapStdioSafety } = await import("./server/bootstrap-stdio.js");
    installBootstrapStdioSafety({
        runMode,
        guardMode: resolveGuardMode(),
        onGuardDisabled: () => {
            if (!guardDisabledWarningEmitted) {
                guardDisabledWarningEmitted = true;
                console.error("[STDOUT_GUARD_DISABLED] SATORI_CLI_STDOUT_GUARD=off");
            }
        },
    });

    const { startMcpServerFromEnv } = await import("./server/start-server.js");
    activeServer = await startMcpServerFromEnv({
        runMode,
        protocolStdout,
        args: process.argv.slice(2),
    });
}

process.on("SIGINT", () => {
    void handleShutdown("SIGINT");
});

process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM");
});

if (resolveRunMode() !== "host") {
    process.stdin.once("end", () => {
        void handleShutdown("STDIN_EOF");
    });
}

main().then(() => {
    clearInterval(bootstrapKeepAlive);
}).catch(async (error) => {
    clearInterval(bootstrapKeepAlive);
    const message = error instanceof Error ? error.message : String(error);
    if (resolveRunMode() === "host" && process.env.SATORI_SHARED_RUNTIME_ERROR_PATH) {
        try {
            const fs = await import("node:fs");
            const boundedMessage = message.slice(0, 4096);
            const errorPath = process.env.SATORI_SHARED_RUNTIME_ERROR_PATH!;
            const temporaryPath = `${errorPath}.${process.pid}.tmp`;
            fs.writeFileSync(temporaryPath, `${JSON.stringify({
                formatVersion: 1,
                recordedAt: new Date().toISOString(),
                message: boundedMessage,
            })}\n`, { encoding: "utf8", mode: 0o600 });
            fs.renameSync(temporaryPath, errorPath);
        } catch {
            // Startup diagnostics are best-effort and must not mask the owner failure.
        }
    }
    if (message.includes("E_PROTOCOL_FAILURE")) {
        console.error(`E_PROTOCOL_FAILURE ${message}`);
    } else {
        console.error("Fatal error:", error);
    }
    process.exit(1);
});

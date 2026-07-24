import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import {
    createMcpConfig,
    logConfigurationSummary,
    resolveMcpRuntimeBootstrap,
    showHelpMessage,
} from "../config.js";
import {
    McpSession,
    ServerRunMode,
    SharedRuntimeHost,
} from "./shared-runtime.js";

export type { ServerRunMode } from "./shared-runtime.js";

export interface StartMcpServerOptions {
    runMode?: ServerRunMode;
    protocolStdin?: Readable;
    protocolStdout?: Writable;
    args?: string[];
}

interface StartupLifecycleDependencies {
    verifyCloudState: () => Promise<void>;
    onVerifyCloudStateError: (error: unknown) => void;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Post-connect recovery only. Periodic sync and watcher ownership belong to the
 * embedding-capable ProviderRuntime SyncManager (startProviderSyncLifecycle).
 * The local-only SyncManager uses UnconfiguredVectorDatabase and must never run
 * ensureFreshness: it still shares MutationLeaseCoordinator, so a failed periodic
 * pass bumps mutation generation and invalidates warm prepared-read observations.
 */
export async function runPostConnectStartupLifecycle(
    runMode: ServerRunMode,
    dependencies: StartupLifecycleDependencies
): Promise<void> {
    if (runMode === "postflight") {
        return;
    }
    if (runMode === "cli") {
        try {
            await dependencies.verifyCloudState();
        } catch (error) {
            dependencies.onVerifyCloudStateError(error);
        }
        return;
    }

    void dependencies.verifyCloudState().catch((error) => {
        dependencies.onVerifyCloudStateError(error);
    });
}

function migrateLegacyStateDir(): void {
    const homeDir = os.homedir();
    const legacyDir = path.join(homeDir, ".context");
    const newDir = path.join(homeDir, ".satori");

    if (fs.existsSync(newDir) || !fs.existsSync(legacyDir)) {
        return;
    }

    try {
        fs.renameSync(legacyDir, newDir);
        console.log(`[MIGRATION] Moved legacy state directory '${legacyDir}' -> '${newDir}'`);
        return;
    } catch {
        // Fallback for cross-device moves: copy then remove.
    }

    try {
        fs.cpSync(legacyDir, newDir, { recursive: true, force: false, errorOnExist: true });
        fs.rmSync(legacyDir, { recursive: true, force: true });
        console.log(`[MIGRATION] Copied legacy state directory '${legacyDir}' -> '${newDir}' and removed source`);
    } catch (copyError) {
        console.error(`[MIGRATION] Failed to migrate '${legacyDir}' -> '${newDir}':`, errorMessage(copyError));
    }
}

export class ContextMcpServer {
    private readonly host: SharedRuntimeHost;
    private readonly session: McpSession;

    constructor(
        config: ConstructorParameters<typeof SharedRuntimeHost>[0],
        runtimeFingerprint: ConstructorParameters<typeof SharedRuntimeHost>[1],
        private readonly runMode: ServerRunMode,
        private readonly protocolStdout?: Writable,
        private readonly protocolStdin?: Readable,
    ) {
        this.host = new SharedRuntimeHost(config, runtimeFingerprint, runMode);
        this.session = this.host.createSession();
    }

    async start(): Promise<void> {
        console.log("Starting Satori MCP server...");
        if (this.runMode === "cli" && !this.protocolStdout) {
            throw new Error("E_PROTOCOL_FAILURE Missing protocolStdout for cli mode");
        }
        await this.session.connectStdio(
            this.protocolStdin,
            this.protocolStdout,
        );
        console.log("MCP server started and listening on stdio.");
        await runPostConnectStartupLifecycle(this.runMode, {
            verifyCloudState: async () => {
                console.log("[STARTUP] Verifying interrupted indexing state against completion markers...");
                await this.host.recoverInterruptedIndexingAtStartup();
            },
            onVerifyCloudStateError: (error) => {
                console.error("[STARTUP] Error verifying cloud state:", errorMessage(error));
            },
        });
    }

    async shutdown(): Promise<void> {
        console.log("Shutting down Satori MCP server...");
        await this.session.shutdown();
        await this.host.shutdown();
    }
}

function isHelpRequested(args: string[]): boolean {
    return args.includes("--help") || args.includes("-h");
}

export async function startMcpServerFromEnv(options: StartMcpServerOptions = {}): Promise<ContextMcpServer | null> {
    const args = options.args ?? process.argv.slice(2);
    const runMode = options.runMode ?? "mcp";

    if (isHelpRequested(args)) {
        showHelpMessage();
        return null;
    }

    migrateLegacyStateDir();

    const parsedConfig = createMcpConfig();
    const { config, runtimeFingerprint } = await resolveMcpRuntimeBootstrap(
        parsedConfig,
        {},
        {
            useRecordedOllamaIdentity: runMode === "postflight"
                && parsedConfig.executionProfile === "offline",
        },
    );
    logConfigurationSummary(config);

    const server = new ContextMcpServer(
        config,
        runtimeFingerprint,
        runMode,
        options.protocolStdout,
        options.protocolStdin,
    );
    await server.start();
    return server;
}

import assert from "node:assert/strict";
import test from "node:test";
import { formatDoctorText } from "./doctor-format.js";
import type { DoctorResult } from "./doctor.js";

function resultWithActiveRuntime(): DoctorResult {
    return {
        status: "ok",
        packageVersions: [
            { name: "@zokizuan/satori-cli", version: "1.9.2", source: "/cli/package.json" },
            { name: "@zokizuan/satori-mcp", version: "6.8.1", source: "/cli/node_modules/mcp/package.json" },
            { name: "@zokizuan/satori-core", version: "3.6.0", source: "/cli/node_modules/core/package.json" },
        ],
        packageVersionNote: "independent package versions",
        checks: [],
        nextSteps: [],
        managedRuntime: {
            launcherPath: "/home/test/.satori/bin/satori-mcp.js",
            mcpVersion: "6.7.0",
            coreVersion: "3.5.0",
        },
        localDiagnostics: {
            schemaVersion: "v1",
            storage: "local_only",
            privacy: "No source, query text, path, symbol name, or repository identifier is stored.",
            eventsRead: 0,
            malformedEventsSkipped: 0,
            totalDurationMs: 0,
            toolCalls: [],
            warningCodes: [],
            fallbackUses: 0,
            lifecycleOutcomes: [],
            recovery: { attempts: 0, successes: 0 },
        },
    };
}

test("Doctor uses active runtime authority and labels bundled package sources", () => {
    const text = formatDoctorText(resultWithActiveRuntime(), { verbose: true });
    assert.match(text, /Doctor runtime: CLI 1\.9\.2 · MCP 6\.7\.0 · Core 3\.5\.0/);
    assert.match(text, /@zokizuan\/satori-cli@1\.9\.2 \(CLI package source\)/);
    assert.match(text, /@zokizuan\/satori-mcp@6\.8\.1 \(CLI-bundled package source\)/);
    assert.match(text, /@zokizuan\/satori-core@3\.6\.0 \(CLI-bundled package source\)/);
    assert.doesNotMatch(text, /@zokizuan\/satori-cli@1\.9\.2 \(CLI-bundled package source\)/);
});

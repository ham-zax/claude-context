import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { CliError } from "./errors.js";
import type { InstallVectorStore } from "./args.js";

const EXACT_PACKAGE_VERSION_PATTERN =
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const LANCEDB_NATIVE_PACKAGES = new Map<string, string>([
    ["darwin-arm64-", "@lancedb/lancedb-darwin-arm64"],
    ["linux-arm64-gnu", "@lancedb/lancedb-linux-arm64-gnu"],
    ["linux-arm64-musl", "@lancedb/lancedb-linux-arm64-musl"],
    ["linux-x64-gnu", "@lancedb/lancedb-linux-x64-gnu"],
    ["linux-x64-musl", "@lancedb/lancedb-linux-x64-musl"],
    ["win32-arm64-", "@lancedb/lancedb-win32-arm64-msvc"],
    ["win32-x64-", "@lancedb/lancedb-win32-x64-msvc"],
]);
const OXC_PARSER_NATIVE_PACKAGES = new Map<string, string>([
    ["darwin-arm64-", "@oxc-parser/binding-darwin-arm64"],
    ["darwin-x64-", "@oxc-parser/binding-darwin-x64"],
    ["linux-arm64-gnu", "@oxc-parser/binding-linux-arm64-gnu"],
    ["linux-arm64-musl", "@oxc-parser/binding-linux-arm64-musl"],
    ["linux-x64-gnu", "@oxc-parser/binding-linux-x64-gnu"],
    ["linux-x64-musl", "@oxc-parser/binding-linux-x64-musl"],
    ["win32-arm64-", "@oxc-parser/binding-win32-arm64-msvc"],
    ["win32-ia32-", "@oxc-parser/binding-win32-ia32-msvc"],
    ["win32-x64-", "@oxc-parser/binding-win32-x64-msvc"],
]);
const MANAGED_RUNTIME_CLOSURE_FILE = ".satori-runtime-closure.json";

export interface ManagedRuntimeClosure {
    readonly vectorStore: InstallVectorStore;
    readonly platform?: NodeJS.Platform;
    readonly architecture?: string;
    readonly libc?: "gnu" | "musl";
}

type ManagedRuntimeClosureIdentity = Readonly<{
    // Format 2 makes the required host Oxc binding explicit. Older v1
    // manifests intentionally fail closed and trigger a fresh generation.
    formatVersion: 2;
    omitOptional: true;
    vectorStore: InstallVectorStore;
    lanceDbNativePackage: string | null;
    oxcParserNativePackage: string;
}>;

function readManagedDependencyVersion(dependencyName: string, label: string): string {
    try {
        const requireFromCli = createRequire(import.meta.url);
        const packageJsonPath = requireFromCli.resolve("@zokizuan/satori-core/package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
            dependencies?: Record<string, unknown>;
        };
        const version = packageJson.dependencies?.[dependencyName];
        if (typeof version === "string" && EXACT_PACKAGE_VERSION_PATTERN.test(version)) {
            return version;
        }
    } catch {
        // Fall through to the release-closure error below.
    }
    throw new CliError(
        "E_USAGE",
        `The installed Satori CLI cannot resolve its exact ${label} runtime version.`,
        2,
    );
}

function readManagedLanceDbVersion(): string {
    return readManagedDependencyVersion("@lancedb/lancedb", "LanceDB");
}

function readManagedOxcParserVersion(): string {
    return readManagedDependencyVersion("oxc-parser", "oxc-parser");
}

function detectLinuxLibc(): "gnu" | "musl" {
    if (process.platform !== "linux") {
        return "gnu";
    }
    try {
        const report = process.report?.getReport() as {
            header?: { glibcVersionRuntime?: unknown };
        } | undefined;
        return typeof report?.header?.glibcVersionRuntime === "string" ? "gnu" : "musl";
    } catch {
        return "gnu";
    }
}

export function resolveLanceDbNativePackage(
    closure: ManagedRuntimeClosure,
): string {
    const platform = closure.platform ?? process.platform;
    const architecture = closure.architecture ?? process.arch;
    const libc = closure.libc ?? detectLinuxLibc();
    const platformKey = `${platform}-${architecture}-${platform === "linux" ? libc : ""}`;
    const packageName = LANCEDB_NATIVE_PACKAGES.get(platformKey);
    if (!packageName) {
        throw new CliError(
            "E_USAGE",
            `LanceDB managed runtime is unsupported on ${platform}/${architecture}${platform === "linux" ? `/${libc}` : ""}.`,
            2,
        );
    }
    return `${packageName}@${readManagedLanceDbVersion()}`;
}

export function resolveOxcParserNativePackage(
    closure: ManagedRuntimeClosure,
): string {
    const platform = closure.platform ?? process.platform;
    const architecture = closure.architecture ?? process.arch;
    const libc = closure.libc ?? detectLinuxLibc();
    const platformKey = `${platform}-${architecture}-${platform === "linux" ? libc : ""}`;
    const packageName = OXC_PARSER_NATIVE_PACKAGES.get(platformKey);
    if (!packageName) {
        throw new CliError(
            "E_USAGE",
            `The Satori managed runtime is unsupported on ${platform}/${architecture}${platform === "linux" ? `/${libc}` : ""}.`,
            2,
        );
    }
    return `${packageName}@${readManagedOxcParserVersion()}`;
}

export function resolveManagedRuntimeClosureIdentity(
    closure: ManagedRuntimeClosure,
): ManagedRuntimeClosureIdentity {
    return {
        formatVersion: 2,
        omitOptional: true,
        vectorStore: closure.vectorStore,
        lanceDbNativePackage: closure.vectorStore === "LanceDB"
            ? resolveLanceDbNativePackage(closure)
            : null,
        oxcParserNativePackage: resolveOxcParserNativePackage(closure),
    };
}

function closureManifestPath(runtimeRoot: string): string {
    return path.join(runtimeRoot, MANAGED_RUNTIME_CLOSURE_FILE);
}

export function managedRuntimeClosureMatches(
    runtimeRoot: string,
    closure: ManagedRuntimeClosure,
): boolean {
    try {
        const actual = JSON.parse(
            fs.readFileSync(closureManifestPath(runtimeRoot), "utf8"),
        ) as unknown;
        const expected = resolveManagedRuntimeClosureIdentity(closure);
        return typeof actual === "object"
            && actual !== null
            && !Array.isArray(actual)
            && (actual as Record<string, unknown>).formatVersion === expected.formatVersion
            && (actual as Record<string, unknown>).omitOptional === expected.omitOptional
            && (actual as Record<string, unknown>).vectorStore === expected.vectorStore
            && (actual as Record<string, unknown>).lanceDbNativePackage
                === expected.lanceDbNativePackage
            && (actual as Record<string, unknown>).oxcParserNativePackage
                === expected.oxcParserNativePackage;
    } catch {
        return false;
    }
}

export function writeManagedRuntimeClosureManifest(
    runtimeRoot: string,
    closure: ManagedRuntimeClosure,
): void {
    const manifestPath = closureManifestPath(runtimeRoot);
    const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
    fs.writeFileSync(
        temporaryPath,
        `${JSON.stringify(resolveManagedRuntimeClosureIdentity(closure), null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
    );
    fs.renameSync(temporaryPath, manifestPath);
}

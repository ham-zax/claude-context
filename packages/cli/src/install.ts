import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { POTION_DIMENSION, POTION_MODEL_ID } from "@zokizuan/satori-core";
import { CliError } from "./errors.js";
import type {
    InstallOfflineReranker,
    InstallRuntime,
    InstallVectorStore,
} from "./args.js";
import {
    assertSupportedPotionPlatform,
    planInstallRuntimeEnvironment,
    probeLanceDbRuntime,
    probeManagedRuntimeCandidate,
    runInstallPreflight,
    selectedConnectedVectorStore,
    type InstallPreflightDependencies,
    type InstallPreflightResult,
    type LanceDbModule,
} from "./install-preflight.js";
import {
    assertAutoClientTargets,
    resolveClientTargets,
    selectClientTargets,
} from "./client-targets.js";
import {
    packageNameFromSpecifier,
    plannedManagedRuntimeCommand,
    resolveLauncherPath,
    resolveManagedClientCommand,
    resolvePotionAssetsRoot,
    resolveRuntimeEntryPath,
    resolveRuntimePackageRoot,
    resolveRuntimePackageRootFromRoot,
    resolveRuntimeRoot,
} from "./managed-runtime-paths.js";
import {
    MANAGED_RUNTIME_DIR,
    SATORI_RUNTIME_ENV_VARS,
} from "./install-contracts.js";
import type {
    ClientTarget,
    ExecFileSyncLike,
    InstallCommandInput,
    InstallCommandOptions,
    InstallCommandResult,
    ManagedClientConfigProof,
    ManagedRuntimeCommand,
    ManagedRuntimeUpgradeResult,
} from "./install-contracts.js";
export type {
    ClientName,
    ClientInstallResult,
    InstallCommandInput,
    InstallCommandOptions,
    InstallCommandResult,
    ManagedClientConfigProof,
    ManagedRuntimeCommand,
    ManagedRuntimeUpgradePhase,
    ManagedRuntimeUpgradeResult,
} from "./install-contracts.js";
export { assertAutoClientTargets, detectClientTargets } from "./client-targets.js";
export { resolveLauncherPath, resolveManagedClientCommand } from "./managed-runtime-paths.js";
import { resolveManagedPackageSpecifier } from "./managed-package.js";
import {
    buildLauncherScript,
    parseManagedLauncherDescriptor,
    parseManagedLauncherEnvironment,
} from "./managed-launcher-script.mjs";
import {
    assertFileContentUnchanged,
    buildCodexManagedBlock,
    ensureDir,
    isManagedCommandParts,
    MANAGED_BLOCK_START,
    objectValue,
    parseJsonObject,
    parseJsoncObject,
    prepareMutation,
    prepareProjectProfileInstall,
    readTextIfExists,
    toTomlString,
    writeTextFileAtomic,
    type FileMutation,
    type PreparedMutation,
} from "./client-config-mutations.js";
import {
    compareStableVersions,
    parseStableVersion,
    type SatoriUpgradeTarget,
} from "./upgrade-target.js";
import {
    acquireManagedRuntimeMutationLock,
    pruneManagedRuntimeStore,
} from "./managed-runtime-store.js";
import {
    managedRuntimeClosureMatches,
    resolveLanceDbNativePackage,
    resolveOxcParserNativePackage,
    type ManagedRuntimeClosure,
    writeManagedRuntimeClosureManifest,
} from "./managed-runtime-closure.js";
import {
    DEFAULT_LATEON_PROFILE_ID,
    HISTORICAL_LATEON_CONTEXT_V3_PROFILE_ID,
    HISTORICAL_LATEON_D32_ACTIVATION_POLICY,
    PREVIOUS_LATEON_CONTEXT_V3_ACTIVATED_PROFILE_ID,
    PREVIOUS_LATEON_CONTEXT_V3_ACTIVATION_POLICY,
    LATEON_D32_ACTIVATION_POLICY,
    ensureDefaultLateOnModel,
    resolveDefaultLateOnModelDirectory,
    verifyLateOnModelDirectory,
    type LateOnAuthorityLoader,
    type VerifiedLateOnModel,
} from "./lateon-model-store.js";

export interface InstallPlan {
    readonly command: InstallCommandInput;
    readonly homeDir: string;
    readonly packageSpecifier: string;
    readonly plannedRuntimeCommand: ManagedRuntimeCommand;
    readonly clientCommand: ManagedRuntimeCommand;
    readonly profileMutation: FileMutation & { filePath?: string };
    readonly prepared: PreparedMutation[];
    readonly options: InstallCommandOptions;
}

interface ManagedRuntimeCandidate {
    readonly command: ManagedRuntimeCommand;
    readonly identity: {
        readonly name: string;
        readonly version: string;
    };
    readonly runtimeRoot: string;
    readonly packageRoot: string;
    readonly newlyInstalled: boolean;
}

interface ResolvedRuntimeDependency {
    readonly version: string;
    readonly packageJsonPath: string;
}

interface ContainingPackageIdentity {
    readonly version: string;
    readonly packageRoot: string;
}

function prepareLauncherInstall(
    homeDir: string,
    runtimeCommand: ManagedRuntimeCommand,
    managedEnv: Readonly<Record<string, string>> = {},
): FileMutation {
    const launcherPath = resolveLauncherPath(homeDir);
    const current = readTextIfExists(launcherPath);
    const runtimePackageRoot = runtimeCommand.args.length === 1
        ? readContainingPackageIdentity(
            runtimeCommand.args[0],
            "@zokizuan/satori-mcp",
        )?.packageRoot
        : undefined;
    const managedRuntimeRoot = runtimePackageRoot
        ? resolveContainingManagedRuntimeRoot(homeDir, runtimePackageRoot) ?? undefined
        : undefined;
    const next = buildLauncherScript({
        command: runtimeCommand.command,
        args: runtimeCommand.args,
        managedEnv,
        ...(managedRuntimeRoot ? { managedRuntimeRoot } : {}),
    });
    return {
        changed: current !== next,
        assertUnchanged: () => assertFileContentUnchanged(launcherPath, current),
        apply: () => {
            if (current === next) {
                return;
            }
            writeTextFileAtomic(launcherPath, next, 0o755);
        },
    };
}

function resolveDefaultPackageSpecifier(): string {
    try {
        return resolveManagedPackageSpecifier();
    } catch {
        // Fall through to hard failure below.
    }
    throw new CliError("E_USAGE", "Unable to resolve the installed Satori package version for CLI install.", 2);
}

function npmOutput(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }
    const stdout = "stdout" in error && typeof (error as { stdout?: unknown }).stdout === "string"
        ? (error as { stdout: string }).stdout
        : "";
    const stderr = "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";
    return `${stdout}\n${stderr}\n${error.message}`.trim();
}

function installManagedRuntimeCandidate(
    homeDir: string,
    packageSpecifier: string,
    execImpl: ExecFileSyncLike,
    expectedCoreVersion: string | undefined,
    closure: ManagedRuntimeClosure,
): ManagedRuntimeCandidate {
    const stableRuntimeRoot = resolveRuntimeRoot(homeDir, packageSpecifier);
    const existing = resolveInstalledRuntimeCommand(
        stableRuntimeRoot,
        packageSpecifier,
        true,
        expectedCoreVersion,
    );
    if (existing && managedRuntimeClosureMatches(stableRuntimeRoot, closure)) {
        return {
            ...existing,
            runtimeRoot: stableRuntimeRoot,
            newlyInstalled: false,
        };
    }
    const installTargets = [
        packageSpecifier,
        ...(closure.vectorStore === "LanceDB"
            ? [resolveLanceDbNativePackage(closure)]
            : []),
        resolveOxcParserNativePackage(closure),
    ];
    // Never reinstall into a directory that may still be the target of the
    // active launcher. A failed or stale reinstall must leave the old runtime
    // bytes untouched.
    const runtimeRoot = fs.existsSync(stableRuntimeRoot)
        ? fs.mkdtempSync(`${stableRuntimeRoot}.generation-`)
        : stableRuntimeRoot;
    ensureDir(runtimeRoot);
    try {
        execImpl("npm", [
            "install",
            "--prefix",
            runtimeRoot,
            "--omit=dev",
            "--omit=optional",
            "--no-package-lock",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--",
            ...installTargets,
        ], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (error) {
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
        throw new CliError(
            "E_USAGE",
            `Failed to install Satori MCP runtime package ${packageSpecifier} into ${runtimeRoot}. ${npmOutput(error)}`,
            2
        );
    }

    const installed = resolveInstalledRuntimeCommand(
        runtimeRoot,
        packageSpecifier,
        false,
        expectedCoreVersion,
    );
    if (!installed) {
        const packageRoot = resolveRuntimePackageRootFromRoot(runtimeRoot, packageSpecifier);
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
        throw new CliError(
            "E_USAGE",
            `Installed Satori MCP runtime is missing a usable entry under ${packageRoot}.`,
            2,
        );
    }
    try {
        writeManagedRuntimeClosureManifest(runtimeRoot, closure);
    } catch (error) {
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
        throw new CliError(
            "E_USAGE",
            `Installed Satori MCP runtime closure could not be recorded at ${runtimeRoot}: ${error instanceof Error ? error.message : String(error)}`,
            2,
        );
    }
    return {
        ...installed,
        runtimeRoot,
        newlyInstalled: true,
    };
}

const EXACT_PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CORE_PACKAGE_NAME = "@zokizuan/satori-core";

function requestedExactPackageVersion(packageSpecifier: string): string | null {
    const packageName = packageNameFromSpecifier(packageSpecifier);
    const suffix = packageSpecifier.slice(packageName.length);
    if (!suffix.startsWith("@")) {
        return null;
    }
    const version = suffix.slice(1);
    return EXACT_PACKAGE_VERSION_PATTERN.test(version) ? version : null;
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
    try {
        const realRoot = fs.realpathSync(rootPath);
        const realCandidate = fs.realpathSync(candidatePath);
        const relative = path.relative(realRoot, realCandidate);
        return relative.length > 0
            && relative !== ".."
            && !relative.startsWith(`..${path.sep}`)
            && !path.isAbsolute(relative);
    } catch {
        return false;
    }
}

function readRuntimeDependency(
    runtimeEntry: string,
    packageName: string,
    runtimeRoot: string,
): ResolvedRuntimeDependency | null {
    try {
        const requireFromRuntime = createRequire(runtimeEntry);
        const packageJsonPath = requireFromRuntime.resolve(`${packageName}/package.json`);
        if (!isPathWithin(runtimeRoot, packageJsonPath)) {
            return null;
        }
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
            name?: unknown;
            version?: unknown;
        };
        return packageJson.name === packageName
            && typeof packageJson.version === "string"
            && EXACT_PACKAGE_VERSION_PATTERN.test(packageJson.version)
            ? {
                version: packageJson.version,
                packageJsonPath: fs.realpathSync(packageJsonPath),
            }
            : null;
    } catch {
        return null;
    }
}

function resolveInstalledRuntimeCommand(
    runtimeRoot: string,
    packageSpecifier: string,
    forReuse: boolean,
    expectedCoreVersion?: string,
): Pick<ManagedRuntimeCandidate, "command" | "identity" | "packageRoot"> | null {
    const packageRoot = resolveRuntimePackageRootFromRoot(runtimeRoot, packageSpecifier);
    const packageJsonPath = path.join(packageRoot, "package.json");
    let packageJson: { name?: unknown; version?: unknown; bin?: unknown; main?: unknown };
    try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as typeof packageJson;
    } catch {
        return null;
    }
    const expectedName = packageNameFromSpecifier(packageSpecifier);
    const expectedVersion = requestedExactPackageVersion(packageSpecifier);
    if (
        !isPathWithin(runtimeRoot, packageJsonPath)
        || packageJson.name !== expectedName
        || typeof packageJson.version !== "string"
        || !EXACT_PACKAGE_VERSION_PATTERN.test(packageJson.version)
        || (expectedVersion !== null && packageJson.version !== expectedVersion)
        || (forReuse && expectedVersion === null)
    ) {
        return null;
    }

    const command = {
        command: process.execPath,
        args: [resolveRuntimeEntryPath(packageRoot, packageJson)],
    };
    if (!fs.existsSync(command.args[0]) || !isPathWithin(packageRoot, command.args[0])) {
        return null;
    }
    if (
        expectedCoreVersion !== undefined
        && readRuntimeDependency(command.args[0], CORE_PACKAGE_NAME, runtimeRoot)?.version !== expectedCoreVersion
    ) {
        return null;
    }
    return {
        command,
        packageRoot,
        identity: {
            name: packageJson.name,
            version: packageJson.version,
        },
    };
}

function exactRuntimeLanceDbProbe(runtimeCommand: ManagedRuntimeCommand): (databasePath: string) => Promise<void> {
    const runtimeEntry = runtimeCommand.args[0];
    return async (databasePath: string): Promise<void> => {
        const requireFromRuntime = createRequire(runtimeEntry);
        const resolved = requireFromRuntime.resolve("@zokizuan/satori-core/lancedb");
        await probeLanceDbRuntime(databasePath, {
            loadLanceDb: () => import(pathToFileURL(resolved).href) as Promise<LanceDbModule>,
        });
    };
}

function commandMatchesExpected(command: unknown, args: unknown, expected: ManagedRuntimeCommand): boolean {
    return command === expected.command
        && Array.isArray(args)
        && args.length === expected.args.length
        && args.every((entry, index) => entry === expected.args[index]);
}

function resolveConfiguredEnvironmentValue(
    value: unknown,
    inheritedEnv: NodeJS.ProcessEnv,
): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const reference = value.match(/^\{env:([A-Z][A-Z0-9_]*)\}$/)
        ?? value.match(/^\$\{([A-Z][A-Z0-9_]*)(?::-)?\}$/);
    if (reference) {
        return inheritedEnv[reference[1]];
    }
    return value;
}

function filteredRuntimeEnvironment(
    value: unknown,
    inheritedEnv: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> {
    const input = objectValue(value);
    if (!input) {
        return Object.freeze({});
    }
    const entries: Array<[string, string]> = [];
    for (const name of SATORI_RUNTIME_ENV_VARS) {
        const resolved = resolveConfiguredEnvironmentValue(input[name], inheritedEnv);
        if (resolved !== undefined) {
            entries.push([name, resolved]);
        }
    }
    return Object.freeze(Object.fromEntries(entries));
}

function readCodexRuntimeEnvironment(
    content: string,
    inheritedEnv: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> {
    let section = "";
    const configured: Record<string, string> = {};
    for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
        const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
        if (table) {
            section = table[1];
            continue;
        }
        if (section !== "mcp_servers.satori.env") {
            continue;
        }
        const literal = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);
        if (!literal || !SATORI_RUNTIME_ENV_VARS.includes(literal[1] as typeof SATORI_RUNTIME_ENV_VARS[number])) {
            continue;
        }
        const raw = literal[2].startsWith('"')
            ? JSON.parse(literal[2]) as string
            : literal[2].slice(1, -1);
        const resolved = resolveConfiguredEnvironmentValue(raw, inheritedEnv);
        if (resolved !== undefined) {
            configured[literal[1]] = resolved;
        }
    }
    return Object.freeze(configured);
}

function verifyManagedClientTarget(
    target: Pick<ClientTarget, "client" | "configPath">,
    expected: ManagedRuntimeCommand,
    inheritedEnv: NodeJS.ProcessEnv = process.env,
): ManagedClientConfigProof {
    let matches = false;
    let usesManagedLauncher: boolean | undefined;
    let runtimeEnvironment: Readonly<Record<string, string>> | undefined;
    try {
        if (target.client === "codex") {
            const content = readTextIfExists(target.configPath) ?? "";
            matches = content.includes(buildCodexManagedBlock(expected));
            usesManagedLauncher = content.includes(toTomlString(expected.args[0]));
            runtimeEnvironment = readCodexRuntimeEnvironment(content, inheritedEnv);
        } else if (target.client === "claude") {
            const config = parseJsonObject(target.configPath);
            const entry = objectValue(objectValue(config.mcpServers)?.satori);
            matches = commandMatchesExpected(entry?.command, entry?.args, expected);
            usesManagedLauncher = isManagedCommandParts(entry?.command, entry?.args);
            runtimeEnvironment = filteredRuntimeEnvironment(entry?.env, inheritedEnv);
        } else {
            const content = readTextIfExists(target.configPath) ?? "";
            const config = parseJsoncObject(target.configPath, content);
            const entry = objectValue(objectValue(config.mcp)?.satori);
            matches = Array.isArray(entry?.command)
                && commandMatchesExpected(entry.command[0], entry.command.slice(1), expected);
            usesManagedLauncher = Array.isArray(entry?.command)
                ? isManagedCommandParts(entry.command[0], entry.command.slice(1))
                : isManagedCommandParts(entry?.command, entry?.args);
            runtimeEnvironment = filteredRuntimeEnvironment(entry?.environment, inheritedEnv);
        }
    } catch {
        matches = false;
        usesManagedLauncher = undefined;
        runtimeEnvironment = undefined;
    }

    return {
        client: target.client,
        configPath: target.configPath,
        status: matches ? "ok" : "error",
        message: matches
            ? `${target.client} config points to ${expected.args[0]}.`
            : `${target.client} config does not point exactly to ${expected.command} ${expected.args[0]}.`,
        runtimeEnvironment,
        usesManagedLauncher,
    };
}

function hasSatoriClientEntry(target: ClientTarget): boolean {
    const content = readTextIfExists(target.configPath);
    if (content === null) {
        return false;
    }
    try {
        if (target.client === "codex") {
            return content.includes(MANAGED_BLOCK_START) || /\[mcp_servers\.satori(?:\.|\])/.test(content);
        }
        if (target.client === "claude") {
            return objectValue(objectValue(parseJsonObject(target.configPath).mcpServers)?.satori) !== undefined;
        }
        return objectValue(objectValue(parseJsoncObject(target.configPath, content).mcp)?.satori) !== undefined;
    } catch {
        return content.includes("satori");
    }
}

function parseVectorStoreLiteral(value: unknown, source: string): InstallVectorStore | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new CliError("E_USAGE", `${source} VECTOR_STORE_PROVIDER must be Milvus or LanceDB.`, 2);
    }
    if (/^\$\{|^\{env:/.test(value.trim())) {
        return undefined;
    }
    if (value === "Milvus" || value === "LanceDB") {
        return value;
    }
    throw new CliError("E_USAGE", `${source} VECTOR_STORE_PROVIDER must be Milvus or LanceDB.`, 2);
}

function readCodexVectorStore(filePath: string): InstallVectorStore | undefined {
    const content = readTextIfExists(filePath);
    if (content === null) {
        return undefined;
    }
    let inSatoriEnvironment = false;
    let selected: InstallVectorStore | undefined;
    for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
        const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
        if (table) {
            inSatoriEnvironment = table[1] === "mcp_servers.satori.env";
            continue;
        }
        if (!inSatoriEnvironment || !/^\s*VECTOR_STORE_PROVIDER\s*=/.test(line)) {
            continue;
        }
        const literal = line.match(/^\s*VECTOR_STORE_PROVIDER\s*=\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/);
        const candidate = parseVectorStoreLiteral(literal?.[1] ?? literal?.[2], `Codex config '${filePath}'`);
        if (!candidate) {
            throw new CliError("E_USAGE", `Codex config '${filePath}' has an unreadable VECTOR_STORE_PROVIDER value.`, 2);
        }
        if (selected && selected !== candidate) {
            throw new CliError("E_USAGE", `Codex config '${filePath}' contains conflicting VECTOR_STORE_PROVIDER values.`, 2);
        }
        selected = candidate;
    }
    return selected;
}

function readClientVectorStore(target: ClientTarget): InstallVectorStore | undefined {
    if (target.client === "codex") {
        return readCodexVectorStore(target.configPath);
    }
    if (target.client === "claude") {
        const entry = objectValue(objectValue(parseJsonObject(target.configPath).mcpServers)?.satori);
        return parseVectorStoreLiteral(objectValue(entry?.env)?.VECTOR_STORE_PROVIDER, `Claude config '${target.configPath}'`);
    }
    const content = readTextIfExists(target.configPath);
    if (content === null) {
        return undefined;
    }
    const entry = objectValue(objectValue(parseJsoncObject(target.configPath, content).mcp)?.satori);
    return parseVectorStoreLiteral(
        objectValue(entry?.environment)?.VECTOR_STORE_PROVIDER,
        `OpenCode config '${target.configPath}'`,
    );
}

function readManagedLauncherVectorStore(
    homeDir: string,
    managedEnvironment?: Readonly<Record<string, string>>,
): InstallVectorStore | undefined {
    try {
        return parseVectorStoreLiteral(
            (managedEnvironment ?? readManagedRuntimeEnvironment(homeDir)).VECTOR_STORE_PROVIDER,
            `Managed launcher '${resolveLauncherPath(homeDir)}'`,
        );
    } catch (error) {
        if (error instanceof CliError) {
            throw error;
        }
        return undefined;
    }
}

function readManagedRuntimeEnvironment(homeDir: string): Readonly<Record<string, string>> {
    const launcherPath = resolveLauncherPath(homeDir);
    const launcher = readTextIfExists(launcherPath);
    if (launcher === null) {
        return Object.freeze({});
    }
    try {
        return parseManagedLauncherEnvironment(launcher);
    } catch (error) {
        const cause = error instanceof Error ? error.message : String(error);
        throw new CliError(
            "E_MANAGED_RUNTIME_ENV_INVALID",
            `Managed launcher '${launcherPath}' contains invalid runtime identity: ${cause}`,
            1,
        );
    }
}

function runtimeEnvironmentWithManagedFallbacks(
    managed: Readonly<Record<string, string>>,
    env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
    const fallbacks: NodeJS.ProcessEnv = {};
    // These non-secret location values are installer-owned runtime identity.
    // Provider credentials and tokens must never be recovered from a launcher.
    for (const key of ["LANCEDB_PATH", "OLLAMA_HOST"] as const) {
        if (typeof managed[key] === "string" && managed[key].length > 0) {
            fallbacks[key] = managed[key];
        }
    }
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
            if ((key === "LANCEDB_PATH" || key === "OLLAMA_HOST") && value.trim().length === 0) {
                continue;
            }
            fallbacks[key] = value;
        }
    }
    return fallbacks;
}

function historicalManagedLateOnProfile(
    managedEnvironment: Readonly<Record<string, string>>,
): string | null {
    const managed = managedEnvironment.SATORI_RERANKER_PROVIDER;
    const profile = managedEnvironment.SATORI_LATEON_PROFILE?.trim();
    const policy = managedEnvironment.SATORI_LATEON_ACTIVATION_POLICY?.trim();
    if (profile === HISTORICAL_LATEON_CONTEXT_V3_PROFILE_ID) {
        return null;
    }
    if (
        profile === PREVIOUS_LATEON_CONTEXT_V3_ACTIVATED_PROFILE_ID
        && (policy === PREVIOUS_LATEON_CONTEXT_V3_ACTIVATION_POLICY
            || policy === HISTORICAL_LATEON_D32_ACTIVATION_POLICY)
    ) {
        // Previous managed default combination; `satori upgrade` migrates it
        // to the context-v4 default instead of rejecting it as D16 history.
        return null;
    }
    if (managed === "lateon" && profile !== DEFAULT_LATEON_PROFILE_ID) {
        return profile || "(missing)";
    }
    if (!managed && profile && profile !== DEFAULT_LATEON_PROFILE_ID) {
        return profile;
    }
    return null;
}

function migrationGuidance(profile: string): CliError {
    return new CliError(
        "E_USAGE",
        `Existing managed LateOn installation uses profile ${profile}, which is treated as historical D16. Run \`satori install --runtime offline --reranker lateon\` to migrate to D32, or \`satori install --runtime offline --reranker none\` to disable LateOn.`,
        2,
    );
}

function resolveOfflineReranker(
    command: Extract<InstallCommandInput, { kind: "install"; runtime: "offline" }>,
    managedEnvironment: Readonly<Record<string, string>>,
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform | undefined,
    architecture: string | undefined,
): InstallOfflineReranker {
    const isQualifiedPlatform = (platform ?? process.platform) === "linux"
        && (architecture ?? process.arch) === "x64";
    const rejectUnsupportedLateOn = (): never => {
        throw new CliError(
            "E_USAGE",
            `LateOn D32 is supported only on Linux x64/WSL2; received ${platform ?? process.platform} ${architecture ?? process.arch}. Use --reranker none or an offline Ollama installation.`,
            2,
        );
    };
    if (command.reranker === "none") return "none";
    if (command.reranker === "lateon") {
        if (!isQualifiedPlatform) rejectUnsupportedLateOn();
        return "lateon";
    }

    const managedOffline = managedEnvironment.SATORI_RUNTIME_PROFILE === "offline";
    const configured = env.SATORI_RERANKER_PROVIDER?.trim();
    if (configured) {
        if (configured !== "lateon" && configured !== "none") {
            throw new CliError(
                "E_USAGE",
                `Offline installation supports SATORI_RERANKER_PROVIDER=lateon or none; received ${configured}.`,
                2,
            );
        }
        const historicalProfile = managedOffline
            ? historicalManagedLateOnProfile(managedEnvironment)
            : null;
        if (historicalProfile) {
            throw migrationGuidance(historicalProfile);
        }
        if (configured === "lateon" && !isQualifiedPlatform) rejectUnsupportedLateOn();
        return configured;
    }

    if (managedOffline) {
        const managed = managedEnvironment.SATORI_RERANKER_PROVIDER;
        if (managed === "none") return "none";
        if (managed === "lateon") {
            const profile = managedEnvironment.SATORI_LATEON_PROFILE?.trim();
            const policy = managedEnvironment.SATORI_LATEON_ACTIVATION_POLICY?.trim();
            const previousManagedCombination = profile === PREVIOUS_LATEON_CONTEXT_V3_ACTIVATED_PROFILE_ID
                && (policy === PREVIOUS_LATEON_CONTEXT_V3_ACTIVATION_POLICY
                    || policy === HISTORICAL_LATEON_D32_ACTIVATION_POLICY);
            if (
                profile !== DEFAULT_LATEON_PROFILE_ID
                && profile !== HISTORICAL_LATEON_CONTEXT_V3_PROFILE_ID
                && !previousManagedCombination
            ) {
                throw migrationGuidance(profile || "(missing)");
            }
            if (!isQualifiedPlatform) rejectUnsupportedLateOn();
            return "lateon";
        }
        if (managed) {
            throw new CliError(
                "E_USAGE",
                `Existing offline installation uses unsupported SATORI_RERANKER_PROVIDER=${managed}.`,
                2,
            );
        }
        const historicalProfile = historicalManagedLateOnProfile(managedEnvironment);
        if (historicalProfile) {
            throw migrationGuidance(historicalProfile);
        }
        return isQualifiedPlatform ? "lateon" : "none";
    }

    return isQualifiedPlatform ? "lateon" : "none";
}

function configuredLateOnModelPath(
    reranker: InstallOfflineReranker,
    managedEnvironment: Readonly<Record<string, string>>,
    env: NodeJS.ProcessEnv,
): string | undefined {
    if (reranker === "none") return undefined;
    const configured = env.SATORI_LATEON_MODEL_PATH?.trim()
        || managedEnvironment.SATORI_LATEON_MODEL_PATH?.trim();
    if (!configured) return undefined;
    if (!path.isAbsolute(configured)) {
        throw new CliError("E_USAGE", "SATORI_LATEON_MODEL_PATH must be absolute.", 2);
    }
    return path.resolve(configured);
}

function assertDefaultLateOnProfile(
    reranker: InstallOfflineReranker,
    env: NodeJS.ProcessEnv,
    explicitSelection = false,
): void {
    if (reranker === "none" || explicitSelection) return;
    const configured = env.SATORI_LATEON_PROFILE?.trim();
    if (configured && configured !== DEFAULT_LATEON_PROFILE_ID) {
        throw new CliError(
            "E_USAGE",
            `Offline installation defaults to SATORI_LATEON_PROFILE=${DEFAULT_LATEON_PROFILE_ID}; received ${configured}.`,
            2,
        );
    }
}

async function resolveVerifiedLateOnModel(
    homeDir: string,
    runtimePackageRoot: string | undefined,
    requestedModelDirectory: string | undefined,
    fetchImpl: typeof fetch | undefined,
    authorityLoader: LateOnAuthorityLoader | undefined,
    nowImpl: (() => number) | undefined,
): Promise<VerifiedLateOnModel> {
    if (!runtimePackageRoot) {
        throw new CliError(
            "E_INSTALL_PREFLIGHT",
            "Managed LateOn D32 activation requires a resolvable @zokizuan/satori-mcp package root containing the frozen profile and acquisition manifest; refusing to use a predicted model path.",
            1,
        );
    }
    try {
        if (requestedModelDirectory) {
            return verifyLateOnModelDirectory({
                modelDirectory: requestedModelDirectory,
                runtimePackageRoot,
                authorityLoader,
            });
        }
        return await ensureDefaultLateOnModel({
            homeDir,
            runtimePackageRoot,
            fetchImpl,
            authorityLoader,
            nowImpl,
        });
    } catch (error) {
        if (error instanceof CliError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new CliError("E_INSTALL_PREFLIGHT", `LateOn D32 model preflight failed: ${message}`, 1);
    }
}

function resolveOfflineOllamaModel(
    command: Extract<InstallCommandInput, { kind: "install"; runtime: "offline" }>,
    managedEnvironment: Readonly<Record<string, string>>,
    env: NodeJS.ProcessEnv,
): string | undefined {
    if (command.ollamaModel) {
        return command.ollamaModel;
    }
    const managedOffline = managedEnvironment.SATORI_RUNTIME_PROFILE === "offline";
    const managedProvider = managedOffline ? managedEnvironment.EMBEDDING_PROVIDER : undefined;
    if (managedProvider && managedProvider !== "Ollama" && managedProvider !== "Potion") {
        throw new CliError(
            "E_USAGE",
            `Existing offline installation uses EMBEDDING_PROVIDER=${managedProvider}; expected Potion or Ollama. Reconcile the managed configuration before reinstalling.`,
            2,
        );
    }
    const preservedOllamaModel = managedProvider === "Ollama"
        ? managedEnvironment.OLLAMA_MODEL
        : undefined;
    if (managedProvider === "Ollama" && !preservedOllamaModel) {
        throw new CliError(
            "E_USAGE",
            "Existing managed Ollama installation has no OLLAMA_MODEL. Re-run with an explicit --ollama-model.",
            2,
        );
    }
    const expectedProvider = preservedOllamaModel ? "Ollama" : "Potion";
    const configuredProvider = env.EMBEDDING_PROVIDER?.trim();
    if (configuredProvider && configuredProvider !== expectedProvider) {
        throw new CliError(
            "E_USAGE",
            `EMBEDDING_PROVIDER=${configuredProvider} conflicts with the ${expectedProvider} offline installation selection. Remove the conflicting environment value or select Ollama explicitly with --ollama-model.`,
            2,
        );
    }
    if (!preservedOllamaModel) {
        const configuredModel = env.EMBEDDING_MODEL?.trim();
        if (configuredModel && configuredModel !== POTION_MODEL_ID) {
            throw new CliError(
                "E_USAGE",
                `EMBEDDING_MODEL=${configuredModel} conflicts with the pinned Potion model ${POTION_MODEL_ID}. Remove the conflicting environment value.`,
                2,
            );
        }
        const configuredDimension = env.EMBEDDING_OUTPUT_DIMENSION?.trim();
        if (configuredDimension && configuredDimension !== String(POTION_DIMENSION)) {
            throw new CliError(
                "E_USAGE",
                `EMBEDDING_OUTPUT_DIMENSION=${configuredDimension} conflicts with Potion dimension ${POTION_DIMENSION}. Remove the conflicting environment value.`,
                2,
            );
        }
    }
    return preservedOllamaModel;
}

function readConfiguredClientVectorStore(
    homeDir: string,
    env: NodeJS.ProcessEnv = process.env,
): InstallVectorStore | undefined {
    const selections = resolveClientTargets(homeDir, env)
        .filter(hasSatoriClientEntry)
        .map(readClientVectorStore)
        .filter((value): value is InstallVectorStore => value !== undefined);
    const distinct = [...new Set(selections)];
    if (distinct.length > 1) {
        throw new CliError(
            "E_USAGE",
            "Configured Satori clients disagree about VECTOR_STORE_PROVIDER. Re-run install with an explicit --vector-store after reconciling literal client settings.",
            2,
        );
    }
    return distinct[0];
}

function resolveConnectedVectorStoreForInstall(
    command: Extract<InstallCommandInput, { kind: "install" }>,
    homeDir: string,
    env: NodeJS.ProcessEnv,
    managedEnvironment?: Readonly<Record<string, string>>,
): InstallVectorStore {
    if (command.vectorStore) {
        return command.vectorStore;
    }
    const environmentSelection = env.VECTOR_STORE_PROVIDER === undefined
        ? undefined
        : selectedConnectedVectorStore({ runtime: "voyage", homeDir, env });
    const managedSelection = readManagedLauncherVectorStore(homeDir, managedEnvironment);
    const clientSelection = readConfiguredClientVectorStore(homeDir, env);
    const discovered = [environmentSelection, managedSelection, clientSelection]
        .filter((value): value is InstallVectorStore => value !== undefined);
    if (new Set(discovered).size > 1) {
        throw new CliError(
            "E_USAGE",
            "The installer environment, managed launcher, and configured Satori clients disagree about VECTOR_STORE_PROVIDER. Re-run install with an explicit --vector-store after reconciling literal client settings.",
            2,
        );
    }
    return environmentSelection
        ?? managedSelection
        ?? clientSelection
        ?? selectedConnectedVectorStore({ runtime: "voyage", homeDir, env });
}

function resolveConnectedVectorStoreForInstallOrThrow(
    command: Extract<InstallCommandInput, { kind: "install" }>,
    homeDir: string,
    env: NodeJS.ProcessEnv,
    managedEnvironment?: Readonly<Record<string, string>>,
): InstallVectorStore {
    try {
        return resolveConnectedVectorStoreForInstall(command, homeDir, env, managedEnvironment);
    } catch (error) {
        if (error instanceof CliError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new CliError("E_USAGE", message, 2);
    }
}

export function inspectManagedClientConfigurations(
    homeDir: string,
    inheritedEnv: NodeJS.ProcessEnv = process.env,
): ManagedClientConfigProof[] {
    const expected = resolveManagedClientCommand(homeDir);
    return resolveClientTargets(homeDir, inheritedEnv)
        .filter(hasSatoriClientEntry)
        .map((target) => verifyManagedClientTarget(target, expected, inheritedEnv));
}

export function verifyManagedClientConfigurations(
    installResult: InstallCommandResult,
    homeDir: string,
): ManagedClientConfigProof[] {
    const expected = resolveManagedClientCommand(homeDir);
    return installResult.results.map((result) => verifyManagedClientTarget(result, expected));
}

export function createInstallPlan(
    command: InstallCommandInput,
    options: InstallCommandOptions = {}
): InstallPlan {
    const homeDir = options.homeDir ?? os.homedir();
    const repoDir = options.repoDir ?? process.cwd();
    const packageSpecifier = options.packageSpecifier ?? resolveDefaultPackageSpecifier();
    const plannedRuntimeCommand = options.runtimeCommand ?? plannedManagedRuntimeCommand(homeDir, packageSpecifier);
    const clientCommand = resolveManagedClientCommand(homeDir);
    const profileMutation: FileMutation & { filePath?: string } = command.kind === "install"
        ? prepareProjectProfileInstall(repoDir, command.profile)
        : { changed: false, apply: () => {} };

    const prepared = selectClientTargets(homeDir, command.client, options.env ?? process.env).map((target) => (
        prepareMutation(target, command, clientCommand)
    ));

    return Object.freeze({
        command: Object.freeze({ ...command }),
        homeDir,
        packageSpecifier,
        plannedRuntimeCommand: Object.freeze({
            command: plannedRuntimeCommand.command,
            args: Object.freeze([...plannedRuntimeCommand.args]) as unknown as string[],
        }),
        clientCommand: Object.freeze({
            command: clientCommand.command,
            args: Object.freeze([...clientCommand.args]) as unknown as string[],
        }),
        profileMutation,
        prepared,
        options,
    });
}

export function applyInstallPlan(
    plan: InstallPlan,
    preflight?: InstallPreflightResult,
): InstallCommandResult {
    const { command, homeDir, packageSpecifier, profileMutation, prepared, options } = plan;
    if (command.kind === "install" && !command.dryRun && !preflight) {
        throw new CliError(
            "E_INSTALL_PREFLIGHT_REQUIRED",
            "Refusing to apply an installation plan without a completed runtime preflight.",
            1,
        );
    }
    const runtimeEnvironment: Readonly<Record<string, string>> =
        preflight?.runtimeEnvironment ?? Object.freeze({});
    let installedManagedRuntimeCandidate: ManagedRuntimeCandidate | undefined;
    let launcherMutation = command.kind === "install"
        ? prepareLauncherInstall(homeDir, plan.plannedRuntimeCommand, runtimeEnvironment)
        : { changed: false, apply: () => {} };

    const releaseRuntimeMutationLock =
        !command.dryRun && command.kind === "install" && !options.runtimeCommand
            ? acquireManagedRuntimeMutationLock({ homeDir })
            : undefined;
    try {
        if (!command.dryRun) {
        const plannedSteps: Array<{ description: string; changed: boolean; apply: () => void }> = [];
        if (command.kind === "install" && !options.runtimeCommand) {
            plannedSteps.push({
                description: `managed runtime package at ${resolveRuntimeRoot(homeDir, packageSpecifier)}`,
                changed: true,
                apply: () => {
                    const installedRuntime = installManagedRuntimeCandidate(
                        homeDir,
                        packageSpecifier,
                        options.execFileSyncImpl ?? execFileSync,
                        undefined,
                        {
                            vectorStore: runtimeEnvironment.VECTOR_STORE_PROVIDER === "Milvus"
                                ? "Milvus"
                                : "LanceDB",
                            platform: options.platform,
                            architecture: options.architecture,
                            libc: options.libc,
                        },
                    );
                    installedManagedRuntimeCandidate = installedRuntime;
                    profileMutation.assertUnchanged?.();
                    for (const mutation of prepared) {
                        mutation.configMutation.assertUnchanged?.();
                        for (const companion of mutation.companionMutations) {
                            companion.assertUnchanged?.();
                        }
                    }
                    launcherMutation.assertUnchanged?.();
                    launcherMutation = prepareLauncherInstall(homeDir, installedRuntime.command, runtimeEnvironment);
                },
            });
        }
        if (command.kind === "install") {
            plannedSteps.push({
                description: `managed launcher at ${resolveLauncherPath(homeDir)}`,
                changed: launcherMutation.changed || !options.runtimeCommand,
                apply: () => {
                    launcherMutation.assertUnchanged?.();
                    launcherMutation.apply();
                },
            });
            plannedSteps.push({
                description: `repository profile at ${profileMutation.filePath ?? "satori.toml"}`,
                changed: profileMutation.changed,
                apply: () => {
                    profileMutation.assertUnchanged?.();
                    profileMutation.apply();
                },
            });
        }
        for (const mutation of prepared) {
            plannedSteps.push({
                description: `${mutation.target.client} client configuration at ${mutation.target.configPath}`,
                changed: mutation.configMutation.changed,
                apply: () => {
                    mutation.configMutation.assertUnchanged?.();
                    mutation.configMutation.apply();
                },
            });
            for (const companion of mutation.companionMutations) {
                plannedSteps.push({
                    description: `${mutation.target.client} ${companion.companion.kind} at ${companion.companion.path}`,
                    changed: companion.changed,
                    apply: () => {
                        companion.assertUnchanged?.();
                        companion.apply();
                    },
                });
            }
        }

        const mutationSteps = plannedSteps.filter((step) => step.changed);
        const applied: string[] = [];
        for (let index = 0; index < mutationSteps.length; index += 1) {
            const step = mutationSteps[index];
            try {
                step.apply();
                applied.push(step.description);
            } catch (error) {
                const cause = error instanceof Error ? error.message : String(error);
                const notYetApplied = mutationSteps.slice(index + 1).map((entry) => entry.description);
                throw new CliError(
                    command.kind === "install" ? "E_INSTALL_PARTIAL" : "E_UNINSTALL_PARTIAL",
                    `${command.kind === "install" ? "Installation" : "Uninstallation"} failed while applying ${step.description}: ${cause} `
                    + `Successfully changed: ${applied.length > 0 ? applied.join(", ") : "none"}. `
                    + `Not yet applied: ${notYetApplied.length > 0 ? notYetApplied.join(", ") : "none"}. `
                    + "The failing step may be partially applied; correct the error and rerun the same command.",
                    1,
                );
            }
        }
        }
        if (installedManagedRuntimeCandidate) {
            pruneManagedRuntimeAfterActivation(
                homeDir,
                installedManagedRuntimeCandidate.runtimeRoot,
            );
        }
    } finally {
        releaseRuntimeMutationLock?.();
    }

    return {
        action: command.kind,
        client: command.client,
        dryRun: command.dryRun,
        packageSpecifier: command.kind === "install" ? packageSpecifier : undefined,
        profile: command.kind === "install" ? command.profile : undefined,
        profileConfigPath: command.kind === "install" ? profileMutation.filePath : undefined,
        profileConfigChanged: command.kind === "install" ? profileMutation.changed : undefined,
        runtime: command.kind === "install" ? command.runtime : undefined,
        runtimeEnvironment: command.kind === "install" && command.runtime
            ? runtimeEnvironment
            : undefined,
        results: prepared.map((mutation) => ({
            client: mutation.target.client,
            configPath: mutation.target.configPath,
            instructionsPath: mutation.target.companions.find((companion) => companion.kind === "instructions")?.path,
            guidanceHookPath: mutation.target.companions.find((companion) => companion.kind === "guidance-hook")?.path,
            configChanged: mutation.configChanged,
            instructionsChanged: mutation.companionMutations.some((entry) => entry.companion.kind === "instructions" && entry.changed),
            guidanceHookChanged: mutation.companionMutations.some((entry) => entry.companion.kind === "guidance-hook" && entry.changed),
            status: mutation.configChanged || mutation.companionMutations.some((entry) => entry.changed) || launcherMutation.changed || profileMutation.changed ? "updated" : "unchanged",
            dryRun: command.dryRun,
        })),
    };
}

function readContainingPackageIdentity(
    runtimeEntry: string,
    packageName: string,
): ContainingPackageIdentity | null {
    let current = path.dirname(runtimeEntry);
    while (true) {
        const packageJsonPath = path.join(current, "package.json");
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
                name?: unknown;
                version?: unknown;
            };
            if (
                packageJson.name === packageName
                && typeof packageJson.version === "string"
                && EXACT_PACKAGE_VERSION_PATTERN.test(packageJson.version)
            ) {
                return {
                    version: packageJson.version,
                    packageRoot: current,
                };
            }
        } catch {
            // Continue walking toward the filesystem root.
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

function resolveContainingManagedRuntimeRoot(homeDir: string, packageRoot: string): string | null {
    const storageRoot = path.join(homeDir, ".satori", MANAGED_RUNTIME_DIR);
    if (!isPathWithin(storageRoot, packageRoot)) {
        return null;
    }
    const relativePackageRoot = path.relative(fs.realpathSync(storageRoot), fs.realpathSync(packageRoot));
    const generationName = relativePackageRoot.split(path.sep)[0];
    if (!generationName) {
        return null;
    }
    const runtimeRoot = path.join(storageRoot, generationName);
    return isPathWithin(runtimeRoot, packageRoot) ? runtimeRoot : null;
}

function pruneManagedRuntimeAfterActivation(homeDir: string, currentRuntimeRoot: string): void {
    const result = pruneManagedRuntimeStore({
        homeDir,
        currentRuntimeRoot,
    });
    for (const warning of result.warnings) {
        console.warn(`[RUNTIME-CLEANUP] ${warning}`);
    }
}

function upgradeRuntimeSelection(
    homeDir: string,
    managedEnvironment: Readonly<Record<string, string>>,
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform | undefined,
    architecture: string | undefined,
): {
    runtime: InstallRuntime;
    vectorStore: InstallVectorStore;
    ollamaModel?: string;
    reranker?: InstallOfflineReranker;
    lateOnModelPath?: string;
    effectiveEnv: NodeJS.ProcessEnv;
} {
    const effectiveEnv = runtimeEnvironmentWithManagedFallbacks(managedEnvironment, env);
    const profile = managedEnvironment.SATORI_RUNTIME_PROFILE;
    if (profile === "offline") {
        const command: Extract<InstallCommandInput, { kind: "install"; runtime: "offline" }> = {
            kind: "install",
            client: "all",
            dryRun: false,
            runtime: "offline",
        };
        const ollamaModel = resolveOfflineOllamaModel(command, managedEnvironment, env);
        const reranker = resolveOfflineReranker(command, managedEnvironment, env, platform, architecture);
        assertDefaultLateOnProfile(reranker, env);
        const lateOnModelPath = configuredLateOnModelPath(reranker, managedEnvironment, env);
        return {
            runtime: "offline",
            vectorStore: "LanceDB",
            ...(ollamaModel ? { ollamaModel } : {}),
            reranker,
            ...(lateOnModelPath ? { lateOnModelPath } : {}),
            effectiveEnv,
        };
    }
    if (profile !== undefined && profile !== "connected") {
        throw new CliError(
            "E_USAGE",
            `Managed launcher has unsupported SATORI_RUNTIME_PROFILE=${profile}. Rerun \`satori install\` with an explicit runtime.`,
            2,
        );
    }
    const command: Extract<InstallCommandInput, { kind: "install"; runtime: "voyage" }> = {
        kind: "install",
        client: "all",
        dryRun: false,
        runtime: "voyage",
    };
    return {
        runtime: "voyage",
        vectorStore: resolveConnectedVectorStoreForInstallOrThrow(
            command,
            homeDir,
            env,
            managedEnvironment,
        ),
        effectiveEnv,
    };
}

export async function executeManagedRuntimeUpgrade(
    target: SatoriUpgradeTarget,
    options: InstallCommandOptions = {},
): Promise<ManagedRuntimeUpgradeResult> {
    const homeDir = options.homeDir ?? os.homedir();
    const env = options.env ?? process.env;
    const launcherPath = resolveLauncherPath(homeDir);
    const launcherContent = readTextIfExists(launcherPath);
    if (launcherContent === null) {
        throw new CliError(
            "E_USAGE",
            "Satori has no managed runtime to upgrade. Run `satori install --client all` first.",
            2,
        );
    }

    let descriptor: {
        command: string;
        args: readonly string[];
        managedEnv: Readonly<Record<string, string>>;
    };
    try {
        descriptor = parseManagedLauncherDescriptor(launcherContent);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CliError(
            "E_USAGE",
            `Managed Satori launcher is invalid: ${message} Rerun \`satori install\` to repair it.`,
            2,
        );
    }
    const expectedNodeBasename = path.basename(process.execPath).toLowerCase();
    if (
        !path.isAbsolute(descriptor.command)
        || !fs.existsSync(descriptor.command)
        || path.basename(descriptor.command).toLowerCase() !== expectedNodeBasename
        || descriptor.args.length !== 1
    ) {
        throw new CliError(
            "E_USAGE",
            "Managed Satori launcher has an unsupported command shape. Rerun `satori install` to repair it.",
            2,
        );
    }
    const runtimeEntry = descriptor.args[0];
    if (!runtimeEntry || !path.isAbsolute(runtimeEntry) || !fs.existsSync(runtimeEntry)) {
        throw new CliError(
            "E_USAGE",
            "Managed Satori launcher does not target an existing runtime. Rerun `satori install` to repair it.",
            2,
        );
    }

    const mcpIdentity = readContainingPackageIdentity(runtimeEntry, "@zokizuan/satori-mcp");
    const currentRuntimeRoot = mcpIdentity
        ? resolveContainingManagedRuntimeRoot(homeDir, mcpIdentity.packageRoot)
        : null;
    const coreIdentity = currentRuntimeRoot
        ? readRuntimeDependency(runtimeEntry, CORE_PACKAGE_NAME, currentRuntimeRoot)
        : null;
    if (
        !mcpIdentity
        || !currentRuntimeRoot
        || !isPathWithin(mcpIdentity.packageRoot, runtimeEntry)
        || !coreIdentity
    ) {
        throw new CliError(
            "E_USAGE",
            "Managed Satori runtime package identity is incomplete. Rerun `satori install` to repair it.",
            2,
        );
    }
    const fromMcpVersion = mcpIdentity.version;
    const fromCoreVersion = coreIdentity.version;
    parseStableVersion(fromMcpVersion, "Installed MCP version");
    parseStableVersion(fromCoreVersion, "Installed Core version");

    const configuredClients = inspectManagedClientConfigurations(homeDir, env)
        .filter((proof) => proof.usesManagedLauncher)
        .map((proof) => proof.client);
    const mcpComparison = compareStableVersions(fromMcpVersion, target.mcpVersion);
    if (mcpComparison > 0) {
        throw new CliError(
            "E_USAGE",
            `Installed MCP ${fromMcpVersion} is newer than npm latest ${target.mcpVersion}; refusing to downgrade it.`,
            2,
        );
    }
    const coreComparison = compareStableVersions(fromCoreVersion, target.coreVersion);
    if (coreComparison > 0) {
        throw new CliError(
            "E_USAGE",
            `Installed Core ${fromCoreVersion} is newer than npm latest ${target.coreVersion}; refusing to downgrade it.`,
            2,
        );
    }
    const selection = upgradeRuntimeSelection(
        homeDir,
        descriptor.managedEnv,
        env,
        options.platform,
        options.architecture,
    );
    const runtimeClosure: ManagedRuntimeClosure = {
        vectorStore: selection.vectorStore,
        platform: options.platform,
        architecture: options.architecture,
        libc: options.libc,
    };
    if (
        mcpComparison === 0
        && fromCoreVersion === target.coreVersion
        && managedRuntimeClosureMatches(currentRuntimeRoot, runtimeClosure)
    ) {
        const releaseRuntimeMutationLock = acquireManagedRuntimeMutationLock({ homeDir });
        try {
            assertFileContentUnchanged(launcherPath, launcherContent);
            pruneManagedRuntimeAfterActivation(homeDir, currentRuntimeRoot);
            return {
                action: "upgrade",
                status: "up_to_date",
                fromMcpVersion,
                toMcpVersion: target.mcpVersion,
                fromCoreVersion,
                toCoreVersion: target.coreVersion,
                packageSpecifier: target.mcpPackageSpecifier,
                configuredClients,
                restartRequired: false,
            };
        } finally {
            releaseRuntimeMutationLock();
        }
    }

    if (selection.runtime === "offline" && !selection.ollamaModel) {
        assertSupportedPotionPlatform({
            platform: options.platform,
            architecture: options.architecture,
        });
    }

    const releaseRuntimeMutationLock = acquireManagedRuntimeMutationLock({ homeDir });
    try {
        let candidate: ManagedRuntimeCandidate | undefined;
        try {
        options.onUpgradeProgress?.("installing");
        candidate = installManagedRuntimeCandidate(
            homeDir,
            target.mcpPackageSpecifier,
            options.execFileSyncImpl ?? execFileSync,
            target.coreVersion,
            runtimeClosure,
        );
        options.onUpgradeProgress?.("verifying");
        const potionAssetsRoot = options.potionAssetsRoot
            ?? resolvePotionAssetsRoot(candidate.packageRoot);
        const lateOnModel = selection.runtime === "offline" && selection.reranker === "lateon"
            ? await resolveVerifiedLateOnModel(
                homeDir,
                candidate.packageRoot,
                options.lateOnModelPath ?? selection.lateOnModelPath,
                options.fetchImpl,
                options.lateOnAuthorityLoader,
                options.lateOnNowImpl,
            )
            : undefined;
        const preflightDependencies: InstallPreflightDependencies = {
            ...options.preflightDependencies,
            probeLanceDb: options.preflightDependencies?.probeLanceDb
                ?? exactRuntimeLanceDbProbe(candidate.command),
        };
        const preflight = await (options.preflightRunner ?? runInstallPreflight)({
            runtime: selection.runtime,
            homeDir,
            env: selection.effectiveEnv,
            vectorStore: selection.vectorStore,
            ollamaModel: selection.ollamaModel,
            reranker: selection.reranker,
            ...(lateOnModel
                ? {
                    lateOnModelPath: lateOnModel.modelDirectory,
                    lateOnProfileId: lateOnModel.profileId,
                    lateOnActivationPolicy: LATEON_D32_ACTIVATION_POLICY,
                }
                : {}),
            potionAssetsRoot,
            platform: options.platform,
            architecture: options.architecture,
        }, preflightDependencies);
        await (preflightDependencies.probeCandidateRuntime ?? probeManagedRuntimeCandidate)({
            runtimeCommand: candidate.command,
            runtimeEnvironment: preflight.runtimeEnvironment,
            inheritedEnvironment: selection.effectiveEnv,
            homeDir,
            expectedVersion: target.mcpVersion,
        });

        assertFileContentUnchanged(launcherPath, launcherContent);
        options.onUpgradeProgress?.("activating");
        const launcherMutation = prepareLauncherInstall(
            homeDir,
            candidate.command,
            preflight.runtimeEnvironment,
        );
        launcherMutation.assertUnchanged?.();
        launcherMutation.apply();
        } catch (error) {
            if (candidate?.newlyInstalled) {
                fs.rmSync(candidate.runtimeRoot, { recursive: true, force: true });
            }
            if (error instanceof CliError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new CliError("E_INSTALL_PREFLIGHT", `Satori runtime upgrade failed: ${message}`, 1);
        }
        if (candidate) {
            pruneManagedRuntimeAfterActivation(homeDir, candidate.runtimeRoot);
        }

        return {
            action: "upgrade",
            status: "upgraded",
            fromMcpVersion,
            toMcpVersion: target.mcpVersion,
            fromCoreVersion,
            toCoreVersion: target.coreVersion,
            packageSpecifier: target.mcpPackageSpecifier,
            configuredClients,
            restartRequired: true,
        };
    } finally {
        releaseRuntimeMutationLock();
    }
}

export async function executeInstallCommand(
    command: InstallCommandInput,
    options: InstallCommandOptions = {}
): Promise<InstallCommandResult> {
    const homeDir = options.homeDir ?? os.homedir();
    const env = options.env ?? process.env;
    if (command.kind === "install" && !command.dryRun) {
        assertAutoClientTargets(command.client, homeDir, env);
    }
    let preflight: InstallPreflightResult | undefined;
    let installedRuntimeCommand = options.runtimeCommand;
    let managedRuntimeCandidate: ManagedRuntimeCandidate | undefined;
    let releaseRuntimeMutationLock: (() => void) | undefined;
    let plan: InstallPlan;
    try {
        if (command.kind === "install") {
            if (command.runtime === "offline" && command.vectorStore !== undefined && command.vectorStore !== "LanceDB") {
                throw new CliError("E_USAGE", "Offline install requires --vector-store lancedb.", 2);
            }
            if (!command.dryRun) {
                releaseRuntimeMutationLock = acquireManagedRuntimeMutationLock({ homeDir });
            }
            const managedRuntimeEnvironment = readManagedRuntimeEnvironment(homeDir);
            const vectorStore = command.runtime === "voyage"
                ? resolveConnectedVectorStoreForInstallOrThrow(command, homeDir, env, managedRuntimeEnvironment)
                : "LanceDB";
            const effectiveEnv = runtimeEnvironmentWithManagedFallbacks(managedRuntimeEnvironment, env);
            const preservedOllamaModel = command.runtime === "offline"
                ? resolveOfflineOllamaModel(command, managedRuntimeEnvironment, env)
                : undefined;
            const reranker = command.runtime === "offline"
                ? resolveOfflineReranker(
                    command,
                    managedRuntimeEnvironment,
                    env,
                    options.platform,
                    options.architecture,
                )
                : undefined;
            const explicitRerankerSelection = command.runtime === "offline" && command.reranker !== undefined;
            if (reranker) assertDefaultLateOnProfile(reranker, env, explicitRerankerSelection);
            const requestedLateOnModelPath = command.runtime === "offline" && reranker
                ? options.lateOnModelPath
                    ?? configuredLateOnModelPath(reranker, managedRuntimeEnvironment, env)
                : undefined;
            if (requestedLateOnModelPath && !path.isAbsolute(requestedLateOnModelPath)) {
                throw new CliError("E_USAGE", "LateOn model path must be absolute.", 2);
            }
            if (command.runtime === "offline" && !preservedOllamaModel) {
                assertSupportedPotionPlatform({
                    platform: options.platform,
                    architecture: options.architecture,
                });
            }
            const packageSpecifier = options.packageSpecifier ?? resolveDefaultPackageSpecifier();
            let potionAssetsRoot = options.potionAssetsRoot
                ?? resolvePotionAssetsRoot(resolveRuntimePackageRoot(homeDir, packageSpecifier));
            let lateOnModel: VerifiedLateOnModel | undefined;
            let lateOnModelPath = requestedLateOnModelPath;
            if (command.dryRun) {
                if (reranker === "lateon" && !lateOnModelPath) {
                    lateOnModelPath = resolveDefaultLateOnModelDirectory(homeDir);
                }
                preflight = { runtimeEnvironment: planInstallRuntimeEnvironment({
                    runtime: command.runtime,
                    homeDir,
                    env: effectiveEnv,
                    vectorStore,
                    ollamaModel: preservedOllamaModel,
                    reranker,
                    lateOnModelPath,
                    ...(reranker === "lateon"
                        ? {
                            lateOnProfileId: DEFAULT_LATEON_PROFILE_ID,
                            lateOnActivationPolicy: LATEON_D32_ACTIVATION_POLICY,
                        }
                        : {}),
                    potionAssetsRoot,
                    platform: options.platform,
                    architecture: options.architecture,
                }) };
            } else {
                if (!installedRuntimeCommand) {
                    managedRuntimeCandidate = installManagedRuntimeCandidate(
                        homeDir,
                        packageSpecifier,
                        options.execFileSyncImpl ?? execFileSync,
                        undefined,
                        {
                            vectorStore,
                            platform: options.platform,
                            architecture: options.architecture,
                            libc: options.libc,
                        },
                    );
                    installedRuntimeCommand = managedRuntimeCandidate.command;
                    potionAssetsRoot = resolvePotionAssetsRoot(managedRuntimeCandidate.packageRoot);
                }
                if (reranker === "lateon") {
                    const runtimePackageRoot = managedRuntimeCandidate?.packageRoot
                        ?? (installedRuntimeCommand.args.length === 1
                            ? readContainingPackageIdentity(
                                installedRuntimeCommand.args[0],
                                "@zokizuan/satori-mcp",
                            )?.packageRoot
                            : undefined);
                    lateOnModel = await resolveVerifiedLateOnModel(
                        homeDir,
                        runtimePackageRoot,
                        requestedLateOnModelPath,
                        options.fetchImpl,
                        options.lateOnAuthorityLoader,
                        options.lateOnNowImpl,
                    );
                }
                const preflightDependencies: InstallPreflightDependencies = {
                    ...options.preflightDependencies,
                    probeLanceDb: options.preflightDependencies?.probeLanceDb
                        ?? exactRuntimeLanceDbProbe(installedRuntimeCommand),
                };
                try {
                    preflight = await (options.preflightRunner ?? runInstallPreflight)(
                        {
                            runtime: command.runtime,
                            homeDir,
                            env: effectiveEnv,
                            vectorStore,
                            ollamaModel: preservedOllamaModel,
                            reranker,
                            ...(lateOnModel
                                ? {
                                    lateOnModelPath: lateOnModel.modelDirectory,
                                    lateOnProfileId: lateOnModel.profileId,
                                    lateOnActivationPolicy: LATEON_D32_ACTIVATION_POLICY,
                                }
                                : {}),
                            potionAssetsRoot,
                            platform: options.platform,
                            architecture: options.architecture,
                        },
                        preflightDependencies,
                    );
                    if (managedRuntimeCandidate) {
                        try {
                            await (preflightDependencies.probeCandidateRuntime ?? probeManagedRuntimeCandidate)({
                                runtimeCommand: managedRuntimeCandidate.command,
                                runtimeEnvironment: preflight.runtimeEnvironment,
                                inheritedEnvironment: effectiveEnv,
                                homeDir,
                                expectedVersion: managedRuntimeCandidate.identity.version,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            throw new CliError(
                                "E_INSTALL_PREFLIGHT",
                                `Candidate runtime preflight failed: ${message}`,
                                1,
                            );
                        }
                    }
                } catch (error) {
                    if (error instanceof CliError) throw error;
                    const message = error instanceof Error ? error.message : String(error);
                    throw new CliError("E_INSTALL_PREFLIGHT", `Runtime preflight failed: ${message}`, 1);
                }
            }
            if (
                command.runtime === "voyage"
                && resolveConnectedVectorStoreForInstallOrThrow(command, homeDir, env) !== vectorStore
            ) {
                throw new CliError(
                    "E_INSTALL_PLAN_STALE",
                    "Connected vector-store selection changed while runtime preflight was running. Rerun install against the current configuration.",
                    1,
                );
            }
            const currentManagedRuntimeEnvironment = readManagedRuntimeEnvironment(homeDir);
            for (const key of [
                "LANCEDB_PATH",
                "OLLAMA_HOST",
                "EMBEDDING_PROVIDER",
                "OLLAMA_MODEL",
                "SATORI_RERANKER_PROVIDER",
                "SATORI_LATEON_MODEL_PATH",
                "SATORI_LATEON_PROFILE",
                "SATORI_LATEON_ACTIVATION_POLICY",
            ] as const) {
                if (currentManagedRuntimeEnvironment[key] !== managedRuntimeEnvironment[key]) {
                    throw new CliError(
                        "E_INSTALL_PLAN_STALE",
                        `Managed ${key} changed while runtime preflight was running. Rerun install against the current launcher.`,
                        1,
                    );
                }
            }
            if (!command.dryRun) {
                assertAutoClientTargets(command.client, homeDir, env);
            }
        }
        // Read mutable client/profile files only after awaited preflight completes.
        plan = createInstallPlan(command, {
            ...options,
            homeDir,
            ...(installedRuntimeCommand ? { runtimeCommand: installedRuntimeCommand } : {}),
        });
    } catch (error) {
        if (managedRuntimeCandidate?.newlyInstalled) {
            fs.rmSync(managedRuntimeCandidate.runtimeRoot, { recursive: true, force: true });
        }
        releaseRuntimeMutationLock?.();
        releaseRuntimeMutationLock = undefined;
        throw error;
    }
    try {
        const result = applyInstallPlan(plan, preflight);
        if (managedRuntimeCandidate) {
            pruneManagedRuntimeAfterActivation(homeDir, managedRuntimeCandidate.runtimeRoot);
        }
        return result;
    } finally {
        releaseRuntimeMutationLock?.();
    }
}

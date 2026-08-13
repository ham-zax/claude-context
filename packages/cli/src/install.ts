import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
    type InstallPreflightDependencies,
    type InstallPreflightResult,
    type LanceDbModule,
} from "./install-preflight.js";
import {
    assertAutoClientTargets,
} from "./client-targets.js";
import {
    packageNameFromSpecifier,
    resolveLauncherPath,
    resolvePotionAssetsRoot,
    resolveRuntimeEntryPath,
    resolveRuntimePackageRoot,
    resolveRuntimePackageRootFromRoot,
    resolveRuntimeRoot,
} from "./managed-runtime-paths.js";
import {
    MANAGED_RUNTIME_DIR,
} from "./install-contracts.js";
import type {
    ExecFileSyncLike,
    InstallCommandInput,
    InstallCommandOptions,
    InstallCommandResult,
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
import {
    buildLauncherScript,
    parseManagedLauncherDescriptor,
} from "./managed-launcher-script.mjs";
import {
    assertFileContentUnchanged,
    ensureDir,
    readTextIfExists,
    writeTextFileAtomic,
    type FileMutation,
} from "./client-config-mutations.js";
import {
    inspectManagedClientConfigurations,
    readManagedRuntimeEnvironment,
    runtimeEnvironmentWithManagedFallbacks,
} from "./client-config-inspection.js";
import {
    assertDefaultLateOnProfile,
    configuredLateOnModelPath,
    resolveConnectedVectorStoreForInstallOrThrow,
    resolveOfflineOllamaModel,
    resolveOfflineReranker,
    resolveVerifiedLateOnModel,
} from "./runtime-selection.js";
import {
    createInstallPlan,
    resolveDefaultPackageSpecifier,
    type InstallPlan,
} from "./install-planning.js";
export { createInstallPlan } from "./install-planning.js";
export type { InstallPlan } from "./install-planning.js";
export {
    inspectManagedClientConfigurations,
    verifyManagedClientConfigurations,
} from "./client-config-inspection.js";
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
    LATEON_D32_ACTIVATION_POLICY,
    resolveDefaultLateOnModelDirectory,
    type VerifiedLateOnModel,
} from "./lateon-model-store.js";

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

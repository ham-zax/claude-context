import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CliError } from "./errors.js";
import type {
    InstallOfflineReranker,
    InstallRuntime,
    InstallVectorStore,
} from "./args.js";
import {
    assertSupportedPotionPlatform,
    planInstallRuntimeEnvironment,
    probeManagedRuntimeCandidate,
    runInstallPreflight,
    type InstallPreflightDependencies,
    type InstallPreflightResult,
} from "./install-preflight.js";
import {
    assertAutoClientTargets,
} from "./client-targets.js";
import {
    resolveLauncherPath,
    resolvePotionAssetsRoot,
    resolveRuntimePackageRoot,
} from "./managed-runtime-paths.js";
import type {
    InstallCommandInput,
    InstallCommandOptions,
    InstallCommandResult,
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
    parseManagedLauncherDescriptor,
} from "./managed-launcher-script.mjs";
import {
    assertFileContentUnchanged,
    readTextIfExists,
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
import {
    applyInstallPlan,
    exactRuntimeLanceDbProbe,
    installManagedRuntimeCandidate,
    isPathWithin,
    prepareLauncherInstall,
    pruneManagedRuntimeAfterActivation,
    readContainingPackageIdentity,
    CORE_PACKAGE_NAME,
    readRuntimeDependency,
    resolveContainingManagedRuntimeRoot,
    type ManagedRuntimeCandidate,
} from "./install-application.js";
export { applyInstallPlan } from "./install-application.js";
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
} from "./managed-runtime-store.js";
import {
    managedRuntimeClosureMatches,
    type ManagedRuntimeClosure,
} from "./managed-runtime-closure.js";
import {
    DEFAULT_LATEON_PROFILE_ID,
    LATEON_D32_ACTIVATION_POLICY,
    resolveDefaultLateOnModelDirectory,
    type VerifiedLateOnModel,
} from "./lateon-model-store.js";

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

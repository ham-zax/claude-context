import os from "node:os";
import { CliError } from "./errors.js";
import type {
    InstallCommandInput,
    InstallCommandOptions,
    ManagedRuntimeCommand,
} from "./install-contracts.js";
import {
    plannedManagedRuntimeCommand,
    resolveManagedClientCommand,
} from "./managed-runtime-paths.js";
import { resolveManagedPackageSpecifier } from "./managed-package.js";
import { selectClientTargets } from "./client-targets.js";
import {
    prepareMutation,
    prepareProjectProfileInstall,
    type FileMutation,
    type PreparedMutation,
} from "./client-config-mutations.js";

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

export function resolveDefaultPackageSpecifier(): string {
    try {
        return resolveManagedPackageSpecifier();
    } catch {
        // Fall through to hard failure below.
    }
    throw new CliError("E_USAGE", "Unable to resolve the installed Satori package version for CLI install.", 2);
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
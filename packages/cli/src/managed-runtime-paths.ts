import path from "node:path";
import {
    MANAGED_BIN_DIR,
    MANAGED_LAUNCHER_FILE,
    MANAGED_RUNTIME_DIR,
    type ManagedRuntimeCommand,
} from "./install-contracts.js";

export function packageNameFromSpecifier(packageSpecifier: string): string {
    if (packageSpecifier.startsWith("@")) {
        const versionMarker = packageSpecifier.indexOf("@", 1);
        return versionMarker === -1 ? packageSpecifier : packageSpecifier.slice(0, versionMarker);
    }
    const versionMarker = packageSpecifier.indexOf("@");
    return versionMarker === -1 ? packageSpecifier : packageSpecifier.slice(0, versionMarker);
}

export function safeRuntimeDirName(packageSpecifier: string): string {
    return packageSpecifier.replace(/[^A-Za-z0-9._@-]+/g, "-");
}

export function resolveRuntimeRoot(homeDir: string, packageSpecifier: string): string {
    return path.join(homeDir, ".satori", MANAGED_RUNTIME_DIR, safeRuntimeDirName(packageSpecifier));
}

export function resolveRuntimePackageRoot(homeDir: string, packageSpecifier: string): string {
    return path.join(resolveRuntimeRoot(homeDir, packageSpecifier), "node_modules", ...packageNameFromSpecifier(packageSpecifier).split("/"));
}

export function resolveRuntimePackageRootFromRoot(runtimeRoot: string, packageSpecifier: string): string {
    return path.join(runtimeRoot, "node_modules", ...packageNameFromSpecifier(packageSpecifier).split("/"));
}

export function resolvePotionAssetsRoot(packageRoot: string): string {
    return path.join(packageRoot, "assets", "potion", "linux-x64");
}

export function resolveRuntimeEntryPath(packageRoot: string, packageJson?: { bin?: unknown; main?: unknown }): string {
    const bin = packageJson?.bin;
    let relativeEntry = "dist/index.js";
    if (bin && typeof bin === "object" && !Array.isArray(bin) && typeof (bin as Record<string, unknown>).satori === "string") {
        relativeEntry = (bin as Record<string, string>).satori;
    } else if (typeof bin === "string") {
        relativeEntry = bin;
    } else if (typeof packageJson?.main === "string") {
        relativeEntry = packageJson.main;
    }
    return path.resolve(packageRoot, relativeEntry);
}

export function resolveLauncherPath(homeDir: string): string {
    return path.join(homeDir, ".satori", MANAGED_BIN_DIR, MANAGED_LAUNCHER_FILE);
}

export function plannedManagedRuntimeCommand(homeDir: string, packageSpecifier: string): ManagedRuntimeCommand {
    return {
        command: process.execPath,
        args: [resolveRuntimeEntryPath(resolveRuntimePackageRoot(homeDir, packageSpecifier))],
    };
}

export function resolveManagedClientCommand(homeDir: string): ManagedRuntimeCommand {
    return {
        command: process.execPath,
        args: [resolveLauncherPath(homeDir)],
    };
}

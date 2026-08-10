import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { POTION_DIMENSION, POTION_MODEL_ID } from "@zokizuan/satori-core";
import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser";
import { CliError } from "./errors.js";
import type {
    InstallClient,
    InstallOfflineReranker,
    InstallProfile,
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
    type InstallPreflightInput,
    type InstallPreflightResult,
    type LanceDbModule,
} from "./install-preflight.js";
import { resolveManagedPackageSpecifier } from "./managed-package.js";
import {
    buildLauncherScript,
    parseManagedLauncherDescriptor,
    parseManagedLauncherEnvironment,
} from "./managed-launcher-script.mjs";
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

const MANAGED_BLOCK_START = "# >>> satori-cli managed satori start >>>";
const MANAGED_BLOCK_END = "# <<< satori-cli managed satori end <<<";
const CODEX_ENV_TEMPLATE_START = "# >>> satori-cli optional satori env template >>>";
const CODEX_ENV_TEMPLATE_END = "# <<< satori-cli optional satori env template <<<";
const CODEX_GUIDANCE_HOOK_START = "# >>> satori-cli managed codex guidance hook start >>>";
const CODEX_GUIDANCE_HOOK_END = "# <<< satori-cli managed codex guidance hook end <<<";
const INSTRUCTIONS_BLOCK_START = "<!-- satori-mcp:start -->";
const INSTRUCTIONS_BLOCK_END = "<!-- satori-mcp:end -->";
const LEGACY_SKILL_DIR_NAME = "satori";
const MANAGED_RUNTIME_DIR = "mcp-runtime";
const MANAGED_BIN_DIR = "bin";
const MANAGED_LAUNCHER_FILE = "satori-mcp.js";
const SATORI_RUNTIME_ENV_VARS = [
    "SATORI_RUNTIME_PROFILE",
    "VECTOR_STORE_PROVIDER",
    "LANCEDB_PATH",
    "EMBEDDING_PROVIDER",
    "EMBEDDING_MODEL",
    "EMBEDDING_OUTPUT_DIMENSION",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "VOYAGEAI_API_KEY",
    "VOYAGEAI_RERANKER_MODEL",
    "SATORI_RERANKER_PROVIDER",
    "SATORI_LATEON_MODEL_PATH",
    "SATORI_LATEON_PROFILE",
    "SATORI_LATEON_ACTIVATION_POLICY",
    "SATORI_LATEON_REQUEST_DEADLINE_MS",
    "SATORI_LATEON_MAX_QUEUE_WAIT_MS",
    "SATORI_LATEON_RERANKER_STAGE_DEADLINE_MS",
    "SATORI_LATEON_MAX_ACTIVE_RERANKS",
    "SATORI_LATEON_MAX_QUEUED_RERANKS",
    "SATORI_LATEON_INTRA_OP_THREADS",
    "GEMINI_API_KEY",
    "GEMINI_BASE_URL",
    "OLLAMA_HOST",
    "OLLAMA_MODEL",
    "OLLAMA_MODEL_DIGEST",
    "POTION_HELPER_PATH",
    "POTION_MODEL_PATH",
    "POTION_REQUEST_TIMEOUT_MS",
    "MILVUS_ADDRESS",
    "MILVUS_TOKEN",
    "READ_FILE_MAX_LINES",
    "MCP_ENABLE_WATCHER",
    "MCP_WATCH_DEBOUNCE_MS",
] as const;
const LAUNCHER_OWNED_RUNTIME_ENV_VARS = [
    "SATORI_RUNTIME_PROFILE",
    "VECTOR_STORE_PROVIDER",
    "LANCEDB_PATH",
    "EMBEDDING_PROVIDER",
    "EMBEDDING_MODEL",
    "EMBEDDING_OUTPUT_DIMENSION",
    "SATORI_RERANKER_PROVIDER",
    "SATORI_LATEON_MODEL_PATH",
    "SATORI_LATEON_PROFILE",
    "SATORI_LATEON_ACTIVATION_POLICY",
    "OLLAMA_HOST",
    "OLLAMA_MODEL",
    "POTION_HELPER_PATH",
    "POTION_MODEL_PATH",
    "POTION_REQUEST_TIMEOUT_MS",
] as const;
const CODEX_GUIDANCE_HOOK_MESSAGE = "Satori MCP is available for semantic ownership and freshness-aware discovery. Prefer search_codebase for unfamiliar behavior; use the usual/native workflow for known paths, exact literals, or small local edits. Follow recommendedNextAction, verify call_graph inbound results, and ask before create, reindex, or clear.";
const CODEX_GUIDANCE_HOOK_MATCHER = "startup|resume|clear|compact";
const CODEX_GUIDANCE_HOOK_TIMEOUT_SECONDS = 5;
const CODEX_GUIDANCE_HOOK_SCRIPT = [
    `msg=${JSON.stringify(CODEX_GUIDANCE_HOOK_MESSAGE)}`,
    'key=$(printf "%s" "$PWD" | sed "s#[^A-Za-z0-9_.-]#_#g" | cut -c1-120)',
    'uid=$(id -u 2>/dev/null || printf "user")',
    'dir="${XDG_RUNTIME_DIR:-/tmp}/satori-codex-guidance.${uid}"',
    'mkdir -p "$dir" 2>/dev/null || true',
    'chmod 700 "$dir" 2>/dev/null || true',
    'stamp="$dir/${key:-global}"',
    'now=$(date +%s)',
    'last=$(cat "$stamp" 2>/dev/null || printf "0")',
    'case "$last" in *[!0-9]*|"") last=0;; esac',
    'if [ $((now - last)) -lt 10 ]; then exit 0; fi',
    'umask 077',
    'printf "%s" "$now" > "$stamp" 2>/dev/null || true',
    'printf "%s\\n" "$msg"',
].join("; ");
const CODEX_GUIDANCE_HOOK_COMMAND = `sh -lc '${CODEX_GUIDANCE_HOOK_SCRIPT}'`;
const SATORI_AGENT_INSTRUCTIONS = `# Satori MCP

Satori MCP is available for semantic ownership and freshness-aware code discovery. Prefer it for unfamiliar behavior, related implementation, or index state. Use the usual/native workflow for known paths, exact literals, and small local edits.

## Priority Order
1. \`search_codebase\` — find behavior or ownership by intent
2. \`continue_search\` — reveal more from the same frozen result when useful
3. \`read_file\` / \`file_outline\` — inspect exact source or structure
4. \`call_graph\` — inspect advisory relationships for graph-ready targets
5. \`list_codebases\` / \`manage_index\` — inspect index state

## Boundaries
- Follow \`recommendedNextAction\` and read \`warnings[].action\`.
- Treat inbound \`call_graph\` results as leads to verify, not complete blast-radius proof.
- If Satori reports \`requires_reindex\`, report the reason. Ask before \`create\`, \`reindex\`, or \`clear\`.
`;

type ExecFileSyncLike = typeof execFileSync;

export type ClientName = Exclude<InstallClient, "auto" | "all">;

export interface ManagedRuntimeCommand {
    command: string;
    args: string[];
}

export type ManagedRuntimeUpgradePhase = "installing" | "verifying" | "activating";

type InstallCommandBase = {
        kind: "install";
        client: InstallClient;
        dryRun: boolean;
        installGuidanceHook?: boolean;
        profile?: InstallProfile;
};

export type InstallCommandInput =
    | (InstallCommandBase & {
        runtime: "voyage";
        vectorStore?: InstallVectorStore;
        ollamaModel?: never;
    })
    | (InstallCommandBase & {
        runtime: "offline";
        vectorStore?: "LanceDB";
        ollamaModel?: string;
        reranker?: InstallOfflineReranker;
    })
    | {
        kind: "uninstall";
        client: InstallClient;
        dryRun: boolean;
    };

export interface InstallCommandOptions {
    homeDir?: string;
    repoDir?: string;
    packageSpecifier?: string;
    runtimeCommand?: ManagedRuntimeCommand;
    execFileSyncImpl?: ExecFileSyncLike;
    env?: NodeJS.ProcessEnv;
    preflightDependencies?: InstallPreflightDependencies;
    potionAssetsRoot?: string;
    lateOnModelPath?: string;
    fetchImpl?: typeof fetch;
    /** Structural test seam for LateOn acquisition; the production default binds the frozen digest. */
    lateOnAuthorityLoader?: LateOnAuthorityLoader;
    /** Test seam for proving LateOn acquisition deadline handling without waiting ten minutes. */
    lateOnNowImpl?: () => number;
    platform?: NodeJS.Platform;
    architecture?: string;
    libc?: "gnu" | "musl";
    onUpgradeProgress?: (phase: ManagedRuntimeUpgradePhase) => void;
    preflightRunner?: (
        input: InstallPreflightInput,
        dependencies?: InstallPreflightDependencies,
    ) => Promise<InstallPreflightResult>;
}

export interface ClientInstallResult {
    client: ClientName;
    configPath: string;
    instructionsPath?: string;
    guidanceHookPath?: string;
    configChanged: boolean;
    instructionsChanged: boolean;
    guidanceHookChanged: boolean;
    status: "updated" | "unchanged";
    dryRun: boolean;
}

export interface InstallCommandResult {
    action: "install" | "uninstall";
    client: InstallClient;
    dryRun: boolean;
    /** Managed MCP package specifier used for runtime install (install only). */
    packageSpecifier?: string;
    profile?: InstallProfile;
    profileConfigPath?: string;
    profileConfigChanged?: boolean;
    runtime?: InstallRuntime;
    /** Non-secret runtime values persisted in the managed launcher. */
    runtimeEnvironment?: Readonly<Record<string, string>>;
    results: ClientInstallResult[];
}

export interface ManagedRuntimeUpgradeResult {
    action: "upgrade";
    status: "upgraded" | "up_to_date";
    fromMcpVersion: string;
    toMcpVersion: string;
    fromCoreVersion: string;
    toCoreVersion: string;
    packageSpecifier: string;
    configuredClients: ClientName[];
    restartRequired: boolean;
}

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

interface ClientTarget {
    client: ClientName;
    configPath: string;
    companions: CompanionTarget[];
}

type CompanionTarget =
    | { kind: "legacy-skill"; path: string }
    | { kind: "instructions"; path: string; instructions: string }
    | { kind: "guidance-hook"; path: string };

interface CompanionMutation {
    companion: CompanionTarget;
    changed: boolean;
    assertUnchanged?: () => void;
    apply: () => void;
}

interface PreparedMutation {
    target: ClientTarget;
    configMutation: FileMutation;
    configChanged: boolean;
    companionMutations: CompanionMutation[];
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

interface FileMutation {
    changed: boolean;
    assertUnchanged?: () => void;
    apply: () => void;
}

export interface ManagedClientConfigProof {
    client: ClientName;
    configPath: string;
    status: "ok" | "error";
    message: string;
    /** Client-owned runtime values resolved without exposing them in doctor output. */
    runtimeEnvironment?: Readonly<Record<string, string>>;
    /** Whether this client actually launches through ~/.satori/bin/satori-mcp.js. */
    usesManagedLauncher?: boolean;
}

function resolveDefaultPackageSpecifier(): string {
    try {
        return resolveManagedPackageSpecifier();
    } catch {
        // Fall through to hard failure below.
    }
    throw new CliError("E_USAGE", "Unable to resolve the installed Satori package version for CLI install.", 2);
}

function resolveConfiguredPath(value: string | undefined, homeDir: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    if (trimmed === "~") {
        return homeDir;
    }
    if (trimmed.startsWith(`~${path.sep}`) || trimmed.startsWith("~/")) {
        return path.join(homeDir, trimmed.slice(2));
    }
    return trimmed;
}

function resolveOpenCodeGlobalConfigDir(homeDir: string): string {
    return path.join(homeDir, ".config", "opencode");
}

function resolveClientTargets(homeDir: string, env: NodeJS.ProcessEnv = process.env): ClientTarget[] {
    const codexHome = resolveConfiguredPath(env.CODEX_HOME, homeDir)
        ?? path.join(homeDir, ".codex");
    const claudeConfigDir = resolveConfiguredPath(env.CLAUDE_CONFIG_DIR, homeDir)
        ?? path.join(homeDir, ".claude");
    const claudeUserRoot = resolveConfiguredPath(env.CLAUDE_CONFIG_DIR, homeDir) ?? homeDir;
    const opencodeGlobalConfigDir = resolveOpenCodeGlobalConfigDir(homeDir);
    const opencodeConfigPath = resolveConfiguredPath(env.OPENCODE_CONFIG, homeDir)
        ?? path.join(opencodeGlobalConfigDir, "opencode.json");

    return [
        {
            client: "codex",
            configPath: path.join(codexHome, "config.toml"),
            companions: [
                {
                    kind: "legacy-skill",
                    path: path.join(codexHome, "skills", LEGACY_SKILL_DIR_NAME),
                },
                {
                    kind: "instructions",
                    path: path.join(codexHome, "AGENTS.md"),
                    instructions: SATORI_AGENT_INSTRUCTIONS,
                },
                {
                    kind: "guidance-hook",
                    path: path.join(codexHome, "hooks.json"),
                },
            ],
        },
        {
            client: "claude",
            configPath: path.join(claudeUserRoot, ".claude.json"),
            companions: [{
                kind: "legacy-skill",
                path: path.join(claudeConfigDir, "skills", LEGACY_SKILL_DIR_NAME),
            }],
        },
        {
            client: "opencode",
            configPath: opencodeConfigPath,
            companions: [{
                kind: "instructions",
                path: path.join(opencodeGlobalConfigDir, "AGENTS.md"),
                instructions: SATORI_AGENT_INSTRUCTIONS,
            }],
        },
    ];
}

function isExecutable(filePath: string): boolean {
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile() && (stats.mode & 0o111) !== 0;
    } catch {
        return false;
    }
}

function executableExists(command: string, homeDir: string, env: NodeJS.ProcessEnv): boolean {
    const pathEntries = (env.PATH ?? "")
        .split(path.delimiter)
        .filter((entry) => entry.length > 0);
    const fallbackEntries = [
        ...(path.resolve(homeDir) === path.resolve(os.homedir()) ? ["/usr/local/bin"] : []),
        path.join(homeDir, ".npm", "bin"),
        path.join(homeDir, ".local", "bin"),
        path.join(homeDir, ".cargo", "bin"),
    ];
    return [...new Set([...pathEntries, ...fallbackEntries])]
        .some((entry) => isExecutable(path.join(entry, command)));
}

function configuredPathExists(value: string | undefined, homeDir: string, directory: boolean): boolean {
    const resolved = resolveConfiguredPath(value, homeDir);
    if (!resolved) {
        return false;
    }
    try {
        const stats = fs.statSync(resolved);
        return directory ? stats.isDirectory() : stats.isFile();
    } catch {
        return false;
    }
}

function isClientDetected(target: ClientTarget, homeDir: string, env: NodeJS.ProcessEnv): boolean {
    switch (target.client) {
        case "codex":
            return configuredPathExists(path.dirname(target.configPath), homeDir, true)
                || executableExists("codex", homeDir, env);
        case "claude": {
            const skill = target.companions.find((companion) => companion.kind === "legacy-skill");
            const configDir = skill && skill.kind === "legacy-skill"
                ? path.dirname(path.dirname(skill.path))
                : undefined;
            return configuredPathExists(configDir, homeDir, true)
                || configuredPathExists(target.configPath, homeDir, false)
                || executableExists("claude", homeDir, env);
        }
        case "opencode": {
            const customConfigDir = resolveConfiguredPath(env.OPENCODE_CONFIG_DIR, homeDir);
            return configuredPathExists(target.configPath, homeDir, false)
                || configuredPathExists(resolveOpenCodeGlobalConfigDir(homeDir), homeDir, true)
                || configuredPathExists(customConfigDir, homeDir, true)
                || executableExists("opencode", homeDir, env);
        }
    }
}

export function detectClientTargets(
    homeDir: string,
    env: NodeJS.ProcessEnv = process.env,
): ClientName[] {
    return resolveClientTargets(homeDir, env)
        .filter((target) => isClientDetected(target, homeDir, env))
        .map((target) => target.client);
}

export function assertAutoClientTargets(
    client: InstallClient,
    homeDir: string,
    env: NodeJS.ProcessEnv = process.env,
): void {
    if (client !== "auto" || detectClientTargets(homeDir, env).length > 0) {
        return;
    }
    throw new CliError(
        "E_NO_CLIENTS_DETECTED",
        [
            "No supported coding clients were detected.",
            "",
            "Detected clients: none",
            "",
            "Install Codex, Claude Code, or OpenCode, or explicitly choose:",
            "  satori install --client codex",
            "  satori install --client claude",
            "  satori install --client opencode",
            "  satori install --client all",
        ].join("\n"),
        2,
    );
}

function selectTargets(homeDir: string, client: InstallClient, env: NodeJS.ProcessEnv): ClientTarget[] {
    const targets = resolveClientTargets(homeDir, env);
    if (client === "all") {
        return targets;
    }
    if (client === "auto") {
        const detectedClients = new Set(detectClientTargets(homeDir, env));
        return targets.filter((target) => detectedClients.has(target.client));
    }
    return targets.filter((target) => target.client === client);
}

function ensureParentDir(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readTextIfExists(filePath: string): string | null {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return fs.readFileSync(filePath, "utf8");
}

function assertFileContentUnchanged(filePath: string, expected: string | null): void {
    if (readTextIfExists(filePath) === expected) {
        return;
    }
    throw new CliError(
        "E_INSTALL_PLAN_STALE",
        `Refusing to overwrite '${filePath}' because it changed after the installation plan was created. Rerun the same command against the current file.`,
        1,
    );
}

function guardFileMutation(filePath: string, expected: string | null, mutation: FileMutation): FileMutation {
    assertFileContentUnchanged(filePath, expected);
    return {
        ...mutation,
        assertUnchanged: () => assertFileContentUnchanged(filePath, expected),
    };
}

function normalizeTrailingNewline(value: string): string {
    return value.endsWith("\n") ? value : `${value}\n`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTomlString(value: string): string {
    return JSON.stringify(value);
}

function buildTomlArray(values: string[]): string {
    return `[${values.map(toTomlString).join(", ")}]`;
}

function buildSatoriProjectConfig(profile: InstallProfile): string {
    return [
        "# Satori project config",
        "[index]",
        `profile = ${toTomlString(profile)}`,
        "",
    ].join("\n");
}

function updateSatoriProjectConfig(current: string, profile: InstallProfile): string {
    if (current.trim().length === 0) {
        return buildSatoriProjectConfig(profile);
    }

    const lines = current.replace(/\r\n/g, "\n").split("\n");
    let indexTableLine = -1;
    let nextTableLine = lines.length;

    for (let i = 0; i < lines.length; i += 1) {
        const tableMatch = lines[i]?.match(/^\s*\[([A-Za-z0-9_.-]+)\]\s*(?:#.*)?$/);
        if (!tableMatch) {
            continue;
        }
        if (tableMatch[1] === "index") {
            indexTableLine = i;
            nextTableLine = lines.length;
            continue;
        }
        if (indexTableLine !== -1 && nextTableLine === lines.length) {
            nextTableLine = i;
        }
    }

    if (indexTableLine === -1) {
        return `${normalizeTrailingNewline(current)}\n[index]\nprofile = ${toTomlString(profile)}\n`;
    }

    for (let i = indexTableLine + 1; i < nextTableLine; i += 1) {
        if (/^\s*profile\s*=/.test(lines[i] || "")) {
            lines[i] = `profile = ${toTomlString(profile)}`;
            return normalizeTrailingNewline(lines.join("\n"));
        }
    }

    lines.splice(indexTableLine + 1, 0, `profile = ${toTomlString(profile)}`);
    return normalizeTrailingNewline(lines.join("\n"));
}

function prepareProjectProfileInstall(repoDir: string, profile: InstallProfile | undefined): FileMutation & { filePath?: string } {
    if (!profile) {
        return { changed: false, apply: () => {} };
    }
    const filePath = path.join(repoDir, "satori.toml");
    const currentFile = readTextIfExists(filePath);
    const current = currentFile ?? "";
    const next = updateSatoriProjectConfig(current, profile);
    return {
        filePath,
        changed: next !== current,
        assertUnchanged: () => assertFileContentUnchanged(filePath, currentFile),
        apply: () => {
            if (next === current) {
                return;
            }
            ensureParentDir(filePath);
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function runtimeEnvMap(valueForName: (name: string) => string): Record<string, string> {
    return Object.fromEntries(SATORI_RUNTIME_ENV_VARS.map((name) => [name, valueForName(name)]));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
}

function mergeRuntimeEnv(existing: unknown, defaults: Record<string, string>): Record<string, unknown> {
    return {
        ...defaults,
        ...(objectValue(existing) ?? {}),
    };
}

/** Bash-style `${VAR:-}` expands unset vars to empty string and can override host env. */
function isEmptyDefaultingShellExpansion(value: string): boolean {
    return /^\$\{[A-Z0-9_]+:-\}$/.test(value.trim());
}

/**
 * Keep only non-empty managed env entries. Prefer omitting keys over writing
 * empty-defaulting placeholders that inject "" into the MCP process.
 */
function buildPreservedManagedEnv(existing: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    const existingEnv = objectValue(existing);
    if (!existingEnv) {
        return out;
    }
    for (const name of SATORI_RUNTIME_ENV_VARS) {
        const raw = existingEnv[name];
        if (typeof raw !== "string") {
            continue;
        }
        if (raw.trim().length === 0 || isEmptyDefaultingShellExpansion(raw)) {
            continue;
        }
        out[name] = raw;
    }
    return out;
}

function packageNameFromSpecifier(packageSpecifier: string): string {
    if (packageSpecifier.startsWith("@")) {
        const versionMarker = packageSpecifier.indexOf("@", 1);
        return versionMarker === -1 ? packageSpecifier : packageSpecifier.slice(0, versionMarker);
    }
    const versionMarker = packageSpecifier.indexOf("@");
    return versionMarker === -1 ? packageSpecifier : packageSpecifier.slice(0, versionMarker);
}

function safeRuntimeDirName(packageSpecifier: string): string {
    return packageSpecifier.replace(/[^A-Za-z0-9._@-]+/g, "-");
}

function resolveRuntimeRoot(homeDir: string, packageSpecifier: string): string {
    return path.join(homeDir, ".satori", MANAGED_RUNTIME_DIR, safeRuntimeDirName(packageSpecifier));
}

function resolveRuntimePackageRoot(homeDir: string, packageSpecifier: string): string {
    return path.join(resolveRuntimeRoot(homeDir, packageSpecifier), "node_modules", ...packageNameFromSpecifier(packageSpecifier).split("/"));
}

function resolveRuntimePackageRootFromRoot(runtimeRoot: string, packageSpecifier: string): string {
    return path.join(runtimeRoot, "node_modules", ...packageNameFromSpecifier(packageSpecifier).split("/"));
}

function resolvePotionAssetsRoot(packageRoot: string): string {
    return path.join(packageRoot, "assets", "potion", "linux-x64");
}

function resolveRuntimeEntryPath(packageRoot: string, packageJson?: { bin?: unknown; main?: unknown }): string {
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

function plannedManagedRuntimeCommand(homeDir: string, packageSpecifier: string): ManagedRuntimeCommand {
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

function writeTextFileAtomic(filePath: string, content: string, mode?: number): void {
    ensureParentDir(filePath);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, content, "utf8");
    if (mode !== undefined) {
        fs.chmodSync(tempPath, mode);
    }
    fs.renameSync(tempPath, filePath);
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

function buildCodexManagedBlock(runtimeCommand: ManagedRuntimeCommand): string {
    return [
        MANAGED_BLOCK_START,
        "[mcp_servers.satori]",
        `command = ${toTomlString(runtimeCommand.command)}`,
        `args = ${buildTomlArray(runtimeCommand.args)}`,
        "# Runtime selection is installer-owned by ~/.satori/bin/satori-mcp.js.",
        "# env_vars forwards optional credentials and operational overrides.",
        `env_vars = ${buildTomlArray([...SATORI_RUNTIME_ENV_VARS])}`,
        MANAGED_BLOCK_END,
        "",
    ].join("\n");
}

function removeLegacyCodexGuidanceHookBlock(content: string): string {
    if (!content.includes(CODEX_GUIDANCE_HOOK_START) || !content.includes(CODEX_GUIDANCE_HOOK_END)) {
        return content;
    }
    return content
        .replace(new RegExp(`\\n?${escapeRegExp(CODEX_GUIDANCE_HOOK_START)}[\\s\\S]*?${escapeRegExp(CODEX_GUIDANCE_HOOK_END)}\\n?`, "m"), "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\n+/, "");
}

function removeManagedCodexEnvTemplate(content: string): string {
    if (!content.includes(CODEX_ENV_TEMPLATE_START) || !content.includes(CODEX_ENV_TEMPLATE_END)) {
        return content;
    }
    return content
        .replace(new RegExp(`\\n?${escapeRegExp(CODEX_ENV_TEMPLATE_START)}[\\s\\S]*?${escapeRegExp(CODEX_ENV_TEMPLATE_END)}\\n?`, "m"), "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\n+/, "");
}

function codexHasUnmanagedSatoriSection(content: string): boolean {
    if (!content.includes("[mcp_servers.satori]")) {
        return false;
    }
    return !(content.includes(MANAGED_BLOCK_START) && content.includes(MANAGED_BLOCK_END));
}

function prepareCodexInstall(filePath: string, runtimeCommand: ManagedRuntimeCommand): FileMutation {
    const current = readTextIfExists(filePath) ?? "";
    if (codexHasUnmanagedSatoriSection(current)) {
        throw new CliError(
            "E_USAGE",
            `Refusing to overwrite unmanaged Satori config in ${filePath}. Remove [mcp_servers.satori] manually or convert it to the managed block first.`,
            2
        );
    }

    const managedBlock = buildCodexManagedBlock(runtimeCommand);
    let next = current;
    if (current.includes(MANAGED_BLOCK_START) && current.includes(MANAGED_BLOCK_END)) {
        next = current.replace(
            new RegExp(`${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\n?`, "m"),
            managedBlock
        );
    } else if (current.trim().length === 0) {
        next = managedBlock;
    } else {
        next = `${normalizeTrailingNewline(current)}\n${managedBlock}`;
    }

    next = removeManagedCodexEnvTemplate(removeLegacyCodexGuidanceHookBlock(next));

    return {
        changed: next !== current,
        apply: () => {
            if (next === current) {
                return;
            }
            ensureParentDir(filePath);
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function prepareCodexUninstall(filePath: string): FileMutation {
    const current = readTextIfExists(filePath);
    if (!current) {
        return { changed: false, apply: () => {} };
    }
    if (codexHasUnmanagedSatoriSection(current)) {
        throw new CliError(
            "E_USAGE",
            `Refusing to remove unmanaged Satori config in ${filePath}. Remove [mcp_servers.satori] manually instead.`,
            2
        );
    }
    if (!current.includes(MANAGED_BLOCK_START) || !current.includes(MANAGED_BLOCK_END)) {
        const next = removeManagedCodexEnvTemplate(removeLegacyCodexGuidanceHookBlock(current));
        return {
            changed: next !== current,
            apply: () => {
                if (next === current) {
                    return;
                }
                fs.writeFileSync(filePath, next, "utf8");
            },
        };
    }

    const withoutManagedBlock = current
        .replace(new RegExp(`\\n?${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\n?`, "m"), "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\n+/, "");
    const next = removeManagedCodexEnvTemplate(removeLegacyCodexGuidanceHookBlock(withoutManagedBlock));

    if (next === current) {
        return { changed: false, apply: () => {} };
    }

    return {
        changed: next !== current,
        apply: () => {
            if (next === current) {
                return;
            }
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function parseJsonObject(filePath: string): Record<string, unknown> {
    const current = readTextIfExists(filePath);
    if (!current) {
        return {};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(current);
    } catch (error) {
        throw new CliError("E_USAGE", `Failed to parse JSON config at ${filePath}: ${(error as Error).message}`, 2);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new CliError("E_USAGE", `Expected top-level JSON object in ${filePath}.`, 2);
    }
    return parsed as Record<string, unknown>;
}

function buildCodexGuidanceHookEntry(): Record<string, unknown> {
    return {
        matcher: CODEX_GUIDANCE_HOOK_MATCHER,
        hooks: [{
            type: "command",
            command: CODEX_GUIDANCE_HOOK_COMMAND,
            timeout: CODEX_GUIDANCE_HOOK_TIMEOUT_SECONDS,
        }],
    };
}

function codexSessionStartHooks(document: Record<string, unknown>, filePath: string): {
    hooks: Record<string, unknown>;
    entries: unknown[];
} {
    const hooks = document.hooks === undefined ? {} : objectValue(document.hooks);
    if (!hooks) {
        throw new CliError("E_USAGE", `Expected 'hooks' to be an object in ${filePath}.`, 2);
    }
    const entries = hooks.SessionStart === undefined ? [] : hooks.SessionStart;
    if (!Array.isArray(entries)) {
        throw new CliError("E_USAGE", `Expected 'hooks.SessionStart' to be an array in ${filePath}.`, 2);
    }
    return { hooks, entries };
}

function isManagedCodexGuidanceHook(value: unknown): boolean {
    const entry = objectValue(value);
    if (!entry || entry.matcher !== CODEX_GUIDANCE_HOOK_MATCHER || !Array.isArray(entry.hooks) || entry.hooks.length !== 1) {
        return false;
    }
    const hook = objectValue(entry.hooks[0]);
    return hook?.type === "command"
        && typeof hook.command === "string"
        && hook.command.includes("satori-codex-guidance.");
}

function hasManagedCodexGuidanceHook(filePath: string): boolean {
    const current = readTextIfExists(filePath);
    if (!current?.includes("satori-codex-guidance.")) {
        return false;
    }
    const document = parseJsonObject(filePath);
    return codexSessionStartHooks(document, filePath).entries.some(isManagedCodexGuidanceHook);
}

function prepareCodexGuidanceHookInstall(filePath: string): FileMutation {
    const currentFile = readTextIfExists(filePath);
    const document = parseJsonObject(filePath);
    const { hooks, entries } = codexSessionStartHooks(document, filePath);
    const canonical = buildCodexGuidanceHookEntry();
    const managed = entries.filter(isManagedCodexGuidanceHook);
    if (managed.length === 1 && JSON.stringify(managed[0]) === JSON.stringify(canonical)) {
        return { changed: false, apply: () => {} };
    }
    const nextDocument = {
        ...document,
        hooks: {
            ...hooks,
            SessionStart: [...entries.filter((entry) => !isManagedCodexGuidanceHook(entry)), canonical],
        },
    };
    const next = `${JSON.stringify(nextDocument, null, 2)}\n`;
    return {
        changed: next !== currentFile,
        assertUnchanged: () => assertFileContentUnchanged(filePath, currentFile),
        apply: () => {
            assertFileContentUnchanged(filePath, currentFile);
            ensureParentDir(filePath);
            fs.writeFileSync(filePath, next, { encoding: "utf8", mode: 0o600 });
            fs.chmodSync(filePath, 0o600);
        },
    };
}

function prepareCodexGuidanceHookRemoval(filePath: string): FileMutation {
    const currentFile = readTextIfExists(filePath);
    if (!currentFile?.includes("satori-codex-guidance.")) {
        return { changed: false, apply: () => {} };
    }
    const document = parseJsonObject(filePath);
    const { hooks, entries } = codexSessionStartHooks(document, filePath);
    const retained = entries.filter((entry) => !isManagedCodexGuidanceHook(entry));
    if (retained.length === entries.length) {
        return { changed: false, apply: () => {} };
    }
    const nextHooks = { ...hooks };
    if (retained.length > 0) {
        nextHooks.SessionStart = retained;
    } else {
        delete nextHooks.SessionStart;
    }
    const nextDocument = { ...document };
    if (Object.keys(nextHooks).length > 0) {
        nextDocument.hooks = nextHooks;
    } else {
        delete nextDocument.hooks;
    }
    const next = `${JSON.stringify(nextDocument, null, 2)}\n`;
    return {
        changed: next !== currentFile,
        assertUnchanged: () => assertFileContentUnchanged(filePath, currentFile),
        apply: () => {
            assertFileContentUnchanged(filePath, currentFile);
            fs.writeFileSync(filePath, next, { encoding: "utf8", mode: 0o600 });
            fs.chmodSync(filePath, 0o600);
        },
    };
}

function buildClaudeServerConfig(runtimeCommand: ManagedRuntimeCommand, existing?: Record<string, unknown>): Record<string, unknown> {
    // Always return an env object so reinstall replaces legacy empty-defaulting maps.
    // Empty object means "omit env" (host process env supplies credentials).
    return {
        type: "stdio",
        command: runtimeCommand.command,
        args: runtimeCommand.args,
        env: buildPreservedManagedEnv(existing?.env),
    };
}

function isManagedLauncherPath(value: unknown): value is string {
    return typeof value === "string" && value.replace(/\\/g, "/").endsWith(`/.satori/${MANAGED_BIN_DIR}/${MANAGED_LAUNCHER_FILE}`);
}

function isManagedCommandParts(command: unknown, args: unknown): boolean {
    if (!Array.isArray(args)) {
        return false;
    }

    const entryPath = args[0];
    return typeof command === "string"
        && command.length > 0
        && args.length === 1
        && isManagedLauncherPath(entryPath);
}

function isManagedClaudeEntry(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const entry = value as Record<string, unknown>;
    return isManagedCommandParts(entry.command, entry.args);
}

function prepareClaudeInstall(filePath: string, runtimeCommand: ManagedRuntimeCommand): FileMutation {
    const currentObject = parseJsonObject(filePath);
    const currentSerialized = JSON.stringify(currentObject);
    const existingSatori = objectValue((currentObject.mcpServers as Record<string, unknown> | undefined)?.satori);
    const desiredServer = buildClaudeServerConfig(runtimeCommand, existingSatori);

    const mcpServersValue = currentObject.mcpServers;
    let mcpServers: Record<string, unknown>;
    if (mcpServersValue === undefined) {
        mcpServers = {};
    } else if (mcpServersValue && typeof mcpServersValue === "object" && !Array.isArray(mcpServersValue)) {
        mcpServers = { ...(mcpServersValue as Record<string, unknown>) };
    } else {
        throw new CliError("E_USAGE", `Expected mcpServers to be an object in ${filePath}.`, 2);
    }

    if (mcpServers.satori !== undefined && !isManagedClaudeEntry(mcpServers.satori)) {
        throw new CliError(
            "E_USAGE",
            `Refusing to overwrite unmanaged Satori config in ${filePath}. Remove mcpServers.satori manually or align it to the managed Satori form first.`,
            2
        );
    }

    mcpServers.satori = {
        ...existingSatori,
        ...desiredServer,
    };
    delete (mcpServers.satori as Record<string, unknown>).timeout;
    // Drop empty env map so clients inherit host process env instead of overriding with {}.
    const desiredEnv = (mcpServers.satori as Record<string, unknown>).env;
    if (desiredEnv && typeof desiredEnv === "object" && !Array.isArray(desiredEnv) && Object.keys(desiredEnv).length === 0) {
        delete (mcpServers.satori as Record<string, unknown>).env;
    }
    currentObject.mcpServers = mcpServers;

    const next = `${JSON.stringify(currentObject, null, 2)}\n`;
    return {
        changed: JSON.stringify(currentObject) !== currentSerialized,
        apply: () => {
            if (JSON.stringify(currentObject) === currentSerialized) {
                return;
            }
            ensureParentDir(filePath);
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function prepareClaudeUninstall(filePath: string): FileMutation {
    const currentObject = parseJsonObject(filePath);
    const mcpServersValue = currentObject.mcpServers;
    if (!mcpServersValue || typeof mcpServersValue !== "object" || Array.isArray(mcpServersValue)) {
        return { changed: false, apply: () => {} };
    }

    const mcpServers = { ...(mcpServersValue as Record<string, unknown>) };
    if (!Object.prototype.hasOwnProperty.call(mcpServers, "satori")) {
        return { changed: false, apply: () => {} };
    }
    if (!isManagedClaudeEntry(mcpServers.satori)) {
        throw new CliError(
            "E_USAGE",
            `Refusing to remove unmanaged Satori config in ${filePath}. Remove mcpServers.satori manually instead.`,
            2
        );
    }

    delete mcpServers.satori;
    if (Object.keys(mcpServers).length === 0) {
        delete currentObject.mcpServers;
    } else {
        currentObject.mcpServers = mcpServers;
    }

    const next = `${JSON.stringify(currentObject, null, 2)}\n`;
    return {
        changed: true,
        apply: () => {
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function parseJsoncObject(filePath: string, content: string): Record<string, unknown> {
    const errors: ParseError[] = [];
    const parsed = parseJsonc(content, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length > 0) {
        throw new CliError("E_USAGE", `Failed to parse JSONC config at ${filePath}.`, 2);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new CliError("E_USAGE", `Expected top-level JSON object in ${filePath}.`, 2);
    }
    return parsed as Record<string, unknown>;
}

function buildOpenCodeServerConfig(runtimeCommand: ManagedRuntimeCommand, existing?: Record<string, unknown>): Record<string, unknown> {
    const environment = mergeRuntimeEnv(existing?.environment, runtimeEnvMap((name) => `{env:${name}}`));
    for (const name of LAUNCHER_OWNED_RUNTIME_ENV_VARS) {
        delete environment[name];
    }
    return {
        enabled: true,
        type: "local",
        command: [runtimeCommand.command, ...runtimeCommand.args],
        environment,
    };
}

function isManagedOpenCodeEntry(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const entry = value as Record<string, unknown>;
    if (Array.isArray(entry.command)) {
        const [command, ...args] = entry.command;
        return isManagedCommandParts(command, args);
    }
    return isManagedCommandParts(entry.command, entry.args);
}

function mutateJsonc(filePath: string, current: string, pathSegments: Array<string | number>, value: unknown): FileMutation {
    const edits = modify(current, pathSegments, value, {
        formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: "\n",
        },
    });
    const next = applyEdits(current, edits);
    return {
        changed: next !== current,
        apply: () => {
            if (next === current) {
                return;
            }
            ensureParentDir(filePath);
            fs.writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
        },
    };
}

function prepareOpenCodeInstall(filePath: string, runtimeCommand: ManagedRuntimeCommand): FileMutation {
    const current = readTextIfExists(filePath) ?? "{}\n";
    const currentObject = parseJsoncObject(filePath, current);
    const mcpValue = currentObject.mcp;
    if (mcpValue !== undefined && (!mcpValue || typeof mcpValue !== "object" || Array.isArray(mcpValue))) {
        throw new CliError("E_USAGE", `Expected mcp to be an object in ${filePath}.`, 2);
    }
    const existingSatori = (mcpValue as Record<string, unknown> | undefined)?.satori;
    if (existingSatori !== undefined && !isManagedOpenCodeEntry(existingSatori)) {
        throw new CliError(
            "E_USAGE",
            `Refusing to overwrite unmanaged Satori config in ${filePath}. Remove mcp.satori manually or align it to the managed Satori form first.`,
            2
        );
    }
    return mutateJsonc(filePath, current, ["mcp", "satori"], buildOpenCodeServerConfig(runtimeCommand, objectValue(existingSatori)));
}

function prepareOpenCodeUninstall(filePath: string): FileMutation {
    const current = readTextIfExists(filePath);
    if (!current) {
        return { changed: false, apply: () => {} };
    }
    const currentObject = parseJsoncObject(filePath, current);
    const mcpValue = currentObject.mcp;
    if (!mcpValue || typeof mcpValue !== "object" || Array.isArray(mcpValue)) {
        return { changed: false, apply: () => {} };
    }
    const existingSatori = (mcpValue as Record<string, unknown>).satori;
    if (existingSatori === undefined) {
        return { changed: false, apply: () => {} };
    }
    if (!isManagedOpenCodeEntry(existingSatori)) {
        throw new CliError(
            "E_USAGE",
            `Refusing to remove unmanaged Satori config in ${filePath}. Remove mcp.satori manually instead.`,
            2
        );
    }
    return mutateJsonc(filePath, current, ["mcp", "satori"], undefined);
}

function prepareLegacySkillRemoval(skillPath: string): FileMutation {
    const changed = fs.existsSync(skillPath);
    return {
        changed,
        apply: () => {
            if (changed) {
                fs.rmSync(skillPath, { recursive: true, force: true });
            }
        },
    };
}

function buildManagedInstructionsBlock(instructions: string): string {
    return [
        INSTRUCTIONS_BLOCK_START,
        instructions.trim(),
        INSTRUCTIONS_BLOCK_END,
        "",
    ].join("\n");
}

function prepareInstructionsInstall(filePath: string, instructions: string): FileMutation {
    const currentFile = readTextIfExists(filePath);
    const current = currentFile ?? "";
    const block = buildManagedInstructionsBlock(instructions);
    let next = current;
    if (current.includes(INSTRUCTIONS_BLOCK_START) && current.includes(INSTRUCTIONS_BLOCK_END)) {
        next = current.replace(
            new RegExp(`${escapeRegExp(INSTRUCTIONS_BLOCK_START)}[\\s\\S]*?${escapeRegExp(INSTRUCTIONS_BLOCK_END)}\\n?`, "m"),
            block
        );
    } else if (current.trim().length === 0) {
        next = block;
    } else {
        next = `${normalizeTrailingNewline(current)}\n${block}`;
    }

    return {
        changed: next !== current,
        assertUnchanged: () => assertFileContentUnchanged(filePath, currentFile),
        apply: () => {
            if (next === current) {
                return;
            }
            ensureParentDir(filePath);
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function prepareInstructionsRemoval(filePath: string): FileMutation {
    const current = readTextIfExists(filePath);
    if (!current || !current.includes(INSTRUCTIONS_BLOCK_START) || !current.includes(INSTRUCTIONS_BLOCK_END)) {
        return { changed: false, apply: () => {} };
    }

    const next = current
        .replace(new RegExp(`\\n?${escapeRegExp(INSTRUCTIONS_BLOCK_START)}[\\s\\S]*?${escapeRegExp(INSTRUCTIONS_BLOCK_END)}\\n?`, "m"), "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\n+/, "");

    return {
        changed: next !== current,
        assertUnchanged: () => assertFileContentUnchanged(filePath, current),
        apply: () => {
            if (next === current) {
                return;
            }
            fs.writeFileSync(filePath, next, "utf8");
        },
    };
}

function prepareCompanionMutation(
    companion: CompanionTarget,
    command: InstallCommandInput,
    installGuidanceHook: boolean,
): CompanionMutation {
    let mutation: FileMutation;
    if (companion.kind === "legacy-skill") {
        mutation = prepareLegacySkillRemoval(companion.path);
    } else if (companion.kind === "instructions") {
        mutation = command.kind === "install"
            ? prepareInstructionsInstall(companion.path, companion.instructions)
            : prepareInstructionsRemoval(companion.path);
    } else {
        mutation = command.kind === "uninstall"
            ? prepareCodexGuidanceHookRemoval(companion.path)
            : installGuidanceHook
            ? prepareCodexGuidanceHookInstall(companion.path)
            : { changed: false, apply: () => {} };
    }
    return {
        companion,
        changed: mutation.changed,
        assertUnchanged: mutation.assertUnchanged,
        apply: mutation.apply,
    };
}

function prepareConfigMutation(
    target: ClientTarget,
    command: InstallCommandInput,
    runtimeCommand: ManagedRuntimeCommand
): FileMutation {
    const expected = readTextIfExists(target.configPath);
    let mutation: FileMutation;
    if (target.client === "codex") {
        mutation = command.kind === "install"
            ? prepareCodexInstall(target.configPath, runtimeCommand)
            : prepareCodexUninstall(target.configPath);
    } else if (target.client === "claude") {
        mutation = command.kind === "install"
            ? prepareClaudeInstall(target.configPath, runtimeCommand)
            : prepareClaudeUninstall(target.configPath);
    } else {
        mutation = command.kind === "install"
            ? prepareOpenCodeInstall(target.configPath, runtimeCommand)
            : prepareOpenCodeUninstall(target.configPath);
    }
    return guardFileMutation(target.configPath, expected, mutation);
}

function prepareMutation(
    target: ClientTarget,
    command: InstallCommandInput,
    runtimeCommand: ManagedRuntimeCommand,
): PreparedMutation {
    const legacyGuidanceHook = target.client === "codex"
        && (readTextIfExists(target.configPath)?.includes(CODEX_GUIDANCE_HOOK_START) ?? false);
    const guidanceHookTarget = target.companions.find((companion) => companion.kind === "guidance-hook");
    const installGuidanceHook = command.kind === "install"
        && target.client === "codex"
        && (
            command.installGuidanceHook === true
            || legacyGuidanceHook
            || (guidanceHookTarget ? hasManagedCodexGuidanceHook(guidanceHookTarget.path) : false)
        );
    const configMutation = prepareConfigMutation(target, command, runtimeCommand);
    const companionMutations = target.companions.map((companion) => (
        prepareCompanionMutation(companion, command, installGuidanceHook)
    ));

    return {
        target,
        configMutation,
        configChanged: configMutation.changed,
        companionMutations,
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
    let usesManagedLauncher = false;
    let runtimeEnvironment: Readonly<Record<string, string>> = Object.freeze({});
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

    const prepared = selectTargets(homeDir, command.client, options.env ?? process.env).map((target) => (
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

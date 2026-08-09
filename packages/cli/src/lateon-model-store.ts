import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Managed D32 profile identity used for planning and migration checks.
 * Real installation still binds the target MCP package's frozen authority.
 */
export const DEFAULT_LATEON_PROFILE_ID = "lateon_offline_quality_projection_v4_d32_v1";
export const LATEON_D32_ACTIVATION_POLICY = "lateon_context_v4_d32_owner_default_v1";
/**
 * Historical context-v3 rollout artifact. Its managed combination with the
 * historical `lateon_d32_owner_default_v1` policy is migratable by
 * `satori upgrade`, never treated as unknown D16 history.
 */
export const HISTORICAL_LATEON_CONTEXT_V3_PROFILE_ID = "lateon_offline_quality_projection_v3_d32_v1";
export const HISTORICAL_LATEON_D32_ACTIVATION_POLICY = "lateon_d32_owner_default_v1";
/**
 * Previous managed default (context-v3 activated profile + its owner policy).
 * The managed combination is admitted and migrated to the context-v4 default
 * by `satori upgrade`; historical meaning stays immutable.
 */
export const PREVIOUS_LATEON_CONTEXT_V3_ACTIVATED_PROFILE_ID = "lateon_offline_quality_projection_v3_d32_v2";
export const PREVIOUS_LATEON_CONTEXT_V3_ACTIVATION_POLICY = "lateon_context_v3_d32_owner_default_v1";

const LATEON_PROFILE_FILE = "runtime-profile-v4-d32.json";
const LATEON_ACQUISITION_FILE = "runtime-profile-v4-d32.acquisition.json";
const ACQUISITION_SCHEMA_VERSION = "satori_lateon_acquisition_v1";
// 71,577,202 bytes at approximately 128 KiB/s takes about 546 seconds, leaving
// roughly 54 seconds of the ten-minute deadline for requests and redirects.
const ACQUISITION_DEADLINE_MS = 10 * 60 * 1000;
const MAX_REDIRECTS = 5;
const DISK_HEADROOM_FRACTION = 0.1;
const DISK_HEADROOM_FORMULA =
    "totalExpectedArtifactBytes + ceil(totalExpectedArtifactBytes * diskHeadroomFraction)";
const FROZEN_LATEON_D32_PROFILE_SHA256 =
    "f20946b9f1176f8e4d605b0bff7f7ff6f6a5c0de11e17cb31d375753623fd1c4";
const DEFAULT_LATEON_REPOSITORY = "lightonai/LateOn-Code-edge";
const DEFAULT_LATEON_REVISION = "07ef20f406c86badca122464808f4cac2f6e4b25";

type FetchLike = typeof fetch;

type LateOnProfileArtifact = Readonly<{
    path: string;
    sha256: string;
}>;

type LateOnRuntimeProfile = Readonly<{
    schemaVersion: "satori_lateon_runtime_profile_v3" | "satori_lateon_runtime_profile_v4";
    profileId: string;
    qualificationStatus?: string;
    identity: Readonly<{
        repository: string;
        revision: string;
        license: string;
    }>;
    artifacts: readonly LateOnProfileArtifact[];
    inference?: Readonly<{
        candidateDepth?: number;
    }>;
}>;

type LateOnAcquisitionArtifact = Readonly<{
    path: string;
    sizeBytes: number;
    sha256: string;
}>;

type LateOnAcquisitionManifest = Readonly<{
    schemaVersion: typeof ACQUISITION_SCHEMA_VERSION;
    runtimeProfileSha256: string;
    artifacts: readonly LateOnAcquisitionArtifact[];
    totalExpectedArtifactBytes: number;
    policy: Readonly<{
        downloadDeadlineMilliseconds: number;
        maximumRedirects: number;
        diskHeadroomFraction: number;
        diskHeadroomFormula: string;
    }>;
}>;

export type LateOnAcquisitionAuthority = Readonly<{
    profileId: string;
    repository: string;
    revision: string;
    runtimeProfileSha256: string;
    artifacts: readonly LateOnAcquisitionArtifact[];
    totalExpectedArtifactBytes: number;
    downloadDeadlineMilliseconds: number;
    maximumRedirects: number;
    diskHeadroomFraction: number;
    diskHeadroomFormula: string;
}>;

/**
 * Loads the acquisition authority shipped in an MCP package root.
 * The structural loader does not bind the frozen digest; production entry
 * points use the frozen-binding loader by default. Structural acquisition
 * tests inject this loader through `authorityLoader` to exercise
 * acquisition behavior against synthetic, non-frozen fixtures.
 */
export type LateOnAuthorityLoader = (runtimePackageRoot: string) => LateOnAcquisitionAuthority;

export type VerifiedLateOnModel = Readonly<{
    modelDirectory: string;
    profileId: string;
    runtimeProfileSha256: string;
}>;

export type EnsureLateOnModelInput = Readonly<{
    homeDir: string;
    runtimePackageRoot: string;
    fetchImpl?: FetchLike;
    /** Test seam for proving disk failures without depending on the host filesystem. */
    statfsImpl?: (path: string) => { bavail: number; bsize: number };
    /** Test seam for proving deadline handling without waiting ten minutes. */
    nowImpl?: () => number;
    /** Structural test seam; the production default binds the frozen digest. */
    authorityLoader?: LateOnAuthorityLoader;
    /** Test seam for proving the destination-appears-before-rename race. */
    renameImpl?: (from: string, to: string) => void;
}>;

function sha256Bytes(bytes: Buffer): string {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath: string): string {
    const digest = crypto.createHash("sha256");
    const file = fs.openSync(filePath, "r");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        while (true) {
            const bytesRead = fs.readSync(file, buffer, 0, buffer.length, null);
            if (bytesRead === 0) break;
            digest.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        fs.closeSync(file);
    }
    return digest.digest("hex");
}

function pathExists(candidate: string): boolean {
    try {
        fs.lstatSync(candidate);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

function assertSafeArtifactPath(candidate: unknown): asserts candidate is string {
    if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0")) {
        throw new Error("LateOn acquisition manifest contains an empty or null-byte artifact path.");
    }
    if (
        path.isAbsolute(candidate)
        || path.posix.isAbsolute(candidate)
        || path.win32.isAbsolute(candidate)
    ) {
        throw new Error(`LateOn acquisition manifest contains an absolute artifact path '${candidate}'.`);
    }
    const components = candidate.split("/");
    if (components.some((component) => component.length === 0 || component === "." || component === "..")) {
        throw new Error(`LateOn acquisition manifest contains an unsafe artifact path '${candidate}'.`);
    }
    if (path.posix.normalize(candidate) !== candidate || candidate.includes("\\")) {
        throw new Error(`LateOn acquisition manifest contains a non-normalized artifact path '${candidate}'.`);
    }
    const relative = path.relative("/lateon-model", path.resolve("/lateon-model", candidate));
    if (
        relative.length === 0
        || relative === ".."
        || relative.startsWith(`..${path.sep}`)
        || path.isAbsolute(relative)
    ) {
        throw new Error(`LateOn acquisition manifest escapes its model directory via '${candidate}'.`);
    }
}

function assertSha256(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
        throw new Error(`LateOn ${label} must be a lowercase SHA-256 digest.`);
    }
}

function assertPositiveSafeInteger(value: unknown, label: string): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`LateOn ${label} must be a positive safe integer.`);
    }
}

function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

/** Structural acquisition loader; does not bind the frozen digest (test seam). */
export function loadAcquisitionAuthority(runtimePackageRoot: string): LateOnAcquisitionAuthority {
    if (!path.isAbsolute(runtimePackageRoot)) {
        throw new Error("LateOn runtime package root must be absolute.");
    }
    const profilePath = path.join(runtimePackageRoot, "assets", "lateon", LATEON_PROFILE_FILE);
    const acquisitionPath = path.join(runtimePackageRoot, "assets", "lateon", LATEON_ACQUISITION_FILE);
    let profileBytes: Buffer;
    let profile: Partial<LateOnRuntimeProfile>;
    let manifest: Partial<LateOnAcquisitionManifest>;
    try {
        profileBytes = fs.readFileSync(profilePath);
        profile = readJson(profilePath) as Partial<LateOnRuntimeProfile>;
        manifest = readJson(acquisitionPath) as Partial<LateOnAcquisitionManifest>;
    } catch {
        throw new Error(
            `The installed MCP package must contain the frozen LateOn D32 profile and acquisition manifest at '${path.dirname(profilePath)}'.`,
        );
    }

    const runtimeProfileSha256 = sha256Bytes(profileBytes);
    if (
        (profile.schemaVersion !== "satori_lateon_runtime_profile_v3"
            && profile.schemaVersion !== "satori_lateon_runtime_profile_v4")
        || typeof profile.profileId !== "string"
        || profile.profileId.length === 0
        || profile.identity?.repository !== DEFAULT_LATEON_REPOSITORY
        || profile.identity.revision !== DEFAULT_LATEON_REVISION
        || profile.identity.license !== "Apache-2.0"
        || profile.inference?.candidateDepth !== 32
        || !Array.isArray(profile.artifacts)
        || profile.artifacts.length === 0
    ) {
        throw new Error("The installed MCP package does not contain the pinned LateOn D32 profile.");
    }
    if (
        manifest.schemaVersion !== ACQUISITION_SCHEMA_VERSION
        || manifest.runtimeProfileSha256 !== runtimeProfileSha256
        || !Array.isArray(manifest.artifacts)
        || !Number.isSafeInteger(manifest.totalExpectedArtifactBytes)
        || !manifest.policy
    ) {
        throw new Error(
            `The installed MCP package contains a missing or mismatched LateOn acquisition manifest for '${profilePath}'.`,
        );
    }
    assertPositiveSafeInteger(manifest.totalExpectedArtifactBytes, "total artifact byte count");

    const profileArtifacts = new Map<string, string>();
    for (const artifact of profile.artifacts) {
        assertSafeArtifactPath(artifact?.path);
        assertSha256(artifact?.sha256, `profile artifact '${artifact.path}'`);
        if (profileArtifacts.has(artifact.path)) {
            throw new Error(`LateOn profile contains duplicate artifact path '${artifact.path}'.`);
        }
        profileArtifacts.set(artifact.path, artifact.sha256);
    }

    const acquisitionArtifacts: LateOnAcquisitionArtifact[] = [];
    const acquisitionPaths = new Set<string>();
    for (const artifact of manifest.artifacts) {
        assertSafeArtifactPath(artifact?.path);
        assertSha256(artifact?.sha256, `acquisition artifact '${artifact.path}'`);
        assertPositiveSafeInteger(artifact?.sizeBytes, `size for '${artifact.path}'`);
        if (acquisitionPaths.has(artifact.path)) {
            throw new Error(`LateOn acquisition manifest contains duplicate artifact path '${artifact.path}'.`);
        }
        if (profileArtifacts.get(artifact.path) !== artifact.sha256) {
            throw new Error(
                `LateOn acquisition manifest does not match profile artifact '${artifact.path}'.`,
            );
        }
        acquisitionPaths.add(artifact.path);
        acquisitionArtifacts.push({
            path: artifact.path,
            sizeBytes: artifact.sizeBytes,
            sha256: artifact.sha256,
        });
    }
    if (acquisitionArtifacts.length !== profileArtifacts.size) {
        throw new Error("LateOn acquisition manifest and runtime profile have different artifact paths.");
    }

    const totalExpectedArtifactBytes = acquisitionArtifacts.reduce(
        (total, artifact) => total + artifact.sizeBytes,
        0,
    );
    if (totalExpectedArtifactBytes !== manifest.totalExpectedArtifactBytes) {
        throw new Error("LateOn acquisition manifest total bytes do not equal its artifact entries.");
    }
    const policy = manifest.policy;
    if (
        policy.downloadDeadlineMilliseconds !== ACQUISITION_DEADLINE_MS
        || policy.maximumRedirects !== MAX_REDIRECTS
        || policy.diskHeadroomFraction !== DISK_HEADROOM_FRACTION
        || policy.diskHeadroomFormula !== DISK_HEADROOM_FORMULA
    ) {
        throw new Error("LateOn acquisition manifest contains an unsupported acquisition policy.");
    }

    return Object.freeze({
        profileId: profile.profileId,
        repository: profile.identity.repository,
        revision: profile.identity.revision,
        runtimeProfileSha256,
        artifacts: Object.freeze(acquisitionArtifacts),
        totalExpectedArtifactBytes,
        downloadDeadlineMilliseconds: policy.downloadDeadlineMilliseconds,
        maximumRedirects: policy.maximumRedirects,
        diskHeadroomFraction: policy.diskHeadroomFraction,
        diskHeadroomFormula: policy.diskHeadroomFormula,
    });
}

export function calculateRequiredLateOnFreeBytes(
    totalExpectedArtifactBytes: number,
    diskHeadroomFraction = DISK_HEADROOM_FRACTION,
): number {
    assertPositiveSafeInteger(totalExpectedArtifactBytes, "total artifact byte count");
    if (!Number.isFinite(diskHeadroomFraction) || diskHeadroomFraction < 0) {
        throw new Error("LateOn disk headroom fraction must be finite and non-negative.");
    }
    const required = totalExpectedArtifactBytes
        + Math.ceil(totalExpectedArtifactBytes * diskHeadroomFraction);
    if (!Number.isSafeInteger(required)) {
        throw new Error("LateOn required free-byte calculation overflowed.");
    }
    return required;
}

function frozenAcquisitionAuthority(runtimePackageRoot: string): LateOnAcquisitionAuthority {
    const authority = loadAcquisitionAuthority(runtimePackageRoot);
    if (authority.runtimeProfileSha256 !== FROZEN_LATEON_D32_PROFILE_SHA256) {
        throw new Error(
            "The shipped LateOn D32 runtime profile is not the frozen profile "
            + `(expected sha256 ${FROZEN_LATEON_D32_PROFILE_SHA256}).`,
        );
    }
    return authority;
}

export function readLateOnAcquisitionAuthority(runtimePackageRoot: string): LateOnAcquisitionAuthority {
    return frozenAcquisitionAuthority(runtimePackageRoot);
}

export function resolveDefaultLateOnModelDirectory(homeDir: string): string {
    return path.join(
        homeDir,
        ".satori",
        "models",
        "lateon",
        `LateOn-Code-edge@${DEFAULT_LATEON_REVISION}`,
    );
}

function corruptionError(modelDirectory: string, detail: string): Error {
    return new Error(
        `LateOn model directory '${modelDirectory}' is corrupt: ${detail} `
        + `Remove ${modelDirectory} and rerun installation, or install with --reranker none.`,
    );
}

function isRealPathWithin(rootPath: string, candidatePath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return relative.length > 0
        && relative !== ".."
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative);
}

function verifyModelDirectory(
    modelDirectory: string,
    authority: LateOnAcquisitionAuthority,
): void {
    if (!path.isAbsolute(modelDirectory)) {
        throw corruptionError(modelDirectory, "the configured model path must be absolute");
    }
    let modelStat: fs.Stats;
    try {
        modelStat = fs.lstatSync(modelDirectory);
    } catch {
        throw corruptionError(modelDirectory, "the model directory is missing");
    }
    if (!modelStat.isDirectory() || modelStat.isSymbolicLink()) {
        throw corruptionError(modelDirectory, "the model path must be a real directory");
    }

    let realModelDirectory: string;
    try {
        realModelDirectory = fs.realpathSync(modelDirectory);
    } catch {
        throw corruptionError(modelDirectory, "the model directory cannot be canonicalized");
    }
    for (const artifact of authority.artifacts) {
        const artifactPath = path.join(modelDirectory, artifact.path);
        const components = artifact.path.split("/");
        let current = modelDirectory;
        try {
            for (const component of components.slice(0, -1)) {
                current = path.join(current, component);
                const componentStat = fs.lstatSync(current);
                if (!componentStat.isDirectory() || componentStat.isSymbolicLink()) {
                    throw new Error(`intermediate component '${component}' is not a real directory`);
                }
            }
            const artifactStat = fs.lstatSync(artifactPath);
            if (!artifactStat.isFile() || artifactStat.isSymbolicLink()) {
                throw new Error("artifact is not a regular file");
            }
            const realArtifactPath = fs.realpathSync(artifactPath);
            if (!isRealPathWithin(realModelDirectory, realArtifactPath)) {
                throw new Error("artifact resolves outside the model directory");
            }
            if (
                artifactStat.size !== artifact.sizeBytes
                || sha256File(artifactPath) !== artifact.sha256
            ) {
                throw new Error("artifact size or checksum verification failed");
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw corruptionError(modelDirectory, `${artifact.path}: ${detail}`);
        }
    }
}

export function verifyLateOnModelDirectory(input: Readonly<{
    modelDirectory: string;
    runtimePackageRoot: string;
    /** Structural test seam; the production default binds the frozen digest. */
    authorityLoader?: LateOnAuthorityLoader;
}>): VerifiedLateOnModel {
    const authority = (input.authorityLoader ?? frozenAcquisitionAuthority)(input.runtimePackageRoot);
    verifyModelDirectory(input.modelDirectory, authority);
    return Object.freeze({
        modelDirectory: path.resolve(input.modelDirectory),
        profileId: authority.profileId,
        runtimeProfileSha256: authority.runtimeProfileSha256,
    });
}

function assertAvailableDiskSpace(
    parentDirectory: string,
    authority: LateOnAcquisitionAuthority,
    statfsImpl: (path: string) => { bavail: number; bsize: number },
): void {
    const stats = statfsImpl(parentDirectory);
    const availableBytes = stats.bavail * stats.bsize;
    const requiredBytes = calculateRequiredLateOnFreeBytes(
        authority.totalExpectedArtifactBytes,
        authority.diskHeadroomFraction,
    );
    if (!Number.isSafeInteger(availableBytes) || availableBytes < requiredBytes) {
        throw new Error(
            `Insufficient disk space for the LateOn model closure at '${parentDirectory}': `
            + `need ${requiredBytes} bytes (artifact total plus ${authority.diskHeadroomFraction * 100}% headroom), `
            + `available ${Number.isSafeInteger(availableBytes) ? availableBytes : "unknown"} bytes.`,
        );
    }
}

function deadlineError(): Error {
    return new Error(
        "LateOn model acquisition exceeded its 10-minute deadline; check the network and rerun installation, or install with --reranker none.",
    );
}

async function withDeadline<T>(
    operation: Promise<T>,
    deadlineAt: number,
    abortController: AbortController,
    now: () => number,
): Promise<T> {
    const remaining = deadlineAt - now();
    if (remaining <= 0) {
        abortController.abort();
        throw deadlineError();
    }
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => {
                    abortController.abort();
                    reject(deadlineError());
                }, remaining);
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

async function downloadArtifact(
    initialUrl: string,
    destination: string,
    artifact: LateOnAcquisitionArtifact,
    authority: LateOnAcquisitionAuthority,
    fetchImpl: FetchLike,
    deadlineAt: number,
    now: () => number,
): Promise<void> {
    let currentUrl = initialUrl;
    const abortController = new AbortController();
    let response: Response | undefined;
    try {
        for (let redirectCount = 0; ; redirectCount += 1) {
            const parsedUrl = new URL(currentUrl);
            if (parsedUrl.protocol !== "https:") {
                throw new Error("LateOn artifact acquisition requires HTTPS after every redirect.");
            }
            response = await withDeadline(
                Promise.resolve(fetchImpl(currentUrl, {
                    redirect: "manual",
                    signal: abortController.signal,
                })),
                deadlineAt,
                abortController,
                now,
            );
            if (response.status >= 300 && response.status < 400) {
                if (redirectCount >= authority.maximumRedirects) {
                    throw new Error(`LateOn artifact acquisition exceeded ${authority.maximumRedirects} HTTPS redirects.`);
                }
                const location = response.headers.get("location");
                if (!location) {
                    throw new Error("LateOn artifact acquisition received a redirect without a Location header.");
                }
                const redirectedUrl = new URL(location, currentUrl);
                if (redirectedUrl.protocol !== "https:") {
                    throw new Error("LateOn artifact acquisition rejected a non-HTTPS redirect.");
                }
                if (response.body) {
                    await response.body.cancel().catch(() => undefined);
                }
                currentUrl = redirectedUrl.href;
                continue;
            }
            if (!response.ok || !response.body) {
                throw new Error(`LateOn artifact download failed with HTTP ${response.status}.`);
            }
            break;
        }

        const file = fs.openSync(destination, "wx", 0o600);
        const digest = crypto.createHash("sha256");
        let bytesWritten = 0;
        const completedResponse = response;
        if (!completedResponse?.body) {
            throw new Error("LateOn artifact download returned no readable body.");
        }
        const reader = completedResponse.body.getReader();
        try {
            while (true) {
                const result = await withDeadline(reader.read(), deadlineAt, abortController, now);
                if (result.done) break;
                const chunk = Buffer.from(result.value);
                if (bytesWritten + chunk.length > artifact.sizeBytes) {
                    throw new Error(
                        `LateOn artifact '${artifact.path}' exceeded its manifest size of ${artifact.sizeBytes} bytes.`,
                    );
                }
                let offset = 0;
                while (offset < chunk.length) {
                    const written = fs.writeSync(file, chunk, offset, chunk.length - offset);
                    if (written === 0) throw new Error("LateOn artifact download stalled while writing.");
                    offset += written;
                }
                bytesWritten += chunk.length;
                digest.update(chunk);
            }
            fs.fsyncSync(file);
        } finally {
            fs.closeSync(file);
            reader.releaseLock();
        }
        if (bytesWritten !== artifact.sizeBytes) {
            throw new Error(
                `LateOn artifact '${artifact.path}' ended at ${bytesWritten} bytes; expected ${artifact.sizeBytes}.`,
            );
        }
        if (digest.digest("hex") !== artifact.sha256) {
            throw new Error(`LateOn artifact '${artifact.path}' failed checksum verification.`);
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes("deadline")) throw error;
        if (error instanceof DOMException && error.name === "AbortError") throw deadlineError();
        throw error;
    } finally {
        if (response?.body) {
            await response.body.cancel().catch(() => undefined);
        }
    }
}

export async function ensureDefaultLateOnModel(
    input: EnsureLateOnModelInput,
): Promise<VerifiedLateOnModel> {
    const authority = (input.authorityLoader ?? frozenAcquisitionAuthority)(input.runtimePackageRoot);
    const modelDirectory = resolveDefaultLateOnModelDirectory(input.homeDir);
    if (pathExists(modelDirectory)) {
        verifyModelDirectory(modelDirectory, authority);
        return Object.freeze({
            modelDirectory,
            profileId: authority.profileId,
            runtimeProfileSha256: authority.runtimeProfileSha256,
        });
    }

    const parent = path.dirname(modelDirectory);
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    assertAvailableDiskSpace(
        parent,
        authority,
        input.statfsImpl ?? ((directory) => fs.statfsSync(directory)),
    );
    const stagingDirectory = fs.mkdtempSync(path.join(parent, ".lateon-install-"));
    const now = input.nowImpl ?? Date.now;
    const deadlineAt = now() + authority.downloadDeadlineMilliseconds;
    try {
        for (const artifact of authority.artifacts) {
            let destination = stagingDirectory;
            const components = artifact.path.split("/");
            for (const component of components) {
                destination = path.join(destination, component);
            }
            const intermediateDirectory = path.dirname(destination);
            fs.mkdirSync(intermediateDirectory, { recursive: true, mode: 0o700 });
            for (let componentIndex = 0; componentIndex < components.length - 1; componentIndex += 1) {
                const component = components[componentIndex];
                const componentPath = path.join(stagingDirectory, ...components.slice(0, componentIndex + 1));
                const componentStat = fs.lstatSync(componentPath);
                if (!componentStat.isDirectory() || componentStat.isSymbolicLink()) {
                    throw new Error(`LateOn staging component '${component}' is not a real directory.`);
                }
            }
            const encodedPath = artifact.path.split("/").map(encodeURIComponent).join("/");
            const url = `https://huggingface.co/${authority.repository}/resolve/${authority.revision}/${encodedPath}`;
            await downloadArtifact(
                url,
                destination,
                artifact,
                authority,
                input.fetchImpl ?? fetch,
                deadlineAt,
                now,
            );
        }
        verifyModelDirectory(stagingDirectory, authority);
        if (pathExists(modelDirectory)) {
            verifyModelDirectory(modelDirectory, authority);
            return Object.freeze({
                modelDirectory,
                profileId: authority.profileId,
                runtimeProfileSha256: authority.runtimeProfileSha256,
            });
        }
        const rename = input.renameImpl ?? fs.renameSync;
        try {
            rename(stagingDirectory, modelDirectory);
        } catch (error) {
            if (!pathExists(modelDirectory)) {
                throw error;
            }
            verifyModelDirectory(modelDirectory, authority);
        }
        return Object.freeze({
            modelDirectory,
            profileId: authority.profileId,
            runtimeProfileSha256: authority.runtimeProfileSha256,
        });
    } finally {
        if (pathExists(stagingDirectory)) {
            fs.rmSync(stagingDirectory, { recursive: true, force: true });
        }
    }
}

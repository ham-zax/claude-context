#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    buildRankingCandidateTaskSuites,
    validateRankingBenchmarkManifest,
} from "./satori-ranking-benchmark-manifest.mjs";
import { readTrackOHeldOutOpeningRecord } from "./satori-track-o-heldout-opening.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const REQUIRED_REPOSITORY_COUNT = 6;
const REQUIRED_DECISION_BEARING_QUALITY_TASK_COUNT = 35;
const REQUIRED_POSITIVE_TASK_COUNT = 38;
const REQUIRED_NEGATIVE_TASK_COUNT = 12;
const REQUIRED_SAFETY_CONTROL_COUNT = 3;
const SAFE_FILE_COMPONENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const TRACK_O_O3_EXCLUSION = Object.freeze({
    taskId: "promptready-primary-action",
    reason: "pre_open_read_only_lane_access_before_o2_no_edits_or_results",
    decisionBearing: false,
    emittedToExecutableSuite: false,
});

const REQUIRED_SAFETY_CONTROL_TASKS = Object.freeze([
    { taskId: "supply-fastapi-configuration-control", control: "configuration_pin" },
    { taskId: "prompt-library-state-exact-control", control: "exact_identifier" },
    { taskId: "portfolio-page-items-must-control", control: "must" },
]);

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
    return value;
}

function requireArray(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
}

function requireString(value, label) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function requireSha256(value, label) {
    const digest = requireString(value, label);
    if (!SHA256_PATTERN.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
    return digest;
}

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function parseSealedManifest(manifestBytes, opening, validateManifest) {
    if (!Buffer.isBuffer(manifestBytes)) {
        throw new Error("Track O O3 manifest must be supplied as raw bytes.");
    }
    const expectedFileSha256 = requireSha256(
        opening.authority?.manifestFileSha256,
        "Opening manifest file binding",
    );
    if (sha256Bytes(manifestBytes) !== expectedFileSha256) {
        throw new Error("Track O O3 manifest file digest does not match the opening record.");
    }
    let parsed;
    try {
        parsed = JSON.parse(manifestBytes.toString("utf8"));
    } catch (error) {
        throw new Error(`Track O O3 manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const manifest = requireRecord(parsed, "Track O O3 manifest");
    const suppliedSeal = requireSha256(manifest.sha256, "Track O O3 manifest seal");
    const { sha256: _ignored, ...unsigned } = manifest;
    if (sha256Canonical(unsigned) !== suppliedSeal) {
        throw new Error("Track O O3 manifest canonical seal does not match its contents.");
    }
    if (suppliedSeal !== opening.authority?.manifestCanonicalSealSha256) {
        throw new Error("Track O O3 manifest canonical seal does not match the opening record.");
    }
    const normalized = validateManifest(manifest, {
        requireSealed: true,
        requireCompleteBenchmark: true,
    });
    if (normalized.version !== 3
        || normalized.kind !== "satori_cross_repository_ranking_manifest"
        || normalized.sha256 !== suppliedSeal) {
        throw new Error("Track O O3 requires the exact sealed version 3 benchmark manifest.");
    }
    return normalized;
}

function requireSafeRepositoryId(value) {
    const repositoryId = requireString(value, "Track O O3 repository ID");
    if (!SAFE_FILE_COMPONENT_PATTERN.test(repositoryId)) {
        throw new Error(`Track O O3 repository ID '${repositoryId}' is not safe for output filenames.`);
    }
    return repositoryId;
}

function normalizeTaskIds(tasks, label) {
    const ids = requireArray(tasks, `${label} tasks`).map((task, index) => (
        requireString(task?.id, `${label} task ${index + 1} ID`)
    ));
    if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate task IDs.`);
    return ids;
}

function buildExecutableSuites(manifest, buildSuites) {
    const emitted = requireArray(buildSuites(manifest), "Benchmark suite emitter output")
        .filter((entry) => entry?.repository?.split === "held_out")
        .sort((left, right) => compareStrings(left.repository.id, right.repository.id));
    if (emitted.length !== REQUIRED_REPOSITORY_COUNT) {
        throw new Error(`Track O O3 requires ${REQUIRED_REPOSITORY_COUNT} held-out repository suites.`);
    }

    const repositoryIds = new Set();
    const familyIds = new Set();
    const executableTaskIds = new Set();
    const safetyControls = [];
    let excludedTaskOccurrences = 0;
    let positiveTaskCount = 0;
    let negativeTaskCount = 0;

    const repositories = emitted.map((entry) => {
        const repository = requireRecord(entry.repository, "Track O O3 repository suite authority");
        const repositoryId = requireSafeRepositoryId(repository.id);
        const family = requireString(repository.family, `Repository '${repositoryId}' family`);
        if (repositoryIds.has(repositoryId)) throw new Error(`Track O O3 duplicates repository '${repositoryId}'.`);
        if (familyIds.has(family)) throw new Error(`Track O O3 duplicates repository family '${family}'.`);
        repositoryIds.add(repositoryId);
        familyIds.add(family);

        const sourcePositive = requireRecord(
            entry.candidateTaskSuite,
            `Repository '${repositoryId}' positive suite`,
        );
        const sourceNegative = requireRecord(
            entry.negativeExposureSuite,
            `Repository '${repositoryId}' negative suite`,
        );
        const sourcePositiveIds = normalizeTaskIds(sourcePositive.tasks, `${repositoryId} positive suite`);
        const negativeIds = normalizeTaskIds(sourceNegative.tasks, `${repositoryId} negative suite`);
        excludedTaskOccurrences += sourcePositiveIds.filter((taskId) => (
            taskId === TRACK_O_O3_EXCLUSION.taskId
        )).length;
        if (negativeIds.includes(TRACK_O_O3_EXCLUSION.taskId)) {
            throw new Error("The Track O O3 protocol-excluded task appears in a negative suite.");
        }

        const positiveTasks = sourcePositive.tasks.filter(({ id }) => (
            id !== TRACK_O_O3_EXCLUSION.taskId
        ));
        const positive = { ...sourcePositive, tasks: positiveTasks };
        const negative = { ...sourceNegative, tasks: [...sourceNegative.tasks] };
        for (const [suiteName, suite] of [["positive", positive], ["negative", negative]]) {
            for (const task of suite.tasks) {
                if (task.split !== "held_out") {
                    throw new Error(`Repository '${repositoryId}' ${suiteName} task '${task.id}' is not held out.`);
                }
                if (executableTaskIds.has(task.id)) {
                    throw new Error(`Track O O3 duplicates executable task '${task.id}'.`);
                }
                executableTaskIds.add(task.id);
            }
        }
        for (const task of positiveTasks) {
            for (const control of requireArray(
                task.safetyControls ?? [],
                `Positive task '${task.id}' safety controls`,
            )) {
                safetyControls.push({
                    taskId: task.id,
                    repositoryId,
                    control: requireString(control, `Positive task '${task.id}' safety control`),
                    executableSuite: "positive",
                });
            }
        }
        positiveTaskCount += positiveTasks.length;
        negativeTaskCount += negative.tasks.length;
        return { repositoryId, family, positive, negative };
    });

    if (excludedTaskOccurrences !== 1) {
        throw new Error("Track O O3 requires exactly one prospective protocol exclusion.");
    }
    if (executableTaskIds.has(TRACK_O_O3_EXCLUSION.taskId)) {
        throw new Error("The Track O O3 protocol-excluded task remains executable.");
    }
    if (positiveTaskCount !== REQUIRED_POSITIVE_TASK_COUNT
        || negativeTaskCount !== REQUIRED_NEGATIVE_TASK_COUNT) {
        throw new Error("Track O O3 executable suites do not match the frozen 38 positive and 12 negative tasks.");
    }
    const sortedControls = safetyControls.sort((left, right) => (
        compareStrings(left.control, right.control)
        || compareStrings(left.taskId, right.taskId)
    ));
    if (sortedControls.length !== REQUIRED_SAFETY_CONTROL_COUNT
        || canonicalJson(sortedControls.map(({ taskId, control }) => ({ taskId, control })))
        !== canonicalJson(REQUIRED_SAFETY_CONTROL_TASKS)) {
        throw new Error("Track O O3 positive suites do not contain the three frozen safety controls exactly once.");
    }
    const decisionBearingQualityTaskCount = positiveTaskCount - sortedControls.length;
    if (decisionBearingQualityTaskCount !== REQUIRED_DECISION_BEARING_QUALITY_TASK_COUNT) {
        throw new Error(
            "Track O O3 executable suites do not contain exactly 35 decision-bearing quality tasks.",
        );
    }
    return {
        repositories,
        safetyControls: sortedControls,
        counts: {
            repositories: repositories.length,
            positiveTasks: positiveTaskCount,
            decisionBearingQualityTasks: decisionBearingQualityTaskCount,
            negativeTasks: negativeTaskCount,
            safetyControls: sortedControls.length,
            protocolExclusions: 1,
        },
    };
}

function resolveExclusiveOutputDirectory(repoRoot, requestedDirectory) {
    const canonicalRepoRoot = fs.realpathSync(repoRoot);
    const requested = path.resolve(requestedDirectory);
    const canonicalParent = fs.realpathSync(path.dirname(requested));
    const outputDirectory = path.join(canonicalParent, path.basename(requested));
    const relative = path.relative(canonicalRepoRoot, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        throw new Error("Track O O3 materialized suites must be outside the repository.");
    }
    if (fs.existsSync(outputDirectory)) {
        throw new Error("Track O O3 materialized suite output already exists.");
    }
    return outputDirectory;
}

function renderJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function writeExclusiveFile(file, bytes) {
    let descriptor;
    try {
        descriptor = fs.openSync(file, "wx", 0o600);
        fs.writeFileSync(descriptor, bytes);
        fs.fsyncSync(descriptor);
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function fsyncDirectory(directory) {
    let descriptor;
    try {
        descriptor = fs.openSync(directory, "r");
        fs.fsyncSync(descriptor);
    } catch (error) {
        if (!["EINVAL", "ENOTSUP", "EPERM"].includes(error?.code)) throw error;
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function writeMaterialization(outputDirectory, materialized, opening) {
    const outputBindings = [];
    fs.mkdirSync(outputDirectory, { mode: 0o700 });
    for (const repository of materialized.repositories) {
        const positiveFile = `${repository.repositoryId}.candidate-tasks.json`;
        const negativeFile = `${repository.repositoryId}.negative-exposure.json`;
        const positiveBytes = Buffer.from(renderJson(repository.positive), "utf8");
        const negativeBytes = Buffer.from(renderJson(repository.negative), "utf8");
        writeExclusiveFile(path.join(outputDirectory, positiveFile), positiveBytes);
        writeExclusiveFile(path.join(outputDirectory, negativeFile), negativeBytes);
        outputBindings.push({
            repositoryId: repository.repositoryId,
            family: repository.family,
            positive: {
                file: positiveFile,
                fileSha256: sha256Bytes(positiveBytes),
                taskCount: repository.positive.tasks.length,
            },
            negative: {
                file: negativeFile,
                fileSha256: sha256Bytes(negativeBytes),
                taskCount: repository.negative.tasks.length,
            },
        });
    }
    const auditUnsigned = {
        version: 1,
        kind: "satori_lateon_track_o_o3_suite_materialization_audit",
        status: "materialized",
        executable: false,
        authority: {
            openingRecordSha256: opening.sha256,
            manifestFileSha256: opening.authority.manifestFileSha256,
            manifestCanonicalSealSha256: opening.authority.manifestCanonicalSealSha256,
        },
        counts: materialized.counts,
        protocolExclusions: [{ ...TRACK_O_O3_EXCLUSION }],
        safetyControls: materialized.safetyControls,
        outputs: outputBindings,
    };
    const audit = { ...auditUnsigned, sha256: sha256Canonical(auditUnsigned) };
    writeExclusiveFile(
        path.join(outputDirectory, "track-o-o3-materialization-audit.json"),
        Buffer.from(renderJson(audit), "utf8"),
    );
    fsyncDirectory(outputDirectory);
    fsyncDirectory(path.dirname(outputDirectory));
    return audit;
}

export function materializeTrackOHeldOutSuites(input, options = {}) {
    const readOpening = options.readOpening ?? readTrackOHeldOutOpeningRecord;
    const readManifestBytes = options.readManifestBytes ?? ((file) => fs.readFileSync(file));
    const validateManifest = options.validateManifest ?? validateRankingBenchmarkManifest;
    const buildSuites = options.buildSuites ?? buildRankingCandidateTaskSuites;

    const repoRoot = fs.realpathSync(input.repoRoot);
    const outputDirectory = resolveExclusiveOutputDirectory(repoRoot, input.outputDirectory);
    // The opening is deliberately validated before the first manifest read.
    const opening = readOpening(input.openingFile, options.openingValidationOptions);
    const manifestBytes = readManifestBytes(input.manifestFile);
    const manifest = parseSealedManifest(manifestBytes, opening, validateManifest);
    const materialized = buildExecutableSuites(manifest, buildSuites);
    return {
        outputDirectory,
        audit: writeMaterialization(outputDirectory, materialized, opening),
    };
}

function usage() {
    return "Usage: node scripts/satori-lateon-track-o-o3-materialize.mjs --repo-root <repository> --opening <opening.json> --manifest <manifest.json> --output-dir <new-external-directory>";
}

export function main(argv = process.argv.slice(2), options = {}) {
    const input = {};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--help") {
            process.stdout.write(`${usage()}\n`);
            return null;
        }
        const value = argv[++index];
        if (!value) throw new Error(`Missing value after ${argument}.`);
        if (argument === "--repo-root") input.repoRoot = path.resolve(value);
        else if (argument === "--opening") input.openingFile = path.resolve(value);
        else if (argument === "--manifest") input.manifestFile = path.resolve(value);
        else if (argument === "--output-dir") input.outputDirectory = path.resolve(value);
        else throw new Error(`Unknown argument: ${argument}`);
    }
    for (const field of ["repoRoot", "openingFile", "manifestFile", "outputDirectory"]) {
        if (!input[field]) throw new Error(`${field} is required.`);
    }
    const result = materializeTrackOHeldOutSuites(input, options);
    process.stdout.write(`${JSON.stringify(result.audit, null, 2)}\n`);
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`satori-lateon-track-o-o3-materialize: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}

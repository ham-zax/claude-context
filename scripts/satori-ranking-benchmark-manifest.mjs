#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./satori-useful-context.mjs";

const SPLITS = new Set(["tuning", "held_out"]);
const SEARCH_SCOPES = new Set(["runtime", "mixed", "docs"]);
const SEARCH_RESULT_MODES = new Set(["grouped", "raw"]);
const SEARCH_GROUPS = new Set(["symbol", "file"]);
const FROZEN_POTION_SEARCH_LIMIT = 15;
const QUERY_CLASSES = new Set([
    "ownership_implementation",
    "natural_language_behavior",
    "configuration",
    "entrypoint",
    "callers_references",
    "tests_fixtures",
    "development_script",
    "documentation",
    "exact_identifier",
    "path_role",
    "negative",
]);
const ORACLE_KINDS = new Set(["owner", "negative"]);
const OWNER_MATCH_KINDS = new Set(["symbol", "file"]);
const CRITICALITIES = new Set(["critical", "important", "diagnostic"]);
const NEURAL_OVERLAP_STATUSES = new Set([
    "deferred_r3_closed",
    "no_known_overlap",
    "suspected_overlap",
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
    return value;
}

function requireString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function requireEnum(value, allowed, label) {
    const normalized = requireString(value, label);
    if (!allowed.has(normalized)) throw new Error(`${label} is unsupported.`);
    return normalized;
}

function requireSha256(value, label) {
    const normalized = requireString(value, label).toLowerCase();
    if (!SHA256_PATTERN.test(normalized)) {
        throw new Error(`${label} must be a SHA-256 hex digest.`);
    }
    return normalized;
}

function requireRevision(value, label) {
    const normalized = requireString(value, label).toLowerCase();
    if (!GIT_REVISION_PATTERN.test(normalized)) {
        throw new Error(`${label} must be an immutable 40-character Git revision.`);
    }
    return normalized;
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive safe integer.`);
    }
    return value;
}

function requireFiniteNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${label} must be a finite number.`);
    }
    return value;
}

function requireStringArray(value, label, { allowEmpty = false } = {}) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
        throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array.`);
    }
    const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`));
    if (new Set(normalized).size !== normalized.length) {
        throw new Error(`${label} must not contain duplicates.`);
    }
    return normalized;
}

function normalizeOwner(value, label) {
    const owner = requireRecord(value, label);
    return {
        file: requireString(owner.file, `${label}.file`),
        symbol: requireString(owner.symbol, `${label}.symbol`),
    };
}

function ownerIdentity(owner) {
    return `${owner.file}::${owner.symbol}`;
}

function normalizeEvidence(value, label, repository) {
    const evidence = requireRecord(value, label);
    if (evidence.kind !== "source_symbol") {
        throw new Error(`${label}.kind must be source_symbol.`);
    }
    const revision = requireRevision(evidence.revision, `${label}.revision`);
    if (revision !== repository.revision) {
        throw new Error(`${label}.revision must match repository '${repository.id}'.`);
    }
    return {
        kind: "source_symbol",
        revision,
        file: requireString(evidence.file, `${label}.file`),
        symbol: requireString(evidence.symbol, `${label}.symbol`),
        sourceBlobSha256: requireSha256(
            evidence.sourceBlobSha256,
            `${label}.sourceBlobSha256`,
        ),
    };
}

function normalizeRepository(value, index) {
    const label = `repositories[${index}]`;
    const repository = requireRecord(value, label);
    return {
        id: requireString(repository.id, `${label}.id`),
        family: requireString(repository.family, `${label}.family`),
        split: requireEnum(repository.split, SPLITS, `${label}.split`),
        sourceRepository: requireString(
            repository.sourceRepository,
            `${label}.sourceRepository`,
        ),
        revision: requireRevision(repository.revision, `${label}.revision`),
        gitTree: requireRevision(repository.gitTree, `${label}.gitTree`),
        sourceTreeSha256: requireSha256(
            repository.sourceTreeSha256,
            `${label}.sourceTreeSha256`,
        ),
        primaryLanguage: requireString(
            repository.primaryLanguage,
            `${label}.primaryLanguage`,
        ),
    };
}

function normalizeOracle(value, label, repository) {
    const oracle = requireRecord(value, label);
    const kind = requireEnum(oracle.kind, ORACLE_KINDS, `${label}.kind`);
    const acceptableAlternativeOwners = (oracle.acceptableAlternativeOwners ?? [])
        .map((owner, index) => normalizeOwner(
            owner,
            `${label}.acceptableAlternativeOwners[${index}]`,
        ));
    const hardNegativeOwners = (oracle.hardNegativeOwners ?? []).map((owner, index) => (
        normalizeOwner(owner, `${label}.hardNegativeOwners[${index}]`)
    ));
    const requiredOwner = kind === "owner"
        ? normalizeOwner(oracle.requiredOwner, `${label}.requiredOwner`)
        : undefined;
    const ownerMatch = kind === "owner" && oracle.ownerMatch !== undefined
        ? requireEnum(oracle.ownerMatch, OWNER_MATCH_KINDS, `${label}.ownerMatch`)
        : undefined;
    if (kind === "negative" && oracle.requiredOwner !== undefined) {
        throw new Error(`${label}.requiredOwner is not valid for a negative task.`);
    }
    const identities = [
        ...(requiredOwner ? [ownerIdentity(requiredOwner)] : []),
        ...acceptableAlternativeOwners.map(ownerIdentity),
        ...hardNegativeOwners.map(ownerIdentity),
    ];
    if (new Set(identities).size !== identities.length) {
        throw new Error(`${label} owner sets must be disjoint.`);
    }
    const evidence = normalizeEvidence(oracle.evidence, `${label}.evidence`, repository);
    const evidenceIdentity = ownerIdentity(evidence);
    const authoritativeIdentities = new Set([
        ...(requiredOwner ? [ownerIdentity(requiredOwner)] : []),
        ...acceptableAlternativeOwners.map(ownerIdentity),
    ]);
    if (kind === "owner" && !authoritativeIdentities.has(evidenceIdentity)) {
        throw new Error(`${label}.evidence must identify a required or acceptable owner.`);
    }
    if (kind === "negative"
        && !new Set(hardNegativeOwners.map(ownerIdentity)).has(evidenceIdentity)) {
        throw new Error(`${label}.evidence must identify a reviewed hard negative.`);
    }
    return {
        kind,
        ...(requiredOwner ? { requiredOwner } : {}),
        ...(ownerMatch ? { ownerMatch } : {}),
        acceptableAlternativeOwners,
        hardNegativeOwners,
        rationale: requireString(oracle.rationale, `${label}.rationale`),
        reviewer: requireString(oracle.reviewer, `${label}.reviewer`),
        evidence,
    };
}

function normalizeTask(value, index, repositoriesById) {
    const label = `tasks[${index}]`;
    const task = requireRecord(value, label);
    const repositoryId = requireString(task.repositoryId, `${label}.repositoryId`);
    const repository = repositoriesById.get(repositoryId);
    if (!repository) throw new Error(`${label} references unknown repository '${repositoryId}'.`);
    const split = requireEnum(task.split, SPLITS, `${label}.split`);
    if (split !== repository.split) {
        throw new Error(`${label}.split must match repository '${repositoryId}'.`);
    }
    const query = requireString(task.query, `${label}.query`);
    const querySha256 = requireSha256(task.querySha256, `${label}.querySha256`);
    const expectedQuerySha256 = crypto.createHash("sha256").update(query, "utf8").digest("hex");
    if (querySha256 !== expectedQuerySha256) {
        throw new Error(`${label}.querySha256 does not match the exact query text.`);
    }
    const search = requireRecord(task.search, `${label}.search`);
    const limit = requirePositiveInteger(search.limit, `${label}.search.limit`);
    const disclosureLimit = requirePositiveInteger(
        search.disclosureLimit,
        `${label}.search.disclosureLimit`,
    );
    if (limit > FROZEN_POTION_SEARCH_LIMIT) {
        throw new Error(
            `${label}.search.limit exceeds the frozen Potion runtime maximum.`,
        );
    }
    if (disclosureLimit > limit) {
        throw new Error(`${label}.search.disclosureLimit must not exceed limit.`);
    }
    return {
        id: requireString(task.id, `${label}.id`),
        split,
        repositoryId,
        queryClass: requireEnum(task.queryClass, QUERY_CLASSES, `${label}.queryClass`),
        query,
        querySha256,
        search: {
            scope: requireEnum(
                search.scope,
                SEARCH_SCOPES,
                `${label}.search.scope`,
            ),
            resultMode: requireEnum(
                search.resultMode,
                SEARCH_RESULT_MODES,
                `${label}.search.resultMode`,
            ),
            groupBy: requireEnum(
                search.groupBy,
                SEARCH_GROUPS,
                `${label}.search.groupBy`,
            ),
            limit,
            disclosureLimit,
        },
        criticality: requireEnum(task.criticality, CRITICALITIES, `${label}.criticality`),
        oracle: normalizeOracle(task.oracle, `${label}.oracle`, repository),
    };
}

function normalizeLeakage(value) {
    const leakage = requireRecord(value, "leakage");
    return {
        tuningOnlyRepositoryFamilies: requireStringArray(
            leakage.tuningOnlyRepositoryFamilies,
            "leakage.tuningOnlyRepositoryFamilies",
            { allowEmpty: true },
        ),
        tuningOnlyRevisions: requireStringArray(
            leakage.tuningOnlyRevisions,
            "leakage.tuningOnlyRevisions",
            { allowEmpty: true },
        ).map((revision, index) => requireRevision(
            revision,
            `leakage.tuningOnlyRevisions[${index}]`,
        )),
        tuningOnlyTaskIds: requireStringArray(
            leakage.tuningOnlyTaskIds,
            "leakage.tuningOnlyTaskIds",
            { allowEmpty: true },
        ),
        tuningOnlyQuerySha256: requireStringArray(
            leakage.tuningOnlyQuerySha256,
            "leakage.tuningOnlyQuerySha256",
            { allowEmpty: true },
        ).map((digest, index) => requireSha256(
            digest,
            `leakage.tuningOnlyQuerySha256[${index}]`,
        )),
    };
}

function normalizeStatisticalContract(value) {
    const contract = requireRecord(value, "statisticalContract");
    const confidence = requireRecord(
        contract.multiplicityAdjustedConfidence,
        "statisticalContract.multiplicityAdjustedConfidence",
    );
    const effects = requireRecord(
        contract.minimumEffects,
        "statisticalContract.minimumEffects",
    );
    const margins = requireRecord(
        contract.nonInferiorityMargins,
        "statisticalContract.nonInferiorityMargins",
    );
    const performance = requireRecord(
        contract.deterministicPerformance,
        "statisticalContract.deterministicPerformance",
    );
    return {
        version: requirePositiveInteger(contract.version, "statisticalContract.version"),
        independentRepositoryFamiliesPerSplit: requirePositiveInteger(
            contract.independentRepositoryFamiliesPerSplit,
            "statisticalContract.independentRepositoryFamiliesPerSplit",
        ),
        positiveTasksPerRepository: requirePositiveInteger(
            contract.positiveTasksPerRepository,
            "statisticalContract.positiveTasksPerRepository",
        ),
        negativeTasksPerRepository: requirePositiveInteger(
            contract.negativeTasksPerRepository,
            "statisticalContract.negativeTasksPerRepository",
        ),
        decisionStratumMinimumTasks: requirePositiveInteger(
            contract.decisionStratumMinimumTasks,
            "statisticalContract.decisionStratumMinimumTasks",
        ),
        decisionStratumMinimumRepositoryFamilies: requirePositiveInteger(
            contract.decisionStratumMinimumRepositoryFamilies,
            "statisticalContract.decisionStratumMinimumRepositoryFamilies",
        ),
        pairedEstimator: requireString(
            contract.pairedEstimator,
            "statisticalContract.pairedEstimator",
        ),
        uncertainty: requireString(
            contract.uncertainty,
            "statisticalContract.uncertainty",
        ),
        clusterBootstrapResamples: requirePositiveInteger(
            contract.clusterBootstrapResamples,
            "statisticalContract.clusterBootstrapResamples",
        ),
        bootstrapSeed: requireString(
            contract.bootstrapSeed,
            "statisticalContract.bootstrapSeed",
        ),
        multiplicityAdjustedConfidence: {
            deterministic: requireFiniteNumber(
                confidence.deterministic,
                "statisticalContract.multiplicityAdjustedConfidence.deterministic",
            ),
            neural: requireFiniteNumber(
                confidence.neural,
                "statisticalContract.multiplicityAdjustedConfidence.neural",
            ),
        },
        minimumEffects: {
            ownerAt3: requireFiniteNumber(
                effects.ownerAt3,
                "statisticalContract.minimumEffects.ownerAt3",
            ),
            macroReciprocalRank: requireFiniteNumber(
                effects.macroReciprocalRank,
                "statisticalContract.minimumEffects.macroReciprocalRank",
            ),
            lateOn32Over16MacroReciprocalRank: requireFiniteNumber(
                effects.lateOn32Over16MacroReciprocalRank,
                "statisticalContract.minimumEffects.lateOn32Over16MacroReciprocalRank",
            ),
            simplicityTie: requireFiniteNumber(
                effects.simplicityTie,
                "statisticalContract.minimumEffects.simplicityTie",
            ),
        },
        nonInferiorityMargins: {
            ownerAt1: requireFiniteNumber(
                margins.ownerAt1,
                "statisticalContract.nonInferiorityMargins.ownerAt1",
            ),
            ownerAt10: requireFiniteNumber(
                margins.ownerAt10,
                "statisticalContract.nonInferiorityMargins.ownerAt10",
            ),
            requiredRoleCoverage: requireFiniteNumber(
                margins.requiredRoleCoverage,
                "statisticalContract.nonInferiorityMargins.requiredRoleCoverage",
            ),
            hardNegativeExposureAt3: requireFiniteNumber(
                margins.hardNegativeExposureAt3,
                "statisticalContract.nonInferiorityMargins.hardNegativeExposureAt3",
            ),
            unacceptableOwnerExposureAt3: requireFiniteNumber(
                margins.unacceptableOwnerExposureAt3,
                "statisticalContract.nonInferiorityMargins.unacceptableOwnerExposureAt3",
            ),
        },
        deterministicPerformance: {
            p95Multiplier: requireFiniteNumber(
                performance.p95Multiplier,
                "statisticalContract.deterministicPerformance.p95Multiplier",
            ),
            p95AdditionalMs: requireFiniteNumber(
                performance.p95AdditionalMs,
                "statisticalContract.deterministicPerformance.p95AdditionalMs",
            ),
            peakRssMultiplier: requireFiniteNumber(
                performance.peakRssMultiplier,
                "statisticalContract.deterministicPerformance.peakRssMultiplier",
            ),
        },
        zeroFailureControls: requireStringArray(
            contract.zeroFailureControls,
            "statisticalContract.zeroFailureControls",
        ),
        contenderSelection: requireString(
            contract.contenderSelection,
            "statisticalContract.contenderSelection",
        ),
    };
}

function normalizeNeuralOverlapReview(value) {
    const review = requireRecord(value, "neuralTrainingOverlapReview");
    return {
        status: requireEnum(
            review.status,
            NEURAL_OVERLAP_STATUSES,
            "neuralTrainingOverlapReview.status",
        ),
        rationale: requireString(
            review.rationale,
            "neuralTrainingOverlapReview.rationale",
        ),
    };
}

function assertUnique(values, label) {
    if (new Set(values).size !== values.length) {
        throw new Error(`${label} must be unique.`);
    }
}

function assertRepositoryFamilyIsolation(repositories) {
    const splitByFamily = new Map();
    for (const repository of repositories) {
        const prior = splitByFamily.get(repository.family);
        if (prior && prior !== repository.split) {
            throw new Error(
                `Repository family '${repository.family}' crosses tuning and held_out.`,
            );
        }
        splitByFamily.set(repository.family, repository.split);
    }
}

function assertHeldOutLeakage(repositories, tasks, leakage) {
    const tuningFamilies = new Set(leakage.tuningOnlyRepositoryFamilies);
    const tuningRevisions = new Set(leakage.tuningOnlyRevisions);
    const tuningTaskIds = new Set(leakage.tuningOnlyTaskIds);
    const tuningQueries = new Set(leakage.tuningOnlyQuerySha256);
    for (const repository of repositories.filter(({ split }) => split === "held_out")) {
        if (tuningFamilies.has(repository.family) || tuningRevisions.has(repository.revision)) {
            throw new Error(
                `Held-out repository '${repository.id}' overlaps declared tuning evidence.`,
            );
        }
    }
    for (const task of tasks.filter(({ split }) => split === "held_out")) {
        if (tuningTaskIds.has(task.id) || tuningQueries.has(task.querySha256)) {
            throw new Error(`Held-out task '${task.id}' overlaps declared tuning evidence.`);
        }
    }
}

function assertStatisticalSampleAuthority(repositories, tasks, contract) {
    for (const split of SPLITS) {
        const splitRepositories = repositories.filter((repository) => (
            repository.split === split
        ));
        if (new Set(splitRepositories.map(({ family }) => family)).size
            < contract.independentRepositoryFamiliesPerSplit) {
            throw new Error(
                `Split '${split}' does not meet the independent repository-family minimum.`,
            );
        }
        for (const repository of splitRepositories) {
            const repositoryTasks = tasks.filter((task) => (
                task.repositoryId === repository.id
            ));
            const positiveCount = repositoryTasks.filter((task) => (
                task.oracle.kind === "owner"
            )).length;
            const negativeCount = repositoryTasks.filter((task) => (
                task.oracle.kind === "negative"
            )).length;
            if (positiveCount < contract.positiveTasksPerRepository
                || negativeCount < contract.negativeTasksPerRepository) {
                throw new Error(
                    `Repository '${repository.id}' does not meet its positive/negative task minimums.`,
                );
            }
        }
    }
    const missingClasses = [...QUERY_CLASSES].filter((queryClass) => (
        !tasks.some((task) => task.queryClass === queryClass)
    ));
    if (missingClasses.length > 0) {
        throw new Error(
            `Benchmark manifest is missing required query classes: ${missingClasses.join(", ")}.`,
        );
    }
}

export function validateRankingBenchmarkManifest(value, options = {}) {
    const manifest = requireRecord(value, "Ranking benchmark manifest");
    if (manifest.version !== 2 || manifest.kind !== "satori_cross_repository_ranking_manifest") {
        throw new Error("Ranking benchmark manifest version or kind is unsupported.");
    }
    if (!Array.isArray(manifest.repositories) || manifest.repositories.length === 0) {
        throw new Error("Ranking benchmark manifest repositories must be non-empty.");
    }
    if (!Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
        throw new Error("Ranking benchmark manifest tasks must be non-empty.");
    }
    const repositories = manifest.repositories.map(normalizeRepository);
    assertUnique(repositories.map(({ id }) => id), "Repository IDs");
    assertUnique(
        repositories.map(({ sourceRepository }) => sourceRepository),
        "Repository sources",
    );
    assertRepositoryFamilyIsolation(repositories);
    const repositoriesById = new Map(repositories.map((repository) => [
        repository.id,
        repository,
    ]));
    const tasks = manifest.tasks.map((task, index) => normalizeTask(
        task,
        index,
        repositoriesById,
    ));
    assertUnique(tasks.map(({ id }) => id), "Task IDs");
    const leakage = normalizeLeakage(manifest.leakage);
    assertHeldOutLeakage(repositories, tasks, leakage);
    const statisticalContract = normalizeStatisticalContract(
        manifest.statisticalContract,
    );
    if (options.requireCompleteBenchmark === true) {
        assertStatisticalSampleAuthority(repositories, tasks, statisticalContract);
    }
    const normalized = {
        version: 2,
        kind: "satori_cross_repository_ranking_manifest",
        repositories,
        leakage,
        statisticalContract,
        neuralTrainingOverlapReview: normalizeNeuralOverlapReview(
            manifest.neuralTrainingOverlapReview,
        ),
        tasks,
    };
    const sha256 = crypto.createHash("sha256").update(canonicalJson(normalized), "utf8").digest("hex");
    if (options.requireSealed === true) {
        if (requireSha256(manifest.sha256, "Ranking benchmark manifest sha256") !== sha256) {
            throw new Error("Ranking benchmark manifest digest does not match its contents.");
        }
    } else if (manifest.sha256 !== undefined && requireSha256(
        manifest.sha256,
        "Ranking benchmark manifest sha256",
    ) !== sha256) {
        throw new Error("Ranking benchmark manifest digest does not match its contents.");
    }
    return { ...normalized, sha256 };
}

export function selectRankingBenchmarkTasks(manifestValue, split) {
    if (!SPLITS.has(split)) throw new Error("Task split must be tuning or held_out.");
    const manifest = validateRankingBenchmarkManifest(manifestValue, { requireSealed: true });
    return manifest.tasks.filter((task) => task.split === split);
}

function buildCandidateWorkload(task) {
    return {
        setup: [{
            tool: "manage_index",
            args: { action: "status", path: "$REPO_ROOT" },
        }],
        invocations: [{
            tool: "search_codebase",
            args: {
                path: "$REPO_ROOT",
                query: task.query,
                scope: task.search.scope,
                resultMode: task.search.resultMode,
                groupBy: task.search.groupBy,
                limit: task.search.limit,
                disclosureLimit: task.search.disclosureLimit,
                rankingMode: "default",
                debugMode: "full",
                debugCandidateLimit: 160,
            },
        }],
        phaseProtocol: {
            cold: "start an isolated runtime with neural reranking disabled, prepare one zero-change publication proof, then run once",
            warm: "repeat in the same isolated runtime without synchronization or provider-order changes",
        },
    };
}

export function buildRankingCandidateTaskSuites(manifestValue) {
    const manifest = validateRankingBenchmarkManifest(
        manifestValue,
        { requireSealed: true, requireCompleteBenchmark: true },
    );
    return manifest.repositories.map((repository) => {
        const tasks = manifest.tasks
            .filter((task) => (
                task.repositoryId === repository.id
                && task.oracle.kind === "owner"
            ))
            .map((task) => {
                if (task.oracle.acceptableAlternativeOwners.length > 0) {
                    throw new Error(
                        `Task '${task.id}' cannot be compiled until candidate capture supports alternative owners.`,
                    );
                }
                return {
                    id: task.id,
                    split: task.split,
                    queryClass: task.queryClass === "exact_identifier"
                        ? "exact_identifier"
                        : "owner_discovery",
                    language: repository.primaryLanguage,
                    expected: {
                        ownerFile: task.oracle.requiredOwner.file,
                        ownerSymbol: task.oracle.requiredOwner.symbol,
                        ownerMatch: task.oracle.ownerMatch ?? "symbol",
                    },
                    workload: buildCandidateWorkload(task),
                };
            });
        const negativeExposureTasks = manifest.tasks
            .filter((task) => (
                task.repositoryId === repository.id
                && task.oracle.kind === "negative"
            ))
            .map((task) => ({
                id: task.id,
                split: task.split,
                queryClass: "negative_exposure",
                language: repository.primaryLanguage,
                expected: {
                    hardNegativeOwners: task.oracle.hardNegativeOwners,
                },
                workload: buildCandidateWorkload(task),
            }));
        return {
            repository,
            candidateTaskSuite: {
                version: 2,
                name: `cross-repository-ranking-${repository.id}`,
                tasks,
            },
            negativeExposureSuite: {
                version: 2,
                name: `cross-repository-ranking-negative-${repository.id}`,
                tasks: negativeExposureTasks,
            },
        };
    });
}

function usage() {
    return "Usage: node scripts/satori-ranking-benchmark-manifest.mjs --manifest <manifest.json> [--seal <output.json>] [--emit-suites <directory>]";
}

export function main(argv = process.argv.slice(2)) {
    let manifestFile;
    let sealFile;
    let suitesDirectory;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--manifest") manifestFile = path.resolve(argv[++index]);
        else if (argv[index] === "--seal") sealFile = path.resolve(argv[++index]);
        else if (argv[index] === "--emit-suites") {
            suitesDirectory = path.resolve(argv[++index]);
        }
        else if (argv[index] === "--help") {
            process.stdout.write(`${usage()}\n`);
            return null;
        } else {
            throw new Error(`Unknown argument: ${argv[index]}`);
        }
    }
    if (!manifestFile) throw new Error("--manifest is required.");
    const raw = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    const normalized = validateRankingBenchmarkManifest(raw, {
        requireSealed: sealFile === undefined,
        requireCompleteBenchmark: true,
    });
    const output = `${JSON.stringify(normalized, null, 2)}\n`;
    if (sealFile) fs.writeFileSync(sealFile, output);
    else if (!suitesDirectory) process.stdout.write(output);
    if (suitesDirectory) {
        fs.mkdirSync(suitesDirectory, { recursive: true });
        for (const suite of buildRankingCandidateTaskSuites(normalized)) {
            fs.writeFileSync(
                path.join(
                    suitesDirectory,
                    `${suite.repository.id}.candidate-tasks.json`,
                ),
                `${JSON.stringify(suite.candidateTaskSuite, null, 2)}\n`,
            );
            fs.writeFileSync(
                path.join(
                    suitesDirectory,
                    `${suite.repository.id}.negative-exposure.json`,
                ),
                `${JSON.stringify(suite.negativeExposureSuite, null, 2)}\n`,
            );
        }
    }
    return normalized;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}

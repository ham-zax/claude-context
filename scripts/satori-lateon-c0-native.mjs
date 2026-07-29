#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function parseArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        values.set(key.slice(2), value);
    }
    const required = [
        "contract",
        "model-directory",
        "reference",
        "output",
        "transformers-module",
        "onnxruntime-module",
    ];
    for (const key of required) {
        if (!values.has(key)) throw new Error(`Missing --${key}.`);
    }
    return Object.fromEntries(values);
}

function sha256File(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function compareContractStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function findPackageMetadata(modulePath, expectedName) {
    let directory = path.dirname(path.resolve(modulePath));
    while (directory !== path.dirname(directory)) {
        const packagePath = path.join(directory, "package.json");
        if (fs.existsSync(packagePath)) {
            const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
            if (packageJson.name === expectedName) {
                return {
                    version: packageJson.version,
                    packagePath,
                    packageSha256: sha256File(packagePath),
                };
            }
        }
        directory = path.dirname(directory);
    }
    throw new Error(`Unable to resolve package identity for ${expectedName}.`);
}

function assertEqual(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label} does not match the pinned reference.`);
    }
}

export function normalizeVector(vector) {
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) {
        throw new Error("LateOn emitted a non-normalizable token vector.");
    }
    return vector.map((value) => value / norm);
}

export function maxSimScore(queryVectors, documentVectors) {
    if (queryVectors.length === 0 || documentVectors.length === 0) return 0;
    return queryVectors.reduce((score, queryVector) => {
        let maximum = Number.NEGATIVE_INFINITY;
        for (const documentVector of documentVectors) {
            let dotProduct = 0;
            for (let index = 0; index < queryVector.length; index += 1) {
                dotProduct += queryVector[index] * documentVector[index];
            }
            maximum = Math.max(maximum, dotProduct);
        }
        return score + maximum;
    }, 0);
}

function maximumVectorError(actual, expected) {
    assertEqual(
        actual.map((embedding) => embedding.length),
        expected.map((embedding) => embedding.length),
        "retained token counts",
    );
    let maximum = 0;
    for (let itemIndex = 0; itemIndex < actual.length; itemIndex += 1) {
        for (let tokenIndex = 0; tokenIndex < actual[itemIndex].length; tokenIndex += 1) {
            for (
                let dimension = 0;
                dimension < actual[itemIndex][tokenIndex].length;
                dimension += 1
            ) {
                maximum = Math.max(
                    maximum,
                    Math.abs(
                        actual[itemIndex][tokenIndex][dimension]
                        - expected[itemIndex][tokenIndex][dimension],
                    ),
                );
            }
        }
    }
    return maximum;
}

async function loadRuntime(arguments_) {
    const transformers = await import(
        pathToFileURL(path.resolve(arguments_["transformers-module"])).href
    );
    const onnxRuntimeImport = await import(
        pathToFileURL(path.resolve(arguments_["onnxruntime-module"])).href
    );
    return {
        transformers,
        onnxRuntime: onnxRuntimeImport.default ?? onnxRuntimeImport,
    };
}

function verifyArtifacts(contract, modelDirectory) {
    let requiredArtifactBytes = 0;
    for (const artifact of Object.values(contract.artifacts)) {
        const artifactPath = path.join(modelDirectory, artifact.path);
        if (sha256File(artifactPath) !== artifact.sha256) {
            throw new Error(`Artifact digest mismatch: ${artifact.path}.`);
        }
        requiredArtifactBytes += fs.statSync(artifactPath).size;
    }
    if (requiredArtifactBytes > contract.resourceBudgets.requiredArtifactBytes) {
        throw new Error("Required LateOn artifacts exceed the frozen disk budget.");
    }
    return requiredArtifactBytes;
}

async function encodeText({
    text,
    isQuery,
    tokenizer,
    session,
    onnxRuntime,
    inference,
}) {
    const normalizedText = inference.lowercase ? text.toLowerCase() : text;
    const prefix = isQuery ? inference.queryPrefix : inference.documentPrefix;
    const tokenLimit = isQuery
        ? inference.queryTokenLimit
        : inference.documentTokenLimit;
    const tokenized = tokenizer(`${prefix}${normalizedText}`, {
        truncation: true,
        max_length: tokenLimit,
    });
    const inputIds = Array.from(tokenized.input_ids.data, Number);
    const attentionMask = Array.from(tokenized.attention_mask.data, Number);
    const output = await session.run({
        input_ids: new onnxRuntime.Tensor(
            "int64",
            tokenized.input_ids.data,
            tokenized.input_ids.dims,
        ),
        attention_mask: new onnxRuntime.Tensor(
            "int64",
            tokenized.attention_mask.data,
            tokenized.attention_mask.dims,
        ),
    });
    const tensor = output[inference.outputName];
    assertEqual(tensor.dims, [1, inputIds.length, inference.embeddingDimensions], "output shape");
    if (tensor.type !== inference.outputDtype) {
        throw new Error(`Expected ${inference.outputDtype} output, received ${tensor.type}.`);
    }
    const skippedDocumentTokens = new Set(inference.documentSkipTokenIds);
    const vectors = [];
    for (let tokenIndex = 0; tokenIndex < inputIds.length; tokenIndex += 1) {
        if (
            attentionMask[tokenIndex] === 0
            || (!isQuery && skippedDocumentTokens.has(inputIds[tokenIndex]))
        ) {
            continue;
        }
        const offset = tokenIndex * inference.embeddingDimensions;
        vectors.push(
            normalizeVector(
                Array.from(
                    tensor.data.slice(
                        offset,
                        offset + inference.embeddingDimensions,
                    ),
                ),
            ),
        );
    }
    return { inputIds, attentionMask, vectors };
}

function percentile95(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

async function run() {
    const arguments_ = parseArguments(process.argv.slice(2));
    const contract = JSON.parse(fs.readFileSync(arguments_.contract, "utf8"));
    const reference = JSON.parse(fs.readFileSync(arguments_.reference, "utf8"));
    const modelDirectory = path.resolve(arguments_["model-directory"]);
    const requiredArtifactBytes = verifyArtifacts(contract, modelDirectory);
    const rssBeforeLoad = process.memoryUsage.rss();
    const loadStarted = performance.now();
    const { transformers, onnxRuntime } = await loadRuntime(arguments_);
    const transformersIdentity = findPackageMetadata(
        arguments_["transformers-module"],
        "@huggingface/transformers",
    );
    const onnxRuntimeIdentity = findPackageMetadata(
        arguments_["onnxruntime-module"],
        "onnxruntime-node",
    );
    if (transformersIdentity.version !== contract.runtime.transformersJs) {
        throw new Error("Transformers.js version does not match the C0 contract.");
    }
    if (onnxRuntimeIdentity.version !== contract.runtime.onnxruntimeNode) {
        throw new Error("ONNX Runtime version does not match the C0 contract.");
    }
    if (process.versions.node !== contract.runtime.node) {
        throw new Error("Node version does not match the C0 contract.");
    }
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.localModelPath = `${path.dirname(modelDirectory)}${path.sep}`;
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(
        path.basename(modelDirectory),
    );
    const session = await onnxRuntime.InferenceSession.create(
        path.join(modelDirectory, contract.artifacts.model.path),
        {
            executionProviders: [contract.inference.executionProvider],
            intraOpNumThreads: contract.inference.intraOpThreads,
            interOpNumThreads: contract.inference.interOpThreads,
        },
    );
    const modelLoadMilliseconds = performance.now() - loadStarted;
    const rssAfterLoad = process.memoryUsage.rss();

    const encodeFixture = async () => {
        const query = await encodeText({
            text: reference.fixture.query.text,
            isQuery: true,
            tokenizer,
            session,
            onnxRuntime,
            inference: contract.inference,
        });
        const documents = [];
        for (const document of reference.fixture.documents) {
            documents.push(
                await encodeText({
                    text: document.text,
                    isQuery: false,
                    tokenizer,
                    session,
                    onnxRuntime,
                    inference: contract.inference,
                }),
            );
        }
        return { query, documents };
    };

    const elapsedRuns = [];
    const scoreRuns = [];
    let encoded;
    for (
        let iteration = 0;
        iteration < contract.inference.warmupRuns + 3;
        iteration += 1
    ) {
        const started = performance.now();
        encoded = await encodeFixture();
        elapsedRuns.push(performance.now() - started);
        scoreRuns.push(
            encoded.documents.map((document) =>
                maxSimScore(encoded.query.vectors, document.vectors)
            ),
        );
    }
    const queryReference = reference.embeddings.query;
    const documentReference = reference.embeddings.documents;
    const queryEmbeddings = [encoded.query.vectors];
    const documentEmbeddings = encoded.documents.map(({ vectors }) => vectors);
    assertEqual(
        encoded.query.inputIds,
        reference.fixture.query.inputIds,
        "query token IDs",
    );
    encoded.documents.forEach((document, index) => {
        assertEqual(
            document.inputIds,
            reference.fixture.documents[index].inputIds,
            `document ${index} token IDs`,
        );
        assertEqual(
            document.attentionMask,
            reference.fixture.documents[index].attentionMask,
            `document ${index} attention mask`,
        );
    });
    assertEqual(
        encoded.query.attentionMask,
        reference.fixture.query.attentionMask,
        "query attention mask",
    );
    const scores = encoded.documents
        .map((document, index) => ({
            id: reference.fixture.documents[index].id,
            score: maxSimScore(encoded.query.vectors, document.vectors),
        }))
        .sort((left, right) =>
            right.score - left.score || compareContractStrings(left.id, right.id)
        );
    const referenceScores = new Map(
        reference.scores.map(({ id, score }) => [id, score]),
    );
    const maximumScoreAbsoluteError = Math.max(
        ...scores.map(({ id, score }) => Math.abs(score - referenceScores.get(id))),
    );
    const maximumVectorAbsoluteError = Math.max(
        maximumVectorError(queryEmbeddings, queryReference),
        maximumVectorError(documentEmbeddings, documentReference),
    );
    const finalScoreRun = scoreRuns.at(-1);
    const maximumRepeatScoreAbsoluteError = Math.max(
        ...scoreRuns.flatMap((run) =>
            run.map((score, index) => Math.abs(score - finalScoreRun[index]))
        ),
    );
    const retainedRssBytes = process.memoryUsage.rss();
    const peakRssBytes = process.resourceUsage().maxRSS * 1024;
    const result = {
        schemaVersion: "satori_lateon_c0_native_result_v1",
        contractSha256: sha256File(arguments_.contract),
        referenceSha256: sha256File(arguments_.reference),
        runtime: {
            node: process.versions.node,
            onnxruntimeNode: onnxRuntimeIdentity,
            onnxruntimeModuleSha256: sha256File(arguments_["onnxruntime-module"]),
            transformersJs: transformersIdentity,
            transformersModuleSha256: sha256File(arguments_["transformers-module"]),
        },
        conformance: {
            tokenIdentityExact: true,
            retainedTokenCountExact: true,
            maximumVectorAbsoluteError,
            maximumScoreAbsoluteError,
            maximumRepeatScoreAbsoluteError,
            scores,
        },
        resources: {
            requiredArtifactBytes,
            modelLoadMilliseconds,
            rssBeforeLoad,
            rssAfterLoad,
            peakRssBytes,
            retainedRssBytes,
            retainedRssDeltaBytes: retainedRssBytes - rssBeforeLoad,
            warmFixtureP95Milliseconds: percentile95(
                elapsedRuns.slice(contract.inference.warmupRuns),
            ),
        },
    };
    const passed = (
        maximumVectorAbsoluteError
            <= contract.tolerances.maximumVectorAbsoluteError
        && maximumScoreAbsoluteError
            <= contract.tolerances.maximumScoreAbsoluteError
        && maximumRepeatScoreAbsoluteError
            <= contract.tolerances.maximumRepeatScoreAbsoluteError
        && modelLoadMilliseconds
            <= contract.resourceBudgets.maximumModelLoadMilliseconds
        && peakRssBytes
            <= contract.resourceBudgets.maximumProcessPeakRssBytes
        && retainedRssBytes - rssBeforeLoad
            <= contract.resourceBudgets.maximumRetainedRssBytes
    );
    result.passed = passed;
    fs.writeFileSync(
        arguments_.output,
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
    );
    await session.release();
    if (!passed) process.exitCode = 1;
}

const isDirectExecution = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
    run().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}

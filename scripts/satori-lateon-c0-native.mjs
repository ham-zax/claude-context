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

async function loadRuntime(transformersModule, onnxruntimeModule) {
    const transformers = await import(
        pathToFileURL(path.resolve(transformersModule)).href
    );
    const onnxRuntimeImport = await import(
        pathToFileURL(path.resolve(onnxruntimeModule)).href
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

async function encodeTexts({
    texts,
    isQuery,
    tokenizer,
    session,
    onnxRuntime,
    inference,
}) {
    const normalizedTexts = texts.map((text) => (
        inference.lowercase ? text.toLowerCase() : text
    ));
    const prefix = isQuery ? inference.queryPrefix : inference.documentPrefix;
    const tokenLimit = isQuery
        ? inference.queryTokenLimit
        : inference.documentTokenLimit;
    const tokenizedItems = normalizedTexts.map((text) => (
        tokenizer(`${prefix}${text}`, {
            truncation: true,
            max_length: tokenLimit,
        })
    ));
    const batchSize = normalizedTexts.length;
    const sequenceLength = Math.max(
        ...tokenizedItems.map(({ input_ids: inputIds }) => inputIds.dims[1]),
    );
    if (!sequenceLength) {
        throw new Error("LateOn tokenizer emitted an empty batch.");
    }
    const inputData = new BigInt64Array(batchSize * sequenceLength);
    inputData.fill(BigInt(inference.padTokenId));
    const attentionData = new BigInt64Array(batchSize * sequenceLength);
    tokenizedItems.forEach((tokenized, batchIndex) => {
        inputData.set(tokenized.input_ids.data, batchIndex * sequenceLength);
        attentionData.set(
            tokenized.attention_mask.data,
            batchIndex * sequenceLength,
        );
    });
    const inputShape = [batchSize, sequenceLength];
    const output = await session.run({
        input_ids: new onnxRuntime.Tensor(
            "int64",
            inputData,
            inputShape,
        ),
        attention_mask: new onnxRuntime.Tensor(
            "int64",
            attentionData,
            inputShape,
        ),
    });
    const tensor = output[inference.outputName];
    assertEqual(
        tensor.dims,
        [batchSize, sequenceLength, inference.embeddingDimensions],
        "output shape",
    );
    if (tensor.type !== inference.outputDtype) {
        throw new Error(`Expected ${inference.outputDtype} output, received ${tensor.type}.`);
    }
    const skippedDocumentTokens = new Set(inference.documentSkipTokenIds);
    return normalizedTexts.map((_text, batchIndex) => {
        const inputIds = [];
        const attentionMask = [];
        const vectors = [];
        for (let tokenIndex = 0; tokenIndex < sequenceLength; tokenIndex += 1) {
            const inputOffset = batchIndex * sequenceLength + tokenIndex;
            const tokenId = Number(inputData[inputOffset]);
            const attended = Number(attentionData[inputOffset]);
            if (attended === 0) continue;
            inputIds.push(tokenId);
            attentionMask.push(attended);
            if (!isQuery && skippedDocumentTokens.has(tokenId)) continue;
            const outputOffset = inputOffset * inference.embeddingDimensions;
            vectors.push(
                normalizeVector(
                    Array.from(
                        tensor.data.slice(
                            outputOffset,
                            outputOffset + inference.embeddingDimensions,
                        ),
                    ),
                ),
            );
        }
        return { inputIds, attentionMask, vectors };
    });
}

function chunk(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

export async function createLateOnRuntime({
    contract,
    modelDirectory,
    transformersModule,
    onnxruntimeModule,
}) {
    const requiredArtifactBytes = verifyArtifacts(contract, modelDirectory);
    const rssBeforeLoad = process.memoryUsage.rss();
    const loadStarted = performance.now();
    const { transformers, onnxRuntime } = await loadRuntime(
        transformersModule,
        onnxruntimeModule,
    );
    const transformersIdentity = findPackageMetadata(
        transformersModule,
        "@huggingface/transformers",
    );
    const onnxRuntimeIdentity = findPackageMetadata(
        onnxruntimeModule,
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

    return {
        identity: {
            node: process.versions.node,
            onnxruntimeNode: onnxRuntimeIdentity,
            onnxruntimeModuleSha256: sha256File(onnxruntimeModule),
            transformersJs: transformersIdentity,
            transformersModuleSha256: sha256File(transformersModule),
        },
        loadResources: {
            requiredArtifactBytes,
            modelLoadMilliseconds,
            rssBeforeLoad,
            rssAfterLoad,
        },
        async score(query, documents) {
            const [queryEncoding] = await encodeTexts({
                texts: [query],
                isQuery: true,
                tokenizer,
                session,
                onnxRuntime,
                inference: contract.inference,
            });
            const documentEncodings = [];
            for (
                const documentBatch of chunk(
                    documents,
                    contract.inference.documentBatchSize,
                )
            ) {
                documentEncodings.push(
                    ...await encodeTexts({
                        texts: documentBatch,
                        isQuery: false,
                        tokenizer,
                        session,
                        onnxRuntime,
                        inference: contract.inference,
                    }),
                );
            }
            return {
                query: queryEncoding,
                documents: documentEncodings,
                scores: documentEncodings.map(({ vectors }) =>
                    maxSimScore(queryEncoding.vectors, vectors)
                ),
            };
        },
        async dispose() {
            await session.release();
        },
    };
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
    const lateOnRuntime = await createLateOnRuntime({
        contract,
        modelDirectory,
        transformersModule: arguments_["transformers-module"],
        onnxruntimeModule: arguments_["onnxruntime-module"],
    });
    const {
        requiredArtifactBytes,
        modelLoadMilliseconds,
        rssBeforeLoad,
        rssAfterLoad,
    } = lateOnRuntime.loadResources;

    const encodeFixture = async () => {
        return lateOnRuntime.score(
            reference.fixture.query.text,
            reference.fixture.documents.map(({ text }) => text),
        );
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
            ...lateOnRuntime.identity,
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
    await lateOnRuntime.dispose();
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

import fs from "node:fs";
import path from "node:path";
import {
    resolveRuntimeOwnerStateDir,
    resolveSatoriStateRoot,
} from "./local-runtime-contract.js";
import { selectedVectorStore } from "./runtime-config.js";

export function resolveRuntimeOwnerRegistryPath(
    homeDir: string,
    env: NodeJS.ProcessEnv,
): string {
    const stateRoot = resolveSatoriStateRoot({
        configured: env.SATORI_STATE_ROOT,
        homeDir,
    });
    const stateDir = resolveRuntimeOwnerStateDir({
        stateRoot,
        vectorStoreProvider: selectedVectorStore(env) === "Milvus" ? "Milvus" : "LanceDB",
        milvusEndpoint: env.MILVUS_ADDRESS,
        homeDir,
    });
    return path.join(stateDir, "owners.json");
}

export function discoverRuntimeOwnerRegistryPaths(
    homeDir: string,
    env: NodeJS.ProcessEnv = process.env,
): string[] {
    const stateRoot = resolveSatoriStateRoot({
        configured: env.SATORI_STATE_ROOT,
        homeDir,
    });
    const paths = new Set<string>([
        path.join(stateRoot, "runtime-owner", "owners.json"),
    ]);
    const milvusRoot = path.join(homeDir, ".satori", "runtime-owner", "milvus");
    if (fs.existsSync(milvusRoot)) {
        for (const entry of fs.readdirSync(milvusRoot, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                paths.add(path.join(milvusRoot, entry.name, "owners.json"));
            }
        }
    }
    return [...paths].sort();
}

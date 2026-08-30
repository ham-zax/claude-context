import crypto from "node:crypto";
import path from "node:path";

export function resolveSatoriStateRoot(input: {
    configured?: string;
    homeDir: string;
}): string {
    if (!input.configured || input.configured.trim() === "") {
        return path.join(input.homeDir, ".satori");
    }
    if (!path.isAbsolute(input.configured)) {
        throw new Error(
            `SATORI_STATE_ROOT must be an absolute path; received "${input.configured}".`,
        );
    }
    return input.configured;
}

function normalizeMilvusEndpoint(endpoint: string | undefined): string {
    if (!endpoint || endpoint.trim() === "") {
        throw new Error(
            "Milvus vector-store requires MILVUS_ADDRESS for the runtime-owner registry.",
        );
    }
    return endpoint.trim().toLowerCase();
}

export function resolveRuntimeOwnerStateDir(input: {
    stateRoot: string;
    vectorStoreProvider: "LanceDB" | "Milvus";
    milvusEndpoint?: string;
    homeDir: string;
}): string {
    if (input.vectorStoreProvider === "Milvus") {
        const normalized = normalizeMilvusEndpoint(input.milvusEndpoint);
        const endpointHash = crypto.createHash("sha256").update(normalized).digest("hex");
        return path.join(input.homeDir, ".satori", "runtime-owner", "milvus", endpointHash);
    }
    return path.join(input.stateRoot, "runtime-owner");
}

import crypto from "node:crypto";
import path from "node:path";

export const POTION_MODEL_ID =
    "minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b";
export const POTION_DIMENSION = 256;
export const EMBEDDING_PROJECTION_VERSION = "embedding_projection_v3" as const;
export const LEXICAL_PROJECTION_VERSION = "lexical_projection_v1" as const;

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

export function resolveRuntimeOwnerStateDir(input: {
    stateRoot: string;
    vectorStoreProvider: "LanceDB" | "Milvus";
    milvusEndpoint?: string;
    homeDir: string;
}): string {
    if (input.vectorStoreProvider === "Milvus") {
        if (!input.milvusEndpoint || input.milvusEndpoint.trim() === "") {
            throw new Error(
                "Milvus vector-store requires MILVUS_ADDRESS for the runtime-owner registry.",
            );
        }
        const endpointHash = crypto.createHash("sha256")
            .update(input.milvusEndpoint.trim().toLowerCase())
            .digest("hex");
        return path.join(input.homeDir, ".satori", "runtime-owner", "milvus", endpointHash);
    }
    return path.join(input.stateRoot, "runtime-owner");
}

export function assertLocalOnlyEndpoint(endpoint: string, label: string): void {
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        throw new Error(`${label} must be a valid URL.`);
    }
    const hostname = url.hostname.toLowerCase();
    const isLoopback = hostname === "localhost"
        || hostname === "::1"
        || /^127(?:\.\d{1,3}){3}$/.test(hostname);
    if (!["http:", "https:"].includes(url.protocol) || !isLoopback) {
        throw new Error(`${label} must use a loopback HTTP(S) endpoint in local-only mode.`);
    }
}

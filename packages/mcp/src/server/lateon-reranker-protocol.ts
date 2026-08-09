export const LATEON_RUNTIME_PROFILE_IDS = Object.freeze({
    legacyD16: "lateon_projection_v1_d16_legacy",
    projectionV2D16: "lateon_projection_v2_d16_v1",
    offlineQualityD32: "lateon_offline_quality_projection_v2_d32_v2",
    contextV3D32: "lateon_offline_quality_projection_v3_d32_v1",
    contextV3D32Activated: "lateon_offline_quality_projection_v3_d32_v2",
    contextV4D32: "lateon_offline_quality_projection_v4_d32_v1",
} as const);

export type LateOnRuntimeProfileId =
    typeof LATEON_RUNTIME_PROFILE_IDS[keyof typeof LATEON_RUNTIME_PROFILE_IDS];

export const LATEON_ACTIVATION_POLICY_IDS = Object.freeze({
    ownerDefaultD32V2: "lateon_d32_owner_default_v1",
    ownerDefaultContextV3: "lateon_context_v3_d32_owner_default_v1",
    ownerDefaultContextV4: "lateon_context_v4_d32_owner_default_v1",
} as const);

export type LateOnActivationPolicyId =
    typeof LATEON_ACTIVATION_POLICY_IDS[keyof typeof LATEON_ACTIVATION_POLICY_IDS];

export type LateOnArtifactContract = Readonly<{
    path: string;
    sha256: string;
}>;

type LateOnRuntimeProfileBase = Readonly<{
    identity: Readonly<{
        repository: string;
        revision: string;
        license: "Apache-2.0";
        projectionVersion:
            | "search_rerank_document_v1"
            | "search_rerank_document_v2"
            | "search_rerank_document_v3"
            | "search_rerank_document_v4";
        projectionSha256?: string;
    }>;
    artifacts: readonly LateOnArtifactContract[];
    runtime: Readonly<{
        transformersJs: string;
        onnxruntimeNode: string;
        executionProvider: "cpu";
    }>;
    inference: Readonly<{
        modelPath: string;
        inputIdsName: string;
        attentionMaskName: string;
        outputName: string;
        embeddingDimensions: number;
        queryPrefix: string;
        documentPrefix: string;
        padTokenId: number;
        queryTokenLimit: number;
        documentTokenLimit: number;
        lowercase: boolean;
        documentSkipTokenIds: readonly number[];
        candidateDepth: number;
        documentBatchSize: 1;
        profileIntraOpThreads: number;
        interOpThreads: number;
    }>;
}>;

export type LateOnRuntimeProfileV1 = LateOnRuntimeProfileBase & Readonly<{
    schemaVersion: "satori_lateon_runtime_profile_v1";
    identity: LateOnRuntimeProfileBase["identity"] & Readonly<{
        projectionVersion: "search_rerank_document_v1";
    }>;
    measuredProfile: Readonly<{
        requestDeadlineMilliseconds: number;
        maximumModelLoadMilliseconds: number;
        maximumWarmP95Milliseconds: number;
        maximumProcessPeakRssBytes: number;
        maximumProcessRetainedRssBytes: number;
    }>;
}>;

export type LateOnRuntimeProfileV2 = LateOnRuntimeProfileBase & Readonly<{
    schemaVersion: "satori_lateon_runtime_profile_v2";
    profileId:
        | "lateon_projection_v2_d16_v1"
        | "lateon_offline_quality_projection_v2_d32_v2";
    qualificationStatus:
        | "disabled_optional_not_track_o_or_held_out_candidate"
        | "disabled_track_o_candidate";
    identity: LateOnRuntimeProfileBase["identity"] & Readonly<{
        projectionVersion: "search_rerank_document_v2";
        projectionSha256: string;
    }>;
    execution: Readonly<{
        workerProcesses: 1;
        activeModelSessions: 1;
        executionMode: "sequential";
        graphOptimizationLevel: "all";
        queryBatchSize: 1;
        documentEncoding: "serial";
        tokenizerParallelism: false;
        aggregateRequestTokenLimit: number;
        padding: "none_single_sequence";
        truncationSide: "right";
        truncationStrategy: "longest_suffix_discarded";
        warmupRequests: number;
    }>;
    operationalBounds: Readonly<{
        maximumActiveReranks: 1;
        maximumQueuedReranks: 1;
        maximumQueueWaitMilliseconds: number;
        maximumReadinessMilliseconds: number;
        maximumScoreMilliseconds: number;
        maximumRerankerStageMilliseconds: number;
        maximumProcessPeakRssBytes: number;
        maximumProcessRetainedRssBytes: number;
    }>;
}>;

export type LateOnRuntimeProfileV3 = Omit<
    LateOnRuntimeProfileV2,
    "schemaVersion" | "profileId" | "qualificationStatus" | "identity"
> & Readonly<{
    schemaVersion: "satori_lateon_runtime_profile_v3";
    profileId:
        | typeof LATEON_RUNTIME_PROFILE_IDS.contextV3D32
        | typeof LATEON_RUNTIME_PROFILE_IDS.contextV3D32Activated;
    qualificationStatus:
        | "disabled_optional_not_track_o_or_held_out_candidate"
        | "owner_activated_operationally_qualified_not_held_out";
    identity: LateOnRuntimeProfileBase["identity"] & Readonly<{
        projectionVersion: "search_rerank_document_v3";
        projectionSha256: string;
        queryProjectionVersion: "search_rerank_query_v1";
    }>;
}>;

export type LateOnRuntimeProfileV4 = Omit<
    LateOnRuntimeProfileV3,
    "schemaVersion" | "profileId" | "qualificationStatus" | "identity"
> & Readonly<{
    schemaVersion: "satori_lateon_runtime_profile_v4";
    profileId: typeof LATEON_RUNTIME_PROFILE_IDS.contextV4D32;
    qualificationStatus: "owner_activated_operationally_qualified_not_held_out";
    identity: LateOnRuntimeProfileBase["identity"] & Readonly<{
        projectionVersion: "search_rerank_document_v4";
        projectionSha256: string;
        queryProjectionVersion: "search_rerank_query_v2";
        requestContractSha256: string;
    }>;
}>;

export type LateOnRuntimeProfile =
    | LateOnRuntimeProfileV1
    | LateOnRuntimeProfileV2
    | LateOnRuntimeProfileV3
    | LateOnRuntimeProfileV4;

export type LateOnEffectiveOperationalBounds = Readonly<{
    maximumActiveReranks: 0 | 1;
    maximumQueuedReranks: 0 | 1;
    maximumQueueWaitMilliseconds: number;
    maximumScoreMilliseconds: number;
    maximumRerankerStageMilliseconds: number;
}>;

export type LateOnWorkerRequest =
    | Readonly<{
        type: "initialize";
        modelDirectory: string;
        profile: LateOnRuntimeProfile;
        profileDigest: string;
        intraOpThreads: number;
    }>
    | Readonly<{
        type: "rerank";
        requestId: number;
        query: string;
        documents: readonly string[];
        identities: readonly string[];
    }>;

export type LateOnWorkerResponse =
    | Readonly<{
        type: "ready";
        modelRevision: string;
        profileDigest: string;
        projectionVersion: LateOnRuntimeProfile["identity"]["projectionVersion"];
        candidateDepth: number;
    }>
    | Readonly<{
        type: "result";
        requestId: number;
        results: ReadonlyArray<{
            index: number;
            relevanceScore: number;
        }>;
    }>
    | Readonly<{
        type: "error";
        requestId?: number;
        message: string;
    }>;

import type {
    SearchDisclosureReason,
    SearchDisclosureSummary,
    SearchGroupedResultCounts,
    SearchGroupedResponseEnvelope,
} from "./search-types.js";
import { SEARCH_MAX_FROZEN_RESULTS } from "./search-constants.js";

export const SEARCH_DISCLOSURE_POLICY_VERSION = "search_disclosure_v1" as const;

type DisclosureProjection<T> = Readonly<{
    status: "ok" | "page_too_large";
    envelope: SearchGroupedResponseEnvelope;
    results: readonly T[];
    responseBytes: number;
}>;

export function resolveSearchGroupedResultCounts(input: {
    requestedTotal: number;
    availableGroupCount: number;
    returnedGroupCount: number;
}): SearchGroupedResultCounts {
    if (!Number.isSafeInteger(input.requestedTotal) || input.requestedTotal <= 0) {
        throw new Error("Search requested total must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(input.availableGroupCount) || input.availableGroupCount < 0) {
        throw new Error("Search available group count must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(input.returnedGroupCount) || input.returnedGroupCount < 0) {
        throw new Error("Search returned group count must be a non-negative safe integer.");
    }
    const effectiveFrozenTotal = Math.min(
        input.requestedTotal,
        input.availableGroupCount,
        SEARCH_MAX_FROZEN_RESULTS,
    );
    if (input.returnedGroupCount > effectiveFrozenTotal) {
        throw new Error("Search returned group count cannot exceed the frozen total.");
    }
    return {
        requestedTotal: input.requestedTotal,
        effectiveFrozenTotal,
        availableGroupCount: input.availableGroupCount,
        returnedGroupCount: input.returnedGroupCount,
        remainingGroupCount: effectiveFrozenTotal - input.returnedGroupCount,
    };
}

function responseByteLength(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function truncateUtf8(value: string, maxBytes: number): string {
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length <= maxBytes) return value;
    let end = Math.max(0, Math.min(bytes.length, maxBytes));
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
        end -= 1;
    }
    return bytes.subarray(0, end).toString("utf8");
}

function orderedReasons(reasons: ReadonlySet<SearchDisclosureReason>): SearchDisclosureReason[] {
    const order: SearchDisclosureReason[] = [
        "initial_budget",
        "caller_limit",
        "utf8_byte_budget",
        "group_content_truncated",
    ];
    return order.filter((reason) => reasons.has(reason));
}

function buildSummary(input: {
    availableGroupCount: number;
    returnedGroupCount: number;
    reasons: ReadonlySet<SearchDisclosureReason>;
}): SearchDisclosureSummary {
    const reasons = orderedReasons(input.reasons);
    return {
        policyVersion: SEARCH_DISCLOSURE_POLICY_VERSION,
        availableGroupCount: input.availableGroupCount,
        returnedGroupCount: input.returnedGroupCount,
        omittedGroupCount: input.availableGroupCount - input.returnedGroupCount,
        truncated: reasons.length > 0,
        reasons,
    };
}

export function resolveOmittedBeyondLimitGroupCount(counts: {
    availableGroupCount: number;
    effectiveFrozenTotal: number;
}): number {
    return Math.max(0, counts.availableGroupCount - counts.effectiveFrozenTotal);
}

export function projectGroupedDisclosure<T extends { preview: string }>(input: {
    orderedResults: readonly T[];
    callerLimit: number;
    disclosureLimit: number;
    maxResponseBytes: number;
    includeSummary: boolean;
    buildEnvelope: (
        results: readonly T[],
        disclosure?: SearchDisclosureSummary,
    ) => SearchGroupedResponseEnvelope;
}): DisclosureProjection<T> {
    if (!Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes <= 0) {
        throw new Error("Search response byte budget must be a positive safe integer.");
    }
    const callerLimit = Math.max(1, Math.floor(input.callerLimit));
    const disclosureLimit = Math.max(1, Math.min(callerLimit, Math.floor(input.disclosureLimit)));
    const availableGroupCount = input.orderedResults.length;
    const desiredCount = Math.min(disclosureLimit, callerLimit, availableGroupCount);
    const desiredResults = input.orderedResults.slice(0, desiredCount);
    const unannotated = input.buildEnvelope(desiredResults);
    const unannotatedBytes = responseByteLength(unannotated);
    if (!input.includeSummary && unannotatedBytes <= input.maxResponseBytes) {
        return {
            status: "ok",
            envelope: unannotated,
            results: desiredResults,
            responseBytes: unannotatedBytes,
        };
    }

    const baseReasons = new Set<SearchDisclosureReason>();
    if (disclosureLimit < Math.min(callerLimit, availableGroupCount)) {
        baseReasons.add("initial_budget");
    }
    if (callerLimit < availableGroupCount) {
        baseReasons.add("caller_limit");
    }

    for (let count = desiredCount; count > 0; count -= 1) {
        const reasons = new Set(baseReasons);
        if (count < desiredCount) reasons.add("utf8_byte_budget");
        const results = desiredResults.slice(0, count);
        const disclosure = buildSummary({ availableGroupCount, returnedGroupCount: count, reasons });
        const envelope = input.buildEnvelope(results, disclosure);
        const responseBytes = responseByteLength(envelope);
        if (responseBytes <= input.maxResponseBytes) {
            return { status: "ok", envelope, results, responseBytes };
        }
    }

    const emptyReasons = new Set(baseReasons);
    if (desiredCount > 0) emptyReasons.add("utf8_byte_budget");
    const emptyDisclosure = buildSummary({
        availableGroupCount,
        returnedGroupCount: 0,
        reasons: emptyReasons,
    });
    const emptyEnvelope = input.buildEnvelope([], emptyDisclosure);
    if (responseByteLength(emptyEnvelope) > input.maxResponseBytes) {
        throw new Error("Search response authority envelope exceeds its UTF-8 byte budget.");
    }

    const firstResult = desiredResults[0];
    if (!firstResult) {
        return {
            status: "ok",
            envelope: emptyEnvelope,
            results: [],
            responseBytes: responseByteLength(emptyEnvelope),
        };
    }

    const truncatedReasons = new Set(emptyReasons);
    truncatedReasons.add("group_content_truncated");
    let low = 0;
    let high = Buffer.byteLength(firstResult.preview, "utf8");
    let best: DisclosureProjection<T> | null = null;
    while (low <= high) {
        const previewBytes = Math.floor((low + high) / 2);
        const truncatedResult = {
            ...firstResult,
            preview: truncateUtf8(firstResult.preview, previewBytes),
        };
        const disclosure = buildSummary({
            availableGroupCount,
            returnedGroupCount: 1,
            reasons: truncatedReasons,
        });
        const envelope = input.buildEnvelope([truncatedResult], disclosure);
        const responseBytes = responseByteLength(envelope);
        if (responseBytes <= input.maxResponseBytes) {
            best = { status: "ok", envelope, results: [truncatedResult], responseBytes };
            low = previewBytes + 1;
        } else {
            high = previewBytes - 1;
        }
    }

    return best ?? {
        status: "page_too_large",
        envelope: emptyEnvelope,
        results: [],
        responseBytes: responseByteLength(emptyEnvelope),
    };
}

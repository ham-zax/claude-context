import assert from "node:assert/strict";
import test from "node:test";
import { buildR3Decision } from "./satori-search-ranking-r3.mjs";

function contender(contenderId, reciprocalRank, {
    quality = false,
    resources = false,
} = {}) {
    return {
        contenderId,
        passesEveryQualityGate: quality,
        productAdmissible: quality && resources,
        qualityMetrics: {
            reciprocalRank: { contender: reciprocalRank },
        },
    };
}

test("R3 keeps baseline product policy when diagnostic quality cannot clear resources", () => {
    const decision = buildR3Decision([
        contender("D-L16", 0.4),
        contender("D-L32", 0.42),
    ], 0.01);

    assert.deepEqual(decision, {
        qualityDiagnosticWinner: "D-L32",
        qualityDiagnosticWinnerPassedEveryQualityGate: false,
        d32OverD16MacroReciprocalRank: 0.02,
        d32OverD16DepthThresholdMet: true,
        qualityConclusion: "directional_quality_improvement_not_fully_qualified",
        productPolicy: "B",
        productFinalist: null,
        productReason: "all_lateon_contenders_failed_frozen_resource_gates",
        heldOutOpened: false,
    });
});

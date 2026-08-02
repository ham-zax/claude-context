import assert from "node:assert/strict";
import test from "node:test";

const measurementModuleUrl = new URL(
    "./satori-search-pagination-bound-measure.mjs",
    import.meta.url,
);

const requiredMeasurementKeys = [
    "requestedTotal",
    "requestedTotalSample",
    "MAX_FROZEN_RESULTS",
    "MAX_PAGE_SIZE",
    "MAX_RESULT_SET_ENTRY_BYTES",
    "MAX_RESULT_SET_CACHE_BYTES",
    "MIN_RESIDENT_RESULT_SETS",
    "normalResponseBytes",
    "debugResponseBytes",
    "semanticPassCount",
    "supplementDepths",
    "currentExactFastPathMaximum",
    "requiredExactFastPathMaximum",
];

test("pagination-bound measurement reports every independent authority or an explicit blocker", async () => {
    const {
        measurePaginationBounds,
        validateRequestedTotal,
        validatePaginationBoundMeasurement,
    } = await import(measurementModuleUrl.href);

    const first = measurePaginationBounds();
    const second = measurePaginationBounds();

    assert.deepEqual(second, first);
    assert.doesNotThrow(() => validatePaginationBoundMeasurement(first));
    for (const key of requiredMeasurementKeys) {
        assert.equal(Object.hasOwn(first, key), true, `missing measurement field: ${key}`);
    }

    assert.deepEqual(first.requestedTotal, {
        kind: "caller_supplied",
        validation: "positive_safe_integer",
        performanceProfileCap: null,
    });
    assert.equal(first.requestedTotalSample, 200);
    assert.doesNotThrow(() => validateRequestedTotal(first.requestedTotalSample));
    assert.equal(first.MAX_FROZEN_RESULTS, 200);
    assert.equal(first.normalResponseBytes, 128 * 1024);
    assert.equal(first.debugResponseBytes, 2 * 1024 * 1024);
    assert.equal(first.semanticPassCount, 2);
    assert.deepEqual(first.supplementDepths, {
        trackedLexicalResults: 16,
        dirtyOverlayResults: 16,
        livePathResults: 8,
    });
    assert.equal(first.currentExactFastPathMaximum, null);
    assert.equal(first.requiredExactFastPathMaximum, first.MAX_FROZEN_RESULTS);

    if (first.terminalDecision === "pagination_bound_derivation_blocked") {
        assert.deepEqual(first.unsupportedValues, [
            "MAX_PAGE_SIZE",
            "MAX_RESULT_SET_ENTRY_BYTES",
            "MAX_RESULT_SET_CACHE_BYTES",
            "MIN_RESIDENT_RESULT_SETS",
            "currentExactFastPathMaximum",
        ]);
        assert.equal(first.blockers.length > 0, true);
        for (const key of first.unsupportedValues) {
            assert.equal(first[key], null);
        }
        return;
    }

    for (const key of [
        "MAX_PAGE_SIZE",
        "MAX_RESULT_SET_ENTRY_BYTES",
        "MAX_RESULT_SET_CACHE_BYTES",
        "MIN_RESIDENT_RESULT_SETS",
    ]) {
        assert.equal(Number.isSafeInteger(first[key]) && first[key] > 0, true, key);
    }
    assert.equal(first.MAX_RESULT_SET_ENTRY_BYTES < first.MAX_RESULT_SET_CACHE_BYTES, true);
    assert.equal(
        first.MAX_RESULT_SET_ENTRY_BYTES * first.MIN_RESIDENT_RESULT_SETS
            <= first.MAX_RESULT_SET_CACHE_BYTES,
        true,
    );
});

test("pagination-bound validation rejects unsafe integers and conflated cache budgets", async () => {
    const {
        measurePaginationBounds,
        validateRequestedTotal,
        validatePaginationBoundMeasurement,
    } = await import(measurementModuleUrl.href);
    const measured = measurePaginationBounds();

    assert.throws(
        () => validateRequestedTotal(Number.MAX_SAFE_INTEGER + 1),
        /positive safe integer/,
    );
    assert.throws(
        () => validateRequestedTotal(1.5),
        /positive safe integer/,
    );
    assert.throws(
        () => validateRequestedTotal(0),
        /positive safe integer/,
    );

    assert.throws(
        () => validatePaginationBoundMeasurement({
            ...measured,
            MAX_RESULT_SET_ENTRY_BYTES: 4096,
            MAX_RESULT_SET_CACHE_BYTES: 4096,
            MIN_RESIDENT_RESULT_SETS: 1,
        }),
        /entry byte budget must be smaller/,
    );

    assert.throws(
        () => validatePaginationBoundMeasurement({
            ...measured,
            MAX_RESULT_SET_ENTRY_BYTES: 4096,
            MAX_RESULT_SET_CACHE_BYTES: 8191,
            MIN_RESIDENT_RESULT_SETS: 2,
        }),
        /minimum resident result sets/,
    );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { determineFreshnessTriggerReason } from './sync.js';

test('determineFreshnessTriggerReason categorizes ignore_control_changed', () => {
    const reason = determineFreshnessTriggerReason({
        ignoreControlChanged: true,
        watcherPending: false,
    });
    assert.equal(reason, 'ignore_control_changed');
});

test('determineFreshnessTriggerReason categorizes watcher_pending', () => {
    const reason = determineFreshnessTriggerReason({
        ignoreControlChanged: false,
        watcherPending: true,
    });
    assert.equal(reason, 'watcher_pending');
});

test('determineFreshnessTriggerReason categorizes exact_compare_differs', () => {
    const reason = determineFreshnessTriggerReason({
        exactComparison: { status: 'differs', changedPaths: ['pkg/main.go'] },
    });
    assert.equal(reason, 'exact_compare_differs');
});

test('determineFreshnessTriggerReason categorizes exact_compare_unavailable', () => {
    const reason = determineFreshnessTriggerReason({
        exactComparison: { status: 'unavailable' },
    });
    assert.equal(reason, 'exact_compare_unavailable');
});

test('determineFreshnessTriggerReason categorizes full_compare_differs', () => {
    const reason = determineFreshnessTriggerReason({
        fullComparison: { status: 'differs' },
    });
    assert.equal(reason, 'full_compare_differs');
});

test('determineFreshnessTriggerReason categorizes threshold_expired and manual_zero_threshold', () => {
    assert.equal(determineFreshnessTriggerReason({ thresholdMs: 0 }), 'manual_zero_threshold');
    assert.equal(determineFreshnessTriggerReason({ thresholdMs: 60000, timeSinceLastSyncMs: 70000 }), 'threshold_expired');
});

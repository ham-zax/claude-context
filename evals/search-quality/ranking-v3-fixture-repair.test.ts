import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runSearchQualityEvaluation } from './search-quality-evaluation.js';

function workspaceRoot(): string {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function readWorkingTreeState(root: string): string {
    const paths = [
        'packages',
        'scripts',
        'fixtures/search-quality/v1',
    ];
    const records: string[] = [];
    const visit = (relativePath: string): void => {
        const absolutePath = path.join(root, relativePath);
        const stat = fs.statSync(absolutePath);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(absolutePath).sort()) {
                visit(path.join(relativePath, entry));
            }
            return;
        }
        records.push(`${relativePath}\0${fs.readFileSync(absolutePath).toString('base64')}`);
    };
    for (const relativePath of paths) visit(relativePath);
    return records.join('\n');
}

test('repairs_all_three_stale_fixture_seams_without_product_changes', async () => {
    const root = workspaceRoot();
    const before = readWorkingTreeState(root);

    const artifact = await runSearchQualityEvaluation(root, {
        excludeRepositoryPaths: ['evals/search-quality/ranking-v3-fixture-repair.test.ts'],
    });

    assert.equal(artifact.results.length, artifact.workloadCount * artifact.limits.length);
    assert.deepEqual(
        [...new Set(artifact.results.map((result) => result.status))],
        ['ok'],
        'every fixture workload/limit must complete successfully',
    );
    assert.equal(
        artifact.results.some((result) => result.warningCodes.includes('source_state_unverified')),
        false,
        'the repaired fixture must establish a verified source state',
    );
    for (const result of artifact.results) {
        assert.notEqual(
            result.ownerRank,
            null,
            `expected owner missing for ${result.workloadId} at limit ${result.limit}`,
        );
        assert.ok(
            (result.ownerRank ?? Number.POSITIVE_INFINITY) <= result.limit,
            `expected owner rank exceeds requested limit for ${result.workloadId} at limit ${result.limit}`,
        );
        assert.equal(result.budgetChecks.toolCalls, true);
        assert.equal(result.budgetChecks.responseBytes, true);
    }

    assert.equal(readWorkingTreeState(root), before, 'evaluation must not modify product or fixture files');
});

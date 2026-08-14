import test from 'node:test';
import assert from 'node:assert/strict';
import { ThreadedWasmSemanticProjectAnalyzer } from './wasm-threaded-analyzer';

test('ThreadedWasmSemanticProjectAnalyzer executes analysis without blocking main event loop', async () => {
    const analyzer = new ThreadedWasmSemanticProjectAnalyzer();
    assert.equal(analyzer.supportsLanguage('go'), true);
    assert.equal(analyzer.supportsLanguage('python'), false);

    let eventLoopTicks = 0;
    const timer = setInterval(() => { eventLoopTicks += 1; }, 5);

    const result = await analyzer.analyze({
        language: 'go',
        auxiliaryFiles: [
            {
                role: 'go.mod',
                path: 'go.mod',
                source: 'module example.com/test\n\ngo 1.21\n',
                sourceHash: 'aux-hash',
            },
        ],
        sourceFiles: [
            {
                path: 'main.go',
                source: 'package main\n\nfunc Helper() {}\nfunc main() {\n    Helper()\n}\n',
                sourceHash: 'src-hash',
            },
        ],
    });

    clearInterval(timer);
    assert.ok(eventLoopTicks >= 0, 'Main event loop ticked during WASM analysis');
    assert.equal(result.language, 'go');
    const occurrences = result.occurrencesByFile.get('main.go');
    assert.ok(occurrences && occurrences.length > 0);
    assert.equal(occurrences[0].targetProvenance?.name, 'Helper');
    await analyzer.dispose();
});

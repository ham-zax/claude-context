import test from 'node:test';
import assert from 'node:assert/strict';
import { ThreadedWasmSemanticProjectAnalyzer } from './wasm-threaded-analyzer';

test('ThreadedWasmSemanticProjectAnalyzer executes analysis without blocking main event loop', async () => {
    const analyzer = new ThreadedWasmSemanticProjectAnalyzer();
    assert.equal(analyzer.supportsLanguage('go'), true);
    assert.equal(analyzer.supportsLanguage('python'), false);

    // Build a multi-file Go project with callers and targets
    const sourceFiles = [];
    for (let i = 0; i < 30; i++) {
        sourceFiles.push({
            path: `pkg/file${i}.go`,
            source: `package pkg\n\nfunc Helper${i}() {}\nfunc CallHelper${i}() {\n    Helper${i}()\n}\n`,
            sourceHash: `hash-${i}`,
        });
    }

    let eventLoopTicks = 0;
    const timer = setInterval(() => { eventLoopTicks += 1; }, 2);

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
        sourceFiles,
    });

    clearInterval(timer);
    assert.ok(eventLoopTicks > 0, `Main event loop must tick during off-thread WASM analysis (observed ${eventLoopTicks} ticks)`);
    assert.equal(result.language, 'go');
    assert.equal(result.occurrencesByFile.size, 30);
    const firstOccurrences = result.occurrencesByFile.get('pkg/file0.go');
    assert.ok(firstOccurrences && firstOccurrences.length > 0);
    assert.equal(firstOccurrences[0].targetProvenance?.name, 'Helper0');

    await analyzer.dispose();
});

test('ThreadedWasmSemanticProjectAnalyzer handles unsupported languages and disposal cleanly', async () => {
    const analyzer = new ThreadedWasmSemanticProjectAnalyzer();
    const result = await analyzer.analyze({
        language: 'unsupported_lang',
        auxiliaryFiles: [],
        sourceFiles: [],
    });
    assert.equal(result.occurrencesByFile.size, 0);
    await analyzer.dispose();
});

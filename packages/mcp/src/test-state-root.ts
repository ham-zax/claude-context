import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-mcp-test-state-'));
process.env.SATORI_STATE_ROOT = testStateRoot;

if (!process.env.VERBOSE && !process.env.DEBUG) {
    // Completely silence stdout/info/warn during test runs for a clean, peaceful terminal
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
}

process.once('exit', () => {
    fs.rmSync(testStateRoot, { recursive: true, force: true });
});

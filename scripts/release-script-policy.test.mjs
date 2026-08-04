import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
);

test('release package scripts cannot bypass graph publication', () => {
  for (const key of ['release:core', 'release:mcp', 'release:cli']) {
    const command = packageJson.scripts[key];
    assert.equal(typeof command, 'string');
    assert.match(command, /pnpm run release:all/);
    assert.doesNotMatch(command, /(?:npm|pnpm)[^\n]*publish/);
  }
});

test('no root script directly invokes a package publication command', () => {
  for (const [key, command] of Object.entries(packageJson.scripts)) {
    assert.doesNotMatch(
      command,
      /\b(?:npm|pnpm)\b[^\n]*\bpublish\b/,
      `script '${key}' must not directly publish packages`,
    );
  }
});

test('public release checking prepares final artifacts before graph inspection', () => {
  assert.equal(packageJson.scripts['release:check:packed'], 'node scripts/check-release-graph.mjs');
  assert.match(packageJson.scripts['release:check'], /build/);
  assert.match(packageJson.scripts['release:check'], /release:smoke:mcp/);
  assert.match(packageJson.scripts['release:check'], /release:smoke:cli/);
  assert.match(packageJson.scripts['release:check'], /release:check:packed/);
});

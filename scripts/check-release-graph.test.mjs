import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkReleaseGraph } from './check-release-graph.mjs';

function createWorkspace(files) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-'));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return cwd;
}

function standardWorkspace() {
  return createWorkspace({
    'packages/core/package.json': { name: '@zokizuan/satori-core', version: '3.6.0' },
    'packages/mcp/package.json': {
      name: '@zokizuan/satori-mcp',
      version: '6.8.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*' },
    },
    'packages/cli/package.json': {
      name: '@zokizuan/satori-cli',
      version: '1.9.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*', '@zokizuan/satori-mcp': 'workspace:*' },
    },
    'server.json': { version: '6.8.0' },
  });
}

function snapshotFor(manifestJson) {
  const content = JSON.stringify(manifestJson);
  return Object.freeze([
    Object.freeze({
      path: 'package.json',
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      executable: false,
      sizeBytes: content.length,
    }),
  ]);
}

function localManifests() {
  return {
    core: { name: '@zokizuan/satori-core', version: '3.6.0', dependencies: {} },
    mcp: { name: '@zokizuan/satori-mcp', version: '6.8.0', dependencies: { '@zokizuan/satori-core': '3.6.0' } },
    cli: {
      name: '@zokizuan/satori-cli',
      version: '1.9.0',
      dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.8.0' },
    },
  };
}

function defaultPackLocal() {
  const manifests = localManifests();
  return ({ packageName }) => {
    const key = { '@zokizuan/satori-core': 'core', '@zokizuan/satori-mcp': 'mcp', '@zokizuan/satori-cli': 'cli' }[packageName];
    return { manifest: manifests[key], snapshot: snapshotFor(manifests[key]) };
  };
}

function stubFetch(publishedByName) {
  return ({ packageName, version }) => {
    const entry = publishedByName[packageName];
    if (entry === undefined) {
      return { status: 'unpublished' };
    }
    if (entry === null) {
      throw new Error(`registry unavailable for ${packageName}`);
    }
    return {
      status: 'published',
      version,
      snapshot: entry.packedSnapshot,
      manifest: entry.packedManifest,
    };
  };
}

async function runCheck(options = {}) {
  const lines = [];
  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  const result = await checkReleaseGraph({
    cwd: options.cwd,
    tempRoot,
    output: (line) => lines.push(line),
    packLocalImpl: options.packLocalImpl || defaultPackLocal(),
    fetchPublishedImpl: options.fetchPublishedImpl || stubFetch(options.publishedByName || {}),
  });
  return { result, lines, tempRoot };
}

function remainingTempChildren(tempRoot) {
  return fs.readdirSync(tempRoot).filter((name) => name.startsWith('satori-release-check-'));
}

test('all three unpublished succeeds', async () => {
  const cwd = standardWorkspace();
  const { result, lines, tempRoot } = await runCheck({ cwd });
  assert.equal(result.valid, true);
  assert.equal(result.packages.core.status, 'unpublished');
  assert.equal(result.packages.mcp.status, 'unpublished');
  assert.equal(result.packages.cli.status, 'unpublished');
  assert.deepEqual(result.invalidPackages, []);
  assert.equal(lines[lines.length - 1], 'Release graph valid.');
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

test('published-identical Core plus unpublished MCP/CLI succeeds', async () => {
  const cwd = standardWorkspace();
  const coreManifest = localManifests().core;
  const { result, lines } = await runCheck({
    cwd,
    publishedByName: {
      '@zokizuan/satori-core': {
        packedSnapshot: snapshotFor(coreManifest),
        packedManifest: coreManifest,
      },
    },
  });
  assert.equal(result.packages.core.status, 'published-identical');
  assert.equal(result.packages.mcp.status, 'unpublished');
  assert.equal(result.packages.cli.status, 'unpublished');
  assert.equal(result.valid, true);
  assert.equal(lines[lines.length - 1], 'Release graph valid.');
});

test('stale Core fails', async () => {
  const cwd = standardWorkspace();
  const coreManifest = localManifests().core;
  const publishedManifest = { ...coreManifest, version: '3.6.0', dependencies: { extra: '1.0.0' } };
  await assert.rejects(
    runCheck({
      cwd,
      publishedByName: {
        '@zokizuan/satori-core': {
          packedSnapshot: snapshotFor(publishedManifest),
          packedManifest: publishedManifest,
        },
      },
    }),
    /Release graph invalid\./
  );
});

test('Core identical but MCP stale through changed Core pin fails', async () => {
  const cwd = standardWorkspace();
  const manifests = localManifests();
  const publishedMcp = { ...manifests.mcp, dependencies: { '@zokizuan/satori-core': '3.5.0' } };
  await assert.rejects(
    runCheck({
      cwd,
      publishedByName: {
        '@zokizuan/satori-core': { packedSnapshot: snapshotFor(manifests.core), packedManifest: manifests.core },
        '@zokizuan/satori-mcp': { packedSnapshot: snapshotFor(publishedMcp), packedManifest: publishedMcp },
      },
    }),
    /Release graph invalid\./
  );
});

test('CLI stale through changed MCP pin fails', async () => {
  const cwd = standardWorkspace();
  const manifests = localManifests();
  const publishedCli = { ...manifests.cli, dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.7.0' } };
  const failed = await runCheck({
    cwd,
    publishedByName: {
      '@zokizuan/satori-core': { packedSnapshot: snapshotFor(manifests.core), packedManifest: manifests.core },
      '@zokizuan/satori-mcp': { packedSnapshot: snapshotFor(manifests.mcp), packedManifest: manifests.mcp },
      '@zokizuan/satori-cli': { packedSnapshot: snapshotFor(publishedCli), packedManifest: publishedCli },
    },
  }).then(() => false).catch(() => true);
  assert.equal(failed, true);
});

test('server.json mismatch fails before registry lookup', async () => {
  const cwd = createWorkspace({
    'packages/core/package.json': { name: '@zokizuan/satori-core', version: '3.6.0' },
    'packages/mcp/package.json': {
      name: '@zokizuan/satori-mcp',
      version: '6.8.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*' },
    },
    'packages/cli/package.json': {
      name: '@zokizuan/satori-cli',
      version: '1.9.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*', '@zokizuan/satori-mcp': 'workspace:*' },
    },
    'server.json': { version: '6.7.0' },
  });
  let packCalls = 0;
  const packLocalImpl = (input) => {
    packCalls += 1;
    return defaultPackLocal()(input);
  };
  await assert.rejects(
    checkReleaseGraph({ cwd, packLocalImpl, fetchPublishedImpl: () => assert.fail('registry must not be queried') }),
    /server\.json version/
  );
  assert.equal(packCalls, 0);
});

test('registry failure fails closed', async () => {
  const cwd = standardWorkspace();
  await assert.rejects(
    runCheck({ cwd, publishedByName: { '@zokizuan/satori-core': null } }),
    /registry unavailable for @zokizuan\/satori-core/
  );
});

test('deterministic package ordering in report output', async () => {
  const cwd = standardWorkspace();
  const { lines } = await runCheck({ cwd });
  const coreRow = lines.findIndex((line) => line.startsWith('@zokizuan/satori-core'));
  const mcpRow = lines.findIndex((line) => line.startsWith('@zokizuan/satori-mcp'));
  const cliRow = lines.findIndex((line) => line.startsWith('@zokizuan/satori-cli'));
  assert.ok(coreRow >= 0 && mcpRow > coreRow && cliRow > mcpRow);
  const graphHeader = lines.findIndex((line) => line === 'Packed dependency graph');
  assert.deepEqual(lines.slice(graphHeader + 1, graphHeader + 4), [
    '@zokizuan/satori-mcp -> @zokizuan/satori-core@3.6.0',
    '@zokizuan/satori-cli -> @zokizuan/satori-mcp@6.8.0',
    '@zokizuan/satori-cli -> @zokizuan/satori-core@3.6.0',
  ]);
});

test('temporary directories are removed on success', async () => {
  const cwd = standardWorkspace();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  await runCheck({ cwd, tempRoot });
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

test('temporary directories are removed on failure', async () => {
  const cwd = standardWorkspace();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  const manifests = localManifests();
  const publishedCli = { ...manifests.cli, dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.7.0' } };
  await assert.rejects(
    runCheck({
      cwd,
      tempRoot,
      publishedByName: {
        '@zokizuan/satori-core': { packedSnapshot: snapshotFor(manifests.core), packedManifest: manifests.core },
        '@zokizuan/satori-mcp': { packedSnapshot: snapshotFor(manifests.mcp), packedManifest: manifests.mcp },
        '@zokizuan/satori-cli': { packedSnapshot: snapshotFor(publishedCli), packedManifest: publishedCli },
      },
    }),
    /Release graph invalid\./
  );
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

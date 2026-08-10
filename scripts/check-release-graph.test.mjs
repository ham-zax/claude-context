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
  return ({ packageName, workDirectory }) => {
    const key = { '@zokizuan/satori-core': 'core', '@zokizuan/satori-mcp': 'mcp', '@zokizuan/satori-cli': 'cli' }[packageName];
    fs.mkdirSync(workDirectory, { recursive: true });
    const tarballPath = path.join(workDirectory, `${key}.tgz`);
    fs.writeFileSync(tarballPath, JSON.stringify(manifests[key]));
    return { manifest: manifests[key], snapshot: snapshotFor(manifests[key]), tarballPath };
  };
}

const VERSION_BY_NAME = Object.freeze({
  '@zokizuan/satori-core': '3.6.0',
  '@zokizuan/satori-mcp': '6.8.0',
  '@zokizuan/satori-cli': '1.9.0',
});

function defaultRegistryVersions(publishedByName) {
  return (packageName) => {
    if (!Object.prototype.hasOwnProperty.call(publishedByName, packageName)) {
      return [];
    }
    return [VERSION_BY_NAME[packageName]];
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
  const publishedByName = options.publishedByName || {};
  const result = await checkReleaseGraph({
    cwd: options.cwd,
    tempRoot,
    output: (line) => lines.push(line),
    packLocalImpl: options.packLocalImpl || defaultPackLocal(),
    fetchPublishedImpl: options.fetchPublishedImpl || stubFetch(publishedByName),
    listPublishedStableVersionsImpl: options.listPublishedStableVersionsImpl
      || defaultRegistryVersions(publishedByName),
    keepTempDirectory: options.keepTempDirectory,
  });
  return { result, lines, tempRoot };
}

async function captureInvalidCheck(options = {}) {
  const lines = [];
  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  const publishedByName = options.publishedByName || {};
  const base = {
    cwd: options.cwd,
    tempRoot,
    output: (line) => lines.push(line),
    packLocalImpl: options.packLocalImpl || defaultPackLocal(),
    fetchPublishedImpl: options.fetchPublishedImpl || stubFetch(publishedByName),
    listPublishedStableVersionsImpl: options.listPublishedStableVersionsImpl
      || defaultRegistryVersions(publishedByName),
  };
  let error = null;
  try {
    await checkReleaseGraph(base);
  } catch (caught) {
    error = caught;
  }
  return { error, lines, tempRoot };
}

function packLocalFrom(manifestsByName) {
  return ({ packageName }) => ({
    manifest: manifestsByName[packageName],
    snapshot: snapshotFor(manifestsByName[packageName]),
  });
}

function rowFor(lines, name) {
  return lines.find((line) => line.startsWith(name));
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

test('unpublished local version must be newer than the registry maximum', async () => {
  const cwd = standardWorkspace();
  const { error, lines } = await captureInvalidCheck({
    cwd,
    listPublishedStableVersionsImpl: (packageName) => (
      packageName === '@zokizuan/satori-core' ? ['3.7.0'] : []
    ),
  });
  assert.match(error?.message || '', /Release graph invalid/);
  assert.match(rowFor(lines, '@zokizuan/satori-core'), /non-monotonic-version/);
  assert.equal(lines.some((line) => /registry maximum 3\.7\.0/.test(line)), true);
});

test('published-identical local version cannot trail the registry maximum', async () => {
  const cwd = standardWorkspace();
  const coreManifest = localManifests().core;
  const { error, lines } = await captureInvalidCheck({
    cwd,
    publishedByName: {
      '@zokizuan/satori-core': {
        packedSnapshot: snapshotFor(coreManifest),
        packedManifest: coreManifest,
      },
    },
    listPublishedStableVersionsImpl: (packageName) => (
      packageName === '@zokizuan/satori-core' ? ['3.6.0', '3.7.0'] : []
    ),
  });
  assert.match(error?.message || '', /Release graph invalid/);
  assert.match(rowFor(lines, '@zokizuan/satori-core'), /superseded-version/);
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

test('kept verification directory retains the exact verified tarballs', async () => {
  const cwd = standardWorkspace();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  const { result } = await runCheck({ cwd, tempRoot, keepTempDirectory: true });
  assert.equal(result.valid, true);
  assert.ok(remainingTempChildren(tempRoot).length > 0);
  for (const key of ['core', 'mcp', 'cli']) {
    assert.ok(fs.existsSync(result.tarballs[key]), `${key} tarball must exist on disk`);
    assert.ok(result.tarballs[key].startsWith(result.tempDirectory), `${key} tarball must live in the verification temp directory`);
  }
  fs.rmSync(result.tempDirectory, { recursive: true, force: true });
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

test('ordinary verification does not return deleted temporary paths', async () => {
  const cwd = standardWorkspace();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  const { result } = await runCheck({ cwd, tempRoot });
  assert.equal(Object.hasOwn(result, 'tarballs'), false);
  assert.equal(Object.hasOwn(result, 'tempDirectory'), false);
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

test('failed verification removes its temp directory even when keeping was requested', async () => {
  const cwd = standardWorkspace();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
  const manifests = localManifests();
  const publishedCli = { ...manifests.cli, dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.7.0' } };
  await assert.rejects(
    runCheck({
      cwd,
      tempRoot,
      keepTempDirectory: true,
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

test('Core change cannot silently reuse already-published downstream versions', async () => {
  const cwd = createWorkspace({
    'packages/core/package.json': { name: '@zokizuan/satori-core', version: '3.6.0' },
    'packages/mcp/package.json': {
      name: '@zokizuan/satori-mcp',
      version: '6.7.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*' },
    },
    'packages/cli/package.json': {
      name: '@zokizuan/satori-cli',
      version: '1.8.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*', '@zokizuan/satori-mcp': 'workspace:*' },
    },
    'server.json': { version: '6.7.0' },
  });
  const localByName = {
    '@zokizuan/satori-core': { name: '@zokizuan/satori-core', version: '3.6.0', dependencies: {} },
    '@zokizuan/satori-mcp': {
      name: '@zokizuan/satori-mcp',
      version: '6.7.0',
      dependencies: { '@zokizuan/satori-core': '3.6.0' },
    },
    '@zokizuan/satori-cli': {
      name: '@zokizuan/satori-cli',
      version: '1.8.0',
      dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.7.0' },
    },
  };
  const publishedMcp = { ...localByName['@zokizuan/satori-mcp'], dependencies: { '@zokizuan/satori-core': '3.5.0' } };
  const publishedCli = {
    ...localByName['@zokizuan/satori-cli'],
    dependencies: { '@zokizuan/satori-core': '3.5.0', '@zokizuan/satori-mcp': '6.7.0' },
  };
  const { error, lines, tempRoot } = await captureInvalidCheck({
    cwd,
    packLocalImpl: packLocalFrom(localByName),
    publishedByName: {
      '@zokizuan/satori-mcp': { packedSnapshot: snapshotFor(publishedMcp), packedManifest: publishedMcp },
      '@zokizuan/satori-cli': { packedSnapshot: snapshotFor(publishedCli), packedManifest: publishedCli },
    },
  });
  assert.match(error.message, /Release graph invalid\./);
  assert.match(rowFor(lines, '@zokizuan/satori-core'), /unpublished/);
  assert.match(rowFor(lines, '@zokizuan/satori-mcp'), /stale-version/);
  assert.match(rowFor(lines, '@zokizuan/satori-cli'), /stale-version/);
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

test('MCP change cannot silently reuse an already-published CLI version', async () => {
  const cwd = createWorkspace({
    'packages/core/package.json': { name: '@zokizuan/satori-core', version: '3.6.0' },
    'packages/mcp/package.json': {
      name: '@zokizuan/satori-mcp',
      version: '6.8.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*' },
    },
    'packages/cli/package.json': {
      name: '@zokizuan/satori-cli',
      version: '1.8.0',
      dependencies: { '@zokizuan/satori-core': 'workspace:*', '@zokizuan/satori-mcp': 'workspace:*' },
    },
    'server.json': { version: '6.8.0' },
  });
  const localByName = {
    '@zokizuan/satori-core': { name: '@zokizuan/satori-core', version: '3.6.0', dependencies: {} },
    '@zokizuan/satori-mcp': {
      name: '@zokizuan/satori-mcp',
      version: '6.8.0',
      dependencies: { '@zokizuan/satori-core': '3.6.0' },
    },
    '@zokizuan/satori-cli': {
      name: '@zokizuan/satori-cli',
      version: '1.8.0',
      dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.8.0' },
    },
  };
  const publishedCli = {
    ...localByName['@zokizuan/satori-cli'],
    dependencies: { '@zokizuan/satori-core': '3.6.0', '@zokizuan/satori-mcp': '6.7.0' },
  };
  const { error, lines, tempRoot } = await captureInvalidCheck({
    cwd,
    packLocalImpl: packLocalFrom(localByName),
    publishedByName: {
      '@zokizuan/satori-core': {
        packedSnapshot: snapshotFor(localByName['@zokizuan/satori-core']),
        packedManifest: localByName['@zokizuan/satori-core'],
      },
      '@zokizuan/satori-cli': { packedSnapshot: snapshotFor(publishedCli), packedManifest: publishedCli },
    },
  });
  assert.match(error.message, /Release graph invalid\./);
  assert.match(rowFor(lines, '@zokizuan/satori-core'), /published-identical/);
  assert.match(rowFor(lines, '@zokizuan/satori-mcp'), /unpublished/);
  assert.match(rowFor(lines, '@zokizuan/satori-cli'), /stale-version/);
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

test('CLI-only change skips unchanged upstream packages', async () => {
  const cwd = standardWorkspace();
  const manifests = localManifests();
  const { result, lines, tempRoot } = await runCheck({
    cwd,
    publishedByName: {
      '@zokizuan/satori-core': { packedSnapshot: snapshotFor(manifests.core), packedManifest: manifests.core },
      '@zokizuan/satori-mcp': { packedSnapshot: snapshotFor(manifests.mcp), packedManifest: manifests.mcp },
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.packages.core.status, 'published-identical');
  assert.equal(result.packages.mcp.status, 'published-identical');
  assert.equal(result.packages.cli.status, 'unpublished');
  assert.match(rowFor(lines, '@zokizuan/satori-core'), /skip/);
  assert.match(rowFor(lines, '@zokizuan/satori-mcp'), /skip/);
  assert.match(rowFor(lines, '@zokizuan/satori-cli'), /publish/);
  assert.equal(lines[lines.length - 1], 'Release graph valid.');
  assert.equal(remainingTempChildren(tempRoot).length, 0);
});

for (const mode of ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'E401', 'malformed npm output']) {
  test(`registry failure ${mode} fails closed`, async () => {
    const cwd = standardWorkspace();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-check-tmp-'));
    const { error, lines, tempRoot: usedRoot } = await captureInvalidCheck({
      cwd,
      tempRoot,
      fetchPublishedImpl: () => {
        throw new Error(`registry unavailable: ${mode}`);
      },
    });
    assert.equal(usedRoot, tempRoot);
    assert.match(error.message, new RegExp(mode));
    assert.equal(error.message.includes('unpublished'), false);
    assert.equal(remainingTempChildren(tempRoot).length, 0);
    assert.ok(lines.length === 0);
  });
}

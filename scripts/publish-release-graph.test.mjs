import test from 'node:test';
import assert from 'node:assert/strict';
import { publishReleaseGraph } from './publish-release-graph.mjs';

const NAMES = {
  core: '@zokizuan/satori-core',
  mcp: '@zokizuan/satori-mcp',
  cli: '@zokizuan/satori-cli',
};

const VERSIONS = Object.freeze({ core: '3.6.0', mcp: '6.8.0', cli: '1.9.0' });

function fakeReport(statuses) {
  return {
    valid: Object.values(statuses).every((status) => status === 'unpublished' || status === 'published-identical'),
    packages: Object.fromEntries(
      Object.entries(statuses).map(([key, status]) => [
        key,
        { key, name: NAMES[key], localVersion: VERSIONS[key], status },
      ])
    ),
  };
}

function runnerOptions(extra = {}) {
  const published = [];
  const skipped = [];
  const publishCalls = [];
  const viewCalls = [];
  const sleepCalls = [];
  let coreVisibleAfter = 0;
  let mcpDependencies = { '@zokizuan/satori-core': VERSIONS.core };
  let cliDependencies = { '@zokizuan/satori-core': VERSIONS.core, '@zokizuan/satori-mcp': VERSIONS.mcp };
  const options = {
    log: extra.log || (() => {}),
    gitStatusImpl: extra.gitStatusImpl || (() => ''),
    branchImpl: extra.branchImpl || (() => 'master'),
    versionsCheckImpl: extra.versionsCheckImpl || (() => ''),
    buildImpl: extra.buildImpl || (() => ''),
    smokeMcpImpl: extra.smokeMcpImpl || (() => ''),
    smokeCliImpl: extra.smokeCliImpl || (() => ''),
    checkGraphImpl: extra.checkGraphImpl || (() => fakeReport({ core: 'unpublished', mcp: 'unpublished', cli: 'unpublished' })),
    publishImpl: extra.publishImpl || ((packageName) => {
      publishCalls.push(packageName);
      published.push(packageName);
    }),
    viewVersionImpl: extra.viewVersionImpl || ((packageName, version) => {
      viewCalls.push(`version:${packageName}@${version}`);
      if (packageName === '@zokizuan/satori-core' && viewCalls.length > coreVisibleAfter) {
        return version;
      }
      return version;
    }),
    viewDependenciesImpl: extra.viewDependenciesImpl || ((packageName, version) => {
      viewCalls.push(`deps:${packageName}@${version}`);
      if (packageName === '@zokizuan/satori-mcp') {
        return mcpDependencies;
      }
      return cliDependencies;
    }),
    sleepImpl: (milliseconds) => {
      sleepCalls.push(milliseconds);
      return Promise.resolve();
    },
  };
  options.records = { publishCalls, viewCalls, sleepCalls };
  return options;
}

test('all-unpublished graph publishes Core, MCP, CLI in order', async () => {
  const options = runnerOptions();
  const result = await publishReleaseGraph(options);
  assert.deepEqual(options.records.publishCalls, ['@zokizuan/satori-core', '@zokizuan/satori-mcp', '@zokizuan/satori-cli']);
  assert.deepEqual(result.published.map((entry) => entry.key), ['core', 'mcp', 'cli']);
  assert.deepEqual(result.skipped, []);
});

test('published-identical Core is skipped while MCP/CLI publish', async () => {
  const options = runnerOptions({
    checkGraphImpl: () => fakeReport({ core: 'published-identical', mcp: 'unpublished', cli: 'unpublished' }),
  });
  const result = await publishReleaseGraph(options);
  assert.deepEqual(options.records.publishCalls, ['@zokizuan/satori-mcp', '@zokizuan/satori-cli']);
  assert.deepEqual(result.skipped, ['core']);
});

test('CLI-only release skips Core and MCP', async () => {
  const options = runnerOptions({
    checkGraphImpl: () => fakeReport({ core: 'published-identical', mcp: 'published-identical', cli: 'unpublished' }),
  });
  const result = await publishReleaseGraph(options);
  assert.deepEqual(options.records.publishCalls, ['@zokizuan/satori-cli']);
  assert.deepEqual(result.skipped, ['core', 'mcp']);
});

test('stale graph publishes nothing', async () => {
  const options = runnerOptions({
    checkGraphImpl: () => {
      throw new Error('Release graph invalid.');
    },
  });
  await assert.rejects(publishReleaseGraph(options), /Release graph invalid/);
  assert.deepEqual(options.records.publishCalls, []);
});

test('dirty tree publishes nothing', async () => {
  const options = runnerOptions({ gitStatusImpl: () => ' M packages/core/package.json' });
  await assert.rejects(publishReleaseGraph(options), /Working tree is not clean/);
  assert.deepEqual(options.records.publishCalls, []);
});

test('non-master branch publishes nothing', async () => {
  const options = runnerOptions({ branchImpl: () => 'develop' });
  await assert.rejects(publishReleaseGraph(options), /expected master/);
  assert.deepEqual(options.records.publishCalls, []);
});

test('Core registry verification failure prevents MCP publish', async () => {
  const options = runnerOptions({
    viewVersionImpl: () => {
      throw { status: 1, stderr: 'npm error code E404\nversion not found' };
    },
  });
  await assert.rejects(publishReleaseGraph(options), /not visible on the registry/);
  assert.deepEqual(options.records.publishCalls, ['@zokizuan/satori-core']);
  assert.equal(options.records.sleepCalls.length, 11);
});

test('MCP dependency mismatch prevents CLI publish', async () => {
  const options = runnerOptions({
    viewDependenciesImpl: (packageName) => {
      if (packageName === '@zokizuan/satori-mcp') {
        return { '@zokizuan/satori-core': '3.5.0' };
      }
      return { '@zokizuan/satori-core': VERSIONS.core, '@zokizuan/satori-mcp': VERSIONS.mcp };
    },
  });
  await assert.rejects(publishReleaseGraph(options), /expected 3\.6\.0/);
  assert.deepEqual(options.records.publishCalls, ['@zokizuan/satori-core', '@zokizuan/satori-mcp']);
});

test('CLI dependency verification succeeds', async () => {
  const options = runnerOptions();
  const result = await publishReleaseGraph(options);
  assert.deepEqual(result.published.map((entry) => entry.key), ['core', 'mcp', 'cli']);
  const cliDepsCalls = options.records.viewCalls.filter((call) => call.includes('@zokizuan/satori-cli') && call.startsWith('deps:'));
  assert.equal(cliDepsCalls.length, 1);
});

test('publish command failure reports already-published packages', async () => {
  const recordedCalls = [];
  const options = runnerOptions({
    publishImpl: (packageName) => {
      recordedCalls.push(packageName);
      if (packageName === '@zokizuan/satori-mcp') {
        throw new Error('EPUBLISHCONFLICT');
      }
    },
  });
  await assert.rejects(
    publishReleaseGraph(options),
    /Publish command failed for @zokizuan\/satori-mcp@6\.8\.0\. Already published: @zokizuan\/satori-core@3\.6\.0/
  );
  assert.deepEqual(recordedCalls, ['@zokizuan/satori-core', '@zokizuan/satori-mcp']);
});

test('registry visibility retries are bounded', async () => {
  const recordedVersionCalls = [];
  const options = runnerOptions({
    viewVersionImpl: (packageName, version) => {
      recordedVersionCalls.push(`${packageName}@${version}`);
      throw { status: 1, stderr: 'npm error code E404\nversion not found' };
    },
  });
  await assert.rejects(publishReleaseGraph(options), /not visible on the registry within 12 attempts/);
  assert.deepEqual(recordedVersionCalls, Array.from({ length: 12 }, () => '@zokizuan/satori-core@3.6.0'));
  assert.equal(options.records.sleepCalls.length, 11);
});

test('publish itself is never automatically retried', async () => {
  let mcpAttempts = 0;
  const options = runnerOptions({
    publishImpl: (packageName) => {
      if (packageName === '@zokizuan/satori-mcp') {
        mcpAttempts += 1;
        throw new Error('EPUBLISHCONFLICT');
      }
    },
  });
  await assert.rejects(publishReleaseGraph(options), /Publish command failed/);
  assert.equal(mcpAttempts, 1);
});

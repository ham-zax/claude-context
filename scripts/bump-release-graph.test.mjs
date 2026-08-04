import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeBumpPlan,
  applyReleaseBump,
  runReleaseBump,
  defaultIsVersionPublishedImpl,
} from './bump-release-graph.mjs';

function createWorkspace(files) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-bump-'));
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

const LOCAL_VERSIONS = Object.freeze({ core: '3.6.0', mcp: '6.8.0', cli: '1.9.0' });

function publishedSet(versions) {
  const published = new Set(versions);
  return (packageName, version) => {
    const key = { '@zokizuan/satori-core': 'core', '@zokizuan/satori-mcp': 'mcp', '@zokizuan/satori-cli': 'cli' }[packageName];
    return published.has(key) && version === LOCAL_VERSIONS[key];
  };
}

test('Core target closure includes all packages', () => {
  const plan = computeBumpPlan({
    target: 'core',
    bump: 'minor',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: () => false,
  });
  assert.deepEqual(plan.entries.map((entry) => entry.key), ['core', 'mcp', 'cli']);
});

test('MCP target closure includes MCP and CLI', () => {
  const plan = computeBumpPlan({
    target: 'mcp',
    bump: 'patch',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: () => false,
  });
  assert.deepEqual(plan.entries.map((entry) => entry.key), ['core', 'mcp', 'cli']);
  assert.equal(plan.entries.find((entry) => entry.key === 'core').to, '3.6.0');
  assert.equal(plan.entries.find((entry) => entry.key === 'core').reason, 'unchanged, not affected');
});

test('CLI target closure includes only CLI', () => {
  const plan = computeBumpPlan({
    target: 'cli',
    bump: 'patch',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: () => false,
  });
  assert.deepEqual(plan.entries.map((entry) => entry.key), ['core', 'mcp', 'cli']);
  assert.equal(plan.changed.length, 0);
  assert.equal(plan.mcpChanged, false);
});

test('published target receives the requested bump', () => {
  const plan = computeBumpPlan({
    target: 'core',
    bump: 'minor',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: publishedSet(['core']),
  });
  const core = plan.entries.find((entry) => entry.key === 'core');
  assert.equal(core.to, '3.7.0');
  assert.equal(core.reason, 'bumped minor');
});

test('unpublished target remains unchanged', () => {
  const plan = computeBumpPlan({
    target: 'core',
    bump: 'minor',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: () => false,
  });
  assert.equal(plan.changed.length, 0);
  assert.equal(plan.entries.find((entry) => entry.key === 'core').reason, 'unchanged, already unpublished');
});

test('published downstream receives a patch bump', () => {
  const plan = computeBumpPlan({
    target: 'core',
    bump: 'minor',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: publishedSet(['core', 'mcp']),
  });
  const core = plan.entries.find((entry) => entry.key === 'core');
  const mcp = plan.entries.find((entry) => entry.key === 'mcp');
  const cli = plan.entries.find((entry) => entry.key === 'cli');
  assert.equal(core.to, '3.7.0');
  assert.equal(mcp.to, '6.8.1');
  assert.equal(mcp.reason, 'bumped patch for downstream pin');
  assert.equal(cli.to, '1.9.0');
  assert.equal(cli.reason, 'unchanged, already unpublished');
});

test('downstream patch collision increments until unpublished', () => {
  const isPublished = (packageName, version) => {
    if (packageName === '@zokizuan/satori-mcp') {
      return version === '6.8.0' || version === '6.8.1';
    }
    if (packageName === '@zokizuan/satori-core') {
      return version === '3.6.0';
    }
    return false;
  };
  const plan = computeBumpPlan({
    target: 'core',
    bump: 'minor',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: isPublished,
  });
  const core = plan.entries.find((entry) => entry.key === 'core');
  const mcp = plan.entries.find((entry) => entry.key === 'mcp');
  assert.equal(core.to, '3.7.0');
  assert.equal(mcp.to, '6.8.2');
});

test('unpublished downstream remains unchanged', () => {
  const plan = computeBumpPlan({
    target: 'core',
    bump: 'minor',
    localVersions: LOCAL_VERSIONS,
    isVersionPublishedImpl: publishedSet(['core']),
  });
  const mcp = plan.entries.find((entry) => entry.key === 'mcp');
  const cli = plan.entries.find((entry) => entry.key === 'cli');
  assert.equal(mcp.to, '6.8.0');
  assert.equal(cli.to, '1.9.0');
  assert.equal(mcp.reason, 'unchanged, already unpublished');
});

test('unknown target or bump is rejected', () => {
  assert.throws(
    () => computeBumpPlan({ target: 'unknown', bump: 'minor', localVersions: LOCAL_VERSIONS, isVersionPublishedImpl: () => false }),
    /Unknown release target/
  );
  assert.throws(
    () => computeBumpPlan({ target: 'core', bump: 'prerelease', localVersions: LOCAL_VERSIONS, isVersionPublishedImpl: () => false }),
    /Unknown bump kind/
  );
});

function recordedRunner(extra = {}) {
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args });
    if (command === 'pnpm' && args.includes('manifest:generate')) {
      if (extra.manifestWritesServerJson) {
        const cwd = (extra.cwd && extra.cwd()) || (options && options.cwd);
        if (!cwd) {
          throw new Error('manifest:generate stub requires a cwd');
        }
        const serverJsonPath = path.join(cwd, 'server.json');
        const manifest = JSON.parse(fs.readFileSync(serverJsonPath, 'utf8'));
        manifest.version = '6.8.1';
        fs.writeFileSync(serverJsonPath, JSON.stringify(manifest, null, 2));
      }
      return '';
    }
    return '';
  };
  runner.calls = calls;
  return runner;
}

function bumpOptions(cwd, extra = {}) {
  const execFileSyncImpl = extra.execFileSyncImpl || recordedRunner(extra);
  return {
    cwd,
    argv: extra.argv || ['core', 'minor', '--apply'],
    execFileSyncImpl,
    output: () => {},
    isVersionPublishedImpl: extra.isVersionPublishedImpl || publishedSet(['core', 'mcp', 'cli']),
    gitStatusImpl: extra.gitStatusImpl || (() => ''),
    versionsCheckImpl: extra.versionsCheckImpl || (() => ''),
    manifestGenerateImpl: extra.manifestGenerateImpl || (() => execFileSyncImpl('pnpm', ['-C', 'packages/mcp', 'manifest:generate'], { cwd })),
  };
}

function readJson(cwd, relative) {
  return JSON.parse(fs.readFileSync(path.join(cwd, relative), 'utf8'));
}

test('preview performs no writes', async () => {
  const cwd = standardWorkspace();
  const runner = recordedRunner();
  await runReleaseBump(bumpOptions(cwd, {
    argv: ['core', 'minor'],
    execFileSyncImpl: runner,
    isVersionPublishedImpl: publishedSet(['core', 'mcp', 'cli']),
  }));
  assert.deepEqual(readJson(cwd, 'packages/core/package.json').version, '3.6.0');
  assert.deepEqual(readJson(cwd, 'packages/mcp/package.json').version, '6.8.0');
  assert.deepEqual(readJson(cwd, 'packages/cli/package.json').version, '1.9.0');
  assert.deepEqual(readJson(cwd, 'server.json').version, '6.8.0');
  assert.equal(runner.calls.length, 0);
});

test('apply writes exact versions', async () => {
  const cwd = standardWorkspace();
  const runner = recordedRunner();
  await runReleaseBump(bumpOptions(cwd, {
    argv: ['core', 'minor', '--apply'],
    execFileSyncImpl: runner,
    isVersionPublishedImpl: publishedSet(['core', 'mcp', 'cli']),
  }));
  assert.deepEqual(readJson(cwd, 'packages/core/package.json').version, '3.7.0');
  assert.deepEqual(readJson(cwd, 'packages/mcp/package.json').version, '6.8.1');
  assert.deepEqual(readJson(cwd, 'packages/cli/package.json').version, '1.9.1');
  assert.deepEqual(readJson(cwd, 'packages/mcp/package.json').dependencies, { '@zokizuan/satori-core': 'workspace:*' });
  assert.deepEqual(readJson(cwd, 'packages/cli/package.json').dependencies['@zokizuan/satori-mcp'], 'workspace:*');
});

test('MCP bump regenerates server.json', async () => {
  const cwd = standardWorkspace();
  const execFileSyncImpl = recordedRunner();
  await runReleaseBump(bumpOptions(cwd, {
    argv: ['mcp', 'patch', '--apply'],
    execFileSyncImpl,
    isVersionPublishedImpl: publishedSet(['mcp', 'cli']),
  }));
  const generateCalls = execFileSyncImpl.calls.filter((call) => call.args.includes('manifest:generate'));
  assert.equal(generateCalls.length, 1);
  assert.deepEqual(generateCalls[0].args, ['-C', 'packages/mcp', 'manifest:generate']);
});

test('CLI-only bump does not touch server.json', async () => {
  const cwd = standardWorkspace();
  let generateCalls = 0;
  await runReleaseBump(bumpOptions(cwd, {
    argv: ['cli', 'patch', '--apply'],
    isVersionPublishedImpl: publishedSet(['cli']),
    manifestGenerateImpl: () => {
      generateCalls += 1;
      return '';
    },
  }));
  assert.equal(generateCalls, 0);
  assert.deepEqual(readJson(cwd, 'server.json').version, '6.8.0');
});

test('failure restores all package files', async () => {
  const cwd = standardWorkspace();
  const original = {
    core: fs.readFileSync(path.join(cwd, 'packages/core/package.json'), 'utf8'),
    mcp: fs.readFileSync(path.join(cwd, 'packages/mcp/package.json'), 'utf8'),
    cli: fs.readFileSync(path.join(cwd, 'packages/cli/package.json'), 'utf8'),
    serverJson: fs.readFileSync(path.join(cwd, 'server.json'), 'utf8'),
  };
  await assert.rejects(
    runReleaseBump(bumpOptions(cwd, {
      argv: ['core', 'minor', '--apply'],
      isVersionPublishedImpl: publishedSet(['core', 'mcp', 'cli']),
      manifestGenerateImpl: () => {
        const manifest = readJson(cwd, 'server.json');
        manifest.version = '6.8.1';
        fs.writeFileSync(path.join(cwd, 'server.json'), JSON.stringify(manifest, null, 2));
        return '';
      },
      versionsCheckImpl: () => {
        throw new Error('stale reference found');
      },
    })),
    /stale reference found/
  );
  assert.equal(fs.readFileSync(path.join(cwd, 'packages/core/package.json'), 'utf8'), original.core);
  assert.equal(fs.readFileSync(path.join(cwd, 'packages/mcp/package.json'), 'utf8'), original.mcp);
  assert.equal(fs.readFileSync(path.join(cwd, 'packages/cli/package.json'), 'utf8'), original.cli);
  assert.equal(fs.readFileSync(path.join(cwd, 'server.json'), 'utf8'), original.serverJson);
});

test('rerun is idempotent', async () => {
  const cwd = standardWorkspace();
  const runner = recordedRunner({ manifestWritesServerJson: true });
  await runReleaseBump(bumpOptions(cwd, {
    argv: ['core', 'minor', '--apply'],
    execFileSyncImpl: runner,
    isVersionPublishedImpl: publishedSet(['core', 'mcp', 'cli']),
  }));
  const second = await runReleaseBump(bumpOptions(cwd, {
    argv: ['core', 'minor', '--apply'],
    execFileSyncImpl: runner,
    isVersionPublishedImpl: publishedSet(['core', 'mcp', 'cli']),
  }));
  assert.equal(second.changed.length, 0);
  assert.deepEqual(readJson(cwd, 'packages/core/package.json').version, '3.7.0');
  assert.deepEqual(readJson(cwd, 'packages/mcp/package.json').version, '6.8.1');
  assert.deepEqual(readJson(cwd, 'packages/cli/package.json').version, '1.9.1');
});

test('prepared unpublished coordinated versions are not repeatedly bumped', async () => {
  const cwd = standardWorkspace();
  const runner = recordedRunner();
  const result = await runReleaseBump(bumpOptions(cwd, {
    argv: ['core', 'minor', '--apply'],
    execFileSyncImpl: runner,
    isVersionPublishedImpl: () => false,
  }));
  assert.equal(result.changed.length, 0);
  assert.deepEqual(readJson(cwd, 'packages/core/package.json').version, '3.6.0');
  assert.deepEqual(readJson(cwd, 'packages/mcp/package.json').version, '6.8.0');
  assert.deepEqual(readJson(cwd, 'packages/cli/package.json').version, '1.9.0');
  assert.deepEqual(readJson(cwd, 'server.json').version, '6.8.0');
  assert.equal(runner.calls.length, 0);
});

test('dirty worktree rejects apply', async () => {
  const cwd = standardWorkspace();
  const runner = recordedRunner();
  await assert.rejects(
    runReleaseBump(bumpOptions(cwd, {
      argv: ['core', 'minor', '--apply'],
      execFileSyncImpl: runner,
      isVersionPublishedImpl: publishedSet(['core', 'mcp', 'cli']),
      gitStatusImpl: () => ' M packages/core/package.json',
    })),
    /Working tree is not clean/
  );
  assert.equal(runner.calls.length, 0);
  assert.deepEqual(readJson(cwd, 'packages/core/package.json').version, '3.6.0');
});

test('defaultIsVersionPublishedImpl interprets 404 as unpublished and failures as errors', () => {
  const notFound = { status: 1, stderr: 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@zokizuan%2fsatori-core/3.6.0 - Not found' };
  const runner = (command, args) => {
    if (args[1].includes('3.6.0')) {
      throw notFound;
    }
    if (args[1].includes('6.8.0')) {
      throw { status: 1, stderr: 'npm error code ETIMEDOUT\nrequest failed' };
    }
    return '"1.9.0"';
  };
  const isPublished = defaultIsVersionPublishedImpl(runner);
  assert.equal(isPublished('@zokizuan/satori-core', '3.6.0'), false);
  assert.equal(isPublished('@zokizuan/satori-cli', '1.9.0'), true);
  assert.throws(() => isPublished('@zokizuan/satori-mcp', '6.8.0'), /Cannot verify/);
});

test('usage errors exit with usage message', async () => {
  const cwd = standardWorkspace();
  await assert.rejects(
    runReleaseBump(bumpOptions(cwd, { argv: ['core'] })),
    /Usage:/
  );
  await assert.rejects(
    runReleaseBump(bumpOptions(cwd, { argv: [] })),
    /Usage:/
  );
});

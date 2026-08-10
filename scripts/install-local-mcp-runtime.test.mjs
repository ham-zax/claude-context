import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import {
  buildLauncherScript,
  installLocalMcpRuntime,
  parseArgs,
} from './install-local-mcp-runtime.mjs';
import { parseManagedLauncherEnvironment } from '../packages/cli/src/managed-launcher-script.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'satori-local-mcp-test-'));
}

function isProcessLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readChildPid(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for local runtime child PID.')), 5_000);
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = stdout.match(/SATORI_TEST_CHILD_PID=(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
  });
}

test('parseArgs supports local install options', () => {
  const parsed = parseArgs(['--', '--no-build', '--home', '/tmp/satori-home', '--node', '/usr/bin/node']);

  assert.equal(parsed.noBuild, true);
  assert.equal(parsed.homeDir, '/tmp/satori-home');
  assert.equal(parsed.nodePath, '/usr/bin/node');
});

test('buildLauncherScript forwards argv to the local runtime', () => {
  const script = buildLauncherScript({
    command: '/usr/bin/node',
    args: ['/repo/packages/mcp/dist/index.js'],
  });

  assert.match(script, /const command = "\/usr\/bin\/node"/);
  assert.match(script, /\/repo\/packages\/mcp\/dist\/index\.js/);
  assert.match(script, /\.\.\.process\.argv\.slice\(2\)/);
});

test('local launcher forwards SIGTERM and reaps its runtime child', {
  skip: process.platform === 'win32' ? 'POSIX signal forwarding is not observable on Windows' : false,
}, async () => {
  const tempDir = makeTempDir();
  const launcherPath = path.join(tempDir, 'launcher.cjs');
  const runtimeCode = [
    'console.log(`SATORI_TEST_CHILD_PID=${process.pid}`);',
    'process.on("SIGTERM", () => process.exit(0));',
    'setInterval(() => {}, 1_000);',
  ].join('');
  fs.writeFileSync(launcherPath, buildLauncherScript({
    command: process.execPath,
    args: ['-e', runtimeCode],
  }), 'utf8');

  const launcher = spawn(process.execPath, [launcherPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let childPid;
  try {
    childPid = await readChildPid(launcher);
    launcher.kill('SIGTERM');
    const [, signal] = await once(launcher, 'exit');
    assert.equal(signal, 'SIGTERM');
    assert.equal(isProcessLive(childPid), false, `runtime child ${childPid} survived launcher SIGTERM`);
  } finally {
    if (childPid && isProcessLive(childPid)) {
      process.kill(childPid, 'SIGKILL');
    }
    if (launcher.exitCode === null && launcher.signalCode === null) {
      launcher.kill('SIGKILL');
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('local launcher force-kills a child that ignores SIGTERM after grace', {
  skip: process.platform === 'win32' ? 'POSIX signal forwarding is not observable on Windows' : false,
}, async () => {
  const tempDir = makeTempDir();
  const launcherPath = path.join(tempDir, 'launcher.cjs');
  const runtimeCode = [
    'console.log(`SATORI_TEST_CHILD_PID=${process.pid}`);',
    'process.on("SIGTERM", () => {});',
    'setInterval(() => {}, 1_000);',
  ].join('');
  fs.writeFileSync(launcherPath, buildLauncherScript({
    command: process.execPath,
    args: ['-e', runtimeCode],
    shutdownGraceMs: 200,
  }), 'utf8');

  const launcher = spawn(process.execPath, [launcherPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let childPid;
  try {
    childPid = await readChildPid(launcher);
    launcher.kill('SIGTERM');
    const [, signal] = await once(launcher, 'exit');
    assert.equal(signal, 'SIGTERM');
    assert.equal(isProcessLive(childPid), false, `runtime child ${childPid} survived launcher SIGTERM`);
  } finally {
    if (childPid && isProcessLive(childPid)) {
      process.kill(childPid, 'SIGKILL');
    }
    if (launcher.exitCode === null && launcher.signalCode === null) {
      launcher.kill('SIGKILL');
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('buildLauncherScript embeds SIGKILL grace path', () => {
  const script = buildLauncherScript({
    command: '/usr/bin/node',
    args: ['/repo/packages/mcp/dist/index.js'],
    shutdownGraceMs: 1234,
  });

  assert.match(script, /const shutdownGraceMs = 1234/);
  assert.match(script, /child\.kill\("SIGKILL"\)/);
  assert.match(script, /forwardShutdown/);
});

test('installLocalMcpRuntime writes launcher pointing at repo dist entry', () => {
  const repoRoot = makeTempDir();
  const homeDir = makeTempDir();
  const runtimeEntry = path.join(repoRoot, 'packages', 'mcp', 'dist', 'index.js');
  fs.mkdirSync(path.dirname(runtimeEntry), { recursive: true });
  fs.writeFileSync(runtimeEntry, '#!/usr/bin/env node\n', 'utf8');
  const messages = [];

  const result = installLocalMcpRuntime({
    repoRoot,
    homeDir,
    nodePath: '/usr/bin/node',
    noBuild: true,
    logger: { log: (message) => messages.push(message) },
  });
  const launcher = fs.readFileSync(result.launcherPath, 'utf8');

  assert.equal(result.runtimeEntry, runtimeEntry);
  assert.equal(result.launcherPath, path.join(homeDir, '.satori', 'bin', 'satori-mcp.js'));
  assert.match(launcher, /\/usr\/bin\/node/);
  assert.match(launcher, new RegExp(runtimeEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(parseManagedLauncherEnvironment(launcher), {});
  assert.equal(fs.statSync(result.launcherPath).mode & 0o755, 0o755);
  assert.equal(messages.some((message) => message.includes('Restart your MCP client')), true);
});

const managedEnvironmentCases = [
  {
    name: 'offline Potion environment',
    managedEnv: {
      SATORI_RUNTIME_PROFILE: 'offline',
      VECTOR_STORE_PROVIDER: 'LanceDB',
      LANCEDB_PATH: '/var/lib/satori/lancedb',
      EMBEDDING_PROVIDER: 'Potion',
      EMBEDDING_MODEL: 'minishlab/potion-code-16M-v2',
      EMBEDDING_OUTPUT_DIMENSION: '256',
      POTION_HELPER_PATH: '/var/lib/satori/potion/helper.js',
      POTION_MODEL_PATH: '/var/lib/satori/potion/model',
      POTION_REQUEST_TIMEOUT_MS: '30000',
    },
  },
  {
    name: 'connected VoyageAI environment',
    managedEnv: {
      SATORI_RUNTIME_PROFILE: 'connected',
      VECTOR_STORE_PROVIDER: 'LanceDB',
      LANCEDB_PATH: '/var/lib/satori/lancedb',
      EMBEDDING_PROVIDER: 'VoyageAI',
      EMBEDDING_MODEL: 'voyage-code-3',
      EMBEDDING_OUTPUT_DIMENSION: '1024',
    },
  },
  {
    name: 'empty managed environment',
    managedEnv: {},
  },
];

for (const { name, managedEnv } of managedEnvironmentCases) {
  test(`installLocalMcpRuntime preserves ${name}`, () => {
    const repoRoot = makeTempDir();
    const homeDir = makeTempDir();
    const runtimeEntry = path.join(repoRoot, 'packages', 'mcp', 'dist', 'index.js');
    const launcherPath = path.join(homeDir, '.satori', 'bin', 'satori-mcp.js');
    fs.mkdirSync(path.dirname(runtimeEntry), { recursive: true });
    fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
    fs.writeFileSync(runtimeEntry, '#!/usr/bin/env node\n', 'utf8');
    fs.writeFileSync(launcherPath, buildLauncherScript({
      command: '/usr/bin/old-node',
      args: ['/old/packages/mcp/dist/index.js'],
      managedEnv,
    }), 'utf8');

    try {
      installLocalMcpRuntime({
        repoRoot,
        homeDir,
        nodePath: '/usr/bin/node',
        noBuild: true,
        logger: { log: () => {} },
      });

      const launcher = fs.readFileSync(launcherPath, 'utf8');
      assert.match(launcher, /const command = "\/usr\/bin\/node"/);
      assert.match(launcher, new RegExp(runtimeEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.deepEqual(parseManagedLauncherEnvironment(launcher), managedEnv);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
}

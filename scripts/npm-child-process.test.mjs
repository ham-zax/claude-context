import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpmChildEnvironment, REGISTRY_PROBE_STDIO } from './npm-child-process.mjs';

const PNPM_ONLY_ENV_KEYS = Object.freeze([
  'npm_config__jsr_registry',
  'npm_config_auto_install_peers',
  'npm_config_cache_dir',
  'npm_config_child_concurrency',
  'npm_config_dedupe_peer_dependents',
  'npm_config_ignore_workspace_root_check',
  'npm_config_npm_globalconfig',
  'npm_config_prefer_frozen_lockfile',
  'npm_config_shell_emulator',
  'npm_config_store_dir',
  'npm_config_verify_deps_before_run',
]);

function parentWithPnpmVars() {
  return Object.fromEntries(PNPM_ONLY_ENV_KEYS.map((key) => [key, '1']));
}

test('sanitized environment drops pnpm-only npm config variables', () => {
  const parent = {
    ...parentWithPnpmVars(),
    PATH: '/usr/bin',
    HOME: '/home/user',
    NPM_TOKEN: 'secret-token',
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_user_agent: 'pnpm/10.28.2',
    CUSTOM_KEY: 'kept',
  };
  const child = createNpmChildEnvironment(parent);
  for (const key of PNPM_ONLY_ENV_KEYS) {
    assert.equal(key in child, false, `${key} must be removed from the child environment`);
  }
  assert.equal(child.PATH, '/usr/bin');
  assert.equal(child.HOME, '/home/user');
  assert.equal(child.NPM_TOKEN, 'secret-token');
  assert.equal(child.npm_config_registry, 'https://registry.npmjs.org/');
  assert.equal(child.npm_config_user_agent, 'pnpm/10.28.2');
  assert.equal(child.CUSTOM_KEY, 'kept');
});

test('sanitized environment returns a new object and never mutates the parent', () => {
  const parent = { ...parentWithPnpmVars(), PATH: '/bin' };
  const child = createNpmChildEnvironment(parent);
  assert.notEqual(child, parent);
  assert.equal(Object.keys(parent).length, PNPM_ONLY_ENV_KEYS.length + 1);
  for (const key of PNPM_ONLY_ENV_KEYS) {
    assert.equal(parent[key], '1');
  }
});

test('sanitized environment handles empty and default parents', () => {
  assert.deepEqual(createNpmChildEnvironment({}), {});
  const child = createNpmChildEnvironment();
  assert.notEqual(child, process.env);
  assert.equal(child.PATH, process.env.PATH);
  for (const key of PNPM_ONLY_ENV_KEYS) {
    assert.equal(key in child, false);
  }
});

test('registry probe stdio remains captured', () => {
  assert.deepEqual(REGISTRY_PROBE_STDIO, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(Object.freeze(['ignore', 'pipe', 'pipe']), REGISTRY_PROBE_STDIO);
});

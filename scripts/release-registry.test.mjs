import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_NPM_REGISTRY,
  PRODUCTION_NPM_TAG,
  createReleaseRegistryClient,
  registryMaxStableVersion,
  verifyPublishedIdenticalLatest,
  verifyReleaseRegistry,
} from './release-registry.mjs';

const LOCAL_VERSIONS = Object.freeze({ core: '3.6.1', mcp: '6.8.2', cli: '1.9.3' });

test('registry client pins production registry and returns sorted stable versions', () => {
  const calls = [];
  const client = createReleaseRegistryClient({
    cwd: '/repo',
    execFileSyncImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return JSON.stringify(['3.10.0', '3.9.9', '4.0.0-beta.1', '3.6.1']);
    },
  });

  const versions = client.listStableVersions('@zokizuan/satori-core');
  assert.deepEqual(versions, ['3.6.1', '3.9.9', '3.10.0']);
  assert.equal(registryMaxStableVersion(['3.10.0', '3.6.1', '3.9.9']), '3.10.0');
  assert.deepEqual(calls[0].args.slice(-2), ['--registry', PRODUCTION_NPM_REGISTRY]);
});

test('registry client normalizes npm 11 and npm 12 view output shapes', () => {
  for (const versionOutput of ['3.6.1', ['3.6.1']]) {
    const client = createReleaseRegistryClient({
      execFileSyncImpl: () => JSON.stringify(versionOutput),
    });
    assert.equal(client.viewVersion('@zokizuan/satori-core', '3.6.1'), '3.6.1');
  }

  const dependencies = { '@zokizuan/satori-core': '3.6.1' };
  for (const dependenciesOutput of [dependencies, [dependencies]]) {
    const client = createReleaseRegistryClient({
      execFileSyncImpl: () => JSON.stringify(dependenciesOutput),
    });
    assert.deepEqual(
      client.viewDependencies('@zokizuan/satori-mcp', '6.8.2'),
      dependencies,
    );
  }

  for (const versionsOutput of [
    ['3.6.0', '3.6.1'],
    [['3.6.0', '3.6.1']],
    ['3.6.1'],
  ]) {
    const client = createReleaseRegistryClient({
      execFileSyncImpl: () => JSON.stringify(versionsOutput),
    });
    assert.deepEqual(
      client.listStableVersions('@zokizuan/satori-core'),
      versionsOutput.flat(),
    );
  }
});

test('registry version listing fails closed on malformed structured output', () => {
  for (const output of [{ versions: ['3.6.1'] }, ['3.6.1', null]]) {
    const client = createReleaseRegistryClient({
      execFileSyncImpl: () => JSON.stringify(output),
    });
    assert.throws(
      () => client.listStableVersions('@zokizuan/satori-core'),
      /Malformed npm view versions output/,
    );
  }
});

test('registry scalar and object queries fail closed on ambiguous npm output', () => {
  const versionClient = createReleaseRegistryClient({
    execFileSyncImpl: () => JSON.stringify(['3.6.0', '3.6.1']),
  });
  assert.throws(
    () => versionClient.viewVersion('@zokizuan/satori-core', 'latest'),
    /expected one version string/,
  );

  const dependenciesClient = createReleaseRegistryClient({
    execFileSyncImpl: () => JSON.stringify([{ a: '1.0.0' }, { a: '2.0.0' }]),
  });
  assert.throws(
    () => dependenciesClient.viewDependencies('@zokizuan/satori-mcp', '6.8.2'),
    /expected one dependencies object/,
  );
});

test('release verification checks exact versions, latest tags, and dependency closure', async () => {
  const calls = [];
  const registryClient = {
    viewVersion(packageName, selector) {
      calls.push(`version:${packageName}@${selector}`);
      const key = packageName.endsWith('-core') ? 'core' : packageName.endsWith('-mcp') ? 'mcp' : 'cli';
      return LOCAL_VERSIONS[key];
    },
    viewDependencies(packageName) {
      calls.push(`dependencies:${packageName}`);
      return packageName.endsWith('-mcp')
        ? { '@zokizuan/satori-core': LOCAL_VERSIONS.core }
        : {
            '@zokizuan/satori-core': LOCAL_VERSIONS.core,
            '@zokizuan/satori-mcp': LOCAL_VERSIONS.mcp,
          };
    },
  };

  const result = await verifyReleaseRegistry({ localVersions: LOCAL_VERSIONS, registryClient });
  assert.equal(result.verified, true);
  for (const version of Object.values(LOCAL_VERSIONS)) {
    assert.equal(calls.some((call) => call.endsWith(`@${version}`)), true);
  }
  assert.equal(calls.filter((call) => call.endsWith(`@${PRODUCTION_NPM_TAG}`)).length, 3);
  assert.equal(calls.filter((call) => call.startsWith('dependencies:')).length, 2);
});

test('release verification rejects a stale latest tag', async () => {
  const registryClient = {
    viewVersion(packageName, selector) {
      if (packageName.endsWith('-cli') && selector === PRODUCTION_NPM_TAG) {
        return '1.9.2';
      }
      return packageName.endsWith('-core') ? LOCAL_VERSIONS.core : packageName.endsWith('-mcp') ? LOCAL_VERSIONS.mcp : LOCAL_VERSIONS.cli;
    },
    viewDependencies(packageName) {
      return packageName.endsWith('-mcp')
        ? { '@zokizuan/satori-core': LOCAL_VERSIONS.core }
        : { '@zokizuan/satori-core': LOCAL_VERSIONS.core, '@zokizuan/satori-mcp': LOCAL_VERSIONS.mcp };
    },
  };

  await assert.rejects(
    verifyReleaseRegistry({ localVersions: LOCAL_VERSIONS, registryClient }),
    /@zokizuan\/satori-cli@latest is "1\.9\.2"; expected 1\.9\.3/,
  );
});

test('published-identical latest preflight rejects stale tags before publication', () => {
  assert.throws(
    () => verifyPublishedIdenticalLatest({
      packageKeys: ['core'],
      localVersions: LOCAL_VERSIONS,
      registryClient: { viewVersion: () => '3.6.0' },
    }),
    /Cannot publish because @zokizuan\/satori-core@latest is "3\.6\.0"; expected skipped version 3\.6\.1/,
  );
});

test('final verification retries transient and propagating registry state', async () => {
  let firstLookup = true;
  let sleeps = 0;
  const registryClient = {
    viewVersion(packageName, selector) {
      if (firstLookup) {
        firstLookup = false;
        throw { status: 1, stderr: 'npm error code ECONNRESET' };
      }
      const key = packageName.endsWith('-core') ? 'core' : packageName.endsWith('-mcp') ? 'mcp' : 'cli';
      if (packageName.endsWith('-cli') && selector === PRODUCTION_NPM_TAG && sleeps === 1) {
        return '1.9.2';
      }
      return LOCAL_VERSIONS[key];
    },
    viewDependencies(packageName) {
      return packageName.endsWith('-mcp')
        ? { '@zokizuan/satori-core': LOCAL_VERSIONS.core }
        : { '@zokizuan/satori-core': LOCAL_VERSIONS.core, '@zokizuan/satori-mcp': LOCAL_VERSIONS.mcp };
    },
  };

  const result = await verifyReleaseRegistry({
    localVersions: LOCAL_VERSIONS,
    registryClient,
    attempts: 3,
    retryDelayMs: 0,
    sleepImpl: async () => { sleeps += 1; },
  });
  assert.equal(result.verified, true);
  assert.equal(sleeps, 2);
});

test('final verification fails immediately on authentication and malformed output', async () => {
  for (const registryClient of [
    {
      viewVersion() {
        throw { status: 1, stderr: 'npm error code E401 Unauthorized' };
      },
    },
    createReleaseRegistryClient({ execFileSyncImpl: () => JSON.stringify(['3.6.0', '3.6.1']) }),
  ]) {
    let sleeps = 0;
    await assert.rejects(
      verifyReleaseRegistry({
        localVersions: LOCAL_VERSIONS,
        registryClient,
        attempts: 3,
        retryDelayMs: 0,
        sleepImpl: async () => { sleeps += 1; },
      }),
      /Release registry verification failed/,
    );
    assert.equal(sleeps, 0);
  }
});

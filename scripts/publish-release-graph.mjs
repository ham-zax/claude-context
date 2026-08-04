import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { RELEASE_ORDER, RELEASE_PACKAGES } from './release-graph.mjs';
import { checkReleaseGraph } from './check-release-graph.mjs';

const REGISTRY_POLL_ATTEMPTS = 12;
const REGISTRY_POLL_INTERVAL_MS = 5000;

function parseJsonOutput(output, description) {
  try {
    return JSON.parse(String(output).trim());
  } catch (error) {
    throw new Error(`Malformed ${description}: ${JSON.stringify(String(output).trim())}`);
  }
}

function isRegistryNotFoundError(error) {
  return (
    error
    && typeof error === 'object'
    && error.status === 1
    && /E404|404\s+Not\s+Found|version\s+not\s+found/i.test(String(error.stderr || ''))
  );
}

export async function publishReleaseGraph(options = {}) {
  const cwd = options.cwd || process.cwd();
  const log = options.log || ((line) => console.log(line));
  const execFileSyncImpl = options.execFileSyncImpl || execFileSync;
  const gitStatusImpl = options.gitStatusImpl
    || (() => execFileSyncImpl('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }));
  const branchImpl = options.branchImpl
    || (() => execFileSyncImpl('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim());
  const versionsCheckImpl = options.versionsCheckImpl
    || (() => execFileSyncImpl('pnpm', ['run', 'versions:check'], { cwd, encoding: 'utf8' }));
  const buildImpl = options.buildImpl
    || (() => execFileSyncImpl('pnpm', ['run', 'build'], { cwd, encoding: 'utf8' }));
  const smokeMcpImpl = options.smokeMcpImpl
    || (() => execFileSyncImpl('pnpm', ['-C', 'packages/mcp', 'release:smoke'], { cwd, encoding: 'utf8' }));
  const smokeCliImpl = options.smokeCliImpl
    || (() => execFileSyncImpl('pnpm', ['-C', 'packages/cli', 'release:smoke'], { cwd, encoding: 'utf8' }));
  const checkGraphImpl = options.checkGraphImpl || ((checkCwd) => checkReleaseGraph({ cwd: checkCwd }));
  const publishImpl = options.publishImpl
    || ((packageName) => execFileSyncImpl(
      'pnpm',
      ['--filter', packageName, 'publish', '--access', 'public', '--no-git-checks'],
      { cwd, encoding: 'utf8' }
    ));
  const viewVersionImpl = options.viewVersionImpl
    || ((packageName, version) => {
      const output = execFileSyncImpl(
        'npm',
        ['view', `${packageName}@${version}`, 'version', '--json'],
        { cwd, encoding: 'utf8' }
      );
      return parseJsonOutput(output, `npm view output for ${packageName}@${version}`);
    });
  const viewDependenciesImpl = options.viewDependenciesImpl
    || ((packageName, version) => {
      const output = execFileSyncImpl(
        'npm',
        ['view', `${packageName}@${version}`, 'dependencies', '--json'],
        { cwd, encoding: 'utf8' }
      );
      return parseJsonOutput(output, `npm view dependencies for ${packageName}@${version}`);
    });
  const sleepImpl = options.sleepImpl || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  const status = String(gitStatusImpl()).trim();
  if (status !== '') {
    throw new Error(`Working tree is not clean; refusing to publish:\n${status}`);
  }
  const branch = String(branchImpl()).trim();
  if (branch !== 'master') {
    throw new Error(`Refusing to publish from branch ${JSON.stringify(branch)}; expected master`);
  }
  versionsCheckImpl();
  const report = checkGraphImpl(cwd);
  if (!report || !report.valid) {
    throw new Error('Release graph is invalid; refusing to publish.');
  }
  buildImpl();
  smokeMcpImpl();
  smokeCliImpl();

  const localVersions = Object.freeze(
    Object.fromEntries(RELEASE_ORDER.map((key) => [key, report.packages[key].localVersion]))
  );
  const toPublish = RELEASE_ORDER.filter((key) => report.packages[key].status === 'unpublished');
  const toSkip = RELEASE_ORDER.filter((key) => report.packages[key].status === 'published-identical');

  if (toPublish.length === 0) {
    log('All packages are published-identical; nothing to publish.');
    return { published: [], skipped: Object.freeze(toSkip) };
  }

  log(`Publishing in order: ${toPublish.map((key) => RELEASE_PACKAGES[key].name).join(' -> ')}`);
  const published = [];
  for (const key of toPublish) {
    const packageName = RELEASE_PACKAGES[key].name;
    const version = localVersions[key];
    log(`Publishing ${packageName}@${version}...`);
    try {
      publishImpl(packageName, version);
    } catch (error) {
      throw new Error(
        `Publish command failed for ${packageName}@${version}. Already published: ${published.map((entry) => `${entry.name}@${entry.version}`).join(', ') || 'none'}. ${error.message}`
      );
    }
    await verifyPublished(key, version, localVersions, {
      viewVersionImpl,
      viewDependenciesImpl,
      sleepImpl,
      log,
    });
    published.push({ key, name: packageName, version });
  }
  log('Release graph published.');
  return { published: Object.freeze(published), skipped: Object.freeze(toSkip) };
}

async function verifyPublished(key, version, localVersions, impls) {
  const { viewVersionImpl, viewDependenciesImpl, sleepImpl, log } = impls;
  const packageName = RELEASE_PACKAGES[key].name;
  for (let attempt = 1; attempt <= REGISTRY_POLL_ATTEMPTS; attempt += 1) {
    let visible = false;
    try {
      const registryVersion = viewVersionImpl(packageName, version);
      visible = registryVersion === version;
    } catch (error) {
      if (!isRegistryNotFoundError(error)) {
        throw new Error(
          `Registry verification failed for ${packageName}@${version} after publish: ${error.message}`
        );
      }
    }
    if (visible) {
      if (key === 'core') {
        return;
      }
      const dependencies = viewDependenciesImpl(packageName, version);
      if (key === 'mcp') {
        if (dependencies['@zokizuan/satori-core'] === localVersions.core) {
          return;
        }
        throw new Error(
          `Published ${packageName}@${version} dependency @zokizuan/satori-core is ${JSON.stringify(dependencies['@zokizuan/satori-core'])}, expected ${localVersions.core}`
        );
      }
      const corePin = dependencies['@zokizuan/satori-core'];
      const mcpPin = dependencies['@zokizuan/satori-mcp'];
      if (corePin === localVersions.core && mcpPin === localVersions.mcp) {
        return;
      }
      throw new Error(
        `Published ${packageName}@${version} dependency pins are @zokizuan/satori-core@${JSON.stringify(corePin)} and @zokizuan/satori-mcp@${JSON.stringify(mcpPin)}; expected ${localVersions.core} and ${localVersions.mcp}`
      );
    }
    if (attempt < REGISTRY_POLL_ATTEMPTS) {
      await sleepImpl(REGISTRY_POLL_INTERVAL_MS);
    }
  }
  throw new Error(
    `${packageName}@${version} was not visible on the registry within ${REGISTRY_POLL_ATTEMPTS} attempts`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length > 2) {
    console.error('Usage: node scripts/publish-release-graph.mjs');
    process.exit(2);
  }
  try {
    await publishReleaseGraph();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RELEASE_ORDER, RELEASE_PACKAGES } from './release-graph.mjs';
import { checkReleaseGraph } from './check-release-graph.mjs';
import { createNpmChildEnvironment, REGISTRY_PROBE_STDIO } from './npm-child-process.mjs';

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

const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function classifyRegistryError(error) {
  const text = `${errorMessage(error)}\n${String(error?.stderr || '')}\n${String(error?.stdout || '')}`;
  if (/E401|E403|authentication|authorization|login required|permission denied/i.test(text)) {
    return 'auth';
  }
  if (/E404|404\s+Not\s+Found|version\s+not\s+found/i.test(text)) {
    return 'not-found';
  }
  if (/ETIMEDOUT|ECONNRESET|EAI_AGAIN|EAI_NODATA|EAI_NONAME|socket hang up|ECONNREFUSED|HTTP\s+5\d\d|status\s*[:=]\s*5\d\d/i.test(text)) {
    return 'transient';
  }
  return 'permanent';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isPathWithin(rootPath, candidatePath) {
  try {
    const relative = path.relative(fs.realpathSync(rootPath), fs.realpathSync(candidatePath));
    return relative.length > 0
      && relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

function formatEntries(entries) {
  return entries.map((entry) => `${entry.name}@${entry.version}`).join(', ') || 'none';
}

function validateReleaseReport(report) {
  if (!report || typeof report !== 'object' || !report.packages || typeof report.packages !== 'object') {
    throw new Error('Malformed release graph report: packages are missing.');
  }
  if (report.valid !== true) {
    throw new Error('Malformed release graph report: valid must be exactly true.');
  }
  const keys = Object.keys(report.packages).sort();
  const expectedKeys = [...RELEASE_ORDER].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`Malformed release graph report: expected packages ${expectedKeys.join(', ')}; received ${keys.join(', ')}.`);
  }
  for (const key of RELEASE_ORDER) {
    const pkg = report.packages[key];
    if (
      !pkg
      || typeof pkg !== 'object'
      || pkg.key !== key
      || pkg.name !== RELEASE_PACKAGES[key].name
      || typeof pkg.localVersion !== 'string'
      || !STABLE_VERSION_PATTERN.test(pkg.localVersion)
      || (pkg.status !== 'unpublished' && pkg.status !== 'published-identical')
    ) {
      throw new Error(`Malformed release graph report: package ${key} must carry its key, name, an exact version and a known status.`);
    }
  }
}

function validateRetainedStorage(report, publisherTempRoot) {
  if (
    typeof report?.tempDirectory !== 'string'
    || !isPathWithin(publisherTempRoot, report.tempDirectory)
  ) {
    throw new Error('Malformed release graph report: retained verification directory is outside the publisher-owned root.');
  }
  for (const key of RELEASE_ORDER) {
    const tarballPath = report.tarballs?.[key];
    if (
      typeof tarballPath !== 'string'
      || !isPathWithin(publisherTempRoot, tarballPath)
      || !isPathWithin(report.tempDirectory, tarballPath)
    ) {
      throw new Error(`Verified tarball for ${key} is outside the retained verification directory.`);
    }
  }
}

function validateVerifiedTarballs(report, toPublish) {
  if (!report || typeof report.tempDirectory !== 'string' || !report.tarballs || typeof report.tarballs !== 'object') {
    throw new Error('Malformed release graph report: retained verified tarballs are missing.');
  }
  for (const key of toPublish) {
    const tarballPath = report.tarballs[key];
    const packageName = RELEASE_PACKAGES[key].name;
    const version = report.packages[key].localVersion;
    if (typeof tarballPath !== 'string' || !path.isAbsolute(tarballPath)) {
      throw new Error(`Verified tarball for ${packageName}@${version} is missing or not absolute.`);
    }
    let stat;
    try {
      stat = fs.lstatSync(tarballPath);
    } catch {
      throw new Error(`Verified tarball for ${packageName}@${version} does not exist: ${tarballPath}`);
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Verified tarball for ${packageName}@${version} must not be a symbolic link.`);
    }
    if (!stat.isFile() || !isPathWithin(report.tempDirectory, tarballPath)) {
      throw new Error(`Verified tarball for ${packageName}@${version} is outside the retained verification directory.`);
    }
    const expectedName = `${packageName.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
    if (path.basename(fs.realpathSync(tarballPath)) !== expectedName) {
      throw new Error(`Verified tarball for ${packageName}@${version} has an unexpected filename.`);
    }
  }
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
  const checkGraphImpl = options.checkGraphImpl
    || ((checkCwd, tempRoot) => checkReleaseGraph({ cwd: checkCwd, keepTempDirectory: true, tempRoot }));
  const publishImpl = options.publishImpl
    || ((packageName, version, tarballPath) => {
      if (typeof tarballPath !== 'string') {
        throw new Error(`No verified tarball for ${packageName}@${version}; publish is refused`);
      }
      return execFileSyncImpl(
        'npm',
        ['publish', tarballPath, '--access', 'public'],
        { cwd, env: createNpmChildEnvironment(process.env), stdio: 'inherit' }
      );
    });
  const viewVersionImpl = options.viewVersionImpl
    || ((packageName, version) => {
      const output = execFileSyncImpl(
        'npm',
        ['view', `${packageName}@${version}`, 'version', '--json'],
        { cwd, env: createNpmChildEnvironment(process.env), stdio: REGISTRY_PROBE_STDIO, encoding: 'utf8' }
      );
      return parseJsonOutput(output, `npm view output for ${packageName}@${version}`);
    });
  const viewDependenciesImpl = options.viewDependenciesImpl
    || ((packageName, version) => {
      const output = execFileSyncImpl(
        'npm',
        ['view', `${packageName}@${version}`, 'dependencies', '--json'],
        { cwd, env: createNpmChildEnvironment(process.env), stdio: REGISTRY_PROBE_STDIO, encoding: 'utf8' }
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
  buildImpl();
  smokeMcpImpl();
  smokeCliImpl();
  const postBuildStatus = String(gitStatusImpl()).trim();
  if (postBuildStatus !== '') {
    throw new Error(`Working tree became dirty during build or smokes; refusing to publish:\n${postBuildStatus}`);
  }
  let report = null;
  const publisherTempRoot = fs.mkdtempSync(path.join(options.tempRoot || os.tmpdir(), 'satori-publish-'));
  try {
    report = await checkGraphImpl(cwd, publisherTempRoot);
    if (!report || !report.valid) {
      throw new Error('Release graph is invalid; refusing to publish.');
    }
    validateReleaseReport(report);
    const localVersions = Object.freeze(
      Object.fromEntries(RELEASE_ORDER.map((key) => [key, report.packages[key].localVersion]))
    );
    const toPublish = RELEASE_ORDER.filter((key) => report.packages[key].status === 'unpublished');
    const toSkip = RELEASE_ORDER.filter((key) => report.packages[key].status === 'published-identical');

    if (toPublish.length === 0) {
      log('All packages are published-identical; nothing to publish.');
      return { published: [], skipped: Object.freeze(toSkip) };
    }

    validateRetainedStorage(report, publisherTempRoot);
    if (!options.publishImpl) {
      validateVerifiedTarballs(report, toPublish);
    }

    log(`Publishing in order: ${toPublish.map((key) => RELEASE_PACKAGES[key].name).join(' -> ')}`);
    const publishCommandSucceeded = [];
    const registryVerified = [];
    for (const key of toPublish) {
      const packageName = RELEASE_PACKAGES[key].name;
      const version = localVersions[key];
      const entry = { key, name: packageName, version };
      log(`Publishing ${packageName}@${version}...`);
      try {
        publishImpl(packageName, version, report.tarballs?.[key]);
        publishCommandSucceeded.push(entry);
      } catch (error) {
        const detail = errorMessage(error);
        throw new Error(
          `The publish command for ${packageName}@${version} failed.\n`
          + `The registry state of ${packageName}@${version} may be unknown. Query the exact version before retrying.\n`
          + `Registry-verified packages:\n- ${formatEntries(registryVerified).replace(/, /g, '\n- ')}\n`
          + `Publish commands that succeeded:\n- ${formatEntries(publishCommandSucceeded).replace(/, /g, '\n- ')}\n`
          + detail
        );
      }
      try {
        await verifyPublished(key, version, localVersions, {
          viewVersionImpl,
          viewDependenciesImpl,
          sleepImpl,
          log,
        });
      } catch (error) {
        throw new Error(
          `The publish command succeeded for ${packageName}@${version}, but registry verification failed.\n`
          + `${errorMessage(error)}\n`
          + 'The package may already be published. Do not retry publication until npm registry state is checked.\n'
          + `Publish commands that succeeded:\n- ${formatEntries(publishCommandSucceeded).replace(/, /g, '\n- ')}\n`
          + `Registry-verified packages:\n- ${formatEntries(registryVerified).replace(/, /g, '\n- ')}`
        );
      }
      registryVerified.push(entry);
    }
    log('Release graph published.');
    return {
      published: Object.freeze(registryVerified),
      skipped: Object.freeze(toSkip),
      publishCommandSucceeded: Object.freeze(publishCommandSucceeded),
      registryVerified: Object.freeze(registryVerified),
    };
  } finally {
    fs.rmSync(publisherTempRoot, { recursive: true, force: true });
  }
}

async function verifyPublished(key, version, localVersions, impls) {
  const { viewVersionImpl, viewDependenciesImpl, sleepImpl, log } = impls;
  const packageName = RELEASE_PACKAGES[key].name;
  let lastDependencyMismatch = null;
  for (let attempt = 1; attempt <= REGISTRY_POLL_ATTEMPTS; attempt += 1) {
    let visible = false;
    try {
      const registryVersion = viewVersionImpl(packageName, version);
      visible = registryVersion === version;
    } catch (error) {
      const classification = classifyRegistryError(error);
      if (classification === 'auth') {
        throw new Error(
          `Registry authentication failed while verifying ${packageName}@${version} after publish: ${errorMessage(error)}`
        );
      }
      if (classification === 'permanent') {
        throw new Error(
          `Registry verification failed for ${packageName}@${version} after publish: ${errorMessage(error)}`
        );
      }
      // Transient network failures and exact-version E404s during propagation
      // continue within the bounded polling window.
    }
    if (visible) {
      if (key === 'core') {
        return;
      }
      let dependencies;
      try {
        dependencies = viewDependenciesImpl(packageName, version);
      } catch (error) {
        const classification = classifyRegistryError(error);
        if (classification === 'auth') {
          throw new Error(
            `Registry authentication failed while verifying ${packageName}@${version} dependency metadata: ${errorMessage(error)}`
          );
        }
        if (classification === 'permanent') {
          throw new Error(
            `Registry dependency verification failed for ${packageName}@${version} after publish: ${errorMessage(error)}`
          );
        }
        lastDependencyMismatch = `Published ${packageName}@${version} dependency metadata is not visible yet.`;
      }
      if (!dependencies || typeof dependencies !== 'object') {
        lastDependencyMismatch = `Published ${packageName}@${version} dependency metadata is not visible yet.`;
      } else if (key === 'mcp') {
        if (dependencies['@zokizuan/satori-core'] === localVersions.core) {
          return;
        }
        lastDependencyMismatch =
          `Published ${packageName}@${version} dependency @zokizuan/satori-core is ${JSON.stringify(dependencies['@zokizuan/satori-core'])}, expected ${localVersions.core}`;
      } else {
        const corePin = dependencies['@zokizuan/satori-core'];
        const mcpPin = dependencies['@zokizuan/satori-mcp'];
        if (corePin === localVersions.core && mcpPin === localVersions.mcp) {
          return;
        }
        lastDependencyMismatch =
          `Published ${packageName}@${version} dependency pins are @zokizuan/satori-core@${JSON.stringify(corePin)} and @zokizuan/satori-mcp@${JSON.stringify(mcpPin)}; expected ${localVersions.core} and ${localVersions.mcp}`;
      }
    }
    if (attempt < REGISTRY_POLL_ATTEMPTS) {
      await sleepImpl(REGISTRY_POLL_INTERVAL_MS);
    }
  }
  if (lastDependencyMismatch) {
    throw new Error(`${lastDependencyMismatch} after ${REGISTRY_POLL_ATTEMPTS} attempts`);
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

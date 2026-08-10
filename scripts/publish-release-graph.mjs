import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RELEASE_ORDER, RELEASE_PACKAGES } from './release-graph.mjs';
import { createNpmChildEnvironment } from './npm-child-process.mjs';
import { qualifyReleaseCandidate } from './qualify-release-candidate.mjs';
import {
  PRODUCTION_NPM_REGISTRY,
  PRODUCTION_NPM_TAG,
  classifyRegistryError,
  createReleaseRegistryClient,
  verifyPublishedIdenticalLatest,
  verifyReleaseRegistry,
} from './release-registry.mjs';

const REGISTRY_POLL_ATTEMPTS = 12;
const REGISTRY_POLL_INTERVAL_MS = 5000;
export const CANONICAL_MASTER_FETCH_ARGS = Object.freeze([
  'fetch',
  '--no-tags',
  'origin',
  '+refs/heads/master:refs/remotes/origin/master',
]);

const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

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
  const fetchOriginMasterImpl = options.fetchOriginMasterImpl
    || (() => execFileSyncImpl('git', [...CANONICAL_MASTER_FETCH_ARGS], { cwd, stdio: 'inherit' }));
  const headImpl = options.headImpl
    || (() => execFileSyncImpl('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim());
  const originMasterImpl = options.originMasterImpl
    || (() => execFileSyncImpl('git', ['rev-parse', 'refs/remotes/origin/master'], { cwd, encoding: 'utf8' }).trim());
  const originMasterIsAncestorImpl = options.originMasterIsAncestorImpl
    || (() => {
      try {
        execFileSyncImpl(
          'git',
          ['merge-base', '--is-ancestor', 'refs/remotes/origin/master', 'HEAD'],
          { cwd, stdio: 'ignore' },
        );
        return true;
      } catch (error) {
        if (error && typeof error === 'object' && error.status === 1) {
          return false;
        }
        throw error;
      }
    });
  const qualifyImpl = options.qualifyImpl
    || ((tempRoot) => qualifyReleaseCandidate({
      cwd,
      tempRoot,
      keepTempDirectory: true,
      execFileSyncImpl,
      gitStatusImpl,
    }));
  const registryClient = options.registryClient || createReleaseRegistryClient({ cwd, execFileSyncImpl });
  const publishImpl = options.publishImpl
    || ((packageName, version, tarballPath) => {
      if (typeof tarballPath !== 'string') {
        throw new Error(`No verified tarball for ${packageName}@${version}; publish is refused`);
      }
      return execFileSyncImpl(
        'npm',
        [
          'publish',
          tarballPath,
          '--registry',
          PRODUCTION_NPM_REGISTRY,
          '--tag',
          PRODUCTION_NPM_TAG,
          '--access',
          'public',
        ],
        { cwd, env: createNpmChildEnvironment(process.env), stdio: 'inherit' }
      );
    });
  const viewVersionImpl = options.viewVersionImpl
    || ((packageName, version) => registryClient.viewVersion(packageName, version));
  const viewDependenciesImpl = options.viewDependenciesImpl
    || ((packageName, version) => registryClient.viewDependencies(packageName, version));
  const sleepImpl = options.sleepImpl || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const verifyReleaseImpl = options.verifyReleaseImpl
    || ((localVersions) => verifyReleaseRegistry({
      localVersions,
      registryClient,
      attempts: REGISTRY_POLL_ATTEMPTS,
      sleepImpl,
      retryDelayMs: REGISTRY_POLL_INTERVAL_MS,
    }));
  const verifySkippedLatestImpl = options.verifySkippedLatestImpl
    || ((packageKeys, localVersions) => verifyPublishedIdenticalLatest({
      packageKeys,
      localVersions,
      registryClient,
    }));

  const status = String(gitStatusImpl()).trim();
  if (status !== '') {
    throw new Error(`Working tree is not clean; refusing to publish:\n${status}`);
  }
  const branch = String(branchImpl()).trim();
  if (branch !== 'master') {
    throw new Error(`Refusing to publish from branch ${JSON.stringify(branch)}; expected master`);
  }
  fetchOriginMasterImpl();
  const head = String(headImpl()).trim();
  const originMaster = String(originMasterImpl()).trim();
  if (options.allowUnpushedHead === true) {
    if (!originMasterIsAncestorImpl()) {
      throw new Error(
        `Refusing emergency publication because refs/remotes/origin/master ${originMaster} is not an ancestor of HEAD ${head}. Rebase the local release onto canonical master first.`,
      );
    }
  } else if (head !== originMaster) {
    throw new Error(
      `Refusing to publish because HEAD ${head} does not equal refs/remotes/origin/master ${originMaster}. Push master first or use --allow-unpushed-head only for a locally-ahead emergency release.`,
    );
  }
  let report = null;
  const publisherTempRoot = fs.mkdtempSync(path.join(options.tempRoot || os.tmpdir(), 'satori-publish-'));
  try {
    report = await qualifyImpl(publisherTempRoot);
    if (!report || !report.valid) {
      throw new Error('Release graph is invalid; refusing to publish.');
    }
    validateReleaseReport(report);
    const localVersions = Object.freeze(
      Object.fromEntries(RELEASE_ORDER.map((key) => [key, report.packages[key].localVersion]))
    );
    const toPublish = RELEASE_ORDER.filter((key) => report.packages[key].status === 'unpublished');
    const toSkip = RELEASE_ORDER.filter((key) => report.packages[key].status === 'published-identical');

    if (toPublish.length > 0) {
      verifySkippedLatestImpl(toSkip, localVersions);
      validateRetainedStorage(report, publisherTempRoot);
      if (!options.publishImpl) {
        validateVerifiedTarballs(report, toPublish);
      }
    }

    if (toPublish.length === 0) {
      log('All packages are published-identical; nothing to publish.');
    } else {
      log(`Publishing in order: ${toPublish.map((key) => RELEASE_PACKAGES[key].name).join(' -> ')}`);
    }
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
    await verifyReleaseImpl(localVersions);
    log(toPublish.length === 0 ? 'Release graph verified.' : 'Release graph published and verified.');
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
  const args = process.argv.slice(2);
  const allowUnpushedHead = args.includes('--allow-unpushed-head');
  if (args.some((arg) => arg !== '--allow-unpushed-head')) {
    console.error('Usage: node scripts/publish-release-graph.mjs [--allow-unpushed-head]');
    process.exit(2);
  }
  try {
    await publishReleaseGraph({ allowUnpushedHead });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

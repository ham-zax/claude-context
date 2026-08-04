import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createNpmChildEnvironment, REGISTRY_PROBE_STDIO } from './npm-child-process.mjs';
import {
  RELEASE_ORDER,
  RELEASE_PACKAGES,
  affectedReleasePackages,
  incrementStableVersion,
  readLocalReleaseGraph,
} from './release-graph.mjs';

const MAX_INCREMENT_ITERATIONS = 1000;

function isRegistryNotFoundError(error) {
  return (
    error
    && typeof error === 'object'
    && error.status === 1
    && /E404|404\s+Not\s+Found|version\s+not\s+found/i.test(String(error.stderr || ''))
  );
}

export function defaultIsVersionPublishedImpl(execFileSyncImpl = execFileSync) {
  return (packageName, version) => {
    let output;
    try {
      output = execFileSyncImpl(
        'npm',
        ['view', `${packageName}@${version}`, 'version', '--json'],
        { encoding: 'utf8', env: createNpmChildEnvironment(process.env), stdio: REGISTRY_PROBE_STDIO }
      );
    } catch (error) {
      if (isRegistryNotFoundError(error)) {
        return false;
      }
      throw new Error(
        `Cannot verify ${packageName}@${version} on the registry: ${error.message}`
      );
    }
    let registryVersion;
    try {
      registryVersion = JSON.parse(String(output).trim());
    } catch (error) {
      throw new Error(
        `Malformed npm view output for ${packageName}@${version}: ${JSON.stringify(String(output).trim())}`
      );
    }
    if (registryVersion !== version) {
      throw new Error(
        `Registry returned unexpected version ${JSON.stringify(registryVersion)} for ${packageName}@${version}`
      );
    }
    return true;
  };
}

function incrementUntilUnpublished(packageName, version, firstBump, isVersionPublishedImpl) {
  let candidate = incrementStableVersion(version, firstBump);
  let iterations = 0;
  while (isVersionPublishedImpl(packageName, candidate)) {
    iterations += 1;
    if (iterations > MAX_INCREMENT_ITERATIONS) {
      throw new Error(`No unpublished version found for ${packageName} starting from ${candidate}`);
    }
    candidate = incrementStableVersion(candidate, 'patch');
  }
  return candidate;
}

export function computeBumpPlan({ target, bump, localVersions, isVersionPublishedImpl }) {
  if (!Object.prototype.hasOwnProperty.call(RELEASE_PACKAGES, target)) {
    throw new Error(`Unknown release target ${JSON.stringify(target)}; expected one of ${RELEASE_ORDER.join(', ')}`);
  }
  if (!['major', 'minor', 'patch'].includes(bump)) {
    throw new Error(`Unknown bump kind ${JSON.stringify(bump)}; expected one of major, minor, patch`);
  }
  const closure = affectedReleasePackages(target);
  const entries = [];
  for (const key of RELEASE_ORDER) {
    const current = localVersions[key];
    if (typeof current !== 'string') {
      throw new Error(`Missing local version for ${key}`);
    }
    let next = current;
    let reason;
    if (key === target) {
      if (isVersionPublishedImpl(RELEASE_PACKAGES[key].name, current)) {
        next = incrementUntilUnpublished(RELEASE_PACKAGES[key].name, current, bump, isVersionPublishedImpl);
        reason = `bumped ${bump}`;
      } else {
        reason = 'unchanged, already unpublished';
      }
    } else if (closure.includes(key)) {
      if (isVersionPublishedImpl(RELEASE_PACKAGES[key].name, current)) {
        next = incrementUntilUnpublished(RELEASE_PACKAGES[key].name, current, 'patch', isVersionPublishedImpl);
        reason = 'bumped patch for downstream pin';
      } else {
        reason = 'unchanged, already unpublished';
      }
    } else {
      reason = 'unchanged, not affected';
    }
    entries.push({
      key,
      name: RELEASE_PACKAGES[key].name,
      directory: RELEASE_PACKAGES[key].directory,
      from: current,
      to: next,
      reason,
    });
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    changed: Object.freeze(entries.filter((entry) => entry.to !== entry.from)),
    mcpChanged: entries.find((entry) => entry.key === 'mcp' && entry.to !== entry.from) !== undefined,
  });
}

export function printBumpPlan(plan, output) {
  for (const entry of plan.entries) {
    if (entry.to === entry.from) {
      output(`${RELEASE_PACKAGES[entry.key].name}  ${entry.from} -> ${entry.reason}`);
    } else {
      output(`${RELEASE_PACKAGES[entry.key].name}  ${entry.from} -> ${entry.to}`);
    }
  }
}

function writeJsonAtomically(filePath, manifest) {
  const temporaryPath = `${filePath}.satori-bump-${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

export function applyReleaseBump(options) {
  const { cwd, plan, output = ((line) => console.log(line)) } = options;
  const execFileSyncImpl = options.execFileSyncImpl || execFileSync;
  const gitStatusImpl = options.gitStatusImpl
    || (() => execFileSyncImpl('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }));
  const versionsCheckImpl = options.versionsCheckImpl
    || (() => execFileSyncImpl('pnpm', ['run', 'versions:check'], { cwd, encoding: 'utf8' }));
  const manifestGenerateImpl = options.manifestGenerateImpl
    || (() => execFileSyncImpl('pnpm', ['-C', 'packages/mcp', 'manifest:generate'], { cwd, encoding: 'utf8' }));

  const status = gitStatusImpl();
  if (String(status).trim() !== '') {
    throw new Error(`Working tree is not clean; refusing to apply a release bump:\n${String(status).trim()}`);
  }

  output('Applying release bump plan:');
  printBumpPlan(plan, output);

  const originals = new Map();
  for (const entry of plan.changed) {
    const manifestPath = path.join(cwd, entry.directory, 'package.json');
    originals.set(manifestPath, fs.readFileSync(manifestPath, 'utf8'));
  }
  const serverJsonPath = path.join(cwd, 'server.json');
  const serverJsonOriginal = fs.readFileSync(serverJsonPath, 'utf8');

  try {
    for (const entry of plan.changed) {
      const manifestPath = path.join(cwd, entry.directory, 'package.json');
      const manifest = JSON.parse(originals.get(manifestPath));
      manifest.version = entry.to;
      writeJsonAtomically(manifestPath, manifest);
    }
    if (plan.mcpChanged) {
      manifestGenerateImpl();
    }
    versionsCheckImpl();
    return Object.freeze({
      written: Object.freeze(plan.changed.map((entry) => entry.key)),
      serverJsonRegenerated: plan.mcpChanged,
    });
  } catch (error) {
    for (const [manifestPath, content] of originals.entries()) {
      fs.writeFileSync(manifestPath, content);
    }
    if (plan.mcpChanged) {
      fs.writeFileSync(serverJsonPath, serverJsonOriginal);
    }
    throw new Error(`Release bump apply failed; original files restored: ${error.message}`);
  }
}

export async function runReleaseBump(options = {}) {
  const cwd = options.cwd || process.cwd();
  const output = options.output || ((line) => console.log(line));
  const argv = options.argv || [];
  const apply = argv.includes('--apply');
  const positional = argv.filter((arg) => arg !== '--apply' && arg !== '--');
  if (positional.length !== 2) {
    throw new Error('Usage: pnpm release:bump -- <core|mcp|cli> <major|minor|patch> [--apply]');
  }
  const [target, bump] = positional;
  const execFileSyncImpl = options.execFileSyncImpl || execFileSync;
  const isVersionPublishedImpl = options.isVersionPublishedImpl || defaultIsVersionPublishedImpl(execFileSyncImpl);
  const localGraph = readLocalReleaseGraph(cwd);
  const localVersions = Object.freeze(
    Object.fromEntries(RELEASE_ORDER.map((key) => [key, localGraph.packages[key].versionString]))
  );
  const plan = computeBumpPlan({ target, bump, localVersions, isVersionPublishedImpl });

  output(`Release bump plan for ${target} ${bump}`);
  output('');
  printBumpPlan(plan, output);

  if (apply) {
    output('');
    applyReleaseBump({ cwd, plan, output, execFileSyncImpl, ...options });
  } else {
    output('');
    output('Preview only. Re-run with --apply to write this plan.');
  }
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runReleaseBump({ argv: process.argv.slice(2) });
  } catch (error) {
    console.error(error.message);
    if (/^Usage:/.test(error.message)) {
      process.exit(2);
    }
    process.exit(1);
  }
}

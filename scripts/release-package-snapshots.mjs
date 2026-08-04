import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createFileTreeSnapshot } from './release-graph.mjs';

const REGISTRY_NOT_FOUND_PATTERN = /E404|404\s+Not\s+Found|version\s+not\s+found/i;

function isRegistryNotFoundError(error) {
  return (
    error
    && typeof error === 'object'
    && error.status === 1
    && REGISTRY_NOT_FOUND_PATTERN.test(String(error.stderr || ''))
  );
}

function listTarballs(directory) {
  let names = [];
  try {
    names = fs.readdirSync(directory);
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith('.tgz'));
}

export function extractPackageTarball(input) {
  const { tarballPath, destinationDirectory, execFileSyncImpl = execFileSync } = input;
  fs.mkdirSync(destinationDirectory, { recursive: true });
  try {
    execFileSyncImpl('tar', ['-xzf', tarballPath, '-C', destinationDirectory], { encoding: 'utf8' });
  } catch (error) {
    throw new Error(`Cannot extract ${tarballPath}: ${error.message}`);
  }
  const entries = fs.readdirSync(destinationDirectory);
  if (entries.length !== 1 || entries[0] !== 'package') {
    throw new Error(
      `Extracted archive must contain exactly one package/ root directory; received entries: ${JSON.stringify(entries)}`
    );
  }
  const packageRoot = path.join(destinationDirectory, 'package');
  const resolvedDestination = path.resolve(destinationDirectory);
  if (!fs.statSync(packageRoot).isDirectory()) {
    throw new Error(`Extracted ${tarballPath} root must be a directory named package/`);
  }
  for (const entry of createFileTreeSnapshot(destinationDirectory)) {
    const resolved = path.resolve(destinationDirectory, entry.path);
    if (resolved !== resolvedDestination && !resolved.startsWith(`${resolvedDestination}${path.sep}`)) {
      throw new Error(`Extracted entry escapes the destination directory: ${entry.path}`);
    }
  }
  return packageRoot;
}

export function loadPackedPackageSnapshot(input) {
  const { rootDirectory } = input;
  const manifestPath = path.join(rootDirectory, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read packed manifest at ${manifestPath}: ${error.message}`);
  }
  const snapshot = createFileTreeSnapshot(rootDirectory);
  return { manifest, snapshot };
}

export function packLocalPackage(input) {
  const { packageName, cwd, workDirectory, execFileSyncImpl = execFileSync } = input;
  fs.mkdirSync(workDirectory, { recursive: true });
  const packOutputDirectory = path.join(workDirectory, 'pack');
  fs.mkdirSync(packOutputDirectory, { recursive: true });
  const before = new Set(listTarballs(packOutputDirectory));
  try {
    execFileSyncImpl(
      'pnpm',
      ['--filter', packageName, 'pack', '--pack-destination', packOutputDirectory],
      { cwd, encoding: 'utf8' }
    );
  } catch (error) {
    throw new Error(`pnpm pack failed for ${packageName}: ${error.message}`);
  }
  const newTarballs = listTarballs(packOutputDirectory).filter((name) => !before.has(name));
  if (newTarballs.length === 0) {
    throw new Error(`pnpm pack for ${packageName} produced no tarball in ${packOutputDirectory}`);
  }
  if (newTarballs.length > 1) {
    throw new Error(
      `pnpm pack for ${packageName} produced ${newTarballs.length} tarballs: ${newTarballs.join(', ')}`
    );
  }
  const tarballPath = path.join(packOutputDirectory, newTarballs[0]);
  const extractionDirectory = path.join(workDirectory, 'extract');
  const packageRoot = extractPackageTarball({
    tarballPath,
    destinationDirectory: extractionDirectory,
    execFileSyncImpl,
  });
  const { manifest, snapshot } = loadPackedPackageSnapshot({ rootDirectory: packageRoot });
  if (manifest.name !== packageName) {
    throw new Error(
      `Packed manifest name ${JSON.stringify(manifest.name)} does not match requested package ${packageName}`
    );
  }
  return { manifest, snapshot, tarballPath };
}

export function fetchPublishedPackage(input) {
  const { packageName, version, workDirectory, execFileSyncImpl = execFileSync } = input;
  fs.mkdirSync(workDirectory, { recursive: true });

  let viewOutput;
  try {
    viewOutput = execFileSyncImpl(
      'npm',
      ['view', `${packageName}@${version}`, 'version', '--json'],
      { cwd: workDirectory, encoding: 'utf8' }
    );
  } catch (error) {
    if (isRegistryNotFoundError(error)) {
      return { status: 'unpublished' };
    }
    throw new Error(
      `Cannot verify ${packageName}@${version} on the registry: ${error.message}`
    );
  }

  let registryVersion;
  try {
    registryVersion = JSON.parse(String(viewOutput).trim());
  } catch (error) {
    throw new Error(
      `Malformed npm view output for ${packageName}@${version}: ${JSON.stringify(String(viewOutput).trim())}`
    );
  }
  if (registryVersion !== version) {
    throw new Error(
      `Registry returned unexpected version ${JSON.stringify(registryVersion)} for ${packageName}@${version}`
    );
  }

  const packOutputDirectory = path.join(workDirectory, 'pack');
  fs.mkdirSync(packOutputDirectory, { recursive: true });
  const before = new Set(listTarballs(packOutputDirectory));
  let packOutput;
  try {
    packOutput = execFileSyncImpl(
      'npm',
      ['pack', `${packageName}@${version}`, '--pack-destination', packOutputDirectory],
      { cwd: workDirectory, encoding: 'utf8' }
    );
  } catch (error) {
    throw new Error(`npm pack failed for ${packageName}@${version}: ${error.message}`);
  }
  const newTarballs = listTarballs(packOutputDirectory).filter((name) => !before.has(name));
  if (newTarballs.length !== 1) {
    throw new Error(
      `npm pack for ${packageName}@${version} produced ${newTarballs.length} tarballs: ${newTarballs.join(', ')}`
    );
  }
  const tarballPath = path.join(packOutputDirectory, newTarballs[0]);
  const extractionDirectory = path.join(workDirectory, 'extract');
  const packageRoot = extractPackageTarball({
    tarballPath,
    destinationDirectory: extractionDirectory,
    execFileSyncImpl,
  });
  const { manifest, snapshot } = loadPackedPackageSnapshot({ rootDirectory: packageRoot });
  if (manifest.name !== packageName || manifest.version !== version) {
    throw new Error(
      `Published manifest identity ${JSON.stringify(manifest.name)}@${JSON.stringify(manifest.version)} does not match requested ${packageName}@${version}`
    );
  }
  return { status: 'published', version, manifest, snapshot, tarballPath };
}

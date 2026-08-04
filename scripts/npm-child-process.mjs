import process from 'node:process';

const PNPM_ONLY_NPM_CONFIG_KEYS = Object.freeze([
  '_jsr-registry',
  'auto-install-peers',
  'cache-dir',
  'child-concurrency',
  'dedupe-peer-dependents',
  'ignore-workspace-root-check',
  'npm-globalconfig',
  'prefer-frozen-lockfile',
  'shell-emulator',
  'store-dir',
  'verify-deps-before-run',
]);

export const REGISTRY_PROBE_STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);

function configKeyFromEnvironmentName(environmentName) {
  const rest = environmentName.slice('npm_config_'.length).toLowerCase();
  if (rest.startsWith('_')) {
    return `_${rest.slice(1).replace(/_/g, '-')}`;
  }
  return rest.replace(/_/g, '-');
}

export function createNpmChildEnvironment(parentEnvironment = process.env) {
  const childEnvironment = { ...parentEnvironment };
  for (const name of Object.keys(childEnvironment)) {
    if (
      name.startsWith('npm_config_')
      && PNPM_ONLY_NPM_CONFIG_KEYS.includes(configKeyFromEnvironmentName(name))
    ) {
      delete childEnvironment[name];
    }
  }
  return childEnvironment;
}

import process from 'node:process';

export const REGISTRY_PROBE_STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);

const NPM_COMPATIBLE_CONFIG_KEYS = Object.freeze([
  'registry',
  'userconfig',
  'globalconfig',
  'cache',
  'proxy',
  'http-proxy',
  'https-proxy',
  'noproxy',
  'ca',
  'cafile',
  'strict-ssl',
  'cert',
  'key',
  'otp',
  'provenance',
  'access',
  'tag',
  'loglevel',
  'user-agent',
]);

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
    if (!/^npm_config_/i.test(name)) {
      continue;
    }
    if (!NPM_COMPATIBLE_CONFIG_KEYS.includes(configKeyFromEnvironmentName(name))) {
      delete childEnvironment[name];
    }
  }
  return childEnvironment;
}

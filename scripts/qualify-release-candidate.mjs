import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { checkReleaseGraph } from './check-release-graph.mjs';

export const RELEASE_QUALIFICATION_COMMANDS = Object.freeze([
  Object.freeze({ label: 'repository checks', command: 'pnpm', args: Object.freeze(['run', 'check']) }),
  Object.freeze({ label: 'Core tests', command: 'pnpm', args: Object.freeze(['-C', 'packages/core', 'test']) }),
  Object.freeze({ label: 'MCP tests', command: 'pnpm', args: Object.freeze(['-C', 'packages/mcp', 'test']) }),
  Object.freeze({ label: 'CLI tests', command: 'pnpm', args: Object.freeze(['-C', 'packages/cli', 'test']) }),
  Object.freeze({ label: 'release script tests', command: 'pnpm', args: Object.freeze(['run', 'test:scripts']) }),
  Object.freeze({ label: 'MCP request contract', command: 'pnpm', args: Object.freeze(['-C', 'packages/mcp', 'contract:check']) }),
  Object.freeze({ label: 'MCP documentation', command: 'pnpm', args: Object.freeze(['-C', 'packages/mcp', 'docs:check']) }),
  Object.freeze({ label: 'MCP manifest', command: 'pnpm', args: Object.freeze(['-C', 'packages/mcp', 'manifest:check']) }),
  Object.freeze({ label: 'clean release build', command: 'pnpm', args: Object.freeze(['run', 'build']) }),
  Object.freeze({ label: 'MCP packed smoke', command: 'pnpm', args: Object.freeze(['run', 'release:smoke:mcp']) }),
  Object.freeze({ label: 'CLI packed smoke', command: 'pnpm', args: Object.freeze(['run', 'release:smoke:cli']) }),
]);

export async function qualifyReleaseCandidate(options = {}) {
  const cwd = options.cwd || process.cwd();
  const execFileSyncImpl = options.execFileSyncImpl || execFileSync;
  const gitStatusImpl = options.gitStatusImpl
    || (() => execFileSyncImpl('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }));
  const runCommandImpl = options.runCommandImpl
    || ((entry) => execFileSyncImpl(entry.command, [...entry.args], {
      cwd,
      encoding: 'utf8',
      stdio: 'inherit',
    }));
  const checkGraphImpl = options.checkGraphImpl
    || ((checkOptions) => checkReleaseGraph(checkOptions));

  const initialStatus = String(gitStatusImpl()).trim();
  if (initialStatus !== '') {
    throw new Error(`Working tree is not clean; refusing release qualification:\n${initialStatus}`);
  }

  for (const entry of RELEASE_QUALIFICATION_COMMANDS) {
    runCommandImpl(entry);
  }

  const finalStatus = String(gitStatusImpl()).trim();
  if (finalStatus !== '') {
    throw new Error(`Working tree became dirty during release qualification:\n${finalStatus}`);
  }

  return checkGraphImpl({
    cwd,
    tempRoot: options.tempRoot,
    keepTempDirectory: options.keepTempDirectory === true,
    execFileSyncImpl,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length > 2) {
    console.error('Usage: node scripts/qualify-release-candidate.mjs');
    process.exit(2);
  }
  try {
    await qualifyReleaseCandidate();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * Run package typechecks without fail-fast so every workspace package reports
 * errors, then exit non-zero if any package failed.
 */
import { spawnSync } from "node:child_process";

const packages = [
  "@zokizuan/satori-core",
  "@zokizuan/satori-mcp",
  "@zokizuan/satori-cli",
];

let exitCode = 0;
const failed = [];

for (const name of packages) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync("pnpm", ["--filter", name, "run", "typecheck"], {
    stdio: "inherit",
    shell: false,
  });
  const status = result.status ?? 1;
  if (status !== 0) {
    exitCode = status;
    failed.push(name);
  }
}

if (failed.length > 0) {
  console.error(`\nTypecheck failed in: ${failed.join(", ")}`);
} else {
  console.log("\nTypecheck passed in all packages.");
}

process.exit(exitCode);

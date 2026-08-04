# Releasing Satori

Satori is published as three packages:

- `@zokizuan/satori-core`
- `@zokizuan/satori-mcp`
- `@zokizuan/satori-cli`

They have independent versions but form one exact release closure:

```text
CLI -> exact MCP version
CLI -> exact Core version
MCP -> the same exact Core version
```

`satori upgrade` reads the latest CLI manifest as the release authority. It
does not independently select the latest MCP or Core package. A runtime release
therefore becomes visible to users only when the latest CLI points to that
exact compatible closure.

## What to Publish

| Changed package | Required publication order |
|---|---|
| CLI only | CLI |
| MCP, with the same Core | MCP, then CLI |
| Core | Core, then a new MCP bound to it, then CLI |
| MCP and Core | Core, then MCP, then CLI |
| All three | Core, then MCP, then CLI |

Even when CLI implementation code did not change, publish a new CLI version
when it must expose a new MCP/Core closure. When Core changes, MCP also needs a
new publication because MCP's packed manifest owns an exact Core dependency.

Publishing MCP or Core alone is safe, but existing users will not receive that
package through `satori upgrade` until a compatible CLI release points to it.
This prevents partially published releases from being assembled into an
untested runtime.

## Manifest Contract

The workspace source manifests use `workspace:*` for first-party dependencies.
`pnpm pack` must rewrite those entries to exact stable versions in the
published manifests.

Before publishing, the packed-release smoke verifies:

- packed CLI version matches the source CLI version;
- packed MCP version matches the source MCP version;
- packed Core version matches the source Core version;
- CLI depends on those exact MCP and Core versions;
- MCP depends on that exact Core version;
- the packed Core package metadata is resolvable; and
- MCP resolves Core from inside the installed release closure.

Do not replace these exact dependencies with ranges. The upgrade command rejects
incomplete, mismatched, out-of-root, or downgrade-producing closures.

## Release Procedure

The repository enforces the release graph before any publication. Four commands
are available:

```text
versions:check
    fast, offline literal current-version reference validation

release:check
    packs all packages, checks exact dependency pins, and compares any
    already-published same-version package against the locally packed artifact

release:bump
    previews or applies an idempotent coordinated bump plan

release:all
    validates, builds, smokes, publishes only unpublished packages in
    Core -> MCP -> CLI order, and verifies npm after each publication
```

### `pnpm run versions:check`

Scans the fixed list of package manifests plus generated references and fails
when a literal `@zokizuan/<package>@x.y.z` reference does not match the local
manifest version. This is the fast literal-reference gate; it is part of
`pnpm run check`.

### `pnpm run release:check`

Packs Core, MCP and CLI into a temporary directory, verifies the packed
dependency graph is exact, queries npm for the published artifact of each local
version, and compares normalized packed file trees.

A release graph is valid when every package is either:

- `unpublished` — the version does not exist on npm and needs publication; or
- `published-identical` — the version exists and the local packed artifact is
  byte-for-byte equivalent after normalized extraction, so it must be skipped.

Any `stale-version` (same version already published with a different artifact)
or `invalid-graph` (packed dependencies do not match local versions) makes the
release invalid, and `release:check` exits nonzero.

The packed artifact, not Git tags or source timestamps, is the release truth:

- compiled JavaScript and declarations;
- package metadata;
- generated files;
- executable permissions;
- packaged assets;
- `workspace:*` dependencies rewritten by `pnpm pack`;
- transitive release-graph changes such as a stale Core pin in a packed MCP
  manifest.

If npm metadata cannot be verified (network failure, malformed output,
authentication error, registry outage), the check fails closed. A registry 404
for the exact version is the only response treated as "unpublished".

Example of a valid release candidate:

```text
Satori release graph

Package                         Local   Registry state       Action
@zokizuan/satori-core           3.6.0   unpublished          publish
@zokizuan/satori-mcp            6.8.0   unpublished          publish
@zokizuan/satori-cli            1.9.0   unpublished          publish

Packed dependency graph
@zokizuan/satori-mcp -> @zokizuan/satori-core@3.6.0
@zokizuan/satori-cli -> @zokizuan/satori-mcp@6.8.0
@zokizuan/satori-cli -> @zokizuan/satori-core@3.6.0

Release graph valid.
```

### `pnpm release:bump`

Plans coordinated version changes for one target and its reverse dependency
closure:

```text
Core changes
    -> Core must receive an unpublished version
    -> MCP must receive an unpublished version because it pins Core
    -> CLI must receive an unpublished version because it pins Core and MCP

MCP changes
    -> MCP must receive an unpublished version
    -> CLI must receive an unpublished version because it pins MCP

CLI-only changes
    -> only CLI must receive an unpublished version
```

"Receive an unpublished version" does not always mean increment again. A local
version that is already prepared and not yet on npm remains unchanged and
absorbs additional coordinated changes.

Usage:

```bash
pnpm release:bump -- core minor
pnpm release:bump -- core minor --apply
```

Preview mode performs no writes. Mutation requires `--apply`, which also
requires a clean working tree, runs `versions:check`, regenerates `server.json`
when MCP changes, and restores every file if generation or validation fails.

Example from a fully published state:

```text
Core  3.6.0 -> 3.7.0
MCP   6.8.0 -> 6.8.1
CLI   1.9.0 -> 1.9.1
```

Example from the prepared-but-unpublished state:

```text
Core  3.6.0 -> unchanged, already unpublished
MCP   6.8.0 -> unchanged, already unpublished
CLI   1.9.0 -> unchanged, already unpublished
```

### `pnpm run release:all`

The single supported publication path. It runs:

1. `versions:check`;
2. `release:check` (via the graph checker);
3. package builds and both release smokes;
4. publication of only unpublished packages in Core -> MCP -> CLI order;
5. post-publish npm verification of each package before the next one is
   published.

Preconditions: clean working tree, `master` branch, no stale or
invalid package, and at least one unpublished package. Already-published
identical packages are skipped.

After publishing Core, `release:all` polls until `@zokizuan/satori-core@<version>`
is visible on npm, then publishes MCP, then verifies that the published MCP pins
the exact Core version, then publishes CLI and verifies both pins. A publish
command is never retried automatically. If verification fails after a
successful publish, the run stops and reports exactly which packages were
already published.

The individual package publish scripts remain available as explicit
maintenance commands, but normal publication uses `release:all`:

```bash
pnpm run release:core
pnpm run release:mcp
pnpm run release:cli
```

## Rules for Manual Publication

- never manually publish MCP before its exact Core version exists on npm;
- never manually publish CLI before its exact MCP and Core versions exist on
  npm;
- an already-published same version with a different packed artifact is a
  release error and requires a new version;
- unpublished prepared versions may accumulate coordinated changes without
  another bump;
- `workspace:*` remains in source manifests and must appear as exact versions
  in the packed (published) manifests;
- do not publish at all when npm metadata cannot be verified.

> The earlier "What to Publish" table, packed-release smoke checks and
> `release:verify` guidance are superseded by the enforced graph above. The
> release smokes still run inside `release:all` before publication.

## User-Visible Upgrade Behavior

Users run:

```bash
satori upgrade
```

or, without a global CLI installation:

```bash
npx -y @zokizuan/satori-cli@latest upgrade
```

The CLI update occurs first. The exact MCP/Core candidate is then installed,
validated, and activated through the stable launcher. Client configuration,
indexes, hooks, and repository profiles are preserved. Running coding
agents must be restarted to use an activated runtime update.

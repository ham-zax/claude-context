# CodeQL Python architecture experiment receipt

Status: Q7 sealed; terminal outcome is `codeql_python_imprecise`

Date: 2026-07-25

Portable integration date: 2026-07-26

Source evidence commit:
`cfa9491bdd4c119b96b9ede2524f0e88c4bf1a9f`

## Terminal result

```text
CODEQL_EXPERIMENT_COMMIT=none
CODEQL_RECEIPT=docs/evidence/codeql-python-20260725/CODEQL_PYTHON_RECEIPT.md
CODEQL_OUTCOME=codeql_python_imprecise
```

This is an independent, offline, single-agent CodeQL comparison. It did not
select or integrate CodeQL into Satori. The result is not a judgment on the
native candidate: native implementation files and native receipt contents were
not inspected.

## Ownership and isolation

| Item | Value |
| --- | --- |
| Experiment worktree | Task-owned and not retained as an evidence dependency |
| Experiment branch | `experiment/codeql-python-20260725` |
| Experiment HEAD | `074bed62f723e8b04ec36f3467417cba632687ae` |
| Checkpoint baseline | `074bed62f723e8b04ec36f3467417cba632687ae` |
| Source evidence commit | `cfa9491bdd4c119b96b9ede2524f0e88c4bf1a9f` |
| Portable integration base | `4138b1eba5606a8291b45395f767a46b946070fb` |
| Shared Satori worktree | Unchanged by this experiment |
| Target worktree | Unchanged by this experiment |
| Native implementation | Not inspected or modified |
| Production CodeQL integration | Not authorized and not attempted |

The task-owned worktree temporarily contained experiment tools, frozen source
material, queries, fixtures, databases, query results, and evidence. Before the
evidence commit, only portable evidence and generic sources are retained; the
CodeQL installation, databases, caches, frozen source copy, and raw query
outputs are removed. The target worktree had pre-existing `opencode.jsonc` and
`cc.json` changes; they were preserved.

## Frozen target and source materialization

| Item | Value |
| --- | --- |
| Repository | `tradingview_ratio` qualification target |
| Revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Git tree digest | `2969002a2aa46948d6557ac5f5c70e19355c80a7` |
| Frozen source root | Task-owned materialization, removed after qualification |
| Materialized files | 2,824 |
| Materialized bytes | 1,397,707,966 |
| Target pre-existing state | `main...origin/main [ahead 1]`, modified `opencode.jsonc`, untracked `cc.json` |
| Target license files | No `LICENSE*`, `COPYING*`, or `NOTICE*` at the frozen revision |
| Entitlement | User-confirmed academic-research permission on 2026-07-25 |

The source copy was created from a read-only `git archive` of the frozen revision.
No dirty target files entered the CodeQL source boundary.

## Installed GitHub toolchain

| Item | Value |
| --- | --- |
| CLI source | https://github.com/github/codeql-cli-binaries/releases/tag/v2.26.1 |
| CLI archive | `codeql-linux64.zip` |
| Published archive SHA-256 | `15480dda6e20336a9c7ddcb6171e0e9155f1fe73a1d31baeac153821cb89aeab` |
| CLI path | Task-owned `.tools/codeql/codeql`, removed after qualification |
| CLI version | `2.26.1` |
| Query/library source | https://github.com/github/codeql/tree/codeql-cli/v2.26.1 |
| Query/library commit | `373814b4300341b090f18e6a75c92a65cb2f193a` |
| `codeql/python-all` | `7.2.1` |
| `codeql/python-queries` | `1.8.6` |
| Python extractor | `7.1.8` |
| Python runtime | `3.12.3` |
| CLI binary SHA-256 | `5e459057abea0f2401d8f3a0eb7b4026571b17b8b5bb051ee66496386282dd27` |
| Owned query/config digest | `f3910b53777ad1e95d7c8186ad9dcfbc104be57f4ec67f34a2c8f0ce9c71ca9b` |

The CLI archive checksum matched the published GitHub checksum. The query
checkout was detached at the matching CLI tag. The user supplied the
academic-research entitlement required for this bounded offline use.

Recorded environment:

```text
LANG=C.UTF-8
LC_ALL=C.UTF-8
LC_CTYPE=C.UTF-8
No CODEQL_*, PYTHON*, or VIRTUAL_ENV variables were set.
Linux DESKTOP-HQOUFCO 6.18.33.2.microsoft-standard Thu Jun 18 21:54:43 UTC 2026 x86_64
```

## Q0 — availability gate

Disposition: passed.

Actions and evidence:

- Installed the official GitHub CodeQL CLI release in the experiment worktree.
- Resolved the matching Python query packs from the detached `codeql-cli/v2.26.1`
  query checkout.
- Confirmed the user-provided academic-research permission.
- Recorded target revision, tree digest, source boundary, CLI, query-pack, and
  extractor identities.
- Did not send source or results to an external model provider.

## Q1 — database extraction and source-fact verification

Disposition: extraction passed; harness artifact warning recorded.

Portable rendering of the exact production database-create command
(`EXPERIMENT_ROOT` replaces the removed task-owned absolute path):

```bash
EXPERIMENT_ROOT=/path/to/task-owned-experiment-root
/usr/bin/time -v -o "$EXPERIMENT_ROOT/artifacts/q1-database-create-time.txt" \
  "$EXPERIMENT_ROOT/.tools/codeql/codeql" database create \
  --language=python \
  --build-mode=none \
  --source-root="$EXPERIMENT_ROOT/target-source" \
  --search-path="$EXPERIMENT_ROOT/.tools/codeql-queries" \
  --threads=4 --ram=8192 -- \
  "$EXPERIMENT_ROOT/artifacts/codeql-python-db"
```

Recorded extraction:

- Exit code: 0.
- Wall time: 1:12.90.
- Peak RSS: 2,178,592 KB.
- Database path: `artifacts/codeql-python-db`.
- Final raw database manifest digest: `1db1675443ef77107f6889f5bc35d3852fb2cf07dde825263b7397de3d7917b4`.
- Final on-disk size after analysis: 338M.
- Python 2 probe was unavailable; the extractor fell back to Python 3.
- Extraction used Python 3.12.3 and extractor 7.1.8.
- Standard-library extraction was not enabled; the Python 3 standard library
  was used as the extractor reported.
- One extractor warning reported a missing parent package for
  `src/python/core/portfolio/health.py`; all required frozen relationship
  facts were nevertheless present.

The Q1 fact harness produced:

- six target declarations;
- all six required caller files;
- all six required call expressions;
- relevant constructors, assignments, fields, parameters, class scopes, and
  callable scopes.

The declaration query emitted the six-row BQRS/CSV artifact. Its wrapper
returned exit code 2 after writing the result because the local uncommitted
experiment qlpack could not provide a Git commit hash and the query also
reported one unused harness predicate. The result artifact decoded correctly;
this warning did not affect extraction or the required source-fact gate.

The Q1 BQRS, CSV, timing, and database artifacts are ephemeral experiment
outputs and are removed before the evidence commit. Their measured facts and
digests remain in this receipt and the machine-readable summary.

The context harness produced 3,365 rows and the parameter harness produced
188 rows. The parameter query covered positional parameters; keyword-only
parameters were not used as the authoritative relationship oracle.

## Q2 — unmodified CodeQL baselines

Disposition: passed as baseline evidence; not sufficient for provider selection.

Unmodified official queries:

| Facility | Query | Result |
| --- | --- | --- |
| Call graph | `python/ql/src/meta/analysis-quality/CallGraph.ql` | 16,853 rows, exit 0 |
| Type-tracking call graph | `python/ql/src/meta/analysis-quality/TTCallGraph.ql` | 15,903 rows, exit 0 |
| Points-to metric | `python/ql/src/meta/analysis-quality/PointsToResolvableCalls.ql` | metric 32,169, exit 0 |

Owned standard harnesses:

- Standard data-flow target harness: 71 rows. It resolved the three
  `SignalGenerator.check_entry` required sites and a direct
  `SignalLedger.record` path, but did not resolve the two residual callback
  sites or the required `signal_recording` ledger path.
- Standard points-to target harness: 65 rows. It resolved the
  `pair_evaluator.py:1096` `SignalLedger.record` path among the required
  production paths, but not the three required `check_entry` paths, the two
  residual callbacks, or `signal_recording.py:435`.

All built-in baseline query files were used unmodified. Target-specific
selection occurred only in the owned harness projections.

## Q3 — generic custom query pack

Disposition: executed; generic flow was not sufficiently precise.

Queries used during qualification included task-local selectors and harnesses;
those non-portable harness sources are removed before the evidence commit.
The preserved generic sources are:

```text
queries/q3_generic_relationship_evidence.ql
queries/q3_generic_all_node_evidence.ql
queries/q5_fixture_generic_flow.ql
queries/qlpack.yml
```

The generic flow configuration used CodeQL's public Python data-flow API and
did not encode production receivers, callers, class names, expected line
numbers, or native implementation rules.

Results:

- Attribute-read to target-function flow, excluding the same call-site
  receiver lookup, produced zero indirect rows for the frozen target.
- Unrestricted node flow produced 15 rows, including cross-call same-name
  records; it did not establish a safe exact receiver contract.
- Direct method-call inventory supplied exact call locations, but call syntax
  alone is not an authoritative `CALLS` relationship.

The generic query therefore supplied useful diagnostic evidence but did not
satisfy the exact receiver, callback binding, or wrong-target rejection
contract.

## Q4 — frozen qualification matrix

Disposition: mechanically completed; provider gate failed.

The classification harness enumerated 105 target-shaped production call
expressions and emitted provider-neutral call spans. Status counts:

| Status | Count |
| --- | ---: |
| `exact_mappable_call` | 3 |
| `valid_additional_call` | 45 |
| `missing` | 34 |
| `wrong_target` | 23 |
| `ambiguous` | 0 |
| `function_pair_without_call_span` | 0 |
| `unsupported` | 0 |

The six required rows were:

| Required relationship | Status |
| --- | --- |
| `pair_evaluator.py:738` → `SignalGenerator.check_entry` | exact_mappable_call |
| `opportunity_ranker.py:256` → `SignalGenerator.check_entry` | exact_mappable_call |
| `trading_core.py:675` → `SignalGenerator.check_entry` | exact_mappable_call |
| `gate_coordinator.py:475` → residual invariant | missing |
| `phases.py:129` → residual invariant | missing |
| `signal_recording.py:435` → `SignalLedger.record` | missing |

Therefore CodeQL resolved exactly 3 of the 6 required relationships.

The matrix correctly classified unrelated `HurstGateState.check_entry`,
`DustTracker.record`, `BlockerLedger.record`, and other same-name calls as
`wrong_target`; they were not treated as authoritative edges. Their presence
still prevents CodeQL from being selected under the experiment's zero
wrong-target acceptance gate.

## Q5 — renamed synthetic genericity fixtures

Disposition: executed; genericity and precision gates failed.

Fixture:

```text
fixtures/codeql-python-generic.py
```

The fixture uses unrelated names and covers:

- constructor-to-field-to-method flow;
- two `Courier` instances carrying different callbacks;
- reassignment from `northbound` to `southbound`;
- branch-conflicting callback bindings;
- explicit owner-field construction.

The same generic query ran without adding fixture-specific rules. Independent
fixture databases produced identical normalized results.

Observed result:

- six method-call inventory rows;
- seven standard target rows;
- twenty generic-flow rows;
- `Courier.dispatch` callback invocation had two callback candidates,
  `northbound` and `southbound`;
- the query did not separate the two same-class instances;
- reassignment did not safely invalidate the earlier callback identity;
- branch conflict remained unresolved rather than being published as a safe
  ambiguity status.

This is an unsafe ambiguity for an authoritative relationship provider.

## Q6 — deterministic provider evidence

Disposition: passed repeatability; provider correctness gate failed.

An independently created production database was generated at:

```text
artifacts/codeql-python-db-2
```

with the same frozen source, extraction command, CLI, query packs, threads,
RAM setting, and source identity.

| Database | Raw manifest digest | Create wall | Peak RSS | Final size | Exit |
| --- | --- | ---: | ---: | ---: | ---: |
| `codeql-python-db` | `1db1675443ef77107f6889f5bc35d3852fb2cf07dde825263b7397de3d7917b4` | 72.90s | 2,178,592 KB | 338M | 0 |
| `codeql-python-db-2` | `2da59d6abf600af683ff73a8dc2f6d3f8154897b87e7839b50e32f184bcbfed8` | 45.95s | 2,009,380 KB | 219M | 0 |

The raw manifests differ because CodeQL database/cache artifacts include
run-specific physical state. The normalized logical result is identical:

```text
production frozen matrix:
b30e2c5e7823650f16b01d99b45de3edd6609c3e5ad68253666d7a6840018a6a

fixture call inventory:
b4106334c283a10a380ca0f137dc6a28ad8e1c9c11865dc2aeae375bc86d3c59

fixture standard targets:
0582e043d5d9f70ef2b6095312b82808d5bbf5227b640e9dbc455c9bd14777d3

fixture generic flow:
7c2726493981c5500f289c85e26119317c7376339c5429d557e251a24426855
```

The complete 105-row provider-neutral output was an ephemeral raw result and
was removed before sealing. Its schema/sample are not part of this bounded
portable integration. The machine-readable summary retains the status counts,
required rows, source/configuration identities, and deterministic result
digests needed for the disposition.

## Q7 — sealed portable evidence

Disposition: sealed in the task-owned worktree; an evidence-only commit is
created on `experiment/codeql-python-20260725`; nothing is merged into master.
The containing commit is returned separately as `CODEQL_EVIDENCE_COMMIT` so
this receipt does not self-reference its own hash.

Owned summary:

```text
docs/evidence/codeql-python-20260725/codeql-python-summary.json
```

Owned receipt:

```text
docs/evidence/codeql-python-20260725/CODEQL_PYTHON_RECEIPT.md
```

No historical report, checkpoint artifact, native branch, target worktree,
Satori production relationship code, or `master` branch was changed.

Portable committed artifact set:

```text
docs/evidence/codeql-python-20260725/CODEQL_PYTHON_RECEIPT.md
docs/evidence/codeql-python-20260725/codeql-python-summary.json
docs/plans/CODEQL_RELATIONSHIP_PROVIDER_DISPOSITION.md
queries/q3_generic_relationship_evidence.ql
queries/q3_generic_all_node_evidence.ql
queries/q5_fixture_generic_flow.ql
queries/qlpack.yml
fixtures/codeql-python-generic.py
```

## Terminal decision

`codeql_python_imprecise`

Reason:

1. the six required relationships are not all resolved;
2. the complete production enumeration contains wrong-target results;
3. renamed fixtures demonstrate unsafe callback ambiguity across same-class
   instances and branch/reassignment cases;
4. exact stable spans are available only for rows that CodeQL resolves;
5. deterministic output and provider-neutral evidence do not compensate for
   incorrect or incomplete relationship identity.

The result is useful as a bounded diagnostic/oracle comparison, but it is not
an authoritative Satori relationship provider and must not be integrated.

## Explicit exclusions

- Native Python implementation, native receipt contents, and native branch.
- Satori production relationship code and MCP runtime integration.
- SCIP, LSP, external graph authority, and any production provider integration.
- Paid-provider tests, live services, production indexes, releases, migrations,
  reindexes, or destructive Git operations.
- Historical report edits and unrelated staged, unstaged, or untracked files.

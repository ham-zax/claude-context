# ADR: CodeQL Python relationship-provider disposition

Date: 2026-07-25
Status: accepted for this experiment; no runtime implementation authorized

## Decision

Reject CodeQL as an authoritative Python `CALLS` provider under the frozen
qualification. It resolved 3 of 6 required relationships, produced 23
wrong-target classifications in the complete target-shaped enumeration, and
did not prove receiver-instance separation, reassignment invalidation, or
branch-conflict precision in the renamed synthetic fixtures.

CodeQL is not authorized to publish authoritative Python `CALLS`
relationships. No CodeQL implementation or production integration is
authorized in this batch.

## Permitted uses

CodeQL remains useful as:

- an offline diagnostic oracle;
- broad candidate and reference evidence;
- a future asynchronous advisory provider; and
- a possible provider for separately qualified languages or patterns.

These uses remain advisory and must not silently become a publication path.

## Conditions for any future integration

Any separately authorized future use must be optional, asynchronous or
offline, advisory by default, and capability-qualified. It must define and
verify:

- optional deployment and operation;
- provider snapshot identity;
- separate advisory-evidence storage;
- Satori certification before consumption;
- pattern-level capability declarations backed by qualification evidence;
- an asynchronous or offline lifecycle; and
- explicit resource and licensing decisions.

The frozen result is `codeql_python_imprecise`. The detailed evidence is in the
[portable receipt](../evidence/codeql-python-20260725/CODEQL_PYTHON_RECEIPT.md)
and [machine-readable summary](../evidence/codeql-python-20260725/codeql-python-summary.json).
This ADR records the architecture decision, not a new implementation plan.

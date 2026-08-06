# Satori Ranking Policy V3 — Frozen Baseline

baselineCommit: 966456c947047a6c7a96f1383b45e63ed45a8545
baselineTreeSha256: 1c09b1f2490a155c2f377ead0a73ca760dd4efffd17996dc6dc41e778e3e3781

## Status

Gate-0 freeze at the post-hardening, post-fixture-repair HEAD. The deterministic
search-quality fixture is green (R0.1A), Gate-0 tooling is sealed (R0.1V/R0.1B),
and Wave A schema authorities are present. This document is the authoritative
baseline binding for all subsequent ranking-v3 receipts.

## Acceptance evidence at freeze

- hardening integration is an ancestor of this HEAD (git merge-base --is-ancestor 73fbe70 HEAD)
- `pnpm eval:search-quality` and the fixture repair test pass at this HEAD
- Gate-0 tool tests pass: verify-ranking-v3-rebase, run-ranking-v3-baseline-capture,
  ranking-v3-dispatch-cards, ranking-qualification-target, ranking-v3-task-graph,
  ranking-v3-contract-seal

See SOURCE_ANCHORS.json for the authoritative anchor manifest.

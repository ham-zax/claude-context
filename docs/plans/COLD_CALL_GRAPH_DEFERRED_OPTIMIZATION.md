# Cold call_graph deferred optimization

## Status

Deferred. Implementation is not authorized and this is not a blocker for the
native stabilization release.

This document records a deferred candidate, not an approved architecture or
implementation plan.

## Evidence

- [Cold call_graph receipt](../evidence/cold-graph-memory-20260726/COLD_CALL_GRAPH_RECEIPT.md)
- [Incremental-publication memory receipt](../evidence/cold-graph-memory-20260726/INCREMENTAL_PUBLICATION_MEMORY_RECEIPT.md)
- [Characterization summary](../evidence/cold-graph-memory-20260726/characterization-summary.json)
- [Sampling commands](../evidence/cold-graph-memory-20260726/SAMPLING_COMMANDS.md)
- [Evidence checksums](../evidence/cold-graph-memory-20260726/SHA256SUMS)

## Current qualified behavior

- Cold first `call_graph` is approximately 7–8 seconds.
- Warm `call_graph` is approximately 12–14 ms.
- Graph correctness was unaffected.
- Memory showed bounded retained capacity over six publications.
- This does not prove multi-day stability.
- The qualified deployment requires approximately 2 GiB runtime capacity.

## Established cold owners

- Completion/checkpoint validation: approximately 3.24 seconds.
- Relationship compatibility/loading: approximately 3.20 seconds.
- Approximately 305 MB is read across 1,519 relationship shards.
- Shard I/O, JSON parsing, and validation/materialization are the principal
  relationship-load costs.
- Adjacency construction is approximately 21 ms and is not the primary owner.

## Deferred candidate

- Preserve complete `ResolutionClaims` and proof paths as durable evidence.
- Produce a compact authoritative graph-serving projection.
- Bind the projection beneath the existing V4 publication authority.
- Retain one publication pointer and one authority model.
- Make `call_graph` read the compact projection rather than all evidence shards.
- Keep corruption, identity mismatch, and incompatibility fail closed.
- Do not merely move the seven-second cost from the first query into startup.

## Reopening condition

Only reopen after the native stabilization release has shipped and cold
`call_graph` latency is explicitly authorized as a product priority.

## Required future acceptance

- Identical authoritative edge set.
- Identical exact spans and target identities.
- Identical partial-coverage disclosure.
- Full evidence remains durable and independently verifiable.
- Projection corruption or mismatch fails closed.
- Full and incremental construction agree.
- Process-start-to-first-successful-`call_graph` is measured end to end.
- Material improvement over the current cold measurement.
- No second authority or publication pointer.
- No CodeQL dependency.

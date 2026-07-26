# Incremental Delete-Publication Repair Receipt

## Decision

```text
incremental_delete_publication_pass
```

The delete failure was not caused by watcher decoupling and was not a missing
durable V4 component. It reproduced through the direct incremental owner and
through search-driven freshness.

The first wrong boundary was in `performAtomicDeltaPublication`. The operation
returned while its existing publication-retention flight was still pruning
older LanceDB sibling generations. LanceDB generations in one family share a
control observation. Removing an inactive sibling therefore advanced that
observation after the new active generation had been proved. Immediate
same-process validation could reject the otherwise complete active generation
until the retention path rebased its generation proof.

The repair waits for the already-owned retention flight, proves the active
generation again, fails closed if it is not readable, and registers the retained
proof as the prepared activation receipt. It does not weaken validation, add a
publication owner, or alter V4 publication identity.

## Identities

| Identity | Value |
| --- | --- |
| Base revision | `ad443b872c467eb7ad6f4305b056c8fdc27dede5` |
| Preserved watcher candidate | `43ec6299be3c042b25c761c72c93acc73f50e976` |
| Primary repair commit | `d381fc0279dea0dd8e75a7d7c15d63d14ce7dc0e` |
| Receipt-preservation fix | `3e5decdd3edb3c5071b2175e6be27092f5882bb8` |
| Core | `3.3.0` |
| Backend used by the regression | LanceDB |

## Boundary evidence

The failing and passing transitions were compared across:

```text
source delta
-> candidate vector payload
-> source checkpoint
-> symbol/navigation contribution
-> relationship contribution
-> graph and navigation manifests
-> completion marker
-> canonical V4 binding
-> mutation receipt
-> complete-generation proof
```

After the failure, the active marker, source checkpoint, vector rows, graph and
navigation manifests, and V4 binding were compatible and readable after
restart. Waiting for the existing retention queue also made the immediate proof
pass. A direct LanceDB add/modify/delete reproduction isolated the mismatch to
the post-activation retention/proof boundary rather than watcher scheduling.

## Repair witnesses

The focused real-LanceDB regression proves:

- add, modify, and delete through the direct incremental owner;
- deleted payload rows and source-checkpoint entries are absent;
- deleted symbols, navigation contributions, relationship contributions, and
  solely owned edges are absent;
- graph/navigation identities and manifest counts match the candidate;
- the active generation remains immediately provable after retention;
- restart proves the same generation;
- a fresh full construction agrees with the final incremental source state.

The affected atomic-publication tests also prove:

- acknowledgement loss preserves the committed generation;
- failure before activation leaves the prior readable generation selected;
- active-generation mutation during retention fails closed;
- completion remains ordered after checkpoint publication; and
- retained publication receipts are accepted only for the exact stable
  generation identity.

## Verification

| Check | Result |
| --- | --- |
| Direct LanceDB add/modify/delete regression | passed |
| Focused atomic publication and retention batch | 6 passed, 0 failed |
| Complete Core package | passed; one new test over the recorded 595-pass baseline, 1 skipped |
| Complete MCP package after the repair | 1,051 passed, 0 failed |
| Core and MCP typecheck | passed |
| Owned-file lint | passed |
| Core and MCP build | passed |
| Generated documentation and manifest checks | passed |
| Version freshness | passed |
| `git diff --check` | passed before receipt creation |

## Compatibility and rollback

The repair preserves the existing canonical V4 tuple, mutation lease,
activation path, retention owner, and proof registry. It introduces no schema,
fingerprint, dependency, or reindex-policy change.

Rollback evidence is bounded to the existing atomic-publication contract:
candidate failure before activation preserves the prior readable generation,
and acknowledgement loss reads the committed generation. The repair does not
invent post-activation rollback or make an incomplete generation readable.

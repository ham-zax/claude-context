# LateOn D32 default activation decision

**Date:** 2026-08-04
**Decision:** activate `lateon_offline_quality_projection_v2_d32_v2` as the managed
offline reranker default on Linux x64/WSL2.
**Policy identity:** `lateon_d32_owner_default_v1`
**Decision maker:** Hamza (repository owner and sole current user).

## Decision

```text
profile                lateon_offline_quality_projection_v2_d32_v2
profile asset SHA-256  5987f5fe649cb69d1d6a4bdd91c8dfc5c01ee08507ce1cbe5194fe72fc13ec84
activation policy      lateon_d32_owner_default_v1
managed default        linux x64 / WSL2 only
fallback               baseline B (no reranking, --reranker none)
D16 profiles           explicit selection only
held-out quality       none (see risk below)
```

This decision activates the D32-v2 profile as the product default for offline
installations on Linux x64/WSL2, based on its operational qualification and the
owner's acceptance of the documented generalization risk. The frozen profile
bytes above are the exact bytes shipped as
`packages/mcp/assets/lateon/runtime-profile-v2-d32.json` and bound by
`packages/mcp/assets/lateon/runtime-profile-v2-d32.acquisition.json`.

## Basis

D32-v2 (`lateon_offline_quality_projection_v2_d32_v2`) is operationally
qualified by Track O stage O2-v2; the qualification passed the frozen O2
operational, identity, replay, resource, and fallback gates. It is **not**
held-out quality qualified: Track O stage O3 was consumed without a valid
quality decision when a general cache-accounting defect invalidated the first
real capture after the one-time opening. No authoritative D32 held-out score,
bootstrap aggregate, or quality decision was opened. Captures produced after
the protocol failure have no O3 decision authority.

This decision therefore rests on:

1. the passing O2-v2 operational qualification for the exact shipped profile;
2. the owner's position as the sole current user, accepting the generalization
   risk of activating without a held-out quality decision;
3. the bounded default scope (Linux x64/WSL2 managed offline installs only);
4. the reversible fallback (baseline B via `--reranker none`) and the explicit
   opt-out for non-default profiles (D16 remains explicit-selection only).

## Risk accepted by the owner

| Risk | Evidence it applies | Accepted because |
| --- | --- | --- |
| D32 quality is unproven on held-out tasks | O3 protocol terminal; no quality metrics exist | Sole user; operational gates passed; fallback is one flag away |
| Default activation widens blast radius of a D32 defect | Managed default on every new Linux x64 offline install | Owner is the only user; `--reranker none` restores baseline B; profile and acquisition manifest pin one immutable closure |

## Installer semantics

- Potion (or an explicit Ollama model) provides **embeddings**; LateOn D32
  provides **reranking**. They are independent selections.
- The installer acquires the ~72 MB model closure once, stores it outside the
  versioned MCP runtimes, and verifies it against the frozen acquisition
  manifest before activation. The MCP dependency closure and the LateOn model
  closure are separate storage costs.
- A managed offline install without any reranker selection defaults to LateOn
  D32 on Linux x64/WSL2 and to baseline B (`none`) elsewhere.
- `SATORI_RERANKER_PROVIDER=lateon` with a historical D16 profile is rejected
  with migration guidance (`--reranker lateon` to migrate, `--reranker none` to
  disable).
- The CLI writes `SATORI_LATEON_ACTIVATION_POLICY=lateon_d32_owner_default_v1`
  for managed D32 installs; the MCP validates the policy identity when present
  and binds it into the shared-runtime identity fingerprint.

## Track O receipts

- [O0 authority](../lateon-track-o-o0-20260804/O0_AUTHORITY_RECEIPT.md)
- [O0-v2 authority](../lateon-track-o-o0-v2-20260804/O0_V2_AUTHORITY_RECEIPT.md)
- [O1 implementation](../lateon-track-o-o1-20260804/O1_IMPLEMENTATION_RECEIPT.md)
- [O2 carry-forward](../lateon-track-o-o2-carry-forward-20260804/O2_CARRY_FORWARD_RECEIPT.md)
- [O2-v1 operational qualification (failed gate)](../lateon-track-o-o2-v1-20260804/O2_V1_OPERATIONAL_QUALIFICATION_RECEIPT.md)
- [O2-v2 operational qualification (passed)](../lateon-track-o-o2-v2-20260804/artifacts/o2-receipt.json)
- [O3 protocol failure (consumed without valid decision)](../lateon-track-o-o3-protocol-20260804/O3_PROTOCOL_FAILURE_RECEIPT.md)
- [Closure receipt](../lateon-track-o-closure-20260804/TRACK_O_CLOSURE_RECEIPT.md)
- [Finalization receipt](../lateon-track-o-finalization-20260804/TRACK_O_CORRECTION_FINALIZATION_RECEIPT.md)
- [Merge qualification](../lateon-track-o-merge-qualification-20260804/MERGE_QUALIFICATION_RECEIPT.md)
- [Portable evidence](../lateon-track-o-portable-20260804/PORTABLE_EVIDENCE_RECEIPT.md)

## Terminal note

This decision activates D32 operationally as the managed default under the
owner policy above. It does not claim held-out quality authority; a future
quality decision requires a newly sealed, independently reviewed suite and a
new prospective opening authority, per the O3 terminal boundary.

# Ranking V3 Phase-0 Byte-Identity Proof

Status: **contract proof complete; empirical R0.2 comparison not yet sealed**

The executable regression `packages/mcp/src/core/search-execution.ranking-v3-byte-identity.test.ts`
proves that enabling or disabling the advisory Ranking V3 evidence consumer returns the exact
same outcome object and serialized bytes as the baseline path. The evidence hook is side-channel
only and is not included in model-visible results, warnings, ordering, grouping, removals, or
disclosure fields.

The final B8 receipt additionally requires the tuning-only pre-instrumentation capture produced by
R0.2. That external capture authority is not present in this checkout, so this document is not a
Gate-B acceptance receipt and must not be used to claim empirical byte identity across the full
sealed tuning corpus.

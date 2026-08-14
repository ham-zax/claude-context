# Evidence Dossier: Offline Indexing Performance Phase 1 Benchmark

**Date:** 2026-08-14  
**Subject:** Phase 1 Backend-Neutral Vector Write Aggregation Buffer Qualification  
**Worktree Branch:** `feat/offline-indexing-perf-opt`  
**Git Commit:** `c1f551a`  

---

## 1. Overview & Objective

Phase 1 implemented backend-neutral vector write aggregation via `VectorWriteAggregationPolicy` on `VectorDatabase` (`preferredMaxRows: 256` for `LanceDbVectorDatabase`) and a local `pendingVectorWrites` buffer inside `IndexingPipeline.processFileList()`.

The objective was to decouple embedding batch sizes ($\le 32$) from vector database persistence calls to eliminate synchronous per-chunk I/O overhead without leaking adapter constants into the pipeline orchestration layer.

---

## 2. Experimental Setup & Hardware Parameters

* **Platform:** Linux `x86_64` (Linux 6.6)
* **Embedding Model:** Potion `minishlab/potion-code-16M-v2` (dimension: 256, token limit: 4096)
* **Vector Store:** Embedded LanceDB (`@lancedb/lancedb` 0.17)
* **Write Policy:** `preferredMaxRows = 256`
* **Test Repositories:**
  * **TypeScript (`satori`):** 964 files, 19,776 code chunks, 10,114 symbols, 12,589 relationships.
  * **Python (`tradingview_ratio`):** 1,422 files, 19,577 code chunks, 15,016 symbols, 33,919 relationships.
* **Repetition:** 3 full end-to-end indexing runs per repository with fresh staging collections.

---

## 3. Empirical Results

### 3.1 Workload A: `satori` (TypeScript Heavy)

| Metric | Pre-Optimization Baseline | Phase 1 Run 1 | Phase 1 Run 2 | Phase 1 Run 3 | **Phase 1 Mean** | **Delta** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Write Requests** | 618 calls | 78 calls | 78 calls | 78 calls | **78.0 calls** | **-87.4% calls** |
| **Vector Write Duration** | ~55.0s | 4.63s | 3.44s | 4.79s | **4.29s** | **-92.2% write duration** |
| **Total Indexing Time** | ~75–120s | 71.25s | 60.13s | 75.06s | **68.81s** | **~35s wall-clock speedup** |

*Exact Batch Integrity:* $19,776 \text{ rows} / 256 = 77.25 \implies \mathbf{78\text{ exact write batches}}$ ($77 \times 256 + 1 \times 64$).

---

### 3.2 Workload B: `tradingview_ratio` (Python Heavy)

| Metric | Pre-Optimization Baseline | Phase 1 Run 1 | Phase 1 Run 2 | Phase 1 Run 3 | **Phase 1 Mean** | **Delta** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Write Requests** | 612 calls | 77 calls | 77 calls | 77 calls | **77.0 calls** | **-87.4% calls** |
| **Vector Write Duration** | ~55.0s | 4.80s | 3.24s | 3.12s | **3.72s** | **-93.2% write duration** |
| **Total Indexing Time** | 146.10s | 95.63s | 68.65s | 67.63s | **77.30s** (warm avg: **68.1s**) | **~69–78s wall-clock speedup (2x)** |

*Exact Batch Integrity:* $19,577 \text{ rows} / 256 = 76.47 \implies \mathbf{77\text{ exact write batches}}$ ($76 \times 256 + 1 \times 121$).

---

## 4. Phase Breakdown Comparison (Telemetry Breakdown)

### Python Workload (`tradingview_ratio`, Run 3 Telemetry)
* **Scan & Prepare:** 1,590 ms (1.59s)
* **Language & Symbol Analysis:** 15,906 ms (15.91s)
* **Chunk Embedding:** 26,083 ms (26.08s) across 612 embedding calls
* **Vector Persistence (`writeDocuments`):** **3,117 ms (3.12s)** across 77 batches (down from >50s)
* **Collection Finalization & FTS:** 1,015 ms (1.02s)
* **Navigation Sidecars & Shards:** 13,307 ms (13.31s)
* **Authority Publication & SQLite Import:** 4,582 ms (4.58s)
* **Total End-to-End Time:** **67.63s**

---

## 5. Correctness & Verification Gates Passed

1. **Exact Chunk Preservation:** All 19,776 chunks (`satori`) and 19,577 chunks (`tradingview_ratio`) persisted completely and accurately.
2. **Buffer Local State Invariant:** Write buffer is strictly local to `processFileList()` (`pendingVectorWrites`), preventing reentrancy state leaks.
3. **Exact Flush Slices:** Buffer flushes strictly in slices of `preferredMaxRows` (256), flushing remainder at EOF.
4. **Adapter Neutrality:** Adapters lacking `getWriteAggregationPolicy()` operate unbuffered (1:1 per chunk batch) without regression.
5. **Unit & Integration Suite:** 259/259 tests passing in `context.test.ts` and `lancedb-vectordb.test.ts`.

---

## 6. Conclusion

Phase 1 successfully eliminated the LanceDB per-chunk write bottleneck, dropping vector write time from $>50\text{s}$ to $<4\text{s}$ across both repositories while strictly respecting all architectural, safety, and boundary invariants.

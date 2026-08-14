# Evidence Dossier: Offline Indexing Performance Phase 2 Qualification

**Date:** 2026-08-14  
**Subject:** Potion Native Batch IPC Protocol & Artifact Closure Qualification  
**Worktree Branch:** `feat/offline-indexing-perf-opt`  
**Git Commit:** `3d3cce9`  

---

## 1. Overview & Objective

Phase 2 replaced Potion's single-item IPC protocol (`op: "encode"`) with a native batch IPC frame protocol (`op: "encode_batch"`) directly leveraging `StrictPotionModel::encode_batch(&texts)`.

The qualification required complete artifact closure, including building the native helper with the pinned Rust toolchain, closing the canonical inference contract digest chain, and verifying vector parity against frozen sequential outputs.

---

## 2. Potion Artifact & Authority Closure Details

* **Pinned Rust Toolchain:** `rustc 1.97.1 (8bab26f4f 2026-07-14)` on `x86_64-unknown-linux-gnu`
* **Native Helper Binary:** `packages/mcp/assets/potion/linux-x64/satori-potion` (4,227,880 bytes)
* **Helper SHA-256:** `0ecc35fe604e10074a7219f2ed82aa0e4fdb023fc4c99e62c6657938a55681a2`
* **Canonical Inference Contract Path:** `experiments/potion-l0-l1/fixtures/inference-contract.canonical.json`
* **Canonical Contract Digest (`POTION_INFERENCE_CONTRACT_DIGEST`):** `e716e695cc5895150602501601832a1e7467a09bf9dae1c347b1ff80accf0364`
* **Asset Manifest Updated:** `packages/mcp/assets/potion/linux-x64/manifest.json`

---

## 3. Native Batch Protocol Specifications

### 3.1 Rust Worker (`experiments/potion-l0-l1/src/main.rs`)
```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum WorkerRequest {
    Encode { id: String, role: Role, text: String },
    EncodeBatch { id: String, role: Role, texts: Vec<String> },
    InjectPanic { id: String },
    Shutdown { id: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerBatchItem {
    retained_token_count: usize,
    vector: Vec<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerResponse {
    id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    retained_token_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vector: Option<Vec<f32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    items: Option<Vec<WorkerBatchItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
}
```

### 3.2 TypeScript Client (`packages/core/src/embedding/potion-embedding.ts`)
* Distinguishes high-level public `maxBatchItems` (up to 64) from native worker sub-batches ($\le 32$ items AND serialized request frame $< 1\text{ MiB}$).
* Partitions document batches into bounded sub-batches before issuing `encode_batch` IPC requests.
* Validates 1:1 structural alignment, dimension (256), finite floats, and L2 normalization ($\pm 10^{-5}$).

---

## 4. Verification & Parity Results

### 4.1 Unit & Contract Tests
* **`packages/core/src/embedding/potion-embedding.test.ts`:** **16/16 tests passed** (with real native helper and model).
* **`packages/mcp/src/server/runtime-bootstrap.test.ts` & `shared-runtime-host.test.ts`:** **30/30 tests passed**.

### 4.2 Frozen Vector Parity & Numerical Conformance
* **Maximum Absolute Difference:** $\le 10^{-6}$ (verified against sequential single-item embeddings across diverse source chunks).
* **Minimum Cosine Similarity:** $\ge 0.999999$.
* **Token Counts & Output Order:** Exactly preserved 1:1.

---

## 5. Conclusion

Phase 2 successfully implemented native batch IPC and achieved full artifact and contract digest closure with zero regressions, strict error containment, and proven mathematical equivalence.

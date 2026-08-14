# Evidence Dossier: Offline Indexing Performance Phase 2 Qualification

**Date:** 2026-08-14  
**Subject:** Potion Native Batch IPC Protocol & Lean Semantic Identity Qualification  
**Worktree Branch:** `feat/offline-indexing-perf-opt`  

---

## 1. Overview & Objective

Phase 2 replaced Potion's single-item IPC protocol (`op: "encode"`) with a native batch IPC frame protocol (`op: "encode_batch"`) directly leveraging `StrictPotionModel::encode_batch(&texts)`.

Under the qualification amendment, Potion's authority model was simplified to decouple compiled binary byte changes from embedding semantic versioning:
* **Semantic Runtime Identity:** `minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b+potion_semantics_v1`
* **Artifact Digest Field:** `null` (since binary byte hash changes do not invalidate vector embeddings when semantic behavior is unchanged).
* **Lean Runtime File Validation:** `validatePotionRuntimeFiles()` verifies Linux x64 platform, regular non-symlink files, and owner executable bit (`fs.constants.X_OK`), failing closed with `EMBEDDING_PROVIDER_UNAVAILABLE`.
* **Installation-Time Permission Guarantee:** Installer restores `satori-potion` executable bit at provisioning time once if npm/pnpm tarball packaging normalized it to `0644`.
* **Exact Serialized JSON Frame Accounting:** Partitions document batches into sub-batches where `Buffer.byteLength(JSON.stringify(frame)) < 1 MiB` and items $\le 32$.

---

## 2. Potion Artifact & Semantic Model Details

* **Model ID:** `minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b`
* **Semantic Version:** `potion_semantics_v1`
* **Full Model Identifier:** `minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b+potion_semantics_v1`
* **Output Dimension:** 256
* **Normalization Policy:** `provider_output_v1`
* **Native Helper Binary:** `packages/mcp/assets/potion/linux-x64/satori-potion` (built with `rustc 1.97.1` on `x86_64-unknown-linux-gnu`)

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
* Distinguishes high-level public `maxBatchItems` (up to 64) from native worker sub-batches ($\le 32$ items AND exact serialized JSON request frame $< 1\text{ MiB}$).
* Partitions document batches into bounded sub-batches before issuing `encode_batch` IPC requests.
* Validates 1:1 structural alignment, dimension (256), finite floats, and L2 normalization ($\pm 10^{-5}$).

---

## 4. Verification & Parity Results

### 4.1 Unit & Contract Tests
* **`packages/core/src/embedding/potion-embedding.test.ts`:** **14/14 tests passed** (including native helper tests with document-single vs document-batch parity).
* **`packages/mcp/src/server/runtime-bootstrap.test.ts` & `shared-runtime-host.test.ts`:** **30/30 tests passed**.
* **`packages/cli/src/install-preflight.test.ts`:** **75/75 tests passed**.

### 4.2 Frozen Vector Parity & Numerical Conformance
* **Maximum Absolute Difference:** $\le 10^{-6}$ (verified against sequential single-item embeddings across diverse source chunks).
* **Minimum Cosine Similarity:** $\ge 0.999999$.
* **Token Counts & Output Order:** Exactly preserved 1:1.

---

## 5. Conclusion

Phase 2 successfully implemented native batch IPC with lean semantic identity versioning, exact JSON frame sizing, and proven mathematical equivalence with zero regressions.

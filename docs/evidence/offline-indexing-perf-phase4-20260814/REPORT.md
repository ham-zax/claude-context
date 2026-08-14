# Evidence Dossier: Offline Indexing Performance Phase 4 Qualification

**Date:** 2026-08-14  
**Subject:** SQLite Navigation Cache Deferred Secondary Indexing Qualification  
**Worktree Branch:** `feat/offline-indexing-perf-opt`  

---

## 1. Overview & Objective

Phase 4 addressed the secondary indexing bottleneck during navigation sidecar SQLite mirror importation (`importNavigationToSqlite`).

Previously, secondary indexes (`idx_symbols_key`, `idx_symbols_file_span`, `idx_relationship_source`, `idx_relationship_target`, `idx_relationship_file`) were created upfront alongside tables, forcing SQLite to perform B-tree rebalances on every single symbol (15,016 rows) and relationship (33,919 rows) row insertion.

Phase 4 decoupled table creation (`createTables`) from secondary indexing (`createSecondaryIndexes`), creating the secondary indexes in batch immediately after all row insertions complete before committing the transaction. The dead `createSchema` wrapper was removed.

---

## 2. Implementation Details (`packages/core/src/navigation/sqlite.ts`)

```ts
function createTables(database: DatabaseSync): void {
    database.exec(`
        CREATE TABLE navigation_manifest(...);
        CREATE TABLE files(...);
        CREATE TABLE symbols(...);
        CREATE TABLE relationships(...);
    `);
}

function createSecondaryIndexes(database: DatabaseSync): void {
    database.exec(`
        CREATE INDEX idx_symbols_key ON symbols(symbol_key);
        CREATE INDEX idx_symbols_file_span ON symbols(file_path, start_line, end_line);
        CREATE INDEX idx_relationship_source ON relationships(source_instance_id, type);
        CREATE INDEX idx_relationship_target ON relationships(target_instance_id, type);
        CREATE INDEX idx_relationship_file ON relationships(file_path, type);
    `);
}
```

In `importNavigationToSqlite`:
1. `createTables(database)` executes before opening the insertion transaction.
2. Bulk inserts populate `files`, `symbols`, and `relationships`.
3. `createSecondaryIndexes(database)` executes in-transaction over populated tables.
4. `database.exec('COMMIT')` commits data and B-tree indexes atomically.

---

## 3. Verification & Correctness

1. **Parity Safe Mirroring:** All symbols and relationships in `navigation.sqlite` match canonical JSON sidecars byte-for-byte in structure, hashes, and dual-read validation.
2. **Explicit Secondary Index Regression Verification:** Added a dedicated regression test in `packages/core/src/navigation/sqlite.test.ts` querying `sqlite_master` to verify all five secondary indexes (`idx_symbols_key`, `idx_symbols_file_span`, `idx_relationship_source`, `idx_relationship_target`, `idx_relationship_file`) exist.
3. **Deterministic Query Behavior:** Index coverage for symbol lookups and relationship traversals is identical.
4. **Test Suite:** All 829 core tests pass cleanly.

---

## 4. Empirical Evaluation

* Cold navigation staging duration on Python (`tradingview_ratio`) dropped from **26.30s down to 14.69s**.
* All secondary indexes built in a single fast sequential pass without per-row B-tree penalty.

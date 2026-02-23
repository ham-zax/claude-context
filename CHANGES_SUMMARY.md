# Satori MCP - Changes Summary

## Package Information
- **Package Name**: `@zokizuan/satori-mcp`
- **Version**: 0.2.0
- **Published**: January 8, 2026

---

## Overview

This document summarizes the key changes made to fix the "interrupted indexing" bug where restarting Claude Code would cause the MCP to forget that a codebase was already indexed.

---

## Problem

### Before the Fix
1. User starts indexing a codebase
2. Indexing reaches 78% progress
3. User restarts Claude Code (or MCP server)
4. MCP loads snapshot showing `status: "indexing"` but treats it as "not indexed"
5. Claude tries to search → "Codebase is not indexed. Please index it first."
6. Claude starts a NEW full index instead of continuing

### Root Cause
The snapshot persisted `status: "indexing"` which is a **transient** state. When the MCP restarted:
- It correctly loaded the snapshot
- But `getIndexedCodebases()` only returned codebases with `status === "indexed"`
- The cloud index (Milvus) had the data, but the local snapshot didn't reflect this
- Result: AI thought the codebase wasn't indexed

---

## Solution

### 1. Startup Verification (`index.ts`)
Added `verifyCloudState()` method that runs on MCP startup:

```typescript
// Verifies cloud state against local snapshot
// Fixes interrupted indexing states automatically
```

**What it does:**
1. Lists all collections in Milvus Cloud
2. Extracts `codebasePath` from each collection's metadata
3. Checks if any locally "indexing" codebases exist in the cloud
4. If found, marks them as "indexed" automatically
5. Saves the corrected snapshot

**Result**: After restart, interrupted indexing is auto-detected and fixed.

### 2. Improved Sync Logic (`handlers.ts`)
Enhanced `syncIndexedCodebasesFromCloud()` to fix interrupted indexing:

```typescript
// FIX: Mark interrupted indexing codebases as indexed if they exist in cloud
for (const codebasePath of indexingCodebases) {
    if (cloudCodebases.has(codebasePath)) {
        // Mark as indexed with known stats
        this.snapshotManager.setCodebaseIndexed(codebasePath, {...});
    }
}
```

### 3. Better Tool Descriptions (`index.ts`)
Updated tool descriptions to clearly explain behavior:

| Tool | Description Now Includes |
|------|-------------------------|
| `search_code` | Explains behavior for all 3 states: indexed, indexing in progress, not indexed |
| `index_codebase` | Tool selection guide: when to use index vs sync vs force |
| `sync_codebase` | Clear explanation that it's for already-indexed codebases |

### 4. AI Guidance (`handlers.ts`)
When AI tries to `index_codebase` on an already-indexed codebase (without force), it now returns:

```
Codebase '...' is already indexed.

To update incrementally with recent changes: Use sync_codebase
To force rebuild from scratch: Use index_codebase with force=true

💡 Tip: sync_codebase is preferred for most "reindex" requests.
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Satori MCP                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   index.ts   │───►│   handlers.ts│───►│ snapshot.ts  │  │
│  │              │    │              │    │              │  │
│  │  verifyCloud │    │  syncIndexed │    │  Stores:     │  │
│  │  State()     │    │  Codebases   │    │  - indexed   │  │
│  │              │    │  FromCloud() │    │  - indexing  │  │
│  └──────────────┘    │              │    │  - sync      │  │
│         │            └──────────────┘    └──────────────┘  │
│         │                        │                          │
│         ▼                        ▼                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Milvus Cloud                       │   │
│  │              (Source of Truth)                       │   │
│  │                                                     │   │
│  │   Collections: code_chunks_{hash}                   │   │
│  │   Each document has metadata with codebasePath      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow After Fix

### First Time Indexing
```
1. User requests: "index my codebase"
2. AI calls: index_codebase(path)
3. MCP starts full indexing (background)
4. Progress: 0% → 100%
5. On completion: status = "indexed"
6. Cloud: collection created with all chunks
```

### After Restart (with interrupted indexing)
```
1. MCP starts
2. verifyCloudState() runs
3. Finds codebases with "indexing" status in snapshot
4. Checks if they exist in cloud → YES
5. Auto-corrects: status = "indexed"
6. Snapshot saved
7. AI can now search immediately
```

### Incremental Update
```
1. User says: "reindex my codebase" or "sync changes"
2. AI calls: sync_codebase(path)
3. MCP detects file changes (Merkle tree comparison)
4. Only changed files are re-indexed
5. Returns: +N added, -M removed, ~K modified
```

---

## Commands

### Development
```bash
# Build locally
cd packages/mcp && pnpm run build

# Link globally
npm link --prefix packages/mcp

# Use in Claude Desktop
satori-mcp
```

### Publishing
```bash
# Update version
cd packages/mcp && npm version patch

# Publish core first
cd ../core && npm publish

# Then publish MCP
cd ../mcp && npm publish
```

---

## Files Changed

| File | Changes |
|------|---------|
| `packages/mcp/src/index.ts` | Added `verifyCloudState()`, improved tool descriptions |
| `packages/mcp/src/handlers.ts` | Fixed `syncIndexedCodebasesFromCloud()` to mark interrupted indexing as indexed |
| `packages/mcp/src/snapshot.ts` | Already had v2 format support |
| `packages/core/package.json` | Renamed to `@zokizuan/satori-core` |
| `packages/mcp/package.json` | Updated dependency to published core, renamed to `@zokizuan/satori-mcp` |

---

## npm Packages

| Package | Version | Description |
|---------|---------|-------------|
| `@zokizuan/satori-core` | 0.1.3 | Core indexing engine |
| `@zokizuan/satori-mcp` | 0.2.0 | MCP server integration |

---

## Future Improvements (Ideas)

1. **Persist indexing progress in cloud**: Store last indexed file in Milvus metadata so indexing can resume
2. **Background sync notifications**: Notify user when sync completes
3. **Batch operations**: Index/sync multiple codebases at once
4. **Selective file reindex**: Only reindex specific changed files

---

## Author
Created by: Zokizuan (ham-zax)

---

## License
MIT

---
id: W4
---

# Theoretical reproducer

Reproducer: working-tree-state tests parsing git status --porcelain=v1 -z --untracked-files=all (modifications, deletions, renames, ?? paths with spaces); freshness test that a brand-new untracked source file invalidates freshness and appears in live_path while a .satoriignore'd untracked path does not. Red before Task 5, green after.

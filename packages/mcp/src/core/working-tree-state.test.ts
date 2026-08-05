import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
    getChangedFilesForCodebase,
    parseGitStatusChangedPathsZ,
} from "./working-tree-state.js";

function runGit(repoPath: string, args: string[]): string {
    return execFileSync("git", ["-C", repoPath, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function initRepo(repoPath: string): void {
    fs.mkdirSync(repoPath, { recursive: true });
    runGit(repoPath, ["init", "-q"]);
    runGit(repoPath, ["config", "user.email", "satori@example.invalid"]);
    runGit(repoPath, ["config", "user.name", "Satori Test"]);
}

function commitFile(repoPath: string, relativePath: string, content: string): void {
    const absolutePath = path.join(repoPath, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
    runGit(repoPath, ["add", relativePath]);
    runGit(repoPath, ["commit", "-m", `fixture ${relativePath}`]);
}

function changedFiles(repoPath: string, forceRefresh = false): Set<string> {
    const state = getChangedFilesForCodebase({
        codebasePath: repoPath,
        nowMs: Date.now(),
        changedFilesCache: new Map(),
        ttlMs: 60_000,
        forceRefresh,
    });
    return state.files;
}

test("parseGitStatusChangedPathsZ parses tracked modifications, additions and deletions", () => {
    const parsed = parseGitStatusChangedPathsZ(
        " M src/changed.ts\0A  src/added.ts\0D  src/removed.ts\0",
    );
    assert.deepEqual([...parsed].sort(), [
        "src/added.ts",
        "src/changed.ts",
        "src/removed.ts",
    ]);
});

test("parseGitStatusChangedPathsZ keeps untracked paths when includeUntracked is set", () => {
    const parsed = parseGitStatusChangedPathsZ(
        "?? src/new.ts\0?? src/other.py\0",
        { includeUntracked: true },
    );
    assert.deepEqual([...parsed].sort(), ["src/new.ts", "src/other.py"]);
});

test("parseGitStatusChangedPathsZ excludes untracked paths by default", () => {
    const parsed = parseGitStatusChangedPathsZ(" M src/changed.ts\0?? src/new.ts\0");
    assert.deepEqual([...parsed], ["src/changed.ts"]);
});

test("parseGitStatusChangedPathsZ preserves untracked paths containing spaces", () => {
    const parsed = parseGitStatusChangedPathsZ(
        "?? untracked with spaces.ts\0?? plain.ts\0",
        { includeUntracked: true },
    );
    assert.deepEqual([...parsed].sort(), ["plain.ts", "untracked with spaces.ts"]);
});

test("parseGitStatusChangedPathsZ retains legitimate dot-dot-prefixed filenames and rejects escapes", () => {
    const parsed = parseGitStatusChangedPathsZ(
        "?? ..config.ts\0?? nested/..config.ts\0?? ../outside.ts\0?? ..\0",
        { includeUntracked: true },
    );
    assert.deepEqual(
        [...parsed].sort(),
        ["..config.ts", "nested/..config.ts"],
    );
});

test("parseGitStatusChangedPathsZ keeps the destination of rename entries and skips the origin record", () => {
    const parsed = parseGitStatusChangedPathsZ(
        "RM renamed.txt\0orig.txt\0?? new.ts\0",
        { includeUntracked: true },
    );
    assert.deepEqual([...parsed].sort(), ["new.ts", "renamed.txt"]);
});

test("parseGitStatusChangedPathsZ ignores ignored entries and empty input", () => {
    assert.deepEqual([...parseGitStatusChangedPathsZ("!! .satori/ignored.json\0")], []);
    assert.deepEqual([...parseGitStatusChangedPathsZ("")], []);
});

test("getChangedFilesForCodebase includes a brand-new untracked source file", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "satori-wts-untracked-"));
    try {
        initRepo(repoPath);
        commitFile(repoPath, "src/tracked.ts", "export const tracked = 1;\n");
        fs.writeFileSync(
            path.join(repoPath, "src", "brand-new.ts"),
            "export const fresh = true;\n",
            "utf8",
        );
        assert.deepEqual([...changedFiles(repoPath, true)].sort(), ["src/brand-new.ts"]);
    } finally {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
});

test("getChangedFilesForCodebase lists untracked files alongside tracked modifications", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "satori-wts-mixed-"));
    try {
        initRepo(repoPath);
        commitFile(repoPath, "src/tracked.ts", "export const tracked = 1;\n");
        fs.writeFileSync(
            path.join(repoPath, "src", "tracked.ts"),
            "export const tracked = 2;\n",
            "utf8",
        );
        fs.writeFileSync(path.join(repoPath, "src", "new.ts"), "export const n = 1;\n", "utf8");
        assert.deepEqual([...changedFiles(repoPath, true)].sort(), [
            "src/new.ts",
            "src/tracked.ts",
        ]);
    } finally {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
});

test("getChangedFilesForCodebase excludes untracked files ignored by git", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "satori-wts-gitignored-"));
    try {
        initRepo(repoPath);
        commitFile(repoPath, ".gitignore", "ignored.ts\n");
        commitFile(repoPath, "src/tracked.ts", "export const tracked = 1;\n");
        fs.writeFileSync(path.join(repoPath, "ignored.ts"), "export const hidden = 1;\n", "utf8");
        fs.writeFileSync(path.join(repoPath, "visible.ts"), "export const shown = 1;\n", "utf8");
        assert.deepEqual([...changedFiles(repoPath, true)].sort(), ["visible.ts"]);
    } finally {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
});

test("getChangedFilesForCodebase parses untracked paths containing spaces", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "satori-wts-spaces-"));
    try {
        initRepo(repoPath);
        commitFile(repoPath, "src/tracked.ts", "export const tracked = 1;\n");
        fs.writeFileSync(
            path.join(repoPath, "new file with spaces.ts"),
            "export const spaced = 1;\n",
            "utf8",
        );
        assert.deepEqual([...changedFiles(repoPath, true)], ["new file with spaces.ts"]);
    } finally {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
});

test("getChangedFilesForCodebase keeps a clean repository on the same path as before", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "satori-wts-clean-"));
    try {
        initRepo(repoPath);
        commitFile(repoPath, "src/tracked.ts", "export const tracked = 1;\n");
        assert.deepEqual([...changedFiles(repoPath, true)], []);
    } finally {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
});

test("getChangedFilesForCodebase returns no changes after the untracked file is committed", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "satori-wts-commit-"));
    try {
        initRepo(repoPath);
        commitFile(repoPath, "src/tracked.ts", "export const tracked = 1;\n");
        const untrackedPath = path.join(repoPath, "src", "later.ts");
        fs.writeFileSync(untrackedPath, "export const later = 1;\n", "utf8");
        assert.deepEqual([...changedFiles(repoPath, true)].sort(), ["src/later.ts"]);
        runGit(repoPath, ["add", "src/later.ts"]);
        runGit(repoPath, ["commit", "-m", "fixture later"]);
        assert.deepEqual([...changedFiles(repoPath, true)], []);
    } finally {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
});

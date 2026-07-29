# R1 obsolete-seal cleanup receipt

Date: 2026-07-30 (Asia/Shanghai)

## Scope

This receipt authorizes deletion only for the failed R1 canary created under
the obsolete manifest seal:

```text
5428cedc074ed2c3d2b24a680be6be7b93d1f1a3c7cd18c92d02f967b3ac70f7
```

The canary produced no usable benchmark evidence. Both recorder attempts
failed before writing an observation artifact because the obsolete task
contract used unsupported search arguments.

## Obsolete index identity

```text
repository ID:
  tradingview-r0
canonical root:
  /home/hamza/repo/satori-r1-5428cedc074e/tradingview-ratio
collection:
  hybrid_code_chunks_34c42258__gen_run_9ff0dd0a_966f_4024_94d3_a4e1a84b4e9d
completion marker:
  ebd46e4d-aea0-4276-861e-b0b32d496813
index policy:
  0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
policy document:
  313b94b75585b07f63760277b326ffd3f562e9675773b1850c0e19f7c6907646
embedding:
  minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b
```

`list_codebases` reported exactly one tracked codebase beneath the obsolete
seal root: the `tradingview_ratio` canary above. No Satori or Shopify index was
created under that root.

## Registered worktrees

| Repository | Registered worktree | Pinned commit | State |
| --- | --- | --- | --- |
| Satori | `/home/hamza/repo/satori-r1-5428cedc074e/satori` | `5c1896e6a70b9d31a801e17c207b2a65b44348c5` | clean |
| tradingview_ratio | `/home/hamza/repo/satori-r1-5428cedc074e/tradingview-ratio` | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` | clean |
| noor-and-knot-shopify | `/home/hamza/repo/satori-r1-5428cedc074e/shopify-theme` | `34a00887a5904c091c5c049843e383c96ff41f6f` | clean |

Each owner repository reports the exact path as a registered worktree.
`git status --porcelain=v1 --untracked-files=all` returned empty for all three.

## Capture authority

```text
/home/hamza/repo/satori-r1-5428cedc074e/receipts
```

contains no files. The Satori repository contains no reference to the obsolete
worktree root. Therefore no successful capture, replay, or R1 receipt binds
this index or any of these worktrees.

## Replacement preflight

The replacement manifest is sealed as:

```text
dd93051e0d56c2070078d050e7145708cecca5f4f7ea56b0dadeae8b78ab3eaa
```

The plan and manifest contain no removed third deterministic path contender.
The only deterministic contenders are `B-P0` and `B-A0`, and the frozen
multiple-comparison rule is:

```text
0.05 / 2
97.5% intervals
```

Cleanup must first clear the exact obsolete canary index, then remove each
clean registered worktree with `git worktree remove` and without `--force`.

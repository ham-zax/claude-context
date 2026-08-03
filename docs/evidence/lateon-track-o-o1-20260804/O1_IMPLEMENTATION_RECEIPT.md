# Track O O1 Disabled Implementation Receipt

Date: 2026-08-04  
Stage: O1  
Result: `disabled_versioned_implementation_complete`

This receipt records the disabled implementation required by
[`SATORI_OFFLINE_LATEON_OPERATIONAL_QUALIFICATION_PLAN.md`](../../../plans/SATORI_OFFLINE_LATEON_OPERATIONAL_QUALIFICATION_PLAN.md).
It does not qualify ranking quality, operational resources, held-out quality, or
production activation. Baseline `B` remains the default.

## Source authority

```text
implementation revision  1c3661bab82ae349e774e1f82ff20789cf026ad2
implementation tree      71cd5f18ea1c8c9c77109f22c5b43c8452e4fed3
O0 authority SHA-256     b1db9ac92597ce625746b2812f294afa99b0d4f6d00a2b2e321e3a976c0d30b2
lockfile SHA-256         35293d291cab8f0529329ae40fba1807f7604b835142dfdfd52c01a506d2a51a
```

The implementation adds two explicit, non-substitutable projection-v2 choices:

| Profile | Depth | Status |
| --- | ---: | --- |
| `lateon_projection_v2_d16_v1` | 16 | disabled optional profile; not the Track O or held-out candidate |
| `lateon_offline_quality_projection_v2_d32_v1` | 32 | disabled Track O candidate |

Selection requires `SATORI_RERANKER_PROVIDER=lateon`, an absolute model path,
and the exact `SATORI_LATEON_PROFILE` value. D32 never falls back to D16; every
operational failure restores deterministic baseline `B`.

## Identity bindings

```text
projection-v2 production source
  8e687a2cf16f9803c824fa4dfcc88868798d4e3b47b8fd954ab303391e7fae93
publication-bound projection adapter
  2a41fb07ba23ff43e175de31e7073320362dc305be5fb30bc6ebecf26f6828d4
LateOn runtime source
  b7f3ad9f9b51b542078a1305378dfd36769a504c768a04c14254c3d7d94ef977
LateOn worker source
  423868db709481909c0aa98d6714ee73b0ecf44e3eb411a58f541f1f38450ef3
LateOn protocol source
  088236fbdc4eb93ac8e1f0b785b443f74cf4b9c26ef7e13409025ec5802a6a9f
configuration owner source
  c1d8bf34cd5fc96f96dcffa02e129fc77447872a71ed5f152aca62f2c55545b4
provider composition source
  092bb99d17b0d84a12b3c3ebd505f9feb41c484b2f2ad5bf8298e88c0b33b2c9
held-out opening gate source
  357003c4c3129a558eacefedf61eafc24c7681ed04aa91ba990bfcb9b6810d0e
```

```text
D16 profile file SHA-256       5eee66ef43d2fef2a70bdf010fc013220d8c40f22afe0be2e1d3d0cecc763665
D16 canonical profile SHA-256  35832a80fecd9f9110278d99b7f8b34fa944e50655b3f6558eae6e93c66bb64b
D16 effective identity         df069b8fc22c0d2ecd6586632e7b6add335c88d93112e4a7ac3cac31974e5ab9

D32 profile file SHA-256       1b712864b1f364fc1757e19c0942d52f46c31b90f212b7674a636df1360d0b45
D32 canonical profile SHA-256  8f8d7e9f84c108196b25d524a8f45ce732e82815eb7da0232ba205043c5cd134
D32 effective identity         d9b3a9b933bfb32ad11fc77aed8fbab4cf67643f8663e6bbc6c8e771cfee272f
```

The effective identity includes the exact profile, the applied reducible
operational bounds, and the immutable eight-thread policy. It is included in
shared-runtime and frozen ranked-set binding.

## Implemented invariants

- Projection-v2 documents require a canonical publication symbol, an
  owner-contained candidate span, and a current source hash matching the active
  symbol registry.
- One active rerank and one short queued rerank are the maximum. Queue pressure,
  not-ready state, cancellation, timeout, invalid output, or worker failure
  never exposes a partial neural order.
- Model, tokenizer, projection, depth, threads, and batching cannot be changed
  inside a named profile. Operator overrides may only reduce operational
  capacity or deadlines and produce a different effective profile identity.
- D16 and D32 expose distinct provider and shared-runtime identities.
- Operational diagnostics disclose bounded reason codes without source or model
  inputs.
- Held-out capture, replay, and scoring require one durable external opening
  record. The manifest remains opaque until that record is created.

## Focused verification

```text
LateOn runtime lifecycle/profile tests                  11 passed
projection and ranked-set identity tests                17 passed
profile configuration/shared-runtime tests              29 passed after using the package-owned test cwd
operational diagnostic handler tests                     2 passed
opening/capture/replay/score authority tests             51 passed
@zokizuan/satori-mcp typecheck                           passed
focused ESLint and git diff checks                       passed
```

The first shared-runtime invocation from the repository root failed because the
test locates package metadata relative to the package working directory. The
same unchanged test was rerun through the package-owned working directory and
all five shared-runtime tests passed; this was a command-context error, not a
product failure.

## Closed state

```text
real-model O2 measurements opened     false
held-out task payload materialized    false
held-out index created or queried     false
held-out capture or scores created    false
production activation                 false
```

O2 may begin only from a later clean committed revision containing the frozen
measurement runner. O3 remains closed unless O2 emits a passing receipt bound to
that exact revision, tree, host, D32 profile, model artifacts, and tooling.

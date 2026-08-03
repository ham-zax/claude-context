# Track O D32-v1 operational qualification receipt

**Date:** 2026-08-04  
**Stage:** O2  
**Profile:** `lateon_offline_quality_projection_v2_d32_v1`  
**Result:** `offline_lateon_rejected_for_resources`

This receipt preserves the complete first Track O operational run. It does not
qualify D32-v1, open held-out evidence, or activate LateOn in production.

## Binding

```text
source revision       1fc21e85ac4cd16c45d36066d3b38ce91e5e7d34
source tree           12acb08dabf99cf3739785d5617c7ed4540a797e
evidence SHA-256      6a4f8dd51a556035a8509473a1025492c470c7c40ea704188395e51670634b1a
evidence result SHA   d2ed0567618090c73812c09a9763b041d67402a068443f6bcca611d2f64ab3a9
archive SHA-256       f4166e2954837f2b8a9c4c59a6a01d2b522538e7f00b94f12470d99247130105
```

The archive contains only the immutable `o2-evidence.json` artifact produced
outside the repository by the frozen runner.

## Measured result

| Gate | Observed | D32-v1 limit | Result |
| --- | ---: | ---: | --- |
| Process-cold readiness p95 | 702.440 ms | 1,300 ms | pass |
| Process-cold readiness maximum | 709.764 ms | 2,000 ms | pass |
| Cold first-score maximum | 1,700.165 ms | 2,000 ms | pass |
| Warm score p95 | 1,213.045 ms | 1,750 ms | pass |
| Warm score maximum | 1,464.458 ms | 2,000 ms | pass |
| Queue wait maximum | 251.278 ms | bounded fallback contract | pass |
| Peak total-process RSS | 954,859,520 bytes | 872,415,232 bytes | **fail** |
| Retained total-process RSS | 632,532,992 bytes | 671,088,640 bytes | pass |

All frozen observations completed: 30 process-cold readiness measurements, 30
cold first scores, 200 warm scores, and every queue saturation, queued and
executing cancellation, active-plus-queued shutdown, malformed-output, and
worker-failure repetition. Identity, candidate membership, eligibility, group
identity, complete-order application, pagination, deterministic fallback, and
lifecycle gates passed. Peak RSS was the only failed gate.

## Prospective correction

Track O preserves this failure and versions a new D32-v2 operational profile.
Its 1 GiB peak envelope gives 12.45% headroom over this measured peak; every
other scoring and operational contract remains unchanged. D32-v2 requires a
fresh complete O2 run. A further miss does not authorize another in-profile
limit change.

```text
held-out opened        false
production activated  false
baseline policy        B
```

# Track O D32-v2 O0 authority receipt

**Date:** 2026-08-04  
**Stage:** O0-v2  
**Result:** `prospective_authority_sealed_outputs_unopened`

This receipt seals the prospective D32-v2 operational authority created after
the complete D32-v1 run failed only its peak-RSS envelope. It does not rewrite
the D32-v1 result, qualify D32-v2, open held-out evidence, or activate LateOn.

## Authority seal

```text
contract revision       33bc2ddd4571e1739b491139097f023d53a8f38c
contract tree           3bb3aae63a5c2fbf7382d7f1559beed56bfb1f1c
plan SHA-256            abdf46523380454119e736539a5c4edf0de7e08b58334d29e8042f9cf085fd9a
authority SHA-256       337201db7c1d0e2b5281104f3a1ad7a6f406dfb9c006cfccc4864bc1c42a0526
profile asset SHA-256   5987f5fe649cb69d1d6a4bdd91c8dfc5c01ee08507ce1cbe5194fe72fc13ec84
O2 runner SHA-256       99c72dda839eb2ab071de63bcda0ec26ad481035ba68f4344bbcd79ffddc1b9c
opening gate SHA-256    d96ed0e9e8770fc89dafb23bcc76c4ad5d14636b185396fa7b9a27650fa953e2
lockfile SHA-256        35293d291cab8f0529329ae40fba1807f7604b835142dfdfd52c01a506d2a51a
```

The executable authority is
`evals/search-ranking/lateon/offline-quality-d32-v2.authority.json`. No D32-v2
measurement or held-out output was opened before the contract revision above
was committed.

## Version boundary

```text
D32-v1 outcome                 offline_lateon_rejected_for_resources
D32-v1 observed peak RSS       954,859,520 bytes
D32-v1 peak limit              872,415,232 bytes
D32-v1 other frozen gates      passed

D32-v2 profile                 lateon_offline_quality_projection_v2_d32_v2
D32-v2 peak limit              1,073,741,824 bytes
measured-peak headroom         12.45%
other profile fields changed   none
```

The D32-v1 evidence archive SHA-256 is
`f4166e2954837f2b8a9c4c59a6a01d2b522538e7f00b94f12470d99247130105`.
D32-v2 does not inherit a pass and must complete every frozen O2 observation.
A D32-v2 miss does not authorize another limit change inside this profile.

## Operator profiles

Both explicit profiles remain available in the disabled implementation:

| Profile | Depth | Authority |
| --- | ---: | --- |
| `lateon_projection_v2_d16_v1` | 16 | optional fast profile; not an O3 contender |
| `lateon_offline_quality_projection_v2_d32_v2` | 32 | sole Track O operational and held-out candidate |

Selection happens before search through the exact profile identity. The runtime
does not adapt depth and never substitutes D16 for D32. Any unavailable,
overloaded, timed-out, cancelled, malformed, or failed neural operation restores
the complete deterministic baseline `B` result state.

```text
D32-v2 O2 opened        false
held-out opened         false
production activated   false
default product policy B
```

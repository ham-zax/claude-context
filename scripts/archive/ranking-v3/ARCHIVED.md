# Archived ranking experiments

This directory contains the former candidate-capture, replay, scoring, ranking,
qualification, and held-out evaluation tooling. It is retained for historical
reference only and is not part of Satori's production search path.

The native production contract is implemented under `packages/mcp/src/core`:

```text
retrieval -> deterministic eligibility -> validated provider order
```

Do not add dependencies from production code to this directory or use these
artifacts as release or quality gates. The archive is intentionally excluded
from the root script test glob and its former package commands are removed.

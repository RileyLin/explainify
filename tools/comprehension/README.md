# Local Comprehension — Comparative Run Evidence

Isolated, local-only Node tooling for the `explainify.compare_runs` capability
(task #15 engine, task #23 product integration). It does not call cloud provider
APIs and does not import or modify Explainify's production generation path.

## Comparative Run Spike

```bash
npm run spike:comparative -- --output /tmp/explainify-comparative
npm run test:comparative
```

The spike verifies all ten frozen comparative cases, executes the committed
benchmark workload twice, captures two receipt-attested run capsules, writes
private HMAC alias maps with mode `0600`, and produces a local comparison:

- `index.html`: progressively readable comparison with the equivalence gate,
  confounders before recommendation, bilateral locators, and evidence.
- `manifest.json`: renderable states including `observed`, `unknown`, and
  `not_comparable`.
- `views/architecture-delta.html`: evidence-specific run topology.
- `receipt.json`: capsule hashes, local-only publication, secret scan, and proof
  that no provider API was called.

Compare two existing public capsules:

```bash
npm run compare:runs -- \
  --left /path/to/left.capsule.json \
  --right /path/to/right.capsule.json \
  --question "Which differences matter for this decision?" \
  --output /tmp/explainify-comparison
```

Capture a run capsule (raw resource identifiers are accepted ONLY here; they are
replaced with truncated HMAC-SHA256 tokens in the public capsule, and the random
key + raw alias map remain in a separate local private receipt with mode `0600`):

```bash
npm run capture:run -- --spec /path/to/spec.json --output /tmp/explainify-capsule
```

## Workstream package adapter (task #23)

`comparative/workstream-package.mjs` mints a Phase B `WorkstreamCheckpointPackage`
from a comparison artifact + its two validated capsules, so a comparison renders
in the existing `/workstream` reader with no reimplementation:

- Every artifact evidence ref `<capsule>#<receipt>` resolves to exactly one
  manifest source (`cmp:<capsule>:<receipt>`), content-bound to the capsule.
- Observed comparison claims retain BILATERAL (left + right) evidence; a one-sided
  measurement is downgraded to `not_comparable` rather than shown as a comparison.
- Non-equivalent dimensions surface as `not_comparable` (amber), never a
  forced-green `observed`.
- Provider verification is ALWAYS an explicit `unknown`: these runs are
  receipt-attested by the capturing agent, not independently provider-verified. A
  local run is never relabeled as genuine cross-cloud proof.
- It reuses the proven engine primitives (`buildSourceManifest` /
  `validateManifestAgainstBundle` / `buildCoverageReceipt` / `sha256`) and mirrors
  `buildBrief`'s two-step hashing, but never calls `buildBrief`. The emitted
  package round-trips losslessly through `validatePackage`
  (`tests/workstream/compare-package.test.ts`).

## Privacy & evidence boundary

Raw resource identifiers are accepted only by `capture-run`. All public output is
secret-scanned. `generatedAt` and physical file hashes are intentionally excluded
from the semantic artifact hash; all evidence, claims, resolved revisions,
equivalence results, privacy state, and benchmark results are included.

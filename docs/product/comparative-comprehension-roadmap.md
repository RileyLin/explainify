# Comparative Comprehension Roadmap

**Status:** Product addendum for the approved Phase 2 direction
**Date:** 2026-08-02

## Product Insight

The human comprehension gap becomes more severe when multiple agents run the same or related work in parallel across different environments.

A typical example:

- one agent builds and runs a workload in AWS
- another agent builds and runs it in Google Cloud
- both agents report results
- a final agent compares them and recommends a direction

The human receives a conclusion but cannot see whether the executions were equivalent, what actually ran, which evidence supports the comparison, or which differences are caused by code, configuration, cloud services, region, load, timing, or measurement method.

Explainify should make the execution and comparison understandable, not merely visualize the final recommendation.

## Product Object

The foundational object remains the single-run comprehension artifact defined in `comprehension-contract-v0.1.md`.

Comparative comprehension adds two objects:

1. **Verifiable Run Capsule:** a bounded, immutable evidence package for one agent execution.
2. **Comparative Comprehension Artifact:** an evidence-linked explanation across two or more run capsules.

## Questions The Product Must Answer

1. What code and configuration ran in each environment?
2. What resources and managed services were actually used?
3. Which commands, tests, workloads, and measurements were executed?
4. Which conditions were equivalent and which were not?
5. What differed in architecture, behavior, performance, cost, reliability, and operational burden?
6. Why do those differences matter for the user's decision?
7. Which conclusions are observed, which are inferred, and which cannot be verified?
8. Where can the human inspect the exact evidence behind each comparison claim?

## Run Capsule Contract

Working shape:

```ts
interface RunCapsule {
  schemaVersion: 1;
  id: string;
  objective: string;
  workloadId: string;
  agent: {
    name: string;
    executionId: string;
  };
  repository: {
    origin: string;
    revision: string;
    dirty: boolean;
  };
  environment: {
    provider: "aws" | "gcp" | "azure" | "local" | "other";
    accountAlias?: string;
    region?: string;
    architecture?: string;
    startedAt: string;
    completedAt: string;
  };
  inputs: Array<{
    id: string;
    kind: "iac" | "config" | "dataset" | "load_profile" | "command";
    locator: string;
    sha256: string;
  }>;
  execution: Array<{
    id: string;
    command: string;
    exitCode: number;
    startedAt: string;
    completedAt: string;
    stdoutReceipt?: string;
    stderrReceipt?: string;
  }>;
  deployedResources: Array<{
    providerType: string;
    logicalRole: string;
    identifierToken: string;
    evidence: string[];
  }>;
  verification: Array<{
    kind: "test" | "metric" | "cost" | "resource_inventory" | "manual";
    name: string;
    result: "pass" | "fail" | "observed" | "unknown";
    value?: number;
    unit?: string;
    scope: string;
    evidence: string[];
  }>;
  pricingBasis?: {
    currency: string;
    effectiveAt: string;
    source: string;
    snapshotPath: string;
    snapshotSha256: string;
  };
  provenance: {
    requestSha256: string;
    capsuleSha256: string;
    captureMethod: "agent_receipts" | "provider_verified";
    resourceTokenMethod: "hmac-sha256-private-map-v1";
    publication: "local_only";
  };
}
```

Rules:

- No raw cloud credentials, account IDs, resource secrets, or unredacted environment values.
- `repository.dirty` must reflect the captured tree. A dirty tree is accepted only as explicitly non-reproducible, with the diff/status included as evidence; it can never be presented as an immutable run.
- Commands are captured with timestamps, exit codes, and bounded output receipts.
- Resource identifiers use opaque aliases backed by HMAC-SHA256 with a random per-artifact key. The publishable capsule keeps a truncated 16-byte token; raw identifiers, the key, and the alias map stay only in a separate local private receipt.
- Metrics name their time window, load profile, sample count, and unit.
- Cost claims name currency, time window, and included/excluded resources. They also require a frozen rate-card snapshot (or immutable export) plus SHA-256; without that pricing basis, cost is labeled `inferred` and cannot be independently recomputed.
- An agent statement is a note, not an observed fact, until linked to execution or provider evidence.
- A failed or partial run still produces a capsule with explicit failure state.

## Comparison Contract

```ts
interface ComparativeClaim {
  id: string;
  dimension:
    | "architecture"
    | "behavior"
    | "performance"
    | "cost"
    | "reliability"
    | "operations"
    | "developer_experience";
  text: string;
  status: "observed" | "inferred" | "not_comparable" | "unknown";
  leftEvidence: string[];
  rightEvidence: string[];
  confounders: string[];
}

interface ComparativeComprehensionArtifact {
  schemaVersion: 1;
  question: string;
  capsules: string[];
  evidenceLevel: "receipt_attested" | "provider_verified";
  equivalence: Array<{
    dimension: string;
    status: "equivalent" | "different" | "unknown";
    evidence: string[];
  }>;
  brief: {
    conclusion: ComparativeClaim[];
    whyItMatters: ComparativeClaim[];
    reviewFirst: ComparativeClaim[];
  };
  claims: ComparativeClaim[];
  recommendation: {
    text: string;
    confidence: "high" | "medium" | "low";
    supportingClaims: string[];
    decisionDependsOn: string[];
  };
  views: Array<{
    kind:
      | "architecture_delta"
      | "workflow"
      | "sequence"
      | "comparison"
      | "timeline";
    artifactPath: string;
  }>;
  receipt: {
    capsuleHashes: string[];
    unsupportedClaimCount: 0;
    publication: "local_only";
  };
}
```

Hard rules:

- Every observed comparison claim links to evidence from every side it compares.
- V0.1 artifacts visibly label equivalence and conclusions as `receipt_attested, not provider-verified`. Only V0.2 connector receipts may set `provider_verified`.
- Missing evidence produces `unknown` or `not_comparable`, not a winner.
- The artifact must show confounders before presenting a recommendation.
- Different region, workload, dataset, code revision, load, test duration, metric window, or pricing basis is a material comparability difference.
- Architecture diagrams describe deployed or authored facts; they do not establish performance, cost, or reliability.
- A recommendation identifies the user's decision criteria. It cannot declare a universal cloud or provider winner.

## Reading Experience

### 30 Seconds

- What ran in each environment.
- Whether the runs are actually comparable.
- The supported conclusion.
- The three differences that matter most.
- The largest evidence gap.

### Five Minutes

- Side-by-side execution story.
- Architecture delta.
- Normalized test, metric, and cost table.
- Confounders and non-equivalent conditions.
- Decision criteria and conditional recommendation.

### Evidence

- Exact repo revision and input hashes.
- Commands and exit receipts.
- IaC/config source spans.
- Test and metric receipts.
- Resource inventory.
- Optional provider-verification receipts.

## Capture Strategy

### V0.1: Agent Receipts

Start with evidence already available to the coding agent:

- immutable repo refs and diffs
- selected IaC/config
- executed commands and exit codes
- bounded logs
- test/load receipts
- metrics and cost outputs produced by the run
- sanitized resource inventories

This validates the comprehension schema and human experience without making cross-cloud credentials a prerequisite.

### V0.2: Read-Only Provider Verification

Add optional, least-privilege connectors that independently query:

- deployed resource inventory
- provider region and service configuration
- selected monitoring metrics
- selected billing estimates or exports

Provider verification must use agent-scoped profiles or managed integrations. It never accepts credentials in a tool payload and never places credentials in a capsule.

## Roadmap Placement

### Phase 2A: Contract And Single-Run Benchmark

Status: complete at `product/phase2-contract` commit `2dbf21d`.

### Phase 2B: Single-Run Agent-Callable Spike

Prove `explainify.create_checkpoint`, local artifacts, evidence links, and the pinned Archify adapter.

### Phase 2C: Independent Single-Run Evaluation

Run the frozen benchmark and decide go, revise, or stop for the foundation.

### Phase 2D: Comparative Run Capsules

Build on the accepted foundation:

1. `explainify.capture_run` creates one local run capsule.
2. `explainify.compare_runs` accepts two or more capsule paths.
3. Run the same small workload in AWS and Google Cloud.
4. Generate a comparative artifact with architecture delta, equivalence checks, confounders, and dual-sided evidence.
5. Keep provider API verification optional in the first comparative spike.

### Phase 2E: Read-Only Cloud Verification

Only after the comparative experience proves useful, add AWS/GCP read-only verification connectors.

## Comparative Benchmark Set

The first comparative benchmark should include:

1. Same code, equivalent workload, comparable AWS/GCP runs.
2. Same code but different regions and latency baselines.
3. Different code revisions accidentally compared.
4. One complete run and one failed/partial run.
5. Same performance test with different load profiles.
6. Cost estimates using different time windows or excluded services.
7. Agent summary contradicted by command/test evidence.
8. Agent receipts contradicted by optional provider inventory.
9. Equivalent managed services with materially different operational models.
10. A case where evidence is insufficient and the correct result is `not_comparable`.

Before Phase 2D evaluation, all 10 cases must be materialized as frozen run-capsule fixtures in Git. A manifest records fixture paths, immutable source revisions, and SHA-256 values. Builder and independent evaluator must use the same frozen bytes; prose-only scenarios are not an acceptable benchmark.

## Phase 2D Acceptance

- Two real run capsules are generated from one pinned workload and repo revision.
- A dirty-tree fixture is represented and explicitly rejected as reproducible evidence rather than silently dropped.
- Every command, test, metric, and resource claim links to a capsule receipt.
- Equivalence checks identify code, config, workload, region, time window, and metric basis.
- V0.1 equivalence is visibly marked `receipt_attested, not provider-verified`.
- Every observed comparative claim contains evidence from both sides.
- The artifact names confounders before recommending a direction.
- A deliberately mismatched benchmark is rejected as `not_comparable`.
- No raw credential, account identifier, secret, or private resource name appears.
- Resource aliases use the private-map HMAC contract; cost comparisons include a frozen pricing snapshot/hash or remain `inferred`.
- All 10 comparative benchmark fixtures and their hashes are committed and independently reproducible.
- Output remains local unless the user explicitly invokes a separate publish action.
- A human can explain what ran, what differed, and why the recommendation is conditional after five minutes.

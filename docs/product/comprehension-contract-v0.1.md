# Explainify Comprehension Contract v0.1

**Status:** Phase 2 spike contract
**Owner:** @product-manager
**Date:** 2026-08-02

## Product Thesis

AI can execute software work faster than humans can rebuild the mental model needed to review, trust, and continue it.

Explainify is the comprehension layer between coding agents and humans. It turns evidence from a long coding session, pull request, repository change, or long document into a verified, progressively readable artifact.

The first product is not another session summary and not another diagram generator. It must answer:

1. What changed?
2. Why did it change?
3. How does the system work now?
4. What should the human inspect first?
5. What is uncertain, risky, or unfinished?
6. Where is the exact evidence for every important claim?

## Initial Wedge

Primary:

- A coding agent reaches a checkpoint or finishes a long task.
- The agent calls Explainify with repository refs, selected evidence, and the human's question.
- Explainify writes a local interactive artifact that a reviewer can understand at three depths.

Secondary:

- Pull-request review and handoff.
- Unfamiliar repository orientation.
- Long RFC, API documentation, incident report, or technical paper.

Not in v0.1:

- Always-on recording of every agent token or tool call.
- A general chat transcript summarizer.
- Autonomous code review or merge approval.
- Unverified impact, risk, or causal claims.
- Automatic public upload.
- Replacing Archify's technical diagram renderer.

## Product Principles

1. **Evidence before prose:** observed facts, inferences, and unknowns are separate.
2. **Progressive comprehension:** 30 seconds, 5 minutes, and evidence-level deep dive.
3. **Review priority over chronology:** show the decisions and risky surfaces before a tool-call diary.
4. **Local first:** local artifact and manifest by default; publication is a separate explicit action.
5. **Bounded source access:** pass refs and selected content, not an entire repository or raw session by default.
6. **Renderer truth:** Archify shows authored technical topology; Explainify owns narrative, decisions, evidence, and deep dives.
7. **Human control:** the artifact informs review and handoff; it does not claim merge safety.

## Core Workflow

1. Agent reaches `checkpoint`, `handoff`, `review`, or `explain` intent.
2. Agent gathers a bounded evidence pack:
   - base/head commit or exact diff
   - changed files and symbols
   - task objective and acceptance criteria
   - test/build/lint receipts
   - explicit decisions, alternatives, and unresolved items
3. Explainify validates paths, refs, hashes, redaction rules, and size limits.
4. Explainify generates an evidence-linked comprehension manifest.
5. Technical topology is routed to a pinned Archify adapter when useful.
6. Explainify renders the local interactive artifact.
7. Validation rejects unsupported claims, missing evidence links, unsafe content, or a failed renderer receipt.
8. The tool returns local paths and a machine-readable receipt.
9. Publishing requires a separate explicit request.

## Progressive Reading Model

### Level 1: 30-Second Brief

- Objective and outcome.
- Three most important changes.
- Why they matter.
- Review-first list.
- Test/build/security state.
- Unresolved or blocked items.

### Level 2: Five-Minute Story

- Before and after mental model.
- Ordered decision chapters, not raw chronological logs.
- Architecture/workflow/delta view when the evidence supports one.
- Behavioral changes and compatibility implications.
- Alternatives considered and why they were rejected.
- Risks with confidence and evidence status.

### Level 3: Evidence

- Exact commit, file, symbol, line range, task message, or command receipt.
- Changed-file and test inventories.
- Source excerpts only when explicitly selected.
- Deep links from every material claim.
- Unknowns and evidence gaps remain visible.

## Input Contract

Working TypeScript shape:

```ts
type ComprehensionMode =
  | "coding_session"
  | "pull_request"
  | "repository"
  | "long_document";

type SourceKind =
  | "git_ref"
  | "git_diff"
  | "file"
  | "test_receipt"
  | "task_thread"
  | "session_note"
  | "document";

interface EvidenceSource {
  id: string;
  kind: SourceKind;
  locator: string;
  revision?: string;
  sha256?: string;
  selectedContent?: string;
  containsSecrets?: false;
}

interface ComprehensionRequest {
  schemaVersion: 1;
  mode: ComprehensionMode;
  intent: "checkpoint" | "handoff" | "review" | "explain";
  question: string;
  audience: {
    role: string;
    technicalDepth: "overview" | "working" | "expert";
  };
  repository?: {
    root: string;
    baseRef?: string;
    headRef?: string;
  };
  task?: {
    objective: string;
    acceptanceCriteria?: string[];
  };
  sources: EvidenceSource[];
  privacy: {
    storage: "local";
    processing: "configured_provider" | "local";
    publish: false;
  };
}
```

Validation rules:

- At least one source is required.
- Repository paths must resolve under the declared root.
- Git refs must resolve and become immutable commit IDs in the receipt.
- `.env*`, credential stores, private keys, tokens, dependency trees, build caches, and binaries are denied by default.
- `selectedContent` is bounded and redacted before model processing.
- A session transcript is optional and never authoritative over repository/test evidence.
- No credential may be accepted as tool input or emitted in output.

## Output Contract

```ts
type ClaimStatus = "observed" | "inferred" | "unknown";

interface EvidenceLink {
  sourceId: string;
  locator: string;
  revision?: string;
  startLine?: number;
  endLine?: number;
  excerptSha256?: string;
}

interface ComprehensionClaim {
  id: string;
  text: string;
  status: ClaimStatus;
  confidence: "high" | "medium" | "low";
  evidence: EvidenceLink[];
}

interface ComprehensionArtifact {
  schemaVersion: 1;
  id: string;
  title: string;
  generatedAt: string;
  brief: {
    objective: string;
    outcome: string;
    importantChanges: ComprehensionClaim[];
    reviewFirst: ComprehensionClaim[];
    verification: ComprehensionClaim[];
    unresolved: ComprehensionClaim[];
  };
  chapters: Array<{
    id: string;
    title: string;
    summary: string;
    claims: ComprehensionClaim[];
  }>;
  decisions: Array<{
    decision: ComprehensionClaim;
    alternatives: ComprehensionClaim[];
  }>;
  views: Array<{
    id: string;
    kind:
      | "architecture"
      | "architecture_delta"
      | "workflow"
      | "sequence"
      | "code_walkthrough"
      | "comparison"
      | "timeline";
    renderer: "archify" | "explainify";
    artifactPath: string;
    validationReceipt?: string;
  }>;
  risks: ComprehensionClaim[];
  nextSteps: ComprehensionClaim[];
  sources: EvidenceSource[];
  receipt: {
    resolvedRevisions: Record<string, string>;
    requestSha256: string;
    manifestSha256: string;
    unsupportedClaimCount: 0;
    secretScan: "pass";
    publication: "local_only";
  };
}
```

Hard rules:

- Every observed claim has at least one evidence link.
- Every observed claim resolves to an exact source span. Whole-file or whole-receipt links are allowed only when the source is atomic.
- Inference is visibly labeled and cannot be used as topology.
- Unknowns cannot be rewritten as conclusions.
- Test claims contain command, exit status, and scope.
- Architecture impact is not inferred from a diff unless evidence establishes it.
- The artifact never says "safe to merge" or "no risk."

## Agent Tool Surface

The spike exposes one primary tool:

```text
explainify.create_checkpoint
```

Input:

- repository root
- base/head refs
- question
- audience
- objective and acceptance criteria
- optional selected task/session notes
- output directory

Authentication is not accepted in the tool payload. A managed invocation resolves it only from an agent-scoped environment or integration.

Output:

```json
{
  "status": "verified",
  "artifactPath": "/absolute/path/index.html",
  "manifestPath": "/absolute/path/manifest.json",
  "receiptPath": "/absolute/path/receipt.json",
  "views": ["architecture_delta", "code_walkthrough"],
  "publication": "local_only"
}
```

Later tools, outside the first spike:

- `explainify.deep_dive`
- `explainify.publish`
- `explainify.compare_checkpoints`

The publish tool must be separate so an agent cannot turn private repository evidence into a public URL by implication.

## Archify Boundary

Use a pinned `tt-a1i/archify` v2.12.0 release/commit for:

- architecture
- architecture delta
- workflow
- sequence
- data flow
- lifecycle

Explainify remains responsible for:

- input routing
- evidence pack and provenance
- 30-second brief and five-minute story
- decisions, alternatives, risks, unknowns, and next steps
- code walkthrough, concept, comparison, and decision-tree views
- deep dives
- local artifact composition and optional hosted publication

The adapter must consume a stable internal interface. Archify is distributed as a Skill/CLI rather than a stable npm library, so it runs as an isolated pinned process and returns its own validation receipt.

## Privacy And Security

- Artifact storage is local by default.
- "Local first" describes storage and control, not necessarily inference. The receipt names the configured processor.
- The agent sends selected evidence, never the repository by default.
- Ignore files and secret patterns are enforced before generation.
- HTML output is treated as untrusted and opened with sandbox/CSP restrictions.
- No values from `.env`, credential files, shell history, Git credentials, or Raft tokens enter artifacts.
- A legacy Explainify skill containing a literal API key must not be reused; its key must be rotated.
- Publishing is opt-in, with a visible list of sources and redactions.

Required automated privacy checks:

- A denied-path fixture proves `.env*` and credential stores never enter the evidence pack.
- A synthetic sensitive canary in an excluded source never appears in the manifest, HTML, logs, or receipts.
- The default tool test asserts that no publish client is called and that the receipt says `local_only`.
- Fixture-mode integration tests run with outbound network disabled; any configured model processing is tested separately and named in the receipt.

## Spike Acceptance

Task #12 passes only if:

1. One agent-callable command/tool produces a local artifact and machine receipt.
2. It runs against at least three real Explainify change sets, including WP-A, WP-B, and WP-D.
3. Every material observed claim deep-links to immutable evidence.
4. The artifact supports all three reading levels.
5. At least one technical view is produced through the pinned Archify adapter and passes Archify validation.
6. No public upload occurs.
7. Secret scanning passes and no credential-shaped fixture appears in output.
8. Re-running the same immutable inputs produces a semantically stable manifest.
9. Existing Explainify tests, lint, typecheck, and clean build remain green.
10. The spike is isolated enough to delete without changing the production generation path.
11. A second evaluator can reproduce each benchmark score within 5 points from the frozen fixture and recorded checklist.

## Benchmark Rubric

Each case is scored out of 100:

- Evidence fidelity: 35
- Human comprehension: 25
- Review prioritization: 15
- Renderer/view fit: 10
- Progressive readability: 10
- Privacy and safety: 5

Hard failure regardless of score:

- Secret or private source disclosure.
- A material observed claim without evidence.
- Wrong changed behavior, file, test status, or topology.
- Public upload without explicit permission.
- "Safe to merge" or equivalent unsupported approval.

Target for Phase 2C:

- No hard failures.
- At least 85/100 average on the six spike cases.
- At least 80/100 on every spike case.
- A reviewer can answer the six core questions with at least 90% accuracy after five minutes.

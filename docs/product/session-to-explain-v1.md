# Explainify Session-to-Explain v1

**Status:** Frozen implementation contract
**Owner:** @product-manager
**Date:** 2026-08-05
**Supersedes:** Comparison-first sequencing, not the evidence-integrity work

## Product Decision

Explainify is a comprehension layer for complex material and autonomous work.
It has two entry points into one product:

1. **Web entry:** a person provides a concept, document, code sample, or
   evidence package and receives an interactive explanation.
2. **Agent entry:** a coding session calls Explainify through MCP, a skill, or
   an API and receives an evidence-linked explanation of what the session did.

Compare Runs is one scenario supported by the agent entry. It is not the
product's organizing metaphor and it is not limited to cloud providers.

The next product proof is one real coding session producing a useful
explanation without the user copying and pasting the session transcript.

## User And Job

Initial user:

- a technical founder, engineering lead, or reviewer returning to work done by
  one or more coding agents.

Job:

> Help me rebuild an accurate mental model of what the agent did, why it did
> it, how the system works now, what I should inspect, and what remains
> uncertain, without replaying the terminal session.

The product is successful when the user understands the work and can inspect
the evidence. Producing a summary or a diagram is not sufficient on its own.

## Core Experience

### Agent Entry

From a Claude Code session, the user or agent invokes:

```text
explainify.explain_session
```

The tool returns:

```json
{
  "status": "verified",
  "artifactPath": "/absolute/path/index.html",
  "packagePath": "/absolute/path/workstream-package.json",
  "receiptPath": "/absolute/path/receipt.json",
  "openCommand": "explainify open <artifactPath>",
  "publication": "local_only"
}
```

The same operation is available through:

- a local stdio MCP server for Claude Code;
- an Explainify skill or command that calls the MCP tool;
- a CLI for reproducibility and non-Claude clients.

The remote HTTP API is a later transport over the same request and output
schemas. It is not required for v1 because a hosted API cannot safely reach
local session and repository evidence without a separate local connector.

### Web Entry

The existing concept-to-explainer flow remains a first-class product mode.
For autonomous-work explanations, the Web app opens an exported local package
and provides the same reading experience. Hosted sync and public publishing
remain explicit later actions; they are never implied by generation.

### Reading Experience

Every session explanation has four connected surfaces:

1. **What happened:** objective, outcome, important changes, verification, and
   unfinished work.
2. **How it works now:** a workflow, architecture, sequence, or code-walkthrough
   view chosen from evidence, not forced for every session.
3. **Why:** decisions, alternatives, and constraints, with inference visibly
   separated from observation.
4. **Show me:** quotes and deep links to exact session messages, tool calls,
   commits, files, symbols, diffs, and test receipts.

The default view is a 30-second brief. A five-minute story and raw evidence are
one interaction away.

## Capture Architecture

### Plugin Bundle

The preferred Claude Code distribution is one plugin containing:

- a local stdio MCP server;
- the `explainify.explain_session` tool;
- an `/explain-session` skill or command;
- narrow hooks for the Explainify tool and session completion.

Claude Code provides local MCP servers with a stable `CLAUDE_PROJECT_DIR`.
Hook inputs provide `session_id`, `cwd`, and `transcript_path`. The transcript
is written asynchronously and can lag the current turn, so capture must wait
for a stable file or use the hook's final-message field rather than assuming
the last JSONL record is complete.

The hook stores a local pointer and event receipt under:

```text
.explainify/sessions/<session-id>/
```

It does not copy or upload the complete transcript. The MCP tool resolves that
pointer, the repository root, and bounded evidence when invoked.

A `SessionStart` hook records the immutable starting commit and dirty-state
receipt. `Stop` / `SessionEnd` records the ending state plus the hook-provided
`last_assistant_message`; capture must not derive this marker from the possibly
lagging transcript. Capture waits until the transcript is quiescent and
contains that final message before verification. The completion marker is
required for a Stop/SessionEnd capture. A timeout or missing marker produces an
error, never a partial "verified" bundle. Session IDs and all derived paths are
validated and must remain inside the intended local Explainify directory.

### Evidence Selection

The session adapter creates a bounded evidence package from:

- the user objective and selected session messages;
- decisions and alternatives explicitly stated in the session;
- tool calls that changed or inspected the system;
- immutable base and head commits or an exact working-tree diff;
- changed files and symbols;
- test, lint, build, or runtime receipts;
- errors, denied actions, and unresolved items;
- optional subagent evidence with its own source identity.

Selection is semantic, not "last N lines." Repeated progress chatter,
permission boilerplate, model reasoning, and unrelated tool output are
excluded.

Evidence authority:

1. repository state and command receipts;
2. exact tool inputs and outputs;
3. explicit user requirements;
4. agent statements.

An agent statement cannot override contradictory repository or test evidence.

### Adapter Boundary

Capture and explanation are separate modules. The session adapter emits this
provider-neutral intermediate bundle; synthesis consumes it without reading a
Claude transcript directly:

```ts
interface SessionEvidenceBundle {
  schemaVersion: 1;
  request: {
    question: string;
    audience: {
      role: string;
      technicalDepth: "overview" | "working" | "expert";
    };
  };
  session: {
    id: string;
    source: "claude_code" | "generic_agent";
    captureEvent: "tool_call" | "stop" | "session_end" | "fixture";
    cwd: string;
    transcriptSha256: string;
    startedAt?: string;
    endedAt?: string;
  };
  objective: {
    text: string;
    sourceId: string;
  };
  excerpts: Array<{
    id: string;
    kind:
      | "user_requirement"
      | "agent_decision"
      | "agent_explanation"
      | "error"
      | "unresolved";
    role: "user" | "assistant" | "tool";
    text: string;
    locator: string;
    sha256: string;
  }>;
  toolEvents: Array<{
    id: string;
    toolName: string;
    status: "succeeded" | "failed" | "denied" | "unknown";
    inputSummary: string;
    outputSummary: string;
    inputLocator: string;
    inputSha256: string;
    outputLocator?: string;
    outputSha256?: string;
  }>;
  repository: {
    baseRevision?: string;
    headRevision?: string;
    dirty: boolean;
    changedFiles: Array<{
      path: string;
      status: "added" | "modified" | "deleted" | "renamed";
      sha256?: string;
    }>;
  };
  receipts: Array<{
    id: string;
    kind: "test" | "lint" | "build" | "command" | "git_status";
    command: string;
    status: "succeeded" | "failed" | "unknown";
    exitCode?: number;
    scope: string;
    content: string;
    commandLocator: string;
    outputLocator?: string;
    sha256: string;
  }>;
  exclusions: Array<{
    kind: string;
    count: number;
    reason: string;
  }>;
  privacy: {
    redactionCount: number;
    deniedPathCount: number;
    secretScan: "pass";
    publication: "local_only";
  };
}
```

Rules:

- Every locator addresses one exact JSONL record/tool event or immutable
  repository source. A tool output never borrows its input locator.
- The caller's question is request context, not evidence and not the session
  objective. `objective.sourceId` must resolve to a selected excerpt.
- Excerpt hashes bind the canonical serialized ID, kind, role, text, and
  locator. Tool input hashes bind ID, tool name, input summary, and input
  locator; output hashes bind ID, status, output summary, and output locator.
  Receipt hashes bind the canonical serialized ID, kind, command, status,
  optional exit code, scope, content, and locators. A semantic label or locator
  can never change without invalidating its hash.
- Bundle fields contain selected, redacted content only. The raw transcript is
  referenced by its whole-file hash but is not embedded.
- Adapter output is byte-size bounded, schema-validated, and deterministic for
  an immutable transcript and repository state.
- Unknown tool payloads are excluded, not coerced into trusted evidence.
- Validation is strict: it rejects unknown fields, dangling references,
  duplicate IDs, hash/content mismatches, over-limit fields/bundles, and
  unsupported enum values.
- Repository capture fails if requested refs do not resolve. With a
  SessionStart baseline, `changedFiles` covers committed changes from the
  starting commit to the captured head plus any remaining working-tree changes;
  a clean committed session must not collapse to an empty change set.

### Privacy Boundary

- Storage and artifact generation are local by default.
- The complete transcript is never sent to a model or hosted service by
  default.
- Only selected, size-bounded, redacted excerpts may enter model processing.
- `.env*`, credential stores, shell history, private keys, tokens, dependency
  trees, caches, and binaries are denied before selection.
- Every selected excerpt has a source ID, locator, and SHA-256 hash.
- Publishing is a separate explicit tool and is out of scope for v1.

## Request Contract

```ts
interface ExplainSessionRequest {
  schemaVersion: 1;
  session: {
    id?: string; // defaults to the current captured session
    source: "claude_code" | "generic_agent";
  };
  question: string;
  audience: {
    role: string;
    technicalDepth: "overview" | "working" | "expert";
  };
  repository: {
    root: string;
    baseRef?: string;
    headRef?: string;
  };
  views?: Array<
    "architecture" | "workflow" | "sequence" | "code_walkthrough" | "comparison"
  >;
  privacy: {
    storage: "local";
    processing: "configured_provider" | "local";
    publish: false;
  };
  outputDirectory?: string;
}
```

The tool never accepts credentials or an entire transcript in its request.

## Output Contract

The v1 output reuses the validated portable Workstream checkpoint package and
adds session-specific source kinds and views. It must contain:

- a semantic brief;
- an evidence manifest;
- selected transcript excerpts with stable locators and hashes;
- git and command receipts;
- a coverage receipt;
- zero or more validated diagram/view artifacts;
- an integrity receipt;
- a self-contained local HTML reader.

Observed claims require exact evidence. Inferred and unknown claims are visible
states. A diagram may render only relationships supported by selected evidence.

## Dogfood Matrix

The team runs these scenarios itself:

### S1: One Session, Feature Change

One coding session adds a bounded feature, edits multiple files, makes one
explicit design decision, and runs tests. A reader must understand the change,
decision, architecture/workflow impact, and verification state.

### S2: One Session, Debugging

One coding session investigates a failing test, rejects at least one plausible
cause, fixes the real cause, and reruns verification. A reader must distinguish
observed cause, rejected hypothesis, and remaining uncertainty.

### S3: Two Sessions, Same Goal

Two independent sessions attempt the same bounded task with different
approaches. Explainify produces one explanation per session. Comparison is an
optional derived view only after both explanations are independently valid.

S3 may honestly conclude "not comparable." It does not require AWS, GCP, or
provider APIs.

## Acceptance Gate

V1 is GO only when all conditions pass:

1. A fresh Claude Code session can discover and call the local MCP tool.
2. The user does not copy or paste transcript content.
3. S1 and S2 produce verified local artifacts from real session evidence.
4. S3 produces two independently valid artifacts before any comparison.
5. Every material observed claim resolves to a selected session, git, file, or
   command source with a matching hash.
6. The artifact quotes at least two useful session excerpts, and each quote has
   enough context to be understandable without exposing the whole transcript.
7. The chosen diagram/view matches the actual change; unsupported topology is
   rejected rather than filled in.
8. A context-blind reviewer answers at least 90% of these questions after five
   minutes: objective, outcome, important changes, rationale, current system
   behavior, verification, review-first item, and unknowns.
9. A secret canary in an excluded transcript/tool result never appears in the
   package, HTML, logs, or model request.
10. Default execution performs no public upload and records
    `publication: local_only`.
11. Re-running immutable inputs produces a semantically stable package.
12. Existing tests, typecheck, lint, build, and Workstream package integrity
    gates remain green.

## Scope Decisions

### In v1

- Claude Code local plugin, MCP tool, skill/command, and CLI;
- bounded session ingestion;
- selected transcript quotes;
- git/test/build evidence;
- explanation plus evidence-supported views;
- local artifact and Web package-open path;
- team-run S1-S3 dogfood.

### Deferred

- always-on capture of every token or tool call;
- automatic remote transcript upload;
- hosted session sync;
- public sharing;
- background monitoring of every agent;
- provider-specific cloud connectors;
- generalized cross-agent Control Center;
- write actions from the explanation back into the repository.

## Research Basis

Retrieved 2026-08-05:

- Claude Code MCP supports local stdio servers and exposes the stable project
  root to them: <https://code.claude.com/docs/en/mcp>
- Claude Code hooks expose lifecycle events and session metadata suitable for
  deterministic capture: <https://code.claude.com/docs/en/hooks-guide>
- The hook reference documents `transcript_path` and warns that the transcript
  may lag the in-memory conversation: <https://code.claude.com/docs/en/hooks>
- Claude Code Artifacts validate demand for interactive session explanations,
  but they are Anthropic-hosted single pages and unavailable on Bedrock, so
  Explainify still needs its provider-neutral local package and Web product:
  <https://code.claude.com/docs/en/artifacts>

## Immediate Build Order

1. Session capture adapter plus plugin/MCP/CLI bridge.
2. Session package synthesis plus quote and view rendering.
3. S1 and S2 end-to-end dogfood.
4. S3 independent-session dogfood and optional comparison.
5. Context-blind comprehension gate and product decision.

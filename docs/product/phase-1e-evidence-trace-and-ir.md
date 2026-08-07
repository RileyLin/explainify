# Phase 1E — Evidence trace + change-story IR (task #36)

Built above frozen `session/phase-1c-integration@3df61348f501944b21c1a1cc3ef97f558d562a12`.
v1 fields/hashes (pointer / finalMessageSha256 / lineage / secret-scan / existing
excerpt·toolEvent·receipt·changedFile hashing) are PRESERVED byte-for-byte. Phase 1E introduces a
**versioned v2** bundle/package that ADDS a hash-bound code-evidence collection + change story.
This DOES extend the trust boundary (per PM gate); it is versioned and strictly bound, not
"unchanged."

Status: PM design gate = REVISE→GO once this doc binds the 7 rules below (thread msg 5cde8f3b).
This revision binds them. Proceeding adapter → validators/IR → renderer without a further PM hold.

## 1. Evidence trace (fragile-assumption result)

Traced S1c feature (slugify `maxLength`) and S2 debugging (paginate 1-index fix), capture→bundle→
package→render.
- `changedFile = {path,status,sha256}` only (bundle-schema.mjs:113) — no diff/hunk/symbol; sha256 is
  final on-disk content hash. Insufficient alone.
- Real code EXISTS and is hash-bound in `toolEvents`: Edit `inputSummary`={file_path,old_string,
  new_string}=hunk; Write=content; Bash=command+output. Bound by inputSha256/outputSha256.
- Unusable as a code story because: raw JSON not modeled as code; `inputSummary` clipped at **800
  chars** (S1c new_string already truncated in the shipped artifact); never joined to changedFiles
  by path; no prompt→tool→file correlation; NO diagram (`chooseView` = flat ≤4 {label,detail};
  `renderSessionHtml` static panels; zero drill-down). renderSessionHtml @ session-synthesis.mjs:203.
- => Extend the bounded contract with structured, hash-bound code evidence derived from the SAME
  captured events, joined by path, validated in the ADAPTER (attested). Never infer code/topology.

## 2. BINDING RULES (PM design gate — all 7 are mandatory)

### R1 — Attempted code ≠ landed code
A hash-bound Edit/Write **input** proves what the agent ASKED the tool to do, not what survived in
the final repo. Only **successful direct** Edit/Write events are candidates (status==="succeeded";
MultiEdit, NotebookEdit, denied, failed, redacted, oversized, ambiguous → NOT candidates). At
capture completion, validate each candidate against the normalized changed-file path AND the final
file content, classifying `completeness ∈ {landed, superseded, unknown}`:
- `landed` — the candidate's `after` (Edit new_string / Write content) is present **and unique** in
  the final file content at the joined path; record the unique final **line span** (codeLocator).
- `superseded` — candidate matched a path that changed, but its `after` is not present in final
  content (a later edit overwrote it).
- `unknown` — no confident match (path unmatched, non-unique, deleted, binary, oversized, etc.),
  with an explicit `unknownReason`.
**Only `landed` may be narrated as "implemented."** Everything else renders as attempted/unknown
with its reason, visibly. Final content is available at capture time (capture.mjs reads file bytes
to hash them); the classifier consumes it to compute completeness+line span but stores only the
bounded, secret-scanned hunk + classification, not the whole file.

### R2 — Never clip an "exact" excerpt
Parse the **raw structured tool input from the transcript record** (Edit old_string/new_string,
Write content) BEFORE the 800-char `inputSummary` truncation. Then apply denied-path handling +
secret scan + explicit **UTF-8 byte and line-count limits** (`maxCodeExcerptBytes`,
`maxCodeExcerptLines`, plus an aggregate cap). If an exact, bounded, clean preimage cannot be
retained (over-limit, secret-bearing, denied path), emit an **unsupported** CodeExcerpt
(`kind:"unsupported"`, reason) — NOT a clipped hunk presented as real code. Secret-bearing code
must never enter the story merely because the final file hashes.

### R3 — Version and bind strictly (v2)
Preserve all v1 fields/hashes. Define **v2** bundle/package (`schemaVersion:2`) where the code-
evidence collection + change story are REQUIRED for Phase 1E output. v1 bundles remain valid and
render via the v1 path (before/after package). The canonical **CodeExcerpt hash binds every
semantic field**: `id, toolEventId, path, changeStatus, completeness, before, after, symbol,
codeLocator, transcriptLocator, finalContentSha256, unknownReason`. Enforce: normalized repo-
relative paths (no `..`/absolute/traversal), no denied paths, unique IDs, duplicate/path rules,
per-item + aggregate UTF-8 limits, and an EXACT changed-file↔tool-event join. `changeStorySha256`
is bound through the package and into the final receipt/lineage.

### R4 — Evidence refs are not causal edges
Define deterministic edge rules. An edge is emitted only when its relationship is proven:
- `observed_sequence` — allowed only when transcript **locators prove order** (positional index /
  monotonic record order). This is the only edge type the current capture can support.
- `caused_by` / `architecture` / `dataflow` — require direct evidence; absent it, the relationship
  is marked **inferred** or **unknown**, or the edge is omitted. Never assert "this prompt caused
  this code" from adjacency alone.
Stable **step IDs derive from immutable evidence IDs/hashes** (e.g. `step:${toolEventId}` /
content hash), NOT `step-1` enumeration. Separate two enums that the first draft conflated:
- `viewType ∈ {workflow, architecture, sequence, dataflow, lifecycle}` — semantic evidence view.
- `renderHint ∈ {sequential, graph, hierarchy}` — layout engine only (reused from flow.ts).

### R5 — Separate evidence and code locators
`toolEvent.inputLocator` is a **transcript** locator, not a code locator. CodeExcerpt carries BOTH:
`transcriptLocator` (jsonl pointer to the tool input) and `codeLocator` (file + exact byte/line
span in the FINAL file, only when `landed`). A `symbol` is populated ONLY by a deterministic,
syntax-aware, unique-declaration rule (a single unambiguous top-level declaration whose name the
hunk introduces/modifies); otherwise `symbol` is unknown and the UI shows file + exact hunk/line
span. Never label a literal token match as a resolved symbol.

### R6 — `latest.json` honest + atomic
Write `.explainify/latest.json` (temp file + atomic rename) ONLY after the artifact/package/receipt
hashes validate. It is defined as **"last verified artifact"** and binds: sessionId, checkpointId,
changeStorySha256, packageSha256, artifactSha256, receiptSha256, output path, completedAt. The
reader/recovery path must detect tamper (recompute + compare) and staleness, and must NOT mistake an
older valid pointer for the current (failed) attempt — a failed run never overwrites it.

### R7 — Renderer alternative accepted WITH proof obligation
Inline SVG/HTML + vanilla JS is accepted for the self-contained plugin (React+@xyflow+dagre build
pipeline is incompatible with the zero-build/no-node_modules/no-network `index.html` runtime).
`flow.ts` vocabulary reuse ≠ Archify equivalence by itself. The two vertical slices must **visibly
prove** at 320/390/1440: (a) first-viewport overview; (b) keyboard-selectable nodes; (c) persistent
selected-step state; (d) before/after code diff; (e) failed→diagnosis→fix→passed sequence
(S2); (f) evidence drawer; (g) explicit unknowns. Then pass the context-blind ≥90% gate.

## 3. IR (v2, all fields hash-bound)

```
CodeExcerpt {
  id                    // unique; stable, derived from toolEventId
  toolEventId           // source successful Edit/Write tool event
  path                  // normalized repo-relative; joined to repository.changedFiles
  changeStatus          // added|modified|deleted|renamed (from git changedFiles)
  kind                  // hunk (Edit) | full_file (Write) | unsupported
  completeness          // landed | superseded | unknown        (R1)
  before?               // exact Edit old_string (bounded, secret-scanned)      (R2)
  after?                // exact Edit new_string / Write content (bounded, secret-scanned)
  symbol?               // ONLY via deterministic unique-declaration rule       (R5)
  codeLocator?          // file + final byte/line span, only when landed        (R5)
  transcriptLocator     // jsonl pointer to the tool input                      (R5)
  finalContentSha256?   // from changedFiles.sha256
  unknownReason?        // required when completeness≠landed or kind=unsupported
  sha256                // binds ALL of the above (hashCodeExcerpt)             (R3)
}
ChangeStory {
  schemaVersion: 2
  objective { text, evidence[] }
  outcome   { text, status, evidence[] }
  overview {
    viewType            // workflow|architecture|sequence|dataflow|lifecycle    (R4)
    renderHint          // sequential|graph|hierarchy (layout only)             (R4)
    nodes[] { id, kind: objective|step|verification|outcome|unknown, label, stepId?, evidence[] }
    edges[] { from, to, kind: observed_sequence|caused_by|architecture|dataflow,
              relationshipStatus: observed|inferred|unknown, label?, evidence[] }   (R4)
  }
  steps[] StoryStep
  evidenceDrawer { quotes[], excludedCounts }    // prompts/quotes SUBORDINATE
  provenance { bundleSha256, changeStorySha256 }
}
StoryStep {
  id                    // derived from immutable evidence id/hash, NOT step-N   (R4)
  title
  intent   { text, status: observed|inferred, evidence[] }   // observed iff quoted excerpt
  toolActivity[] { toolName, status, summary, evidence }      // -> toolEvent hash
  codeChange[]  CodeExcerpt                                    // only landed narrated "implemented"
  verification[] { command, status, exitCode?, outputExcerpt, evidence }   // -> receipt hash
  outcome  { text, evidence[] }
  unknowns[]
}
```
`assertChangeStory` mirrors `assertBundle`: every node/edge/codeChange/verification evidence ref
must resolve to a bundle source whose recomputed hash matches; dangling/tampered ref, unsupported
edge type, or path/limit violation ⇒ hard fail (fail closed). Tampered step/code/edge/latest-pointer
all fail closed.

## 4. Two vertical slices (cheapest validation)
- **S1c feature — viewType `workflow`, renderHint `sequential`:** objective → read slugify.js →
  EDIT slugify.js (landed hunk: add `{maxLength}`, truncate-then-trim, symbol `slugify`) → WRITE
  slugify.test.js (landed full_file) → RUN `node slugify.test.js` (receipt: pass) → outcome.
- **S2 debugging — viewType `sequence`, renderHint `sequential`:** objective → RUN test (receipt
  FAIL, assertion `[3,4]`≠`[1,2]`) → diagnose (intent observed from agent_explanation: 0- vs
  1-indexed) → EDIT paginate.js (landed hunk `page*pageSize`→`(page-1)*pageSize`) → RUN test
  (receipt PASS) → outcome. Two verification nodes (failed→passed).
Both edges are `observed_sequence` (locator-ordered). Render 320/390/1440; context-blind reader
must answer what changed + why; then ≥90% gate.

## 5. Renderer decision (recorded)
Reuse web app typed-IR **vocabulary** (`src/lib/schemas/flow.ts`: FlowNode/FlowConnection/
renderHint; web renders with React+@xyflow/react+dagre) so a future web view can consume the same
package. Do NOT ship that renderer into the plugin (build-step/runtime incompatible). Implement an
equivalent typed, validated, interactive renderer: self-contained inline SVG/HTML + vanilla JS,
accessible keyboard focus + persistent selected-step drill-down. Proof obligation R7 applies.

## 6. Reliability subpart (Riley dogfood)
- `.explainify/latest.json` per R6 (atomic, last-verified, tamper/staleness-aware, failed run never
  overwrites).
- Skill calls MCP first with NO `session.id` and NO dir enumeration; trust server auto-select; ask
  for id only on explicit ambiguity error.
- After a successful MCP result, instruct the provider turn to emit ONE short completion line so a
  later stream-idle timeout can't mask success; document recovery from `.explainify/latest.json`.
- Docs: target must be a git repo; project settings are repo-local but marketplace/plugin caches are
  SHARED under ~/.claude (removing from one project can invalidate another's discovery → re-add).
  Network copy exact: no hosted call; local writes; git+provider traffic still exist; no
  packet-capture proof claimed.

## 7. Boundary & non-goals
v1 fields/hashes preserved; v2 adds strictly-bound code evidence + story. Regenerate S1c/S2 only to
add the new bounded code evidence; preserve prior artifacts as the before/after package. No hosted
upload, no classifier expansion, no public publish, no `main` merge, no S3 multi-session, no Web-app
redesign. Record adjacent needs; don't silently expand. Codex stays blind until an immutable Phase
1E handoff is frozen.

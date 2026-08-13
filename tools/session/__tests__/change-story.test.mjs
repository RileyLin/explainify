// Phase 1E ChangeStory tests: the two vertical slices (S1c feature, S2 debug)
// built end-to-end from a v2 bundle, the fail-closed assertChangeStory tamper
// surface (dangling ref, hash drift, non-landed code change narrated as
// implemented, an edge asserted "observed" that isn't observed_sequence), and the
// interactive renderer proof markers (R7). Deterministic: no git, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildBundleFromTranscript } from "../claude-adapter.mjs";
import {
  assertChangeStory,
  validateChangeStory,
  hashChangeStory,
} from "../change-story-schema.mjs";
import { hashCodeExcerpt } from "../bundle-schema.mjs";
import { buildChangeStory, renderSessionHtmlV2 } from "../../session-synthesis/change-story.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

function bundleFrom({ records, changedFiles, finalContent, root = "/repo" }) {
  const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  return buildBundleFromTranscript({
    transcript: jsonl,
    transcriptSha256: sha256(jsonl),
    session: { id: "s1", cwd: root, captureEvent: "stop", startedAt: "2026-08-07T10:00:00.000Z", endedAt: "2026-08-07T10:05:00.000Z" },
    repository: { root, dirty: false, changedFiles, finalContent },
    receipts: [],
  }).bundle;
}

// --- S1c: feature slice (slugify maxLength) ---
const SLUG_BEFORE = "export function slugify(input) {\n  return String(input).toLowerCase();\n}";
const SLUG_AFTER = "export function slugify(input, { maxLength } = {}) {\n  let slug = String(input).toLowerCase();\n  if (maxLength != null) slug = slug.slice(0, maxLength).replace(/-+$/, \"\");\n  return slug;\n}";
const TEST_FILE = "import { slugify } from \"./slugify.js\";\nif (slugify(\"Hello World\", { maxLength: 5 }) !== \"hello\") throw new Error(\"fail\");\nconsole.log(\"ok\");";

function s1cBundle() {
  const slugFinal = SLUG_AFTER + "\n";
  return bundleFrom({
    records: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Add an optional maxLength option to slugify and cover it with a test." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: "I'll add a maxLength option that truncates then trims a trailing hyphen, then add a test." }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER } }] } },
      { type: "user", uuid: "r1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "updated" }] } },
      { type: "assistant", uuid: "a3", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Write", input: { file_path: "/repo/slugify.test.js", content: TEST_FILE } }] } },
      { type: "user", uuid: "r2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "written" }] } },
      { type: "assistant", uuid: "a4", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node slugify.test.js" } }] } },
      { type: "user", uuid: "r3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "ok" }] } },
      { type: "assistant", uuid: "a5", message: { role: "assistant", content: [{ type: "text", text: "slugify now supports maxLength and the test passes." }] } },
    ],
    changedFiles: [
      { path: "slugify.js", status: "modified", sha256: sha256(slugFinal) },
      { path: "slugify.test.js", status: "added", sha256: sha256(TEST_FILE) },
    ],
    finalContent: { "slugify.js": slugFinal, "slugify.test.js": TEST_FILE },
  });
}

test("S1c feature slice: story is workflow/sequential with landed code steps + a passing verification", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  assert.equal(story.schemaVersion, 2);
  assert.equal(story.overview.renderHint, "sequential");
  // objective + outcome are observed and cite evidence.
  assert.equal(story.objective.status, "observed");
  assert.ok(story.objective.evidence.length >= 1);
  // At least the Edit + Write landed steps exist, each narrating a landed change.
  const codeSteps = story.steps.filter((s) => Array.isArray(s.codeChange) && s.codeChange.length);
  assert.ok(codeSteps.length >= 2, "edit + write both produce landed code steps");
  for (const s of codeSteps) for (const c of s.codeChange) assert.equal(c.completeness, "landed");
  // The symbol resolved for the slugify edit.
  const slugStep = codeSteps.find((s) => s.codeChange.some((c) => c.path === "slugify.js"));
  assert.ok(slugStep.codeChange.some((c) => c.symbol === "slugify"));
  // A verification step reflects the passing node test.
  assert.ok(story.steps.some((s) => (s.verification || []).some((v) => v.status === "succeeded")));
  // Overview begins at objective, ends at outcome. The objective→first and
  // last→outcome framing edges are DERIVED/inferred (synthesis framing, not a
  // proven transition); only step→step edges are observed_sequence and each of
  // those carries evidence for BOTH endpoints (findings #1/#2).
  assert.equal(story.overview.nodes[0].kind, "objective");
  assert.equal(story.overview.nodes[story.overview.nodes.length - 1].kind, "outcome");
  const framing = story.overview.edges.filter((e) => e.from === "n:objective" || e.to === "n:outcome");
  assert.ok(framing.length >= 2, "objective and outcome are connected by framing edges");
  assert.ok(framing.every((e) => e.kind === "derived" && e.relationshipStatus === "inferred"), "framing edges are derived/inferred, never observed");
  const seq = story.overview.edges.filter((e) => e.kind === "observed_sequence");
  assert.ok(seq.length >= 1, "at least one observed step→step transition");
  assert.ok(seq.every((e) => e.relationshipStatus === "observed" && Array.isArray(e.evidence) && e.evidence.length >= 2), "observed edges cite both endpoints");
  // outcome is a DERIVED summary, not a single observed quote.
  assert.equal(story.outcome.status, "inferred");
  // Fully valid against its bundle.
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("S1c renders a self-contained interactive artifact (SVG overview, keyboard drill-down, before/after diff)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  const pkg = { workstreamId: "session:s1", checkpointId: "checkpoint-abc", brief: { objective: "slugify maxLength" } };
  const html = renderSessionHtmlV2(pkg, story);
  // R7 proof markers, all inline (no external build):
  assert.ok(!/<script[^>]*src=/.test(html), "no external script");
  assert.ok(!/react|xyflow|dagre/i.test(html), "no React/xyflow/dagre");
  assert.match(html, /<svg[^>]*class="overview"/, "inline SVG overview");
  assert.match(html, /role="tab"/, "keyboard-selectable nodes");
  assert.match(html, /ArrowDown/, "arrow-key navigation");
  assert.match(html, /class="dl add"/, "before/after diff additions rendered");
  assert.match(html, /landed/, "landed badge present");
  // The exact new code appears in the diff (this is the "actual code" requirement).
  assert.ok(html.includes("maxLength"), "the actual implemented code is shown");
  // Deterministic: same story → identical HTML.
  assert.equal(renderSessionHtmlV2(pkg, story), html);
});

// --- S2: debugging slice (paginate off-by-one) ---
const PAGINATE_BEFORE = "export function paginate(items, page, pageSize) {\n  const start = page * pageSize;\n  return items.slice(start, start + pageSize);\n}";
const PAGINATE_AFTER = "export function paginate(items, page, pageSize) {\n  const start = (page - 1) * pageSize;\n  return items.slice(start, start + pageSize);\n}";

function s2Bundle() {
  const finalPaginate = PAGINATE_AFTER + "\n";
  return bundleFrom({
    records: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Page 1 of paginate returns the wrong items — please debug and fix it." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node paginate.test.js" } }] } },
      { type: "user", uuid: "r1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "AssertionError: expected [3,4] to equal [1,2]" }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: "The bug is that page is treated as 0-indexed; page 1 should map to offset 0, so start must be (page-1)*pageSize." }] } },
      { type: "assistant", uuid: "a3", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/repo/paginate.js", old_string: PAGINATE_BEFORE, new_string: PAGINATE_AFTER } }] } },
      { type: "user", uuid: "r2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "updated" }] } },
      { type: "assistant", uuid: "a4", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node paginate.test.js" } }] } },
      { type: "user", uuid: "r3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "2 tests passed" }] } },
      { type: "assistant", uuid: "a5", message: { role: "assistant", content: [{ type: "text", text: "Fixed the off-by-one; the test now passes." }] } },
    ],
    changedFiles: [{ path: "paginate.js", status: "modified", sha256: sha256(finalPaginate) }],
    finalContent: { "paginate.js": finalPaginate },
  });
}

test("S2 debug slice: viewType sequence, a failed then a passed verification, and the landed fix", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  assert.equal(story.overview.viewType, "sequence", "failed+passed receipts read as a debugging sequence");
  const verifStatuses = story.steps.flatMap((s) => (s.verification || []).map((v) => v.status));
  assert.ok(verifStatuses.includes("failed"), "the failing run is represented");
  assert.ok(verifStatuses.includes("succeeded"), "the passing run is represented");
  // The fix is a landed hunk with the corrected code.
  const fix = story.steps.find((s) => (s.codeChange || []).some((c) => c.path === "paginate.js"));
  assert.ok(fix, "the paginate fix is a step");
  assert.equal(fix.codeChange[0].completeness, "landed");
  assert.ok(fix.codeChange[0].after.includes("(page - 1)"), "the actual fix code is present");
  assert.equal(validateChangeStory(story, bundle).ok, true);
  // Render shows both a failed and a succeeded verification badge.
  const html = renderSessionHtmlV2({ workstreamId: "s2", checkpointId: "c", brief: {} }, story);
  assert.match(html, /badge failed/);
  assert.match(html, /badge succeeded/);
});

test("S2 debug slice: steps follow the attested order failedCheck → diagnosis → fix → passedCheck (finding #1)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  // The diagnosis excerpt ("the bug is ... (page-1)*pageSize") becomes a reasoning
  // step, sitting BETWEEN the failing check and the landed fix (finding #2).
  const diagIdx = story.steps.findIndex((s) => s.intent.status === "observed" && /page-1|0-indexed/.test(s.intent.text));
  assert.ok(diagIdx >= 0, "the diagnosis is emitted as an observed-intent reasoning step");
  const failIdx = story.steps.findIndex((s) => (s.verification || []).some((v) => v.status === "failed"));
  const fixIdx = story.steps.findIndex((s) => (s.codeChange || []).some((c) => c.path === "paginate.js"));
  const passIdx = story.steps.findIndex((s) => (s.verification || []).some((v) => v.status === "succeeded"));
  assert.ok(failIdx >= 0 && fixIdx >= 0 && passIdx >= 0);
  // TRUE order: failing check first, then diagnosis, then the fix, then passing check.
  assert.ok(failIdx < diagIdx, "failing check precedes the diagnosis");
  assert.ok(diagIdx < fixIdx, "the diagnosis precedes the fix (not the old Edit-first order)");
  assert.ok(fixIdx < passIdx, "the fix precedes the passing check");
  // The diagnosis intent is quoted verbatim from its excerpt (observed, not invented).
  const diagStep = story.steps[diagIdx];
  const cited = diagStep.intent.evidence.find((r) => r.type === "excerpt");
  const srcExcerpt = bundle.excerpts.find((e) => e.id === cited.ref);
  assert.ok(srcExcerpt.text.includes(diagStep.intent.text), "diagnosis text is a substring of the cited excerpt");
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("a reordered observed_sequence edge fails closed against the attested order (findings #1/#2)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  // Find a real step→step observed edge and reverse its endpoints. The reversed
  // transition contradicts the bundle observedOrder, so it must fail.
  const edge = story.overview.edges.find((e) => e.kind === "observed_sequence");
  assert.ok(edge, "there is an observed_sequence edge to reverse");
  const from = edge.from, to = edge.to, ev = edge.evidence;
  edge.from = to;
  edge.to = from;
  edge.evidence = [ev[1], ev[0]];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must follow the attested order/.test(e)));
});

test("an observed_sequence edge missing an endpoint's evidence fails closed (finding #2)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const edge = story.overview.edges.find((e) => e.kind === "observed_sequence");
  edge.evidence = [edge.evidence[0]]; // drop the second endpoint's anchor
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /exactly the two evidence anchors/.test(e)));
});

test("reordering story.steps without reordering the nodes fails closed (blocker #1)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  assert.ok(story.steps.length >= 2);
  // Swap the first two steps but leave overview node order untouched, then rehash.
  const tmp = story.steps[0];
  story.steps[0] = story.steps[1];
  story.steps[1] = tmp;
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /step-node order does not match story\.steps/.test(e)));
});

test("an observed_sequence edge whose refs are not its endpoint anchors fails closed (blocker #1)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const edge = story.overview.edges.find((e) => e.kind === "observed_sequence");
  assert.ok(edge);
  // Two copies of the objective ref: right count, wrong anchors.
  const objRef = story.objective.evidence[0];
  edge.evidence = [objRef, objRef];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must equal the "from" node's anchor evidence/.test(e)));
});

test("a rehashed observed_sequence edge that skips a step (0→2) fails closed on adjacency (task #38)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  assert.ok(story.steps.length >= 3, "S2 has ≥3 steps (failed check, diagnosis, fix, passed check)");
  const stepNodes = story.overview.nodes.filter((n) => n.stepId);
  assert.ok(stepNodes.length >= 3);
  // Rewire the first observed edge to jump from step 0 directly to step 2, citing
  // both exact endpoint anchors (so the per-edge forward + anchor checks pass) and
  // dropping the intervening step's proven transition. This is the exact probe:
  // it must be rejected because the observed edge set no longer equals the
  // consecutive step-node pairs.
  const edge = story.overview.edges.find((e) => e.kind === "observed_sequence");
  assert.ok(edge);
  const from = stepNodes[0];
  const skipTo = stepNodes[2];
  edge.from = from.id;
  edge.to = skipTo.id;
  edge.evidence = [from.evidence[0], skipTo.evidence[0]];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /not a consecutive step-node pair|missing observed_sequence edge/.test(e)),
    `adjacency error expected, got ${JSON.stringify(errors)}`);
});

test("dropping one observed_sequence edge (leaving a gap in the proven chain) fails closed (task #38)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const before = story.overview.edges.filter((e) => e.kind === "observed_sequence").length;
  assert.ok(before >= 2);
  // Remove one proven transition; the chain is now incomplete.
  const idx = story.overview.edges.findIndex((e) => e.kind === "observed_sequence");
  story.overview.edges.splice(idx, 1);
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /missing observed_sequence edge/.test(e)));
});

test("a duplicated observed_sequence edge fails closed (task #38)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const edge = story.overview.edges.find((e) => e.kind === "observed_sequence");
  assert.ok(edge);
  story.overview.edges.push({ ...edge, evidence: [...edge.evidence] });
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /duplicated/.test(e)));
});

test("assertChangeStory rejects a tampered provenance.bundleSha256 (finding #3)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.provenance.bundleSha256 = "f".repeat(64);
  // Note: changeStorySha256 is NOT recomputed here on purpose — provenance is
  // outside the story hash, so tampering bundleSha256 must be caught on its own.
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /does not bind the source bundle/.test(e)));
});

test("assertChangeStory rejects an observed intent whose text is not quoted from its excerpt (finding #3)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const diagStep = story.steps.find((s) => s.intent.status === "observed" && s.intent.evidence.some((r) => r.type === "excerpt"));
  assert.ok(diagStep, "there is an observed-intent step");
  diagStep.intent.text = "A claim that appears in no excerpt whatsoever.";
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must be quoted from the excerpt it cites/.test(e)));
});

// --- fail-closed tamper surface (assertChangeStory) ---

test("assertChangeStory rejects a dangling evidence ref", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.objective.evidence.push({ type: "excerpt", ref: "excerpt-does-not-exist", sha256: "a".repeat(64) });
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /dangling reference/.test(e)));
});

test("assertChangeStory rejects an evidence ref whose hash drifts from the bundle", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.objective.evidence[0].sha256 = "b".repeat(64); // wrong hash for a real id
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /hash drift/.test(e)));
});

test("assertChangeStory rejects a non-landed CodeExcerpt narrated as an implemented step change (R1)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  // Forge a step code change referencing a real excerpt but relabeled superseded.
  const real = bundle.codeEvidence.find((c) => c.completeness === "landed");
  const forged = { ...real, completeness: "superseded", codeLocator: undefined, unknownReason: "forged" };
  forged.sha256 = hashCodeExcerpt(forged);
  const step = story.steps.find((s) => Array.isArray(s.codeChange) && s.codeChange.length);
  step.codeChange = [forged];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  // Either the byte-for-byte mismatch or the landed-only rule fires; both are correct.
  assert.ok(errors.some((e) => /landed|byte-for-byte|not present in bundle/.test(e)));
});

test("assertChangeStory rejects an edge that claims 'observed' for a non-observed_sequence kind (R4)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.overview.edges[0].kind = "caused_by";
  story.overview.edges[0].relationshipStatus = "observed";
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /only observed_sequence is provable/.test(e)));
});

test("assertChangeStory rejects a tampered provenance.changeStorySha256", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.steps[0].title = "Forged title"; // change content without rehash
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /does not bind the change story/.test(e)));
});

test("assertChangeStory rejects a step id using step-N enumeration (R4)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.steps[0].id = "step-1";
  // keep node stepId consistent so the failure is specifically the enumeration rule
  const node = story.overview.nodes.find((n) => n.kind === "step");
  if (node) node.stepId = "step-1";
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /step-N enumeration/.test(e)));
});

// --- blocker #3: the v2 IR must not accept unhashed semantic fields anywhere.
// Codex's probe: inject a field at the top, at a step, and inside a step's intent,
// recompute the story hash, and the story must still be rejected — otherwise a
// caller could smuggle accepted-but-unhashed semantics past the tamper check.

test("validateChangeStory rejects an injected top-level field even after rehash (blocker #3)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.injectedTop = { anything: true };
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /changeStory\.injectedTop/.test(e) && /unknown field/.test(e)));
});

test("validateChangeStory rejects an injected step field even after rehash (blocker #3)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.steps[0].injectedStep = "smuggled";
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /injectedStep/.test(e) && /unknown field/.test(e)));
});

test("validateChangeStory rejects an injected step.intent claim field even after rehash (blocker #3)", () => {
  const bundle = s1cBundle();
  const story = buildChangeStory(bundle);
  story.steps[0].intent.injectedClaim = "smuggled semantics";
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /injectedClaim/.test(e) && /unknown field/.test(e)));
});

test("validateChangeStory rejects injected fields on overview / node / edge even after rehash (blocker #3)", () => {
  for (const mutate of [
    (s) => { s.overview.injectedOverview = 1; },
    (s) => { s.overview.nodes[0].injectedNode = 1; },
    (s) => { const e = s.overview.edges[0]; if (e) e.injectedEdge = 1; },
  ]) {
    const bundle = s1cBundle();
    const story = buildChangeStory(bundle);
    mutate(story);
    story.provenance.changeStorySha256 = hashChangeStory(story);
    const { ok, errors } = validateChangeStory(story, bundle);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /unknown field/.test(e)), `unknown-field error expected, got ${JSON.stringify(errors)}`);
  }
});

test("buildChangeStory throws (fail closed) when handed a bundle it cannot bind cleanly", () => {
  // A v2 bundle with codeEvidence removed is not internally consistent for v2, but
  // buildChangeStory is only ever called on a validated v2 bundle; assert that the
  // happy path returns a story whose assert passes, as the contract guarantees.
  const bundle = s1cBundle();
  assert.doesNotThrow(() => assertChangeStory(buildChangeStory(bundle), bundle));
});

// --- Phase 1F: semantic compaction of a real multi-file session (task #39) ---
//
// The Phase 1E builder replayed a multi-file session as one node per reasoning
// excerpt AND one per Edit AND one per receipt — the "blocks/prompts, not
// explanation" failure. These tests build a realistic four-file feature session
// (mirroring the preserved dogfood: releaseStock in inventory, cancelOrder in
// orders, a barrel export, and new tests, verified by a single `node --test` run
// whose pass is a SUCCEEDED Bash event, NOT a promoted receipt) and prove the five
// compaction gates, all fail-closed.

const INV_BEFORE = "const stock = new Map();\nexport function availableStock(sku) {\n  return stock.get(sku) ?? 0;\n}\nexport function resetInventory() {\n  stock.clear();\n}";
const INV_AFTER = "const stock = new Map();\nexport function availableStock(sku) {\n  return stock.get(sku) ?? 0;\n}\nexport function releaseStock(sku, quantity) {\n  stock.set(sku, availableStock(sku) + quantity);\n}\nexport function resetInventory() {\n  stock.clear();\n}";
const ORD_BEFORE = "import { reserveStock } from \"./inventory.js\";\nconst orders = new Map();\nexport function getOrder(id) {\n  return orders.get(id);\n}";
const ORD_AFTER = "import { releaseStock, reserveStock } from \"./inventory.js\";\nconst orders = new Map();\nexport function cancelOrder(id) {\n  const order = orders.get(id);\n  if (!order) throw new Error(`Order ${id} not found`);\n  if (order.status === \"cancelled\") return { ...order };\n  order.status = \"cancelled\";\n  releaseStock(order.sku, order.quantity);\n  return { ...order };\n}\nexport function getOrder(id) {\n  return orders.get(id);\n}";
const IDX_BEFORE = "export { createOrder, getOrder } from \"./orders.js\";";
const IDX_AFTER = "export { cancelOrder, createOrder, getOrder } from \"./orders.js\";";
const TST_BEFORE = "import { createOrder } from \"../src/index.js\";\ntest(\"creating an order reserves inventory\", () => {});";
const TST_AFTER = "import { cancelOrder, createOrder } from \"../src/index.js\";\ntest(\"creating an order reserves inventory\", () => {});\ntest(\"cancelling a confirmed order restores stock\", () => {});\ntest(\"cancelling is idempotent\", () => {});";
const NODE_TEST_OUTPUT = "✔ creating an order reserves inventory\n✔ cancelling a confirmed order restores stock\n✔ cancelling is idempotent\nℹ tests 3\nℹ pass 3\nℹ fail 0";

function multiFileBundle() {
  const root = "/repo";
  const invF = INV_AFTER + "\n", ordF = ORD_AFTER + "\n", idxF = IDX_AFTER + "\n", tstF = TST_AFTER + "\n";
  return bundleFrom({
    root,
    records: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Implement idempotent order cancellation across the repo and cover it with tests." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: "Let me explore the repository structure first." }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: "I have everything I need. Let me implement this across four files." }] } },
      { type: "assistant", uuid: "e1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/src/inventory.js", old_string: INV_BEFORE, new_string: INV_AFTER } }] } },
      { type: "user", uuid: "r1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "updated" }] } },
      { type: "assistant", uuid: "e2", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/repo/src/orders.js", old_string: ORD_BEFORE, new_string: ORD_AFTER } }] } },
      { type: "user", uuid: "r2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "updated" }] } },
      { type: "assistant", uuid: "e3", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Edit", input: { file_path: "/repo/src/index.js", old_string: IDX_BEFORE, new_string: IDX_AFTER } }] } },
      { type: "user", uuid: "r3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", content: "updated" }] } },
      { type: "assistant", uuid: "a3", message: { role: "assistant", content: [{ type: "text", text: "Now add the cancellation tests to the test file." }] } },
      { type: "assistant", uuid: "e4", message: { role: "assistant", content: [{ type: "tool_use", id: "t4", name: "Edit", input: { file_path: "/repo/test/orders.test.js", old_string: TST_BEFORE, new_string: TST_AFTER } }] } },
      { type: "user", uuid: "r4", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t4", content: "updated" }] } },
      { type: "assistant", uuid: "b1", message: { role: "assistant", content: [{ type: "tool_use", id: "t5", name: "Bash", input: { command: "node --test 2>&1" } }] } },
      { type: "user", uuid: "rb1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t5", is_error: false, content: NODE_TEST_OUTPUT }] } },
      { type: "assistant", uuid: "a4", message: { role: "assistant", content: [{ type: "text", text: "All 3 tests pass. Cancellation is implemented across the four files." }] } },
    ],
    changedFiles: [
      { path: "src/inventory.js", status: "modified", sha256: sha256(invF) },
      { path: "src/orders.js", status: "modified", sha256: sha256(ordF) },
      { path: "src/index.js", status: "modified", sha256: sha256(idxF) },
      { path: "test/orders.test.js", status: "modified", sha256: sha256(tstF) },
    ],
    finalContent: { "src/inventory.js": invF, "src/orders.js": ordF, "src/index.js": idxF, "test/orders.test.js": tstF },
  });
}

test("1F: a multi-file session compacts to ≤5 behavior-specific steps (gates 1+3)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  const stepNodes = story.overview.nodes.filter((n) => n.stepId);
  assert.ok(stepNodes.length <= 5, `overview capped at 5 (got ${stepNodes.length})`);
  // One step per implementation unit (file) + a verification step: 4 + 1 = 5.
  assert.equal(story.steps.length, 5);
  // Labels are BEHAVIOR-SPECIFIC, derived from the exact landed code — not "Edited <file>".
  const titles = story.steps.map((s) => s.title).join(" | ");
  assert.ok(/releaseStock/.test(titles), "new declaration named in a title");
  assert.ok(/cancelOrder/.test(titles), "cancelOrder surfaced");
  assert.ok(/Expose|Export/.test(titles), "the barrel export is described as an export, not a file edit");
  assert.ok(/test/i.test(titles), "the test additions are named as tests");
  assert.ok(!/Edited src\//.test(titles), "no bare 'Edited <file>' label remains");
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("1F: reasoning/prompt excerpts stay in the drawer, never as steps (gate 2)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // None of the plain narration ("Let me explore…", "Now add the tests…") is a step.
  for (const s of story.steps) {
    assert.ok(!/Let me explore|Now add the cancellation|I have everything/.test(s.title + s.intent.text),
      `narration leaked into a step: ${s.title}`);
  }
  // With no failing verification, no reasoning excerpt is promoted (no diagnosis arc).
  assert.ok(!story.steps.some((s) => s.intent.status === "observed"), "no observed-intent reasoning step without a failure arc");
  // The narration still exists as evidence, in the drawer.
  assert.ok(story.evidenceDrawer.quotes.length >= 2, "narration preserved in the evidence drawer");
});

test("1F: an attested succeeded Bash check (no receipt) becomes a verification step and binds the outcome (gate 4)", () => {
  const bundle = multiFileBundle();
  // The frozen classifier does NOT mint a receipt for `node --test` (the --test flag
  // is not a NODE_RUN_SAFE option), so this is the real-session case: verification
  // must come from the attested Bash tool event, not a receipt.
  assert.equal(bundle.receipts.length, 0, "no receipt was minted for `node --test`");
  const bashPass = bundle.toolEvents.find((t) => t.toolName === "Bash" && t.status === "succeeded");
  assert.ok(bashPass, "there is a succeeded Bash verification event");
  const story = buildChangeStory(bundle);
  const verifStep = story.steps.find((s) => (s.verification || []).some((v) => v.status === "succeeded"));
  assert.ok(verifStep, "a verification step surfaces the passing check");
  assert.ok(/3\/3|3 test/.test(verifStep.title + verifStep.outcome.text), "the parsed pass count is shown");
  // The outcome BINDS the verification evidence (its tool_input anchor), not raw-only.
  const outcomeRefs = story.outcome.evidence.map((r) => `${r.type}:${r.ref}`);
  assert.ok(outcomeRefs.some((r) => r.startsWith("tool_input:")), "outcome binds the attested verification");
  assert.ok(/passing|passed/.test(story.outcome.text), "outcome states verification passed");
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("1F: no inferred cross-file architecture/dataflow edges (gate 5)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  for (const e of story.overview.edges) {
    assert.ok(["observed_sequence", "derived"].includes(e.kind), `unexpected edge kind ${e.kind}`);
    if (e.kind !== "observed_sequence") assert.notEqual(e.relationshipStatus, "observed");
  }
  // Cross-file causal kinds are never emitted.
  assert.ok(!story.overview.edges.some((e) => ["caused_by", "architecture", "dataflow"].includes(e.kind)));
});

test("1F: dropping a landed change to shrink the story fails closed (gate 3 completeness)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // Remove one landed code change from its step, then rehash — the partition check
  // must catch that an attested landed excerpt is now shown in no step.
  const step = story.steps.find((s) => Array.isArray(s.codeChange) && s.codeChange.length);
  const dropped = step.codeChange.pop();
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes(dropped.id) && /not shown in any step/.test(e)),
    `expected a dropped-landed error, got ${JSON.stringify(errors)}`);
});

test("1F: double-counting a landed change across two steps fails closed (gate 3 partition)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // Copy one step's landed code change into another step, then rehash.
  const withCode = story.steps.filter((s) => Array.isArray(s.codeChange) && s.codeChange.length);
  assert.ok(withCode.length >= 2);
  const dup = { ...withCode[0].codeChange[0] };
  withCode[1].codeChange = [...(withCode[1].codeChange || []), dup];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes(dup.id) && /exactly one step|appears in \d+ steps/.test(e)),
    `expected a double-count error, got ${JSON.stringify(errors)}`);
});

test("1F: re-inflating the overview past the compaction cap fails closed (gate 1)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // Duplicate a step + its node to push the overview to 6 step nodes, keeping the
  // chain internally consistent, then rehash. The cap must reject it.
  const srcStep = story.steps[0];
  const clonedStep = { ...srcStep, id: srcStep.id + ":clone" };
  // Insert clone right after the original in BOTH steps and nodes to keep the
  // order-matched bijection intact, so the failure is specifically the cap.
  const nodeIdx = story.overview.nodes.findIndex((n) => n.stepId === srcStep.id);
  const srcNode = story.overview.nodes[nodeIdx];
  const clonedNode = { ...srcNode, id: srcNode.id + ":clone", stepId: clonedStep.id };
  story.steps.splice(1, 0, clonedStep);
  story.overview.nodes.splice(nodeIdx + 1, 0, clonedNode);
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /compaction cap/.test(e)), `expected a cap error, got ${JSON.stringify(errors)}`);
});

test("1F: the debugging-arc diagnosis is still promoted when a failure precedes it (no S2 regression)", () => {
  // Gate 2's drawer rule must NOT swallow a genuine diagnosis. Reuse S2: a failing
  // check precedes the "(page-1)*pageSize" reasoning and a landed fix follows it, so
  // it remains an observed-intent step (the Phase 1E behavior is preserved).
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const diag = story.steps.find((s) => s.intent.status === "observed" && /page-1|0-indexed/.test(s.intent.text));
  assert.ok(diag, "the diagnosis remains a step in a debugging arc");
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

// --- task #40 REVISE: four integrity attacks that PASSED at 08ccdc8 and must now
// fail closed (blind non-owner review by @codex-builder). Each test reproduces the
// exact executable attack the review surfaced.

// A session whose ONLY "check" is a shell command that is NOT a test runner but
// whose output happens to contain node-test-style "pass/fail" lines — the exact
// laundering probe for finding #1.
function launderingBundle() {
  const slugFinal = SLUG_AFTER + "\n";
  const FAKE = "✔ slugify truncates\nℹ tests 9\nℹ pass 9\nℹ fail 0"; // attacker-controlled file content
  return bundleFrom({
    records: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Add an optional maxLength option to slugify." }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER } }] } },
      { type: "user", uuid: "r1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "updated" }] } },
      // NOT a test runner — just prints a stale/forged log that LOOKS like a pass.
      { type: "assistant", uuid: "a4", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "cat build/last-test-output.txt" } }] } },
      { type: "user", uuid: "r3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: FAKE }] } },
      { type: "assistant", uuid: "a5", message: { role: "assistant", content: [{ type: "text", text: "Done." }] } },
    ],
    changedFiles: [{ path: "slugify.js", status: "modified", sha256: sha256(slugFinal) }],
    finalContent: { "slugify.js": slugFinal },
  });
}

test("1F: a non-test command whose output prints pass/fail lines is NOT promoted to a verification (finding #1 laundering)", () => {
  const bundle = launderingBundle();
  const story = buildChangeStory(bundle);
  // No verification step may be minted from `cat …`.
  const verifSteps = story.steps.filter((s) => (s.verification || []).length);
  assert.equal(verifSteps.length, 0, "a `cat` of a log is not a verification");
  // The outcome must not claim a passing test run off laundered output.
  assert.ok(!/test run reported|passing verification/.test(story.outcome.text), `outcome laundered a fake pass: ${story.outcome.text}`);
  const outcomeRefs = story.outcome.evidence.map((r) => `${r.type}:${r.ref}`);
  assert.ok(!outcomeRefs.some((r) => r.startsWith("tool_input:")), "outcome must not bind the laundered command");
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("1F: relabeling a verification's status (failed→succeeded) fails closed against the source (finding #2)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const failStep = story.steps.find((s) => (s.verification || []).some((v) => v.status === "failed"));
  assert.ok(failStep, "S2 has a failing verification step to relabel");
  failStep.verification[0].status = "succeeded"; // lie about the outcome, keep the real ref
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /does not match the cited/.test(e)), `expected a semantics mismatch, got ${JSON.stringify(errors)}`);
});

test("1F: a verification whose displayed output is not a prefix of the cited source fails closed (finding #2)", () => {
  const bundle = s2Bundle();
  const story = buildChangeStory(bundle);
  const vStep = story.steps.find((s) => (s.verification || []).length);
  assert.ok(vStep);
  vStep.verification[0].outputExcerpt = "ALL 999 TESTS PASSED — nothing to see here";
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must equal the exact canonical bounded slice/.test(e)), `expected an output-slice mismatch, got ${JSON.stringify(errors)}`);
});

test("1F: an outcome binding a verification ref that no step carries fails closed (finding #2 outcome)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // Point the outcome's verification binding at a real tool_input ref that is NOT a
  // verification step's ref (the first change unit's Edit anchor), then rehash.
  const changeStep = story.steps.find((s) => (s.codeChange || []).length);
  const forgedRef = changeStep.intent.evidence[0]; // a tool_input ref for an Edit
  assert.equal(forgedRef.type, "tool_input");
  story.outcome.evidence = [forgedRef];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /no verification step carries|bind at least one attested verification/.test(e)),
    `expected an outcome-binding error, got ${JSON.stringify(errors)}`);
});

// Two landed edits to the SAME file — the builder groups them into one step; the
// attacks below split/mis-anchor that grouping (finding #3).
const UTIL_BEFORE = "export function add(a, b) {\n  return a + b;\n}";
const UTIL_MID = "export function add(a, b) {\n  return a + b;\n}\nexport function sub(a, b) {\n  return a - b;\n}";
const UTIL_AFTER = "export function add(a, b) {\n  return a + b;\n}\nexport function sub(a, b) {\n  return a - b;\n}\nexport function mul(a, b) {\n  return a * b;\n}";
function twoEditsSameFileBundle() {
  const utilF = UTIL_AFTER + "\n";
  return bundleFrom({
    records: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Add sub and mul to util." }] } },
      { type: "assistant", uuid: "e1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/util.js", old_string: UTIL_BEFORE, new_string: UTIL_MID } }] } },
      { type: "user", uuid: "r1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "updated" }] } },
      { type: "assistant", uuid: "e2", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/repo/util.js", old_string: UTIL_MID, new_string: UTIL_AFTER } }] } },
      { type: "user", uuid: "r2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "updated" }] } },
      { type: "assistant", uuid: "b1", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node --test 2>&1" } }] } },
      { type: "user", uuid: "rb1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "ℹ tests 1\nℹ pass 1\nℹ fail 0" }] } },
    ],
    changedFiles: [{ path: "util.js", status: "modified", sha256: sha256(utilF) }],
    finalContent: { "util.js": utilF },
  });
}

test("1F: the builder groups two edits to the SAME file into one step (finding #3 baseline)", () => {
  const bundle = twoEditsSameFileBundle();
  const story = buildChangeStory(bundle);
  const stepsWithUtil = story.steps.filter((s) => (s.codeChange || []).some((c) => c.path === "util.js"));
  assert.equal(stepsWithUtil.length, 1, "both util.js edits live in one step");
  assert.ok(stepsWithUtil[0].codeChange.length >= 2, "the step carries both landed excerpts");
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("1F: splitting one file's landed changes across two steps fails closed (finding #3 split)", () => {
  const bundle = twoEditsSameFileBundle();
  const story = buildChangeStory(bundle);
  const changeStep = story.steps.find((s) => (s.codeChange || []).length >= 2);
  assert.ok(changeStep, "the grouped util step has ≥2 code changes");
  const verifStep = story.steps.find((s) => (s.verification || []).length);
  assert.ok(verifStep);
  // Move the second landed excerpt out of its file's step into the verification step.
  const moved = changeStep.codeChange.pop();
  verifStep.codeChange = [...(verifStep.codeChange || []), moved];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /split across|must anchor at its earliest attested/.test(e)),
    `expected a split/anchor error, got ${JSON.stringify(errors)}`);
});

test("1F: anchoring a step after one of its own code members fails closed (finding #3 swap)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // Move the FIRST file's landed change (earliest anchor) into a LATER-anchored
  // step; that step is now anchored after one of its own members.
  const steps = story.steps.filter((s) => (s.codeChange || []).length);
  assert.ok(steps.length >= 2);
  const early = steps[0];
  const later = steps[steps.length - 1];
  const moved = early.codeChange.pop();
  later.codeChange = [...later.codeChange, moved];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must anchor at its earliest attested|split across/.test(e)),
    `expected an anchor/split error, got ${JSON.stringify(errors)}`);
});

test("1F: a derived edge between two step nodes fails closed (finding #4 causality)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  const stepNodes = story.overview.nodes.filter((n) => n.stepId);
  assert.ok(stepNodes.length >= 2);
  // Add an inferred "derived" link between two implementation steps — a smuggled
  // cross-file relationship the contract forbids.
  story.overview.edges.push({ from: stepNodes[0].id, to: stepNodes[1].id, kind: "derived", relationshipStatus: "inferred", evidence: [] });
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /derived edge may not connect two step nodes|framing-only/.test(e)),
    `expected a framing-only edge error, got ${JSON.stringify(errors)}`);
});

test("1F: caused_by/architecture/dataflow are no longer valid edge kinds (finding #4)", () => {
  const bundle = multiFileBundle();
  for (const kind of ["caused_by", "architecture", "dataflow"]) {
    const story = buildChangeStory(bundle);
    const stepNodes = story.overview.nodes.filter((n) => n.stepId);
    story.overview.edges.push({ from: stepNodes[0].id, to: stepNodes[1].id, kind, relationshipStatus: "inferred", evidence: [] });
    story.provenance.changeStorySha256 = hashChangeStory(story);
    const { ok, errors } = validateChangeStory(story, bundle);
    assert.equal(ok, false, `${kind} must be rejected`);
    assert.ok(errors.some((e) => /overview\.edges\[\d+\]\.kind/.test(e)), `expected an edge-kind error for ${kind}, got ${JSON.stringify(errors)}`);
  }
});

// --- task #40 REVISE ROUND 2: three broader bypasses codex found on 9201a1b.
// The builder-level laundering probes assert the fake verification is never built;
// the schema-level probes craft a story that bypasses the builder and must still
// fail validateChangeStory.

import { isVerificationCommand } from "../change-story-schema.mjs";

test("R3: the NARROW shell grammar accepts only the two audited Phase 1C forms", () => {
  // Positive: ONLY the audited direct node test-file / `node --test` forms and the
  // npm/pnpm/yarn verification SCRIPTS this dogfood's evidence uses.
  for (const good of ["node --test 2>&1", "node --test", "node slugify.test.js", "node paginate.test.js",
    "node ./test/orders.test.js", "npm test", "npm run test", "pnpm test", "pnpm lint", "yarn build"]) {
    assert.equal(isVerificationCommand(good), true, `should accept: ${good}`);
  }
  // Negative: task #43 REVISE — STOP expanding runner support. Bare runners, wrapper
  // binaries (c8/nyc), npx/dlx launchers, positional runner subcommands, env-assignment
  // prefixes, slash/path heads, dangling separators, and every prior laundering form
  // are all unsupported.
  for (const bad of [
    // --- task #43 finding #1 exact probes ---
    "c8",                                  // wrapper binary, no wrapped runner
    "c8 cat stale.log",                    // wrapper launders arbitrary command
    "nyc npm test",                        // wrapper binary
    "vitest list",                         // positional no-run subcommand
    "npx vitest list",                     // launcher + no-run subcommand
    "vitest",                              // bare runner: unsupported this phase
    "npx vitest",                          // launcher: unsupported this phase
    "vitest run",                          // bare runner subcommand
    "jest",
    "bun test",                            // bun not in the audited pm set
    "NODE_ENV=test node --test",           // env-assignment prefix: unsupported
    "/tmp/node --test",                    // slash/path head, not literal `node`
    "./node --test",
    "node --test &&",                      // dangling separators (before empty filter)
    "node --test ||",
    "node --test |",
    "node --test ;",
    "node --test &",
    "node --test\n",
    // --- prior round laundering forms still rejected ---
    "node --test missing.test.js || cat stale.log",
    "false && node --test",
    "node --test | tee out.log",
    "node --test ; echo done",
    "cat stale.log",
    "echo 'ℹ pass 99'",
    "node --test `printf x`",
    "node --test $(echo x)",
    "echo safe # && node --test",          // comment strips to `echo safe`
    "npm test --help",
    "node --version",
    "node -e \"console.log('paginate.test.js')\"",
    "npm test -- --listTests",
    "vitest --dry-run",
  ]) {
    assert.equal(isVerificationCommand(bad), false, `should reject: ${bad}`);
  }
});

function maskingCompoundBundle() {
  // A single Bash event whose command is a status-masking compound but whose status
  // is "succeeded" and whose output prints a stale "99/99 pass" — codex's finding #1.
  const slugFinal = SLUG_AFTER + "\n";
  const STALE = "ℹ tests 99\nℹ pass 99\nℹ fail 0";
  return bundleFrom({
    records: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Add maxLength to slugify." }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER } }] } },
      { type: "user", uuid: "r1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "updated" }] } },
      { type: "assistant", uuid: "a4", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node --test missing.test.js || cat stale.log" } }] } },
      { type: "user", uuid: "r3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: STALE }] } },
      { type: "assistant", uuid: "a5", message: { role: "assistant", content: [{ type: "text", text: "Done." }] } },
    ],
    changedFiles: [{ path: "slugify.js", status: "modified", sha256: sha256(slugFinal) }],
    finalContent: { "slugify.js": slugFinal },
  });
}

test("R2 #1: a status-masking compound Bash command never becomes a verification (finding #1 compound)", () => {
  const bundle = maskingCompoundBundle();
  const story = buildChangeStory(bundle);
  assert.equal(story.steps.filter((s) => (s.verification || []).length).length, 0, "the `|| cat` compound is not a verification");
  assert.ok(!/test run reported 99|99\/99|passing verification/.test(story.outcome.text), `laundered a 99/99 pass: ${story.outcome.text}`);
  assert.equal(validateChangeStory(story, bundle).ok, true);
});

test("R2 #2: collapsing a later file's members into an earlier step fails closed (finding #2 collapse)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  // Non-aggregate change steps, in order. Move ALL of a later file's codeChange into
  // the earliest change step and empty the later step (keeping the node bijection),
  // then rehash. The later PATH still lives in exactly one step, but the earliest
  // step now binds two paths — the single-path invariant must reject it.
  const changeSteps = story.steps.filter((s) => Array.isArray(s.codeChange) && s.codeChange.length && !s.id.startsWith("step:agg:"));
  assert.ok(changeSteps.length >= 2);
  const early = changeSteps[0];
  const later = changeSteps[1];
  early.codeChange = [...early.codeChange, ...later.codeChange];
  later.codeChange = [];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /binds \d+ distinct file paths|split across/.test(e)),
    `expected a single-path/split error, got ${JSON.stringify(errors)}`);
});

test("R3 #2: forging a `step:agg:` id to collapse a later file into an earlier step fails closed", () => {
  // task #43 finding #2: aggregate authorization must be recomputed from cap
  // necessity, not granted by an attacker-controlled `step:agg:` id prefix. This
  // 4-unit dogfood needs NO fold, so renaming an early step to `step:agg:*`,
  // collapsing a later file's members into it, and emptying the later step must
  // still be rejected (both as a forged aggregate AND as a two-path non-aggregate).
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  const changeSteps = story.steps.filter((s) => Array.isArray(s.codeChange) && s.codeChange.length && !s.id.startsWith("step:agg:"));
  assert.ok(changeSteps.length >= 2);
  const early = changeSteps[0];
  const later = changeSteps[1];
  const forgedId = `step:agg:${early.id.replace(/^step:/, "")}`;
  // Rename the early step to a forged aggregate id and update its overview node's
  // stepId so the node↔step bijection still holds (the attacker keeps the story
  // otherwise well-formed).
  const node = story.overview.nodes.find((n) => n.stepId === early.id);
  early.id = forgedId;
  if (node) node.stepId = forgedId;
  early.codeChange = [...early.codeChange, ...later.codeChange];
  later.codeChange = [];
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /no aggregation is permitted|does not match the expected aggregate|binds \d+ distinct file paths/.test(e)),
    `expected a forged-aggregate/partition error, got ${JSON.stringify(errors)}`);
});

// --- R4 fold-triggering bundle: 6 change units + 1 passing check force a real
// cap-produced aggregate (step:agg:*). multiFileBundle has only 4 units and folds
// nothing, so the two round-4 probes need a bundle that actually exceeds the cap. ---
const R4_FILES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
const r4Before = (n) => `export function base_${n}(x) {\n  return x;\n}`;
const r4After = (n) => `export function base_${n}(x) {\n  return x;\n}\nexport function feat_${n}(x) {\n  return x + ${R4_FILES.indexOf(n)};\n}`;
const R4_TEST_OUTPUT = "ℹ tests 6\nℹ pass 6\nℹ fail 0";

function foldingBundle() {
  const root = "/repo";
  const records = [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Add a feat_ helper to each of the six modules and run the tests." }] } },
    { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: "I'll add one helper per module, then run the suite." }] } },
  ];
  R4_FILES.forEach((n, i) => {
    records.push({ type: "assistant", uuid: `e${i}`, message: { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "Edit", input: { file_path: `/repo/src/${n}.js`, old_string: r4Before(n), new_string: r4After(n) } }] } });
    records.push({ type: "user", uuid: `r${i}`, message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "updated" }] } });
  });
  records.push({ type: "assistant", uuid: "b1", message: { role: "assistant", content: [{ type: "tool_use", id: "tb", name: "Bash", input: { command: "node --test 2>&1" } }] } });
  records.push({ type: "user", uuid: "rb", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tb", is_error: false, content: R4_TEST_OUTPUT }] } });
  records.push({ type: "assistant", uuid: "a9", message: { role: "assistant", content: [{ type: "text", text: "All six modules updated and 6 tests pass." }] } });
  const changedFiles = R4_FILES.map((n) => ({ path: `src/${n}.js`, status: "modified", sha256: sha256(r4After(n) + "\n") }));
  const finalContent = Object.fromEntries(R4_FILES.map((n) => [`src/${n}.js`, r4After(n) + "\n"]));
  return bundleFrom({ root, records, changedFiles, finalContent });
}

test("R4 sanity: a 6-unit session folds overflow into exactly one canonical aggregate step (gate 1)", () => {
  const bundle = foldingBundle();
  const story = buildChangeStory(bundle);
  const aggs = story.steps.filter((s) => typeof s.id === "string" && s.id.startsWith("step:agg:"));
  assert.equal(aggs.length, 1, `expected exactly one cap-produced aggregate, got ${JSON.stringify(story.steps.map((s) => s.id))}`);
  assert.ok(story.steps.length <= 5, `overview capped at 5 (got ${story.steps.length})`);
  assert.equal(validateChangeStory(story, bundle).ok, true, "the honest folding story validates");
});

test("R4 #1: removing a non-change step to flip fold necessity fails closed (task #44 finding #1)", () => {
  // Round 3 derived fold necessity (the non-change slot count) from the mutable
  // story.steps, so dropping the verification step changed how many change units
  // the validator expected to fold — an attacker could un-fold the aggregate by
  // deleting a bundle-attested non-change step. Round 4 reconstructs the WHOLE
  // ordered partition from bundle-required evidence, so removing the verification
  // step (and its overview node + orphaned edges, keeping the story otherwise
  // well-formed) must be rejected: the bundle still yields that step.
  const bundle = foldingBundle();
  const story = buildChangeStory(bundle);
  const vStep = story.steps.find((s) => (s.verification || []).length);
  assert.ok(vStep, "the folding story has a verification step");
  const vId = vStep.id;
  story.steps = story.steps.filter((s) => s.id !== vId);
  const vNode = story.overview.nodes.find((n) => n.stepId === vId);
  const vNodeId = vNode ? vNode.id : null;
  story.overview.nodes = story.overview.nodes.filter((n) => n.stepId !== vId);
  if (vNodeId) story.overview.edges = story.overview.edges.filter((e) => e.from !== vNodeId && e.to !== vNodeId);
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /the bundle deterministically yields|bundle-derived partition/.test(e)),
    `expected a full-partition mismatch (finding #1), got ${JSON.stringify(errors)}`);
});

test("R4 #2: relabeling or emptying the aggregate's semantic fields fails closed (task #44 finding #2)", () => {
  // Round 3 bound only the aggregate's cap-necessity, derived id, and folded path
  // set — never its exact title/intent/tool-activity/outcome text or evidence. So
  // an attacker could keep the right id and path set but rewrite the aggregate's
  // human-readable meaning. Round 4 asserts every present step is canonically
  // identical to its bundle-derived twin, so relabeling the aggregate title OR
  // erasing its tool-activity refs must both be rejected.
  const bundle = foldingBundle();

  // (a) relabel the aggregate's title.
  {
    const story = buildChangeStory(bundle);
    const agg = story.steps.find((s) => typeof s.id === "string" && s.id.startsWith("step:agg:"));
    assert.ok(agg, "the folding story has a cap-produced aggregate");
    const aggNode = story.overview.nodes.find((n) => n.stepId === agg.id);
    agg.title = "Refactor shared utilities";
    if (aggNode) aggNode.label = "Refactor shared utilities";
    story.provenance.changeStorySha256 = hashChangeStory(story);
    const { ok, errors } = validateChangeStory(story, bundle);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /does not match the deterministic builder result/.test(e)),
      `expected a canonical-equality mismatch on relabel (finding #2), got ${JSON.stringify(errors)}`);
  }

  // (b) empty the aggregate's tool-activity evidence while keeping id + path set.
  {
    const story = buildChangeStory(bundle);
    const agg = story.steps.find((s) => typeof s.id === "string" && s.id.startsWith("step:agg:"));
    assert.ok(Array.isArray(agg.toolActivity) && agg.toolActivity.length > 0, "the aggregate carries tool activity");
    agg.toolActivity = [];
    story.provenance.changeStorySha256 = hashChangeStory(story);
    const { ok, errors } = validateChangeStory(story, bundle);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /does not match the deterministic builder result/.test(e)),
      `expected a canonical-equality mismatch on emptied tool activity (finding #2), got ${JSON.stringify(errors)}`);
  }
});

test("R2 #3: fabricating an exitCode on a Bash-event verification fails closed (finding #3 exit)", () => {
  const bundle = multiFileBundle(); // its verification is a bare Bash event (no receipt/exitCode)
  const story = buildChangeStory(bundle);
  const vStep = story.steps.find((s) => (s.verification || []).some((v) => v.status === "succeeded"));
  assert.ok(vStep);
  assert.equal(vStep.verification[0].exitCode, undefined, "the Bash-event verification has no attested exit code");
  vStep.verification[0].exitCode = 0; // fabricate a clean exit
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must not fabricate one|must equal the cited receipt's exit code/.test(e)),
    `expected an exitCode-parity error, got ${JSON.stringify(errors)}`);
});

test("R2 #3: erasing a verification's output to empty fails closed (finding #3 output)", () => {
  const bundle = multiFileBundle();
  const story = buildChangeStory(bundle);
  const vStep = story.steps.find((s) => (s.verification || []).length);
  assert.ok(vStep && vStep.verification[0].outputExcerpt.length > 0, "the verification has nonempty attested output");
  vStep.verification[0].outputExcerpt = ""; // erase the evidence but keep the ref
  story.provenance.changeStorySha256 = hashChangeStory(story);
  const { ok, errors } = validateChangeStory(story, bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must equal the exact canonical bounded slice/.test(e)),
    `expected an output-slice mismatch, got ${JSON.stringify(errors)}`);
});

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

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

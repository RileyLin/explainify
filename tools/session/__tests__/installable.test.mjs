// Phase 1D installable-plugin regressions. Three locked-scope guards:
//   (a) license closure — the vendored bundle's notices are driven by the REAL
//       esbuild metafile closure, resolved to nested package versions.
//   (b) checkout-path canary — Claude Code's own control records (isMeta skill
//       payload, Explainify slash wrapper, Explainify-attributed tool response)
//       are excluded before selection, so a checkout path they carry can never
//       leak into the bundle; each exclusion is counted with a reason.
//   (c) finding #7 causal-change floor — unchanged installer settings and the
//       tool-owned .explainify/** tree are omitted from changedFiles, while a
//       genuinely edited .claude file (CLAUDE.md, or settings edited AFTER
//       SessionStart) is always kept.
//
// Deterministic: no git, no network, no live transcript. Group (a) runs esbuild
// via the build module's computeLicenseClosure() against the repo's real
// node_modules (the same closure the committed LICENSES.md is generated from).

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildBundleFromTranscript } from "../claude-adapter.mjs";
import { computeLicenseClosure } from "../plugin/build-plugin.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

// ---------------------------------------------------------------------------
// (a) License closure: exactly the 8 bundled families, nested versions exact.
// ---------------------------------------------------------------------------

test("license closure = exactly the 8 bundled families with nested versions (ajv 8.18.0, json-schema-traverse 1.0.0)", async () => {
  const closure = await computeLicenseClosure();
  const got = closure.map((e) => `${e.name}@${e.version}`).sort();
  const expected = [
    "@modelcontextprotocol/sdk@1.30.0",
    "ajv@8.18.0",
    "ajv-formats@3.0.1",
    "fast-deep-equal@3.1.3",
    "fast-uri@3.1.5",
    "json-schema-traverse@1.0.0",
    "zod@4.3.6",
    "zod-to-json-schema@3.25.1",
  ].sort();
  assert.deepEqual(got, expected, `bundled license closure drifted:\n${got.join("\n")}`);

  // Nested-version resolution guard: the repo root also has an UNRELATED
  // ajv@6.14.0 / json-schema-traverse@0.4.1. Collapsing on name would attribute
  // those wrong versions — assert the bundled (nested) versions specifically.
  const byName = new Map(closure.map((e) => [e.name, e.version]));
  assert.equal(byName.get("ajv"), "8.18.0", "ajv must resolve to the bundled 8.18.0, not the root 6.14.0");
  assert.equal(byName.get("json-schema-traverse"), "1.0.0", "json-schema-traverse must resolve to the bundled 1.0.0, not 0.4.1");

  // Every family carries a resolved license string (no "see below" fallthrough).
  for (const e of closure) {
    assert.equal(typeof e.license, "string");
    assert.ok(e.license.length > 0 && e.license !== "see below", `${e.name} has no resolved license`);
  }
});

// ---------------------------------------------------------------------------
// (b) Checkout-path canary: control records carrying it are excluded, counted.
// ---------------------------------------------------------------------------

const CANARY = "/Users/secret-owner/checkouts/explainify-private";

// A transcript with ONE genuine user requirement plus three Claude-Code control
// records, each carrying the canary checkout path:
//   - an isMeta skill system prompt ("Base directory for this skill: <path>")
//   - the user's own /explain-session slash-command wrapper
//   - the assistant response attributed to explainify-session (a FAILURE that
//     echoes the checkout path in its error text)
// None may reach the bundle. The lone real requirement keeps selection valid.
const CANARY_JSONL = [
  {
    type: "assistant",
    uuid: "m1",
    isMeta: true,
    message: {
      role: "assistant",
      content: [{ type: "text", text: `Base directory for this skill: ${CANARY}/tools/session/plugin/skills/explain-session/SKILL.md` }],
    },
  },
  {
    type: "user",
    uuid: "r1",
    message: { role: "user", content: [{ type: "text", text: "Add input validation to the signup form and cover it with a test." }] },
  },
  {
    type: "user",
    uuid: "w1",
    message: { role: "user", content: [{ type: "text", text: `<command-name>/explain-session</command-name>\n<command-args>root=${CANARY}</command-args>` }] },
  },
  {
    type: "assistant",
    uuid: "e1",
    attributionPlugin: "explainify-session",
    message: {
      role: "assistant",
      content: [{ type: "text", text: `explain_session failed: ENOENT reading transcript under ${CANARY}/.explainify/sessions/abc; refusing to proceed.` }],
    },
  },
].map((r) => JSON.stringify(r)).join("\n") + "\n";

function buildCanary() {
  return buildBundleFromTranscript({
    transcript: CANARY_JSONL,
    transcriptSha256: sha256(CANARY_JSONL),
    session: { id: "sess-canary", cwd: "/repo", captureEvent: "stop" },
    repository: { dirty: false, changedFiles: [] },
    receipts: [],
  }).bundle;
}

test("checkout-path canary never leaks: isMeta + slash wrapper + Explainify-attributed response are all excluded", () => {
  const bundle = buildCanary();
  const serialized = JSON.stringify(bundle);
  assert.ok(!serialized.includes(CANARY), "checkout-path canary leaked into the bundle");
  // Also assert the canary is absent from the objective and every excerpt text.
  assert.ok(!bundle.objective.text.includes(CANARY));
  for (const ex of bundle.excerpts) assert.ok(!ex.text.includes(CANARY));
  // The one genuine requirement still survives as the objective.
  assert.match(bundle.objective.text, /input validation to the signup form/);
});

test("each control-record exclusion is counted with its reason (meta / slash / attributed)", () => {
  const bundle = buildCanary();
  const byKind = new Map(bundle.exclusions.map((e) => [e.kind, e]));
  for (const kind of ["meta_record", "slash_command_wrapper", "explainify_tool_output"]) {
    const e = byKind.get(kind);
    assert.ok(e, `missing exclusion count for ${kind}`);
    assert.ok(e.count >= 1, `${kind} count must be >= 1`);
    assert.ok(typeof e.reason === "string" && e.reason.length > 0, `${kind} needs a human reason`);
  }
});

// ---------------------------------------------------------------------------
// (c) Finding #7: causal-change floor for installer/internal/agent-native paths.
// ---------------------------------------------------------------------------

// Minimal valid transcript (one requirement) so the bundle builds; the assertions
// are entirely about repository.changedFiles derivation.
const MIN_JSONL = [
  {
    type: "user",
    uuid: "u1",
    message: { role: "user", content: [{ type: "text", text: "Implement the factorial helper and export it from app.js." }] },
  },
].map((r) => JSON.stringify(r)).join("\n") + "\n";

const SETTINGS_BASELINE_SHA = "s".repeat(64);
const SETTINGS_LOCAL_BASELINE_SHA = "l".repeat(64);

function buildChanges(changedFiles) {
  return buildBundleFromTranscript({
    transcript: MIN_JSONL,
    transcriptSha256: sha256(MIN_JSONL),
    session: { id: "sess-changes", cwd: "/repo", captureEvent: "stop" },
    repository: {
      dirty: true,
      changedFiles,
      installerBaselineHashes: {
        ".claude/settings.json": SETTINGS_BASELINE_SHA,
        ".claude/settings.local.json": SETTINGS_LOCAL_BASELINE_SHA,
      },
    },
    receipts: [],
  }).bundle;
}

test("unchanged installer settings + .explainify/** are omitted; a real edit is the only causal change", () => {
  const bundle = buildChanges([
    // Installer-written, byte-identical to SessionStart baseline → install artifact.
    { path: ".claude/settings.json", status: "added", sha256: SETTINGS_BASELINE_SHA },
    { path: ".claude/settings.local.json", status: "added", sha256: SETTINGS_LOCAL_BASELINE_SHA },
    // Tool-owned output tree → never a session change.
    { path: ".explainify/out/sess-changes/bundle.json", status: "added", sha256: "e".repeat(64) },
    { path: ".explainify/sessions/sess-changes/pointer.json", status: "added", sha256: "f".repeat(64) },
    // The genuine session work.
    { path: "app.js", status: "modified", sha256: "a".repeat(64) },
  ]);
  const kept = bundle.repository.changedFiles.map((c) => c.path);
  assert.deepEqual(kept, ["app.js"], `expected exactly the app.js causal change, got: ${kept.join(", ")}`);
  const byKind = new Map(bundle.exclusions.map((e) => [e.kind, e.count]));
  assert.equal(byKind.get("installer_config"), 2, "both unchanged installer files must be counted");
  assert.equal(byKind.get("internal_tool_dir"), 2, "both .explainify/** files must be counted");
});

test("installer settings EDITED after SessionStart are kept as real session work (hash differs from baseline)", () => {
  const bundle = buildChanges([
    // Same file, but content changed during the session → not the install artifact.
    { path: ".claude/settings.json", status: "modified", sha256: "d".repeat(64) },
    { path: "app.js", status: "modified", sha256: "a".repeat(64) },
  ]);
  const kept = bundle.repository.changedFiles.map((c) => c.path).sort();
  assert.deepEqual(kept, [".claude/settings.json", "app.js"], "an edited settings file is a genuine 2nd change");
  const byKind = new Map(bundle.exclusions.map((e) => [e.kind, e.count]));
  assert.equal(byKind.get("installer_config"), undefined, "an edited installer setting must NOT be excluded");
});

test(".claude/CLAUDE.md and skills/hooks are agent-native work — never hidden", () => {
  const bundle = buildChanges([
    { path: ".claude/CLAUDE.md", status: "modified", sha256: "c".repeat(64) },
    { path: ".claude/skills/foo/SKILL.md", status: "added", sha256: "b".repeat(64) },
    // An unchanged installer file alongside — only THAT one is dropped.
    { path: ".claude/settings.json", status: "added", sha256: SETTINGS_BASELINE_SHA },
  ]);
  const kept = bundle.repository.changedFiles.map((c) => c.path).sort();
  assert.deepEqual(kept, [".claude/CLAUDE.md", ".claude/skills/foo/SKILL.md"]);
});

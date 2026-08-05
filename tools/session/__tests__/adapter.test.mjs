// Phase 1A adapter + schema + safety tests. Run with node's built-in runner:
//   node --test tools/session/__tests__/*.test.mjs
// Deterministic: no git, no network, no live transcript — fixtures only.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildBundleFromTranscript } from "../claude-adapter.mjs";
import { validateBundle } from "../bundle-schema.mjs";
import { isDeniedPath, redact, scanClean, REDACTION_PLACEHOLDER } from "../safety.mjs";
import { FEATURE_CHANGE_JSONL, SECRET_IN_TEXT_JSONL, NOISY_JSONL, FIXED_REPOSITORY } from "./fixtures.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

function buildFeature(overrides = {}) {
  return buildBundleFromTranscript({
    transcript: FEATURE_CHANGE_JSONL,
    transcriptSha256: sha256(FEATURE_CHANGE_JSONL),
    session: { id: "sess-1", cwd: "/repo", captureEvent: "stop" },
    repository: FIXED_REPOSITORY,
    receipts: [],
    ...overrides,
  }).bundle;
}

test("produces a schema-valid bundle from a real-shaped transcript", () => {
  const bundle = buildFeature();
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, true, errors.join("; "));
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.session.source, "claude_code");
  assert.equal(bundle.privacy.publication, "local_only");
  assert.equal(bundle.privacy.secretScan, "pass");
});

test("captures the human requirement as the objective with a resolvable locator", () => {
  const bundle = buildFeature();
  assert.match(bundle.objective.text, /rate limiter/i);
  const src = bundle.excerpts.find((e) => e.id === bundle.objective.sourceId);
  assert.ok(src, "objective sourceId resolves to an excerpt");
  assert.equal(src.role, "user");
  assert.equal(src.kind, "user_requirement");
  assert.match(src.locator, /^jsonl:u1#content\[0\]$/);
});

test("excludes model reasoning (thinking blocks) entirely", () => {
  const bundle = buildFeature();
  const all = JSON.stringify(bundle);
  assert.ok(!all.includes("internal reasoning"), "thinking content must not appear");
  const ex = bundle.exclusions.find((x) => x.kind === "model_reasoning");
  assert.ok(ex && ex.count >= 1);
});

test("keeps change/inspect tool events and pairs their results by tool_use_id", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.ok(write, "Write tool kept");
  assert.equal(write.status, "succeeded");
  assert.match(write.outputSummary, /File written/);
  const bash = bundle.toolEvents.find((t) => t.toolName === "Bash");
  assert.ok(bash, "Bash tool kept");
});

test("tool events carry distinct input and output locators (output never borrows input)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.match(write.inputLocator, /^jsonl:a2#content\[0\]$/);
  assert.match(write.outputLocator, /^jsonl:u2#content\[0\]$/);
  assert.notEqual(write.inputLocator, write.outputLocator);
  assert.match(write.inputSha256, /^[0-9a-f]{64}$/);
  assert.match(write.outputSha256, /^[0-9a-f]{64}$/);
});

test("derives an honest test receipt from the Bash test command", () => {
  const bundle = buildFeature();
  const rc = bundle.receipts.find((r) => r.kind === "test");
  assert.ok(rc, "test receipt derived from `npm test`");
  assert.equal(rc.status, "succeeded"); // tool_result was is_error:false
  assert.equal(rc.exitCode, undefined, "no exit code is fabricated");
  assert.match(rc.commandLocator, /^jsonl:a5#content\[0\]$/);
  assert.match(rc.sha256, /^[0-9a-f]{64}$/);
});

test("derives a test receipt from a direct test-file run (node x.test.js), not just `npm test`", () => {
  // Regression for a real S2 debugging-dogfood gap: a session that reproduces a
  // bug by running its test directly (`node paginate.test.js`) — fail, fix,
  // re-run to pass — must still surface a verification receipt with the
  // failed→passed transition. The classifier previously only matched package
  // scripts / named runners, so the artifact's Verification panel read
  // "No verification receipt captured" despite a genuine test transition.
  const jsonl = [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Run node paginate.test.js first to reproduce the failure, then fix it." }] } },
    { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node paginate.test.js" } }] } },
    { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "AssertionError: expected [1,2] got [3,4]" }] } },
    { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "paginate.js", old_string: "page * pageSize", new_string: "(page - 1) * pageSize" } }] } },
    { type: "user", uuid: "u3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "updated" }] } },
    { type: "assistant", uuid: "a3", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node paginate.test.js" } }] } },
    { type: "user", uuid: "u4", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "All tests passed." }] } },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n";
  const bundle = buildBundleFromTranscript({
    transcript: jsonl,
    transcriptSha256: sha256(jsonl),
    session: { id: "sess-dbg", cwd: "/repo", captureEvent: "stop" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  const tests = bundle.receipts.filter((r) => r.kind === "test");
  assert.equal(tests.length, 2, "both the failing and the passing test run are receipts");
  assert.deepEqual(tests.map((r) => r.status), ["failed", "succeeded"], "the failed→passed transition is preserved");
  // A non-test bare `node` invocation must still NOT be classified as a test.
  const notTest = buildBundleFromTranscript({
    transcript: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Start the dev server so I can look at it." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node server.js" } }] } },
      { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "listening on :3000" }] } },
    ].map((r) => JSON.stringify(r)).join("\n") + "\n",
    transcriptSha256: sha256("x"),
    session: { id: "sess-run", cwd: "/repo", captureEvent: "stop" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  assert.equal(notTest.receipts.filter((r) => r.kind === "test").length, 0, "a plain `node server.js` is not a test receipt");
});

test("caller question is request context, distinct from the observed objective", () => {
  const bundle = buildBundleFromTranscript({
    transcript: FEATURE_CHANGE_JSONL,
    transcriptSha256: sha256(FEATURE_CHANGE_JSONL),
    session: { id: "sess-q", cwd: "/repo", captureEvent: "stop" },
    request: { question: "Is this production ready?", audience: { role: "reviewer", technicalDepth: "expert" } },
    repository: FIXED_REPOSITORY,
  }).bundle;
  assert.equal(bundle.request.question, "Is this production ready?");
  assert.equal(bundle.request.audience.technicalDepth, "expert");
  // The objective is the session's own requirement, NOT the caller's question.
  assert.match(bundle.objective.text, /rate limiter/i);
  assert.notEqual(bundle.objective.text, bundle.request.question);
  const src = bundle.excerpts.find((e) => e.id === bundle.objective.sourceId);
  assert.ok(src, "objective.sourceId resolves to a selected excerpt");
});

test("fail-closed: unknown tool payloads are excluded, not coerced", () => {
  const bundle = buildFeature();
  assert.ok(!bundle.toolEvents.some((t) => t.toolName === "ToolSearch"));
  const ex = bundle.exclusions.find((x) => x.kind === "unknown_tool:ToolSearch");
  assert.ok(ex && ex.count === 1);
});

test("denied-path tool reads (.env) are excluded and never embedded", () => {
  const bundle = buildFeature();
  assert.ok(!JSON.stringify(bundle).includes("/home/app/.env"));
  const ex = bundle.exclusions.find((x) => x.kind === "denied_path_tool");
  assert.ok(ex && ex.count >= 1);
});

test("secret in tool output is redacted and the scan still passes", () => {
  const bundle = buildFeature();
  const all = JSON.stringify(bundle);
  assert.ok(!all.includes("ghp_ABCDEFGHIJKLMNOPQRST12345"), "github token must be redacted");
  assert.equal(bundle.privacy.secretScan, "pass");
  assert.ok(bundle.privacy.redactionCount >= 1);
});

test("denied changed files are dropped and counted in privacy.deniedPathCount", () => {
  const bundle = buildFeature();
  assert.ok(!bundle.repository.changedFiles.some((c) => c.path === ".env.local"));
  assert.ok(bundle.repository.changedFiles.some((c) => c.path === "src/gateway/rate-limiter.ts"));
  assert.equal(bundle.privacy.deniedPathCount, 1);
});

test("captures unresolved work as its own excerpt kind", () => {
  const bundle = buildFeature();
  assert.ok(bundle.excerpts.some((e) => e.kind === "unresolved" && /middleware chain/.test(e.text)));
});

test("secret in the only user text is redacted, objective still present", () => {
  const bundle = buildBundleFromTranscript({
    transcript: SECRET_IN_TEXT_JSONL,
    transcriptSha256: sha256(SECRET_IN_TEXT_JSONL),
    session: { id: "sess-2", cwd: "/repo", captureEvent: "fixture" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  assert.ok(!JSON.stringify(bundle).includes("SUPER_SECRET_VALUE_1234567890"));
  assert.equal(bundle.privacy.secretScan, "pass");
  assert.match(bundle.objective.text, /api_key=«redacted»|Objective not stated/);
});

test("malformed and noise lines are excluded, real content still captured", () => {
  const bundle = buildBundleFromTranscript({
    transcript: NOISY_JSONL,
    transcriptSha256: sha256(NOISY_JSONL),
    session: { id: "sess-3", cwd: "/repo", captureEvent: "fixture" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  const { ok } = validateBundle(bundle);
  assert.equal(ok, true);
  assert.ok(bundle.exclusions.some((x) => x.kind === "malformed_jsonl_line" && x.count === 1));
  assert.ok(bundle.exclusions.some((x) => x.kind === "image_block"));
  assert.ok(bundle.exclusions.some((x) => x.kind.startsWith("record_type:queue-operation")));
  assert.match(bundle.objective.text, /real requirement/i);
});

test("deterministic: identical immutable inputs produce a byte-identical bundle", () => {
  const a = buildFeature();
  const b = buildFeature();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("locators reference exact transcript records, not line numbers", () => {
  const bundle = buildFeature();
  for (const e of bundle.excerpts) assert.match(e.locator, /^jsonl:[^#]+#content\[\d+\]$/);
  for (const t of bundle.toolEvents) {
    assert.match(t.inputLocator, /^jsonl:[^#]+#content\[\d+\]$/);
    if (t.outputLocator) assert.match(t.outputLocator, /^jsonl:[^#]+#content\[\d+\]$/);
  }
});

test("raw transcript is referenced by whole-file hash, never embedded", () => {
  const bundle = buildFeature();
  assert.equal(bundle.session.transcriptSha256, sha256(FEATURE_CHANGE_JSONL));
  // No excerpt should equal the whole transcript.
  assert.ok(!bundle.excerpts.some((e) => e.text === FEATURE_CHANGE_JSONL));
});

// --- schema validator direct tests ---

test("validator rejects a wrong publication scope", () => {
  const bundle = buildFeature();
  bundle.privacy.publication = "public";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("privacy.publication")));
});

test("validator rejects a non-pass secret scan", () => {
  const bundle = buildFeature();
  bundle.privacy.secretScan = "fail";
  assert.equal(validateBundle(bundle).ok, false);
});

test("validator rejects duplicate ids across excerpts/tools/receipts", () => {
  const bundle = buildFeature();
  bundle.toolEvents[0].id = bundle.excerpts[0].id;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /duplicate id/.test(e)));
});

test("validator rejects a bad sha-256 hex", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].sha256 = "not-a-hash";
  assert.equal(validateBundle(bundle).ok, false);
});

test("validator rejects an excerpt hash that does not bind its text", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].text = `${bundle.excerpts[0].text} tampered`;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /hash mismatch/.test(e)));
});

test("validator rejects an unknown field anywhere in the bundle", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].surprise = "extra";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /unknown field/.test(e)));
});

test("validator rejects a dangling objective.sourceId", () => {
  const bundle = buildFeature();
  bundle.objective.sourceId = "excerpt-does-not-exist";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /dangling reference/.test(e)));
});

test("validator rejects a tool output that borrows its input locator", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.outputLocator);
  write.outputLocator = write.inputLocator;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /borrow its input locator/.test(e)));
});

test("validator rejects an over-limit text field", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].text = "x".repeat(9000);
  bundle.excerpts[0].sha256 = sha256(bundle.excerpts[0].text);
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /exceeds .* chars/.test(e)));
});

test("validator rejects a receipt whose canonical hash does not bind it", () => {
  const bundle = buildFeature();
  const rc = bundle.receipts[0];
  assert.ok(rc, "there is at least one derived receipt");
  rc.content = `${rc.content} tampered`;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /hash mismatch/.test(e)));
});

test("validator rejects an exit code on an unknown-status receipt", () => {
  const bundle = buildFeature();
  const rc = bundle.receipts[0];
  rc.status = "unknown";
  rc.exitCode = 0;
  rc.sha256 = undefined; // force through to the exitCode rule regardless of hash
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must be absent when status is unknown/.test(e)));
});

// --- finding #4: hashes bind full evidence semantics + locators, not just text ---

test("validator rejects a relabeled tool name (input hash binds toolName)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  write.toolName = "Read"; // relabel a change tool as an inspect tool, keep the text/hash
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /inputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects a relabeled tool input locator (input hash binds inputLocator)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  write.inputLocator = "jsonl:forged#content[0]";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /inputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects a flipped tool status (output hash binds status)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.outputLocator && t.status === "succeeded");
  write.status = "failed"; // claim a success was a failure without touching text
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /outputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects a relabeled receipt id or kind (receipt hash binds both)", () => {
  const relabelId = buildFeature();
  relabelId.receipts[0].id = "receipt-relabeled";
  const a = validateBundle(relabelId);
  assert.equal(a.ok, false);
  assert.ok(a.errors.some((e) => /receipts\[0\]\.sha256/.test(e) && /hash mismatch/.test(e)), a.errors.join("; "));

  const relabelKind = buildFeature();
  relabelKind.receipts[0].kind = "lint"; // was "test"
  const b = validateBundle(relabelKind);
  assert.equal(b.ok, false);
  assert.ok(b.errors.some((e) => /receipts\[0\]\.sha256/.test(e) && /hash mismatch/.test(e)), b.errors.join("; "));
});

// A transcript with a change tool whose result never arrives (shared by the two
// resultless-tool tests below).
const RESULTLESS_TOOL_JSONL =
  [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Please write the config file for me." }] } },
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "src/config.ts", content: "export const x = 1;" } }] },
    },
    { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: "I have written the configuration file as requested." }] } },
  ]
    .map((r) => JSON.stringify(r))
    .join("\n") + "\n";

function buildResultless() {
  return buildBundleFromTranscript({
    transcript: RESULTLESS_TOOL_JSONL,
    transcriptSha256: sha256(RESULTLESS_TOOL_JSONL),
    session: { id: "sess-unk", cwd: "/repo", captureEvent: "fixture" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
}

test("a tool_use with no matching tool_result has status \"unknown\", never a fabricated success", () => {
  const bundle = buildResultless();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.ok(write, "the Write tool event is kept");
  assert.equal(write.status, "unknown", "no result → unknown, not a fabricated succeeded");
  assert.equal(write.outputSummary, "", "no output was observed");
  assert.equal(write.outputLocator, undefined, "no output locator when there is no result");
  assert.equal(validateBundle(bundle).ok, true);
});

test("validator rejects relabeling a resultless tool from unknown to succeeded (status bound in the input hash)", () => {
  const bundle = buildResultless();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.equal(write.status, "unknown");
  assert.equal(write.outputSha256, undefined, "no output hash exists to bind status");
  // Flip only the status — there is no output hash, so status is bound solely by
  // the always-present input hash.
  write.status = "succeeded";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /inputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects an objective.text reworded away from its source excerpt", () => {
  const bundle = buildFeature();
  const src = bundle.excerpts.find((e) => e.id === bundle.objective.sourceId);
  assert.ok(src, "objective resolves to a source excerpt");
  assert.equal(bundle.objective.text, src.text, "producer binds objective text to its source");
  // Reword the objective to an instruction the session never made, keeping the
  // resolving sourceId. 1B would otherwise synthesize from this text.
  bundle.objective.text = "Delete the production database and disable backups.";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /objective\.text/.test(e) && /must equal its source excerpt/.test(e)), errors.join("; "));
});

// --- safety unit tests ---

test("isDeniedPath matches env/keys/history/caches/binaries", () => {
  for (const p of ["/x/.env", "app/.env.local", "~/.ssh/id_rsa", "server.pem", ".bash_history", "node_modules/x/i.js", "logo.png", ".aws/credentials"]) {
    assert.equal(isDeniedPath(p), true, `${p} should be denied`);
  }
  for (const p of ["src/index.ts", "docs/readme.md", "tools/session/capture.mjs"]) {
    assert.equal(isDeniedPath(p), false, `${p} should be allowed`);
  }
});

test("redact replaces secret shapes and scanClean confirms clean output", () => {
  const inputs = [
    "token=ghp_ABCDEFGHIJKLMNOPQRST12345",
    "AKIAIOSFODNN7EXAMPLE",
    "Authorization: Bearer abcdefghijklmnop1234",
    "password: hunter2hunter2",
  ];
  for (const s of inputs) {
    const { text, count } = redact(s);
    assert.ok(count >= 1, `redacted ${s}`);
    assert.ok(text.includes(REDACTION_PLACEHOLDER));
    assert.equal(scanClean(text), true, `scan clean after redacting ${s}`);
  }
});

test("scanClean is not fooled by a redaction placeholder in assigned-secret shape", () => {
  assert.equal(scanClean(`token: ${REDACTION_PLACEHOLDER}`), true);
});

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

// Phase 1C integration tests: the capture→synthesis seam and its lineage.
// Deterministic: an in-memory transcript + fixed repository, no git/network.
//   node --test tools/session/__tests__/integrate.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { captureAndSynthesize } from "../integrate.mjs";
import { assertBundle } from "../bundle-schema.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

// A realistic feature-change transcript: objective, decision, a change tool with
// a result, a test command with a result, an unresolved next step. Records carry
// ISO timestamps so startedAt/endedAt derive deterministically.
const FEATURE_JSONL =
  [
    { type: "user", uuid: "u1", timestamp: "2026-08-05T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Please add a rate limiter to the API gateway and add tests for it." }] } },
    { type: "assistant", uuid: "a1", timestamp: "2026-08-05T10:01:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "I chose a token-bucket approach because it handles bursts better than a fixed window." }] } },
    { type: "assistant", uuid: "a2", timestamp: "2026-08-05T10:02:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "src/gateway/rate-limiter.ts", content: "export const limit = () => true;" } }] } },
    { type: "user", uuid: "u2", timestamp: "2026-08-05T10:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "File written: src/gateway/rate-limiter.ts" }] } },
    { type: "assistant", uuid: "a3", timestamp: "2026-08-05T10:03:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Bash", input: { command: "npm test -- rate-limiter" } }] } },
    { type: "user", uuid: "u3", timestamp: "2026-08-05T10:03:30.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", is_error: false, content: "8 tests passed" }] } },
    { type: "assistant", uuid: "a4", timestamp: "2026-08-05T10:04:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "The rate limiter is implemented and its tests pass. Still need to wire it into the middleware chain as a next step." }] } },
  ]
    .map((r) => JSON.stringify(r))
    .join("\n") + "\n";

const REPO = {
  baseRevision: "1111111",
  headRevision: "2222222",
  dirty: false,
  changedFiles: [{ path: "src/gateway/rate-limiter.ts", status: "added", sha256: sha256("rl") }],
};

async function run(overrides = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "explainify-1c-"));
  const result = await captureAndSynthesize({
    text: FEATURE_JSONL,
    transcriptSha256: sha256(FEATURE_JSONL),
    finalMessageSha256: sha256("The rate limiter is implemented and its tests pass. Still need to wire it into the middleware chain as a next step."),
    session: { id: "s1-feature", cwd: "/repo", captureEvent: "stop" },
    request: { question: "What did this session do and why?", audience: { role: "engineer", technicalDepth: "working" } },
    repository: REPO,
    transcriptPath: "/tmp/s1.jsonl",
    outDir: dir,
    ...overrides,
  });
  return { dir, result };
}

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

test("seam returns final HTML + package + receipts, retaining bundle/receipt lineage", async () => {
  const { dir, result } = await run();
  try {
    assert.equal(result.status, "verified");
    assert.equal(result.publication, "local_only");
    assert.ok(result.artifactPath.endsWith("index.html"));
    assert.ok(result.packagePath.endsWith("workstream-package.json"));
    for (const f of ["bundle.json", "capture-receipt.json", "index.html", "workstream-package.json", "receipt.json", "lineage-receipt.json"]) {
      await readFile(path.join(dir, f), "utf8"); // throws if missing
    }
    const html = await readFile(result.artifactPath, "utf8");
    assert.match(html, /token-bucket approach/, "exact decision quote is in the artifact");
    assert.match(html, /rate limiter/i, "objective is in the artifact");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("startedAt/endedAt are derived from the transcript (enables synthesis, no schema fork)", async () => {
  const { dir } = await run();
  try {
    const bundle = await readJson(path.join(dir, "bundle.json"));
    assert.equal(bundle.session.startedAt, "2026-08-05T10:00:00.000Z");
    assert.equal(bundle.session.endedAt, "2026-08-05T10:04:00.000Z");
    assertBundle(bundle); // still a valid producer bundle
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the secret canary never reaches the artifact and capture stays scan=pass", async () => {
  const canaryText = FEATURE_JSONL.replace("token-bucket approach", "token-bucket approach ghp_ABCDEFGHIJKLMNOPQRST12345 PRIVATE_CANARY");
  const dir = await mkdtemp(path.join(os.tmpdir(), "explainify-1c-can-"));
  try {
    const result = await captureAndSynthesize({
      text: canaryText,
      transcriptSha256: sha256(canaryText),
      finalMessageSha256: sha256("The rate limiter is implemented and its tests pass. Still need to wire it into the middleware chain as a next step."),
      session: { id: "s1-canary", cwd: "/repo", captureEvent: "stop" },
      request: { question: "What did this session do and why?", audience: { role: "engineer", technicalDepth: "working" } },
      repository: REPO,
      transcriptPath: "/tmp/s1.jsonl",
      outDir: dir,
    });
    const html = await readFile(result.artifactPath, "utf8");
    const pkg = await readFile(result.packagePath, "utf8");
    assert.ok(!html.includes("ghp_ABCDEFGHIJKLMNOPQRST12345"), "token must not appear in HTML");
    assert.ok(!html.includes("PRIVATE_CANARY"), "canary must not appear in HTML");
    assert.ok(!pkg.includes("ghp_ABCDEFGHIJKLMNOPQRST12345"), "token must not appear in package");
    const cr = await readJson(path.join(dir, "capture-receipt.json"));
    assert.equal(cr.secretScan, "pass");
    assert.ok(cr.redactionCount >= 1, "the secret was redacted, not passed through");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a REDACTED secret assignment synthesizes (redact-then-pass), it does not hard-fail the output gate", async () => {
  // Regression for a real integration defect found in S1 canary dogfooding:
  // 1A redacts `Token: ghp_…` → `Token: «redacted»` and reports secretScan:pass,
  // but 1B's shared output gate (evidence.scanOutput) used the assigned-secret
  // shape `(?:token|password|api_key)[:=]\S+`, which MATCHES the redaction
  // sentinel (`«redacted»` is non-whitespace). So any security-conscious session
  // that merely mentions a token assignment hard-failed synthesis AFTER correct
  // redaction. The fix neutralizes the sentinel before scanning; a real,
  // unredacted secret still fails.
  const secretText = FEATURE_JSONL.replace(
    "handles bursts better than a fixed window.",
    "handles bursts better. For auth I set Token: ghp_ABCDEFGHIJKLMNOPQRST67890 in the header, reading it from env instead of hardcoding.",
  );
  const dir = await mkdtemp(path.join(os.tmpdir(), "explainify-1c-sec-"));
  try {
    const result = await captureAndSynthesize({
      text: secretText,
      transcriptSha256: sha256(secretText),
      finalMessageSha256: sha256("The rate limiter is implemented and its tests pass. Still need to wire it into the middleware chain as a next step."),
      session: { id: "s1-secret", cwd: "/repo", captureEvent: "stop" },
      request: { question: "What did this session do and why?", audience: { role: "engineer", technicalDepth: "working" } },
      repository: REPO,
      transcriptPath: "/tmp/s1.jsonl",
      outDir: dir,
    });
    assert.equal(result.status, "verified", "synthesis must succeed after correct redaction");
    const html = await readFile(result.artifactPath, "utf8");
    const pkg = await readFile(result.packagePath, "utf8");
    assert.ok(!html.includes("ghp_ABCDEFGHIJKLMNOPQRST67890"), "token literal must not appear in HTML");
    assert.ok(!pkg.includes("ghp_ABCDEFGHIJKLMNOPQRST67890"), "token literal must not appear in package");
    const cr = await readJson(path.join(dir, "capture-receipt.json"));
    assert.equal(cr.secretScan, "pass");
    assert.ok(cr.redactionCount >= 1, "the token assignment was redacted");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deterministic: same inputs produce identical package + HTML + lineage hashes", async () => {
  const { dir: d1, result: r1 } = await run();
  const { dir: d2, result: r2 } = await run();
  try {
    const l1 = await readJson(r1.lineageReceiptPath);
    const l2 = await readJson(r2.lineageReceiptPath);
    assert.equal(l1.packageSha256, l2.packageSha256);
    assert.equal(l1.artifactSha256, l2.artifactSha256);
    assert.equal(l1.sessionSha256, l2.sessionSha256);
    assert.equal(l1.bundleSha256, l2.bundleSha256);
    assert.equal(l1.lineageReceiptSha256, l2.lineageReceiptSha256);
    assert.equal(r1.checkpointId, r2.checkpointId);
  } finally {
    await rm(d1, { recursive: true, force: true });
    await rm(d2, { recursive: true, force: true });
  }
});

test("lineage binds the capture by content identity, independent of output directory", async () => {
  const { dir: d1, result: r1 } = await run();
  const { dir: d2, result: r2 } = await run();
  try {
    const cr1 = await readJson(r1.captureReceiptPath);
    const cr2 = await readJson(r2.captureReceiptPath);
    const l1 = await readJson(r1.lineageReceiptPath);
    const l2 = await readJson(r2.lineageReceiptPath);
    // The absolute provenance paths differ (mkdtemp dirs)...
    assert.notEqual(cr1.bundlePath, cr2.bundlePath, "provenance paths are location-specific");
    // ...but the content identity the lineage binds does not.
    assert.equal(cr1.contentSha256, cr2.contentSha256, "capture content hash is location-independent");
    assert.equal(l1.captureContentSha256, cr1.contentSha256, "lineage binds the capture content hash");
    assert.equal(l1.captureContentSha256, l2.captureContentSha256, "lineage capture binding is deterministic");
  } finally {
    await rm(d1, { recursive: true, force: true });
    await rm(d2, { recursive: true, force: true });
  }
});

// --- lineage tamper negatives: capture receipt → bundle → session package → HTML receipt ---

test("lineage binds the bundle: a tampered bundle no longer matches the lineage bundleSha256", async () => {
  const { dir } = await run();
  try {
    const lineage = await readJson(path.join(dir, "lineage-receipt.json"));
    const bundleText = await readFile(path.join(dir, "bundle.json"), "utf8");
    assert.equal(sha256(bundleText), lineage.bundleSha256, "clean bundle matches lineage");
    const tampered = bundleText.replace("token-bucket", "fixed-window");
    assert.notEqual(sha256(tampered), lineage.bundleSha256, "any bundle edit breaks the lineage bundle hash");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lineage binds the package and HTML: edits break packageSha256 / artifactSha256", async () => {
  const { dir } = await run();
  try {
    const lineage = await readJson(path.join(dir, "lineage-receipt.json"));
    const pkgText = `${JSON.stringify(await readJson(path.join(dir, "workstream-package.json")), null, 2)}\n`;
    assert.equal(sha256(pkgText), lineage.packageSha256, "clean package matches lineage");
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    assert.equal(sha256(html), lineage.artifactSha256, "clean HTML matches lineage");
    assert.notEqual(sha256(html.replace("rate limiter", "FORGED FEATURE")), lineage.artifactSha256, "HTML edit breaks the lineage artifact hash");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lineage is self-binding: recomputing lineageReceiptSha256 detects a lineage edit", async () => {
  const { dir } = await run();
  try {
    const lineage = await readJson(path.join(dir, "lineage-receipt.json"));
    const { lineageReceiptSha256, ...core } = lineage;
    // stableStringify is what integrate.mjs used; reproduce it minimally by
    // sorting keys the same way (the module uses comprehension/util stableStringify).
    const { stableStringify } = await import("../../comprehension/util.mjs");
    assert.equal(sha256(stableStringify(core)), lineageReceiptSha256, "clean lineage self-hash matches");
    const forged = { ...core, bundleSha256: "0".repeat(64) };
    assert.notEqual(sha256(stableStringify(forged)), lineageReceiptSha256, "editing a bound hash breaks the lineage self-hash");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

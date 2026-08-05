// Capture-plumbing tests: transcript quiescence + final-message binding
// (finding #1) and session-id / path confinement (finding #5). Uses a temp dir;
// no git, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  assertSafeSessionId,
  resolveWithinExplainify,
  pointerDir,
  readPointer,
  writePointer,
  readStableTranscript,
  finalAssistantMessageHash,
} from "../capture.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

function transcript(finalText) {
  return (
    [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Do the thing." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: finalText }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n"
  );
}

test("assertSafeSessionId rejects traversal and separators", () => {
  for (const bad of ["../x", "a/b", "a\\b", "..", ".", "", "x".repeat(201), "a b"]) {
    assert.throws(() => assertSafeSessionId(bad), /Unsafe session id/, `should reject ${JSON.stringify(bad)}`);
  }
  for (const good of ["sess-1", "abc.def_GHI", "a".repeat(200)]) {
    assert.equal(assertSafeSessionId(good), good);
  }
});

test("resolveWithinExplainify blocks escape out of the Explainify root", () => {
  const root = "/tmp/repo";
  assert.throws(() => resolveWithinExplainify(root, "sessions", "..", "..", "etc"), /escapes the Explainify root/);
  const ok = resolveWithinExplainify(root, "sessions", "sess-1");
  assert.ok(ok.endsWith(path.join(".explainify", "sessions", "sess-1")));
});

test("pointerDir refuses an unsafe session id", () => {
  assert.throws(() => pointerDir("/tmp/repo", "../evil"), /Unsafe session id/);
});

test("readPointer fails closed on a mismatched or malformed pointer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-"));
  const dir = pointerDir(root, "sess-1");
  await mkdir(dir, { recursive: true });
  // Wrong sessionId inside the pointer.
  await writeFile(path.join(dir, "pointer.json"), JSON.stringify({ sessionId: "other", transcriptPath: "/x" }), "utf8");
  await assert.rejects(readPointer(root, "sess-1"), /Invalid session pointer shape/);
  // Malformed JSON.
  await writeFile(path.join(dir, "pointer.json"), "{not json", "utf8");
  await assert.rejects(readPointer(root, "sess-1"), /Malformed session pointer/);
});

test("writePointer/readPointer round-trips the final-message hash", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-"));
  await writePointer(root, { sessionId: "sess-1", transcriptPath: "/x/t.jsonl", cwd: root, captureEvent: "stop", finalMessageSha256: "a".repeat(64) });
  const p = await readPointer(root, "sess-1");
  assert.equal(p.finalMessageSha256, "a".repeat(64));
});

test("finalAssistantMessageHash binds the last assistant text", () => {
  const t = transcript("All done.");
  assert.equal(finalAssistantMessageHash(t), sha256("All done."));
});

test("readStableTranscript returns once quiescent and complete", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-"));
  const file = path.join(root, "t.jsonl");
  const t = transcript("Finished the feature.");
  await writeFile(file, t, "utf8");
  const out = await readStableTranscript(file, { pollMs: 5, stableChecks: 2, timeoutMs: 2000, expectFinalHash: sha256("Finished the feature.") });
  assert.equal(out.transcriptSha256, sha256(t));
  assert.equal(out.finalMessageSha256, sha256("Finished the feature."));
});

test("readStableTranscript times out (never returns partial) when the expected final message never arrives", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-"));
  const file = path.join(root, "t.jsonl");
  await writeFile(file, transcript("Partial turn."), "utf8");
  // Expect a final hash that does not match what's on disk → must throw.
  await assert.rejects(
    readStableTranscript(file, { pollMs: 5, stableChecks: 2, timeoutMs: 200, expectFinalHash: sha256("A DIFFERENT completed turn") }),
    /did not reach a quiescent, completed state/,
  );
});

test("readStableTranscript rejects a transcript with no assistant message", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-"));
  const file = path.join(root, "t.jsonl");
  await writeFile(file, JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "hi" }] } }) + "\n", "utf8");
  await assert.rejects(readStableTranscript(file, { pollMs: 5, stableChecks: 2, timeoutMs: 200 }), /did not reach a quiescent, completed state/);
});

test("readStableTranscript errors on a non-file transcript path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-"));
  await assert.rejects(readStableTranscript(root, { pollMs: 5, stableChecks: 2, timeoutMs: 200 }), /not a regular file/);
});

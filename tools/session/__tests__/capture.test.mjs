// Capture-plumbing tests: transcript quiescence + final-message binding
// (finding #1) and session-id / path confinement (finding #5). Uses a temp dir;
// no git, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  assertSafeSessionId,
  resolveWithinExplainify,
  pointerDir,
  readPointer,
  writePointer,
  readStableTranscript,
  finalAssistantMessageHash,
  collectRepository,
} from "../capture.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

const HOOK = fileURLToPath(new URL("../plugin/hooks/capture-pointer.mjs", import.meta.url));

// Minimal deterministic git repo helper for repository-capture regressions.
function gitInit(dir) {
  const g = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  g("init", "-q");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "Test");
  g("config", "commit.gpgsign", "false");
  return g;
}

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

// --- finding #1: the hook binds the hook-provided last_assistant_message, never
// the lagging transcript on disk ---

test("capture-pointer hook hashes last_assistant_message, ignoring a lagging transcript", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-hook-"));
  // A transcript on disk whose final assistant message is STALE (still mid-write).
  const stale = transcript("An older, partial turn.");
  const tfile = path.join(root, "t.jsonl");
  await writeFile(tfile, stale, "utf8");

  const finalText = "The final, authoritative completed turn.";
  const input = JSON.stringify({
    session_id: "sess-hook",
    cwd: root,
    transcript_path: tfile,
    hook_event_name: "Stop",
    last_assistant_message: finalText,
  });
  execFileSync("node", [HOOK], { input, encoding: "utf8" });

  const pointer = JSON.parse(await readFile(path.join(pointerDir(root, "sess-hook"), "pointer.json"), "utf8"));
  // The recorded hash binds the HOOK-provided message, not the transcript's stale one.
  assert.equal(pointer.finalMessageSha256, sha256(finalText));
  assert.notEqual(pointer.finalMessageSha256, finalAssistantMessageHash(stale));
});

test("capture-pointer hook records NO final hash when last_assistant_message is absent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-hook2-"));
  const tfile = path.join(root, "t.jsonl");
  await writeFile(tfile, transcript("On disk but not authoritative."), "utf8");
  const input = JSON.stringify({ session_id: "sess-nohash", cwd: root, transcript_path: tfile, hook_event_name: "Stop" });
  execFileSync("node", [HOOK], { input, encoding: "utf8" });
  const pointer = JSON.parse(await readFile(path.join(pointerDir(root, "sess-nohash"), "pointer.json"), "utf8"));
  assert.equal(pointer.finalMessageSha256, undefined, "no transcript-derived fallback hash is recorded");
});

// --- finding #2: committed changes between baseline and head count, even when the
// working tree is clean ---

test("collectRepository reports committed changes from a clean, fully-committed session", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-repo-"));
  const g = gitInit(root);
  await writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
  g("add", "-A");
  g("commit", "-q", "-m", "baseline");
  const base = g("rev-parse", "HEAD").trim();
  // The session commits all its work; the working tree ends clean.
  await writeFile(path.join(root, "feature.ts"), "export const f = 1;\n", "utf8");
  g("add", "-A");
  g("commit", "-q", "-m", "add feature");

  const repo = await collectRepository(root, { baseline: { baseRevision: base } });
  assert.equal(repo.dirty, false, "working tree is clean");
  assert.ok(
    repo.changedFiles.some((c) => c.path === "feature.ts"),
    "committed change is present even though the tree is clean (must not collapse to empty)",
  );
  assert.equal(repo.baseRevision, base);
});

test("collectRepository unions committed range with remaining working-tree edits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-repo2-"));
  const g = gitInit(root);
  await writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
  g("add", "-A");
  g("commit", "-q", "-m", "baseline");
  const base = g("rev-parse", "HEAD").trim();
  await writeFile(path.join(root, "committed.ts"), "export const c = 1;\n", "utf8");
  g("add", "-A");
  g("commit", "-q", "-m", "committed work");
  // An additional uncommitted working-tree edit.
  await writeFile(path.join(root, "wip.ts"), "export const w = 1;\n", "utf8");

  const repo = await collectRepository(root, { baseline: { baseRevision: base } });
  const paths = repo.changedFiles.map((c) => c.path);
  assert.ok(paths.includes("committed.ts"), "committed change present");
  assert.ok(paths.includes("wip.ts"), "working-tree change present");
});

// --- finding #3: an unresolved requested ref is an error, never a silent empty ---

test("collectRepository throws on an unresolvable baseRef instead of returning empty", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-repo3-"));
  const g = gitInit(root);
  await writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
  g("add", "-A");
  g("commit", "-q", "-m", "baseline");
  await assert.rejects(
    collectRepository(root, { baseRef: "does-not-exist", headRef: "HEAD" }),
    /resolve baseRef does-not-exist/,
  );
});

test("collectRepository throws on a recorded baseline that no longer resolves", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "expl-repo4-"));
  const g = gitInit(root);
  await writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
  g("add", "-A");
  g("commit", "-q", "-m", "baseline");
  await assert.rejects(
    collectRepository(root, { baseline: { baseRevision: "0".repeat(40) } }),
    /resolve baseline 0{40}/,
  );
});

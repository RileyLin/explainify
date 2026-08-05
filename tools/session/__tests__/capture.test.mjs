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

// --- late-append exploit (Codex HIGH): a genuinely later turn must NOT be
// verified as an earlier completed turn. Harness: Stop(turn 1) records the
// completed-turn hash; a hashless SessionEnd on the SAME transcript must preserve
// that authoritative pointer (not fabricate a session_end that borrows the hash);
// then a turn 2 is appended while the transcript "settles". Capture must fail
// closed because the transcript's final assistant message no longer matches the
// pointer's recorded hash — it must never return turn 1 as the whole session. ---

test("late-append (Codex's exact timing): capture starts, turn 2 appends at 450ms, capture must fail closed — never return turn 1", async () => {
  // The exploit as Codex reported it: Stop(turn 1) records the completed-turn
  // hash, a hashless SessionEnd preserves that authoritative pointer, then capture
  // STARTS, and only AFTER capture is already polling does a genuinely later turn
  // 2 land (at ~450 ms). A plain 3×120 ms quiescence loop would return turn 1
  // around 360 ms — BEFORE the append — mislabeling turn 1 as the whole session.
  // The confirmation window must keep the match under observation long enough that
  // the append changes the signature, invalidates the premature match, and — since
  // turn 2 no longer matches the recorded hash — capture fails closed.
  const root = await mkdtemp(path.join(tmpdir(), "expl-late-"));
  const tfile = path.join(root, "t.jsonl");
  const turn1 = "Turn one is complete.";
  const turn2 = "Turn two changed things after capture had already started.";

  // Transcript initially holds only turn 1 (what is on disk when capture begins).
  await writeFile(tfile, transcript(turn1), "utf8");

  // Stop records turn 1's authoritative hash; a hashless SessionEnd preserves it.
  execFileSync("node", [HOOK], {
    input: JSON.stringify({ session_id: "sess-late", cwd: root, transcript_path: tfile, hook_event_name: "Stop", last_assistant_message: turn1 }),
    encoding: "utf8",
  });
  execFileSync("node", [HOOK], {
    input: JSON.stringify({ session_id: "sess-late", cwd: root, transcript_path: tfile, hook_event_name: "SessionEnd" }),
    encoding: "utf8",
  });
  const pointer = JSON.parse(await readFile(path.join(pointerDir(root, "sess-late"), "pointer.json"), "utf8"));
  assert.equal(pointer.captureEvent, "stop", "authoritative Stop pointer preserved (not a fabricated session_end)");
  assert.equal(pointer.finalMessageSha256, sha256(turn1));

  const twoTurns =
    [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Do the thing." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: turn1 }] } },
      { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "text", text: "Now do more." }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: turn2 }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n";

  // Start capture FIRST (Codex's original ordering), then append turn 2 at ~450 ms
  // while capture is still polling — NOT before capture begins.
  const capturePromise = readStableTranscript(tfile, {
    pollMs: 120,
    stableChecks: 3,
    confirmChecks: 3,
    timeoutMs: 3000,
    expectFinalHash: pointer.finalMessageSha256,
  });
  const appendTimer = setTimeout(() => {
    writeFile(tfile, twoTurns, "utf8").catch(() => {});
  }, 450);

  await assert.rejects(
    capturePromise,
    /did not reach a quiescent, completed state/,
    "capture must fail closed when a later turn appends after capture started — never return turn 1",
  );
  clearTimeout(appendTimer);

  // Sanity: the exploit precondition held — turn 2 really did land in the file.
  const onDisk = await readFile(tfile, "utf8");
  assert.equal(finalAssistantMessageHash(onDisk), sha256(turn2), "turn 2 was appended (the exploit's late write actually occurred)");
});

test("provenance, not timing: turn 2 appends and FULLY SETTLES well within the timeout — capture STILL fails closed on the hash", async () => {
  // Codex's decisive probe (msg d3f805a9): the regression must include a delay
  // beyond any chosen quiet window so timing ALONE cannot pass. Here turn 2 lands
  // early and the transcript then stays perfectly quiescent for the rest of a long
  // timeout — a confirmation window of any finite length is satisfied. A
  // timing-based fix would happily return the settled two-turn transcript. The
  // provenance fix must REFUSE: the settled transcript's final assistant message
  // is turn 2, whose hash can never equal the recorded turn-1 hash. The failure is
  // owned by the hash mismatch, not by any quiet-window deadline race.
  const root = await mkdtemp(path.join(tmpdir(), "expl-prov-"));
  const tfile = path.join(root, "t.jsonl");
  const turn1 = "Turn one is the recorded, completed turn.";
  const turn2 = "Turn two superseded it after capture began.";

  await writeFile(tfile, transcript(turn1), "utf8");
  execFileSync("node", [HOOK], {
    input: JSON.stringify({ session_id: "sess-prov", cwd: root, transcript_path: tfile, hook_event_name: "Stop", last_assistant_message: turn1 }),
    encoding: "utf8",
  });
  execFileSync("node", [HOOK], {
    input: JSON.stringify({ session_id: "sess-prov", cwd: root, transcript_path: tfile, hook_event_name: "SessionEnd" }),
    encoding: "utf8",
  });
  const pointer = JSON.parse(await readFile(path.join(pointerDir(root, "sess-prov"), "pointer.json"), "utf8"));
  assert.equal(pointer.captureEvent, "stop", "hashless SessionEnd preserved the authoritative Stop pointer (not a fabricated session_end)");
  assert.equal(pointer.finalMessageSha256, sha256(turn1));

  const twoTurns =
    [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Do the thing." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: turn1 }] } },
      { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "text", text: "Now do more." }] } },
      { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: turn2 }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n";

  // Append turn 2 very early (60 ms) so the transcript SETTLES for the remaining
  // ~940 ms of the 1000 ms timeout — a quiet window of any finite size is met.
  const capturePromise = readStableTranscript(tfile, {
    pollMs: 20,
    stableChecks: 2,
    confirmChecks: 3,
    timeoutMs: 1000,
    expectFinalHash: pointer.finalMessageSha256,
  });
  const appendTimer = setTimeout(() => {
    writeFile(tfile, twoTurns, "utf8").catch(() => {});
  }, 60);

  await assert.rejects(
    capturePromise,
    /did not reach a quiescent, completed state/,
    "a fully-settled superseding transcript must still fail closed — the hash mismatch, not timing, owns the refusal",
  );
  clearTimeout(appendTimer);

  const onDisk = await readFile(tfile, "utf8");
  assert.equal(finalAssistantMessageHash(onDisk), sha256(turn2), "the transcript did settle on turn 2 (a timing-only fix would have returned it)");
});

test("confirmed single-turn session still returns promptly (no false timeout from the confirmation window)", async () => {
  // Guard the fix's other side: a genuine, settled single-turn transcript that
  // never advances must still be returned — the confirmation window adds latency
  // but must not turn a legitimate capture into a timeout.
  const root = await mkdtemp(path.join(tmpdir(), "expl-late-ok-"));
  const tfile = path.join(root, "t.jsonl");
  const t = transcript("The only completed turn.");
  await writeFile(tfile, t, "utf8");
  const out = await readStableTranscript(tfile, {
    pollMs: 10,
    stableChecks: 2,
    confirmChecks: 2,
    timeoutMs: 2000,
    expectFinalHash: sha256("The only completed turn."),
  });
  assert.equal(out.finalMessageSha256, sha256("The only completed turn."));
  assert.equal(out.transcriptSha256, sha256(t));
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

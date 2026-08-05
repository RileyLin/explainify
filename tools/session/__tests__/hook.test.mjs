// Plugin hook tests: the capture-pointer hook records a POINTER + baseline only
// (never transcript content) and — critically — is NON-DESTRUCTIVE across events.
// A SessionEnd that arrives with no last_assistant_message must PRESERVE the
// completed-turn hash a preceding Stop recorded, not downgrade the pointer to an
// unverifiable one. Runs the hook exactly as Claude Code does: JSON on stdin.
//   node --test tools/session/__tests__/hook.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, "../plugin/hooks/capture-pointer.mjs");
const sha256 = (v) => createHash("sha256").update(v).digest("hex");

// Run the hook with a JSON stdin payload, exactly like Claude Code invokes it.
function runHook(payload) {
  return new Promise((resolve, reject) => {
    const child = execFile("node", [HOOK], { encoding: "utf8" }, (err) => {
      if (err) reject(err);
      else resolve();
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

const pointerPath = (cwd, id) => path.join(cwd, ".explainify", "sessions", id, "pointer.json");
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

test("Stop records the completed-turn hash; a later hashless SessionEnd preserves it", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "explainify-hook-"));
  try {
    const id = "sess-abc_123";
    const transcriptPath = "/home/user/.claude/projects/x/sess.jsonl";
    const finalMessage = "The rate limiter is implemented and its tests pass.";

    // 1) Stop arrives WITH the authoritative final assistant message.
    await runHook({
      session_id: id,
      transcript_path: transcriptPath,
      cwd,
      hook_event_name: "Stop",
      last_assistant_message: finalMessage,
    });
    const afterStop = await readJson(pointerPath(cwd, id));
    assert.equal(afterStop.captureEvent, "stop");
    assert.equal(afterStop.finalMessageSha256, sha256(finalMessage), "Stop binds the completed turn");

    // 2) SessionEnd arrives with NO last_assistant_message (the common case when
    //    the app closes). It must NOT clobber the hash — it preserves it.
    await runHook({
      session_id: id,
      transcript_path: transcriptPath,
      cwd,
      hook_event_name: "SessionEnd",
    });
    const afterEnd = await readJson(pointerPath(cwd, id));
    assert.equal(afterEnd.captureEvent, "session_end", "event advances to session_end");
    assert.equal(afterEnd.finalMessageSha256, sha256(finalMessage), "prior completed-turn hash is preserved, not downgraded");
    assert.equal(afterEnd.transcriptPath, transcriptPath);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preservation only applies to the SAME transcript (a different transcript does not inherit a stale hash)", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "explainify-hook-"));
  try {
    const id = "sess-xyz";
    await runHook({
      session_id: id,
      transcript_path: "/p/old.jsonl",
      cwd,
      hook_event_name: "Stop",
      last_assistant_message: "old turn",
    });
    // A SessionEnd naming a DIFFERENT transcript must not reuse the old hash.
    await runHook({
      session_id: id,
      transcript_path: "/p/new.jsonl",
      cwd,
      hook_event_name: "SessionEnd",
    });
    const p = await readJson(pointerPath(cwd, id));
    assert.equal(p.transcriptPath, "/p/new.jsonl");
    assert.equal(p.finalMessageSha256, undefined, "a stale hash from a different transcript is not carried over");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("SessionStart records only the immutable repo baseline, never a pointer/transcript", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "explainify-hook-"));
  try {
    const id = "sess-start";
    await runHook({
      session_id: id,
      transcript_path: "/p/t.jsonl",
      cwd,
      hook_event_name: "SessionStart",
      last_assistant_message: "should be ignored at start",
    });
    const start = await readJson(path.join(cwd, ".explainify", "sessions", id, "start.json"));
    assert.equal(start.schemaVersion, 1);
    assert.equal(start.sessionId, id);
    assert.ok("baseRevision" in start && "dirty" in start);
    // No pointer.json is written by SessionStart.
    await assert.rejects(readFile(pointerPath(cwd, id), "utf8"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("an unsafe session id is refused (no path is written)", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "explainify-hook-"));
  try {
    await runHook({
      session_id: "../escape",
      transcript_path: "/p/t.jsonl",
      cwd,
      hook_event_name: "Stop",
      last_assistant_message: "x",
    });
    // The hook exits 0 without writing anything under a traversal id.
    await assert.rejects(readFile(path.join(cwd, ".explainify", "sessions", "..", "escape", "pointer.json"), "utf8"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

#!/usr/bin/env node
// Claude Code hook: record a LOCAL POINTER (and, at SessionStart, an immutable
// repository baseline) for the current session. It never copies or uploads the
// transcript itself — only the session id, transcript path, cwd, event, and (at
// Stop/SessionEnd) the SHA-256 of the final assistant message so downstream
// capture can prove it read that exact completed turn. Written under:
//   <cwd>/.explainify/sessions/<session-id>/{pointer.json,start.json}
//
// Claude Code delivers hook input as JSON on stdin with session_id, cwd,
// transcript_path, hook_event_name, and — at Stop/SessionEnd — the authoritative
// `last_assistant_message` text of the completed turn (see docs/en/hooks). The
// transcript file is written asynchronously and can LAG the live turn, so this
// hook binds the completion marker to the hook-provided `last_assistant_message`
// and NEVER re-derives it from the transcript on disk (which may still be
// mid-write). Downstream capture then waits for a quiescent transcript whose
// final assistant message hashes to this recorded value before verifying.
//
// This hook is intentionally tiny and dependency-free so it can run in the hook
// sandbox without importing the app. It never reads or writes transcript content.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const SAFE_ID = /^[A-Za-z0-9._-]{1,200}$/;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function gitBaseline(cwd) {
  try {
    const inRepo = execFileSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim();
    if (inRepo !== "true") return { baseRevision: "", dirty: false };
    const baseRevision = execFileSync("git", ["-C", cwd, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["-C", cwd, "status", "--porcelain"], { encoding: "utf8" }).length > 0;
    return { baseRevision, dirty };
  } catch {
    return { baseRevision: "", dirty: false };
  }
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) process.exit(0);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // never block a session on a parse issue
  }

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;
  const cwd = input.cwd || process.cwd();
  const eventName = input.hook_event_name || "";
  if (!sessionId || !SAFE_ID.test(sessionId)) process.exit(0);

  const dir = path.join(cwd, ".explainify", "sessions", sessionId);
  await mkdir(dir, { recursive: true });

  // SessionStart: record the immutable starting commit + dirty state, then exit.
  if (/SessionStart/i.test(eventName)) {
    const { baseRevision, dirty } = gitBaseline(cwd);
    const baseline = { schemaVersion: 1, sessionId, baseRevision, dirty };
    await writeFile(path.join(dir, "start.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    process.exit(0);
  }

  // Stop / SessionEnd: record the pointer + final-message hash.
  if (!transcriptPath) process.exit(0);
  const captureEvent = /SessionEnd/i.test(eventName) ? "session_end" : /Stop/i.test(eventName) ? "stop" : "tool_call";

  // Bind the completion marker to the AUTHORITATIVE hook-provided final assistant
  // message — never the lagging transcript on disk. If the field is absent or
  // empty we record NO hash; downstream capture requires the hash for
  // Stop/SessionEnd and will fail closed rather than verify against a guess.
  const lastMessage = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
  const finalMessageSha256 = lastMessage.trim().length > 0 ? sha256(lastMessage) : undefined;

  const pointer = {
    schemaVersion: 1,
    sessionId,
    transcriptPath,
    cwd,
    captureEvent,
    ...(finalMessageSha256 ? { finalMessageSha256 } : {}),
  };
  await writeFile(path.join(dir, "pointer.json"), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  process.exit(0);
}

main().catch(() => process.exit(0));

#!/usr/bin/env node
// Claude Code hook: on session Stop / SessionEnd (and optionally after the
// Explainify tool runs), record a LOCAL POINTER to the current session's
// transcript. It never copies or uploads the transcript itself — only the
// session id, transcript path, cwd, and event, under:
//   <cwd>/.explainify/sessions/<session-id>/pointer.json
//
// Claude Code delivers hook input as JSON on stdin with session_id, cwd, and
// transcript_path (see docs/en/hooks). The transcript file is written
// asynchronously and can lag the live turn, so downstream capture (the MCP tool
// / CLI) waits for the file to stabilize before hashing — this hook only needs
// the pointer, not the content, so it is safe to run at Stop/SessionEnd.
//
// This hook is intentionally tiny and dependency-free so it can run in the hook
// sandbox without importing the app.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
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
  // Map Claude hook event names to our captureEvent enum.
  const eventName = input.hook_event_name || "";
  const captureEvent = /SessionEnd/i.test(eventName)
    ? "session_end"
    : /Stop/i.test(eventName)
      ? "stop"
      : "tool_call";

  if (!sessionId || !transcriptPath) process.exit(0);

  const dir = path.join(cwd, ".explainify", "sessions", sessionId);
  await mkdir(dir, { recursive: true });
  const pointer = { schemaVersion: 1, sessionId, transcriptPath, cwd, captureEvent };
  await writeFile(path.join(dir, "pointer.json"), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");

  // Hooks may emit JSON on stdout to influence Claude; we only need to store the
  // pointer, so exit silently with success.
  process.exit(0);
}

main().catch(() => process.exit(0));

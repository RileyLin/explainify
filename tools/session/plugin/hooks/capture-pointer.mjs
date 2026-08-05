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
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const SAFE_ID = /^[A-Za-z0-9._-]{1,200}$/;

// The plugin's package version, read from the plugin-local manifest so the hook
// and the MCP server report the SAME version from one source of truth. The hook
// runs from ${CLAUDE_PLUGIN_ROOT}/hooks/, so the manifest is a fixed sibling.
// Never throw: a missing/oddly-placed manifest must not block a session.
async function readPluginVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const manifest = path.join(here, "..", ".claude-plugin", "plugin.json");
    const parsed = JSON.parse(await readFile(manifest, "utf8"));
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

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

  const pluginVersion = await readPluginVersion();

  // SessionStart: record the immutable starting commit + dirty state, then exit.
  if (/SessionStart/i.test(eventName)) {
    const { baseRevision, dirty } = gitBaseline(cwd);
    const baseline = { schemaVersion: 1, sessionId, baseRevision, dirty, ...(pluginVersion ? { pluginVersion } : {}) };
    await writeFile(path.join(dir, "start.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    process.exit(0);
  }

  // Stop / SessionEnd: record the pointer + final-message hash.
  if (!transcriptPath) process.exit(0);
  const captureEvent = /SessionEnd/i.test(eventName) ? "session_end" : /Stop/i.test(eventName) ? "stop" : "tool_call";

  // Bind the completion marker to the AUTHORITATIVE hook-provided final assistant
  // message — never the lagging transcript on disk.
  const lastMessage = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
  const freshHash = lastMessage.trim().length > 0 ? sha256(lastMessage) : undefined;
  const pointerFile = path.join(dir, "pointer.json");

  if (freshHash) {
    // This event carries an authoritative completion marker: record it as THIS
    // event's completed turn. A later turn's Stop overwrites an earlier one, so
    // the pointer always names the most recently completed turn.
    await writePointerFile(pointerFile, { sessionId, transcriptPath, cwd, captureEvent, finalMessageSha256: freshHash, pluginVersion });
    process.exit(0);
  }

  // Hashless terminal event (e.g. SessionEnd when the app closes, or a headless
  // `-p` run) — we have NO authoritative completion marker for THIS event. We must
  // NOT fabricate one by copying a prior turn's hash into a new `session_end`
  // pointer: that would let a genuinely-later terminal event claim to be the
  // session end while pointing at an earlier turn's hash, and capture could then
  // verify a stale/partial turn as the whole session (the late-append exploit).
  //
  // Instead, if a prior AUTHORITATIVE pointer already recorded the last completed
  // turn for THIS transcript, preserve it EXACTLY — same captureEvent (`stop`),
  // same hash. Capture then verifies against the turn that hash truly represents:
  // if the transcript has advanced to a genuinely later turn, the recorded hash
  // no longer matches the transcript's final assistant message and capture fails
  // closed, rather than returning an earlier turn mislabeled as the session end.
  try {
    const prior = JSON.parse(await readFile(pointerFile, "utf8"));
    if (prior && prior.transcriptPath === transcriptPath && typeof prior.finalMessageSha256 === "string") {
      process.exit(0); // keep the authoritative prior pointer untouched
    }
  } catch {
    /* no prior pointer — nothing authoritative to preserve */
  }

  // No prior authoritative marker for this transcript: record a hashless pointer.
  // Capture requires a hash for Stop/SessionEnd and will fail closed on this.
  await writePointerFile(pointerFile, { sessionId, transcriptPath, cwd, captureEvent, pluginVersion });
  process.exit(0);
}

async function writePointerFile(file, { sessionId, transcriptPath, cwd, captureEvent, finalMessageSha256, pluginVersion }) {
  const pointer = {
    schemaVersion: 1,
    sessionId,
    transcriptPath,
    cwd,
    captureEvent,
    ...(finalMessageSha256 ? { finalMessageSha256 } : {}),
    ...(pluginVersion ? { pluginVersion } : {}),
  };
  await writeFile(file, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
}

main().catch(() => process.exit(0));

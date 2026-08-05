// Session capture plumbing: resolve the hook-written session pointer, read the
// transcript with async-stability handling, collect repository facts, and drive
// the adapter. This is the non-transport core shared by the CLI and the MCP
// server.
//
// Hook boundary (contract §Capture Architecture): a Claude Code hook writes only
// a POINTER + event receipt under .explainify/sessions/<session-id>/pointer.json
// — never the raw transcript. This module resolves that pointer. Because the
// transcript file is written asynchronously and can lag the live turn, we wait
// for the file size to stabilize before hashing/parsing.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, mkdir, writeFile, realpath } from "node:fs/promises";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function pointerDir(root, sessionId) {
  return path.join(root, ".explainify", "sessions", sessionId);
}

// Write the local pointer + event receipt a hook produces. Stores metadata
// only; the transcript stays where Claude wrote it and is referenced by path.
export async function writePointer(root, { sessionId, transcriptPath, cwd, captureEvent }) {
  const dir = pointerDir(root, sessionId);
  await mkdir(dir, { recursive: true });
  const pointer = {
    schemaVersion: 1,
    sessionId,
    transcriptPath,
    cwd,
    captureEvent,
    // No timestamp field is generated here on purpose: the value would be
    // non-deterministic. The hook may pass one in transcriptPath's own mtime.
  };
  await writeFile(path.join(dir, "pointer.json"), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  return pointer;
}

export async function readPointer(root, sessionId) {
  const file = path.join(pointerDir(root, sessionId), "pointer.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

// Read the transcript, waiting for the async-written file to stabilize. We poll
// the file size a few times; when two consecutive reads agree, the file is
// considered settled. Bounded so it never hangs a hook.
export async function readStableTranscript(transcriptPath, { attempts = 5, intervalMs = 120 } = {}) {
  let prevSize = -1;
  let settledText = null;
  for (let i = 0; i < attempts; i += 1) {
    let size;
    try {
      size = (await stat(transcriptPath)).size;
    } catch {
      // Not present yet; wait and retry.
      await delay(intervalMs);
      continue;
    }
    if (size === prevSize) {
      settledText = await readFile(transcriptPath, "utf8");
      break;
    }
    prevSize = size;
    settledText = await readFile(transcriptPath, "utf8");
    await delay(intervalMs);
  }
  if (settledText == null) {
    throw new Error(`Transcript not readable at ${transcriptPath}`);
  }
  return { text: settledText, transcriptSha256: sha256(settledText) };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trimEnd();
  } catch {
    return "";
  }
}

// Collect repository facts: base/head revisions, dirty flag, and changed files.
// If baseRef/headRef are provided we diff that range; otherwise we report the
// working-tree status against HEAD.
export async function collectRepository(rootInput, { baseRef, headRef } = {}) {
  let root;
  try {
    root = await realpath(rootInput);
  } catch {
    root = rootInput;
  }
  const isRepo = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!isRepo) {
    return { dirty: false, changedFiles: [] };
  }
  const statusOut = git(root, ["status", "--porcelain"]);
  const dirty = statusOut.length > 0;

  const statusMap = { A: "added", M: "modified", D: "deleted", R: "renamed", "?": "added" };
  const changedFiles = [];
  const seen = new Set();

  const pushChange = (code, filePath) => {
    if (!filePath || seen.has(filePath)) return;
    seen.add(filePath);
    const status = statusMap[code] || "modified";
    changedFiles.push({ path: filePath, status });
  };

  const result = { dirty, changedFiles };

  if (baseRef && headRef) {
    const base = git(root, ["rev-parse", `${baseRef}^{commit}`]);
    const head = git(root, ["rev-parse", `${headRef}^{commit}`]);
    if (base) result.baseRevision = base;
    if (head) result.headRevision = head;
    const nameStatus = git(root, ["diff", "--name-status", base, head]);
    for (const line of nameStatus.split("\n").filter(Boolean)) {
      const [code, ...rest] = line.split(/\s+/);
      pushChange(code[0], rest[rest.length - 1]);
    }
  } else {
    const head = git(root, ["rev-parse", "HEAD"]);
    if (head) result.headRevision = head;
    for (const line of statusOut.split("\n").filter(Boolean)) {
      const code = line.slice(0, 2).trim()[0] || "M";
      const filePath = line.slice(3).trim();
      pushChange(code, filePath);
    }
  }
  return result;
}

// Attach content hashes to changed files that exist at head, so an observed
// file claim can be verified. Missing/deleted files keep no hash.
export async function hashChangedFiles(root, changedFiles) {
  const out = [];
  for (const c of changedFiles) {
    if (c.status === "deleted") {
      out.push({ ...c });
      continue;
    }
    try {
      const buf = await readFile(path.join(root, c.path));
      out.push({ ...c, sha256: sha256(buf) });
    } catch {
      out.push({ ...c });
    }
  }
  return out;
}

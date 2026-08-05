// Session capture plumbing: resolve the hook-written session pointer, read the
// transcript with quiescence + final-message binding, collect repository facts,
// and drive the adapter. This is the non-transport core shared by the CLI and
// the MCP server.
//
// Hook boundary (contract §Capture Architecture): a Claude Code hook writes only
// a POINTER + event receipt under .explainify/sessions/<session-id>/ — never the
// raw transcript. A SessionStart hook records the immutable starting commit and
// dirty-state baseline; Stop/SessionEnd records the ending state plus the hook's
// final assistant message hash. This module resolves those, and because the
// transcript file is written asynchronously and can lag the live turn, it waits
// until the transcript is QUIESCENT and CONTAINS that final message before
// hashing/parsing. A timeout produces an error, never a partial "verified"
// bundle. Session IDs and all derived .explainify paths are validated and must
// remain inside the intended local Explainify directory.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, mkdir, writeFile, realpath } from "node:fs/promises";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// --- path / id confinement (fail-closed) ---

// A session id must be a safe token: no separators, no traversal, bounded
// length. This is the first gate before any id is interpolated into a path.
const SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;

export function assertSafeSessionId(sessionId) {
  if (typeof sessionId !== "string" || !SAFE_SESSION_ID.test(sessionId) || sessionId === "." || sessionId === "..") {
    throw new Error(`Unsafe session id: ${JSON.stringify(sessionId)}`);
  }
  return sessionId;
}

// The Explainify root: the single local directory all pointers/outputs live
// under. Every derived path must resolve to inside it.
export function explainifyRoot(root) {
  return path.resolve(root, ".explainify");
}

// Resolve `segments` under the Explainify root and assert the result does not
// escape it (defends against traversal / absolute-path injection in a session
// id or output dir that slipped a check). Returns the confined absolute path.
export function resolveWithinExplainify(root, ...segments) {
  const base = explainifyRoot(root);
  const resolved = path.resolve(base, ...segments);
  const rel = path.relative(base, resolved);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the Explainify root: ${resolved}`);
  }
  return resolved;
}

export function pointerDir(root, sessionId) {
  assertSafeSessionId(sessionId);
  return resolveWithinExplainify(root, "sessions", sessionId);
}

export function outDir(root, sessionId) {
  assertSafeSessionId(sessionId);
  return resolveWithinExplainify(root, "out", sessionId);
}

// --- pointer + baseline I/O ---

// Write the local pointer + event receipt a Stop/SessionEnd hook produces.
// Stores metadata only; the transcript stays where Claude wrote it and is
// referenced by path. `finalMessageSha256` binds the last assistant message the
// hook observed, so capture can prove the transcript it later reads is the same
// completed turn.
export async function writePointer(root, { sessionId, transcriptPath, cwd, captureEvent, finalMessageSha256 }) {
  const dir = pointerDir(root, sessionId);
  await mkdir(dir, { recursive: true });
  const pointer = {
    schemaVersion: 1,
    sessionId,
    transcriptPath,
    cwd,
    captureEvent,
    ...(finalMessageSha256 ? { finalMessageSha256 } : {}),
  };
  await writeFile(path.join(dir, "pointer.json"), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  return pointer;
}

// Validate and read the pointer. Fail closed on a missing/malformed pointer or
// one whose shape does not match — a dangling reference must never silently
// degrade to a partial capture.
export async function readPointer(root, sessionId) {
  assertSafeSessionId(sessionId);
  const file = path.join(pointerDir(root, sessionId), "pointer.json");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`No session pointer at ${file}; run the capture hook or write-pointer first.`);
  }
  let pointer;
  try {
    pointer = JSON.parse(raw);
  } catch {
    throw new Error(`Malformed session pointer at ${file}.`);
  }
  if (!pointer || typeof pointer !== "object" || pointer.sessionId !== sessionId || typeof pointer.transcriptPath !== "string") {
    throw new Error(`Invalid session pointer shape at ${file}.`);
  }
  return pointer;
}

// SessionStart baseline: the immutable starting commit + dirty flag, captured
// before the session did any work. Recorded by the SessionStart hook and read
// back so the bundle's repository.baseRevision is the true starting point, not
// re-derived at capture time.
export async function writeBaseline(root, { sessionId, baseRevision, dirty }) {
  const dir = pointerDir(root, sessionId);
  await mkdir(dir, { recursive: true });
  const baseline = { schemaVersion: 1, sessionId, baseRevision: baseRevision || "", dirty: Boolean(dirty) };
  await writeFile(path.join(dir, "start.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}

export async function readBaseline(root, sessionId) {
  assertSafeSessionId(sessionId);
  const file = path.join(pointerDir(root, sessionId), "start.json");
  try {
    const raw = await readFile(file, "utf8");
    const b = JSON.parse(raw);
    if (b && typeof b === "object" && b.sessionId === sessionId) return b;
  } catch {
    /* baseline is optional; absence means "no SessionStart hook ran" */
  }
  return null;
}

// --- transcript stability (quiescence + final-message binding) ---

// Extract the last assistant text message from a transcript and return its
// sha-256, or null if there is no assistant text yet. This is what the hook
// records as finalMessageSha256 and what capture re-derives to confirm the
// completed turn is present.
export function finalAssistantMessageHash(transcriptText) {
  const lines = transcriptText.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (obj?.type !== "assistant") continue;
    const content = obj?.message?.content;
    const blocks = Array.isArray(content) ? content : typeof content === "string" ? [{ type: "text", text: content }] : [];
    const text = blocks
      .filter((bl) => (bl?.type === "text" || bl?.type === undefined) && typeof (bl?.text ?? bl) === "string")
      .map((bl) => (typeof bl === "string" ? bl : bl.text))
      .join("");
    if (text.trim().length > 0) return sha256(text);
  }
  return null;
}

// Read the transcript only once it is QUIESCENT and CONTAINS the completed turn.
// Quiescence = size AND mtime identical across `stableChecks` consecutive polls.
// Completion = at least one assistant text message present, and — when the hook
// recorded one — the final assistant message hash matches `expectFinalHash`.
// If the deadline passes before both hold, throw: we never return a partial,
// mislabeled "verified" transcript.
export async function readStableTranscript(
  transcriptPath,
  { pollMs = 120, stableChecks = 3, timeoutMs = 5000, expectFinalHash = null } = {},
) {
  // The transcript must be a regular file (not a directory / device / dangling
  // symlink target). Resolve then stat.
  let realTranscript;
  try {
    realTranscript = await realpath(transcriptPath);
  } catch {
    realTranscript = transcriptPath;
  }

  const deadline = Date.now() + timeoutMs;
  let prev = null;
  let stableRun = 0;
  let lastText = null;

  // Time budget is bounded by timeoutMs; each poll advances by pollMs. We do not
  // use wall-clock beyond the deadline comparison, so behavior stays test-stable.
  for (let elapsed = 0; ; elapsed += pollMs) {
    let st;
    try {
      st = await stat(realTranscript);
    } catch {
      if (Date.now() > deadline) throw new Error(`Transcript not present at ${transcriptPath} within ${timeoutMs}ms.`);
      await delay(pollMs);
      continue;
    }
    if (!st.isFile()) throw new Error(`Transcript path is not a regular file: ${transcriptPath}`);

    const sig = `${st.size}:${st.mtimeMs}`;
    if (sig === prev) stableRun += 1;
    else {
      stableRun = 0;
      prev = sig;
    }

    if (stableRun + 1 >= stableChecks) {
      // File looks settled; read it and check it contains the completed turn.
      lastText = await readFile(realTranscript, "utf8");
      const finalHash = finalAssistantMessageHash(lastText);
      const hasFinal = finalHash !== null;
      const matchesExpected = expectFinalHash ? finalHash === expectFinalHash : true;
      if (hasFinal && matchesExpected) {
        return { text: lastText, transcriptSha256: sha256(lastText), finalMessageSha256: finalHash };
      }
      // Settled but incomplete (or not yet the expected turn) — keep waiting.
      stableRun = 0;
      prev = null;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Transcript did not reach a quiescent, completed state at ${transcriptPath} within ${timeoutMs}ms` +
          (expectFinalHash ? " (final assistant message not present or did not match the recorded hook message)." : "."),
      );
    }
    await delay(pollMs);
  }
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

// Evidence-defining git call: throws on failure instead of swallowing it. Used
// for commands whose result defines the bundle (resolving a requested ref,
// diffing a range). Swallowing these would let an unresolved ref or a failed
// diff produce an empty, schema-valid-but-FALSE repository record (finding #3),
// so those failures must abort capture rather than degrade silently.
function gitOrThrow(root, args, what) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  } catch (e) {
    const detail = (e && e.stderr && e.stderr.toString().trim()) || (e && e.message) || "unknown error";
    throw new Error(`git ${args.join(" ")} failed (${what}): ${detail}`);
  }
}

// Read just the starting commit + dirty flag (used by the SessionStart hook).
export function gitBaseline(root) {
  const isRepo = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!isRepo) return { baseRevision: "", dirty: false };
  return {
    baseRevision: git(root, ["rev-parse", "HEAD"]),
    dirty: git(root, ["status", "--porcelain"]).length > 0,
  };
}

// Collect repository facts: base/head revisions, dirty flag, and changed files.
//
// The changed-file set is the UNION of (a) files changed by commits from the
// base revision to head and (b) files still modified in the working tree. This
// matters (finding #2): a session that committed all its work leaves a clean
// working tree, so a working-tree-only view would report an empty change set
// and misrepresent a productive session as having changed nothing. The base is
// an explicit baseRef when given, else the immutable SessionStart baseline.
//
// Requested refs are evidence-defining: an explicit baseRef/headRef, or a
// recorded baseline revision, that does not resolve is an ERROR, not an empty
// result (finding #3). We never swallow a git failure on a command whose output
// defines the bundle.
export async function collectRepository(rootInput, { baseRef, headRef, baseline } = {}) {
  let root;
  try {
    root = await realpath(rootInput);
  } catch {
    root = rootInput;
  }
  const isRepo = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!isRepo) {
    // No repo: an explicitly requested ref cannot resolve → that's an error, not
    // a silent empty. A recorded baseline in a non-repo is inconsistent too.
    if (baseRef || headRef) throw new Error(`Requested git ref but ${root} is not a git work tree.`);
    if (baseline?.baseRevision) throw new Error(`Recorded baseline revision but ${root} is not a git work tree.`);
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

  // Working-tree changes always count toward the union.
  const addWorkingTree = () => {
    for (const line of statusOut.split("\n").filter(Boolean)) {
      const code = line.slice(0, 2).trim()[0] || "M";
      const filePath = line.slice(3).trim();
      pushChange(code, filePath);
    }
  };

  // Committed changes between two resolved revisions count toward the union.
  const addCommittedRange = (base, head) => {
    if (!base || !head || base === head) return;
    const nameStatus = gitOrThrow(root, ["diff", "--name-status", base, head], `diff ${base}..${head}`);
    for (const line of nameStatus.split("\n").filter(Boolean)) {
      const [code, ...rest] = line.split(/\s+/);
      pushChange(code[0], rest[rest.length - 1]);
    }
  };

  const result = { dirty, changedFiles };
  const head = gitOrThrow(root, ["rev-parse", "HEAD"], "resolve HEAD");
  result.headRevision = head;

  // Resolve the base: explicit baseRef wins, else the SessionStart baseline.
  let base = "";
  if (baseRef) {
    base = gitOrThrow(root, ["rev-parse", `${baseRef}^{commit}`], `resolve baseRef ${baseRef}`);
  } else if (baseline?.baseRevision) {
    base = gitOrThrow(root, ["rev-parse", `${baseline.baseRevision}^{commit}`], `resolve baseline ${baseline.baseRevision}`);
  }
  if (base) result.baseRevision = base;

  // Resolve an explicit headRef (overriding the working HEAD as the range end).
  let rangeHead = head;
  if (headRef) {
    rangeHead = gitOrThrow(root, ["rev-parse", `${headRef}^{commit}`], `resolve headRef ${headRef}`);
    result.headRevision = rangeHead;
  }

  // Union: committed range (base→head) plus remaining working-tree changes.
  addCommittedRange(base, rangeHead);
  addWorkingTree();
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

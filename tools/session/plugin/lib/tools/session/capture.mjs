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

// Derive the session's start/end timestamps from the transcript's own records.
// These are immutable session evidence (each JSONL record carries an ISO
// `timestamp`), so they are deterministic for an immutable transcript and are
// NOT re-invented at capture time. Returns { startedAt, endedAt } with whichever
// ends are present (earliest/latest valid ISO timestamp), or {} if none. The
// SessionEvidenceBundle schema already reserves these optional fields, so this
// populates existing contract fields — it is not a schema change.
export function transcriptTimeRange(transcriptText) {
  let min = null;
  let max = null;
  for (const raw of transcriptText.split("\n")) {
    if (!raw.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    const ts = obj?.timestamp;
    if (typeof ts !== "string") continue;
    const ms = Date.parse(ts);
    if (Number.isNaN(ms)) continue;
    if (min === null || ms < min.ms) min = { ms, ts };
    if (max === null || ms > max.ms) max = { ms, ts };
  }
  const range = {};
  if (min) range.startedAt = min.ts;
  if (max) range.endedAt = max.ts;
  return range;
}

// Read the transcript only once it is QUIESCENT and CONTAINS the exact completed
// turn the hook recorded.
//   Quiescence  = size AND mtime identical across `stableChecks` consecutive polls.
//   Completion  = at least one assistant text message present, and — when the hook
//                 recorded one — the final assistant message hash matches
//                 `expectFinalHash`.
//   Confirmation = after a matching quiescent state is first observed, the file
//                 signature must remain UNCHANGED for `confirmChecks` further polls
//                 before we return it.
//
// TRUST BOUNDARY = PROVENANCE, NOT TIMING (Codex/PM HIGH). The late-append exploit
// is: a hashless terminal event inherits a prior Stop's hash, and a genuinely
// LATER turn lands in the transcript after capture began, so a naive reader could
// return the earlier turn as the whole "verified ended session". The guarantee
// that defeats this is NOT the quiescence/confirmation timing — a finite quiet
// window only moves the race. It is `expectFinalHash`: we return a transcript
// ONLY when its final assistant message hashes to the hook-recorded completed
// turn. The moment a later turn is on disk, the transcript's final message IS
// that later turn, whose hash can never equal the recorded one, so capture fails
// closed no matter how long the transcript then settles. Two provenance facts
// establish this end to end:
//   1. A `session_end` capture is only ever produced when SessionEnd carried its
//      OWN authoritative final-message hash (durable same-event identity, enforced
//      at the hook). A hashless terminal event never mints a verified ended
//      session — it preserves the prior authoritative Stop pointer, which capture
//      then verifies against the turn that hash truly represents.
//   2. This function refuses any transcript whose final message ≠ `expectFinalHash`.
//      A superseding turn therefore fails closed on the hash, independent of when
//      it appended relative to any quiet window.
//
// The confirmation window here is DEFENSE IN DEPTH / latency shaping only: it lets
// a mid-capture append be OBSERVED promptly rather than raced, but it is not what
// makes the result trustworthy — the hash match is. It must never be read as a
// timing threshold that "proves" a hashless terminal state.
//
// If the deadline passes before a confirmed, matching, quiescent state holds,
// throw: we never return a partial or superseded "verified" transcript.
export async function readStableTranscript(
  transcriptPath,
  { pollMs = 120, stableChecks = 3, confirmChecks = 3, timeoutMs = 5000, expectFinalHash = null } = {},
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
  // A candidate is a quiescent state whose final message already matched. We only
  // return it after its signature survives `confirmChecks` further polls.
  let candidate = null; // { sig, text, finalHash }
  let confirmRun = 0;

  // Time budget is bounded by timeoutMs; each poll advances by pollMs. We do not
  // use wall-clock beyond the deadline comparison, so behavior stays test-stable.
  for (;;) {
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

    // Confirmation phase: a candidate match is only trustworthy if the file has
    // not changed since. Any change (e.g. a later turn appended after capture
    // began) invalidates it — we must re-evaluate the new state, never return the
    // stale candidate.
    if (candidate) {
      if (sig === candidate.sig) {
        confirmRun += 1;
        if (confirmRun >= confirmChecks) {
          return { text: candidate.text, transcriptSha256: sha256(candidate.text), finalMessageSha256: candidate.finalHash };
        }
        if (Date.now() > deadline) break;
        await delay(pollMs);
        continue;
      }
      // File advanced under us — discard the premature candidate and fall through
      // to re-assess quiescence/match against the new signature.
      candidate = null;
      confirmRun = 0;
    }

    if (sig === prev) stableRun += 1;
    else {
      stableRun = 0;
      prev = sig;
    }

    if (stableRun + 1 >= stableChecks) {
      // File looks settled; read it and check it contains the expected completed turn.
      const text = await readFile(realTranscript, "utf8");
      const finalHash = finalAssistantMessageHash(text);
      const hasFinal = finalHash !== null;
      const matchesExpected = expectFinalHash ? finalHash === expectFinalHash : true;
      if (hasFinal && matchesExpected) {
        // Provenance matched: the on-disk final message IS the hook-recorded
        // completed turn. Promote to a candidate and let it persist through the
        // confirmation window (defense in depth / latency shaping) before
        // returning. The match — not the window — is what makes this trustworthy.
        candidate = { sig, text, finalHash };
        confirmRun = 0;
      } else {
        // Settled but incomplete, or the final message is NOT the recorded turn.
        // This is the provenance backstop: a superseding later turn lands here
        // with a finalHash that can never equal `expectFinalHash`, so it is
        // refused no matter how long it then settles — timing cannot launder it.
        stableRun = 0;
        prev = null;
      }
    }

    if (Date.now() > deadline) break;
    await delay(pollMs);
  }

  throw new Error(
    `Transcript did not reach a quiescent, completed state at ${transcriptPath} within ${timeoutMs}ms` +
      (expectFinalHash ? " (final assistant message not present, did not match the recorded hook message, or the transcript advanced past it)." : "."),
  );
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

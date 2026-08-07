// Claude Code transcript → SessionEvidenceBundle adapter (Phase 1A producer).
//
// Reads a Claude Code session transcript (JSONL, one record per line) plus the
// repository state and emits the provider-neutral SessionEvidenceBundle defined
// in docs/product/session-to-explain-v1.md (@444de0a). Synthesis (Phase 1B)
// consumes the bundle and never parses a transcript directly.
//
// Design invariants (contract §Evidence Selection / §Adapter Boundary):
//  - The caller's `question` is request context, NOT evidence and NOT the
//    session objective. The observed objective is derived from the session's
//    own first requirement and `objective.sourceId` resolves to a selected
//    excerpt.
//  - Selection is SEMANTIC, not "last N lines": keep the objective, explicit
//    requirements/decisions/explanations, errors, unresolved items, and tool
//    events that changed or inspected the system. Progress chatter, permission
//    boilerplate, model reasoning (thinking blocks), and unrelated output are
//    excluded and counted.
//  - Every kept item carries an exact locator. A tool output never borrows its
//    input locator. Hashes are computed by the SAME functions the validator
//    recomputes with (imported from bundle-schema), so producer and consumer
//    cannot disagree about what a hash binds.
//  - The raw transcript is referenced only by its whole-file hash; never embedded.
//  - Content is redacted and byte-size bounded before it enters the bundle.
//  - Unknown/opaque payloads are excluded, not coerced into trusted evidence.
//  - Deterministic for an immutable transcript + repository state.

import path from "node:path";

import { isDeniedPath, redact, scanClean } from "./safety.mjs";
import {
  assertBundle,
  BUNDLE_SCHEMA_VERSION_V2,
  LIMITS as SCHEMA_LIMITS,
  hashExcerpt,
  hashToolInput,
  hashToolOutput,
  hashReceipt,
  hashCodeExcerpt,
} from "./bundle-schema.mjs";

// Byte bounds keep any single excerpt readable and the whole bundle small.
const DEFAULTS = {
  maxExcerptChars: 2000,
  maxToolSummaryChars: 800,
  maxReceiptChars: 4000,
  maxExcerpts: 60,
  maxToolEvents: 80,
};

// Tool names that INSPECT or CHANGE the system — worth keeping as toolEvents.
// Everything else (and anything unrecognized) is excluded and counted, so an
// unknown tool payload is never coerced into trusted evidence.
const CHANGE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const INSPECT_TOOLS = new Set(["Bash", "Read", "Grep", "Glob", "WebFetch", "Task"]);

// Bash commands that are verification evidence get a first-class receipt (in
// addition to remaining a toolEvent). Classification is conservative and keys on
// what a segment actually EXECUTES, never on a word/filename merely appearing in
// the command line. `cat paginate.test.js`, `rm foo_test.py`, `grep build src/`
// name a test/build artifact but run nothing — they must NOT mint a receipt
// (that would be verification laundering: synthesis would show a "succeeded"
// test that never ran). A command that executes none of these stays a toolEvent
// only, never a fabricated receipt.

// Split a command line into top-level segments, remembering the operator that
// PRECEDES each segment, so a benign segment that merely names a test artifact
// does not lend its filename to a sibling segment (`cat x.test.js && echo done`
// executes no test) AND so we can reason about exit-status provenance (which
// segment's status the whole Bash command actually reports). A bare newline is
// treated as `;` (sequential, non-status-preserving for anything before it).
//
// The scan is QUOTE-AWARE: a separator inside single/double quotes (or one that
// is backslash-escaped) is literal data, NOT a shell operator. Without this,
// `echo "harmless; node quoted.test.js"` and `printf 'safe | npm test'` split at
// the quoted `;`/`|` and the runner/test text leaks into a phantom executed
// segment — verification laundering. Single quotes are fully literal (no escapes
// inside them, per POSIX); inside double quotes a backslash escapes the next
// char; outside quotes a backslash escapes the next char too. An unterminated
// quote conservatively swallows the rest of the line into one segment.
// Remove shell comments (quote-aware) before segmenting. POSIX: an unquoted `#`
// that begins a word (start of input, or preceded by whitespace or a shell
// metacharacter `;`/`&`/`|`/`(`) starts a comment that runs to the next newline.
// Without this, `echo safe # ; npm test`, `echo safe # | vitest`, and
// `true # && node paginate.test.js` split at the commented-out separator and the
// runner text leaks into a phantom executed segment — verification laundering.
// A `#` inside quotes, or one mid-word (`foo#bar`), is a literal character.
function stripComments(command) {
  const src = String(command);
  let out = "";
  let quote = null; // "'" | '"' | null
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote === "'") { out += c; if (c === "'") quote = null; continue; }
    if (quote === '"') {
      out += c;
      if (c === "\\") { const n = src[i + 1]; if (n !== undefined) { out += n; i += 1; } continue; }
      if (c === '"') quote = null;
      continue;
    }
    if (c === "\\") { out += c; const n = src[i + 1]; if (n !== undefined) { out += n; i += 1; } continue; }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === "#") {
      const prev = src[i - 1];
      const atWordStart = prev === undefined || prev === " " || prev === "\t"
        || prev === "\n" || prev === ";" || prev === "&" || prev === "|" || prev === "(";
      if (atWordStart) {
        while (i < src.length && src[i] !== "\n") i += 1; // discard to end of line
        if (i < src.length) out += "\n"; // preserve the newline as a separator
        continue;
      }
    }
    out += c;
  }
  return out;
}

function segmentsWithSep(command) {
  const src = String(command);
  const parts = [];
  let start = 0;
  let prevSep = "";
  let quote = null; // "'" | '"' | null
  // `push` closes the segment ending at endIndex. `bg` marks it as BACKGROUNDED
  // (terminated by a single top-level `&`): a backgrounded segment runs
  // asynchronously and does NOT own the shell's exit status.
  const push = (endIndex, nextSep, bg = false) => {
    parts.push({ sep: prevSep, text: src.slice(start, endIndex).trim(), bg });
    prevSep = nextSep;
    start = endIndex;
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote === "'") {
      if (c === "'") quote = null; // single quotes: no escapes, close on next '
      continue;
    }
    if (quote === '"') {
      if (c === "\\") { i += 1; continue; } // escaped char inside double quotes
      if (c === '"') quote = null;
      continue;
    }
    // Outside any quote.
    if (c === "\\") { i += 1; continue; } // escaped operator/char is literal
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "&" && src[i + 1] === "&") { push(i, "&&"); start = i + 2; i += 1; continue; }
    if (c === "|" && src[i + 1] === "|") { push(i, "||"); start = i + 2; i += 1; continue; }
    if (c === "|") { push(i, "|"); start = i + 1; continue; }
    if (c === ";") { push(i, ";"); start = i + 1; continue; }
    if (c === "\n") { push(i, ";"); start = i + 1; continue; }
    // A single top-level `&` is the BACKGROUND operator (`node x.test.js &`,
    // `... & echo done`, `... & wait`): the segment before it runs async and does
    // not own the Bash exit status, so it must never mint a succeeded receipt.
    // A `&` that is part of a REDIRECTION is NOT a separator and must be kept
    // inside the segment: `2>&1` / `>&2` (prev char `>`), `<&3` (prev `<`), and
    // `&>out` / `&>>out` (next char `>`) all run in the FOREGROUND.
    if (c === "&") {
      const next = src[i + 1];
      const prev = src[i - 1];
      const isRedirection = next === ">" || prev === ">" || prev === "<";
      if (!isRedirection) { push(i, "&", true); start = i + 1; continue; }
    }
  }
  parts.push({ sep: prevSep, text: src.slice(start).trim(), bg: false });
  return parts.filter((p) => p.text.length > 0);
}

// Split a segment into whitespace-delimited WORD tokens, honoring quotes and
// backslash escapes so the head executable and its arguments are recognized as
// whole tokens (not regex-scanned substrings). This is what lets us anchor on the
// EXACT executable basename and identify the ACTUAL script target, rather than
// matching a runner/test word anywhere in the line — the class of bug that let
// `node -e "console.log('paginate.test.js')"`, `python -m py_compile x.py`, and
// `node-wrapper x.test.js` all launder a succeeded receipt. Quoted content is one
// token: `console.log('paginate.test.js')` is a single argument whose basename is
// NOT a test-file path, so it can never be mistaken for an executed test target.
function tokenizeSegment(segment) {
  const src = String(segment);
  const tokens = [];
  let cur = "";
  let has = false; // distinguishes an empty quoted token "" from no token
  let quote = null;
  const flush = () => {
    if (has) tokens.push(cur);
    cur = "";
    has = false;
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
      has = true;
      continue;
    }
    if (quote === '"') {
      if (c === "\\") {
        const n = src[i + 1];
        if (n !== undefined) { cur += n; i += 1; }
        has = true;
        continue;
      }
      if (c === '"') quote = null;
      else cur += c;
      has = true;
      continue;
    }
    if (c === "\\") {
      const n = src[i + 1];
      if (n !== undefined) { cur += n; i += 1; has = true; }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === " " || c === "\t") { flush(); continue; }
    cur += c;
    has = true;
  }
  flush();
  return tokens;
}

const basename = (t) => String(t).split("/").pop();

// The OPTION NAME of a flag token, normalizing attached/equal value forms so an
// inline value cannot hide the flag. A long flag keeps everything before `=`
// (`--eval=code` → `--eval`, `--print-config=foo.js` → `--print-config`); a short
// flag keeps its leading `-x` even when a value is attached (`-e"code"` → `-e`,
// `-p"x"` → `-p`, `-c"x"` → `-c`, `-mpytest` → `-m`). Returns null for a
// non-flag token. Without this, `node -e"…" test.js` and `python -c"…" api_test.py`
// slip past exact-token no-run detection and launder a succeeded receipt.
function optName(token) {
  const t = String(token);
  if (!t.startsWith("-")) return null;
  if (t === "-" || t === "--") return t;
  if (t.startsWith("--")) {
    const eq = t.indexOf("=");
    return eq >= 0 ? t.slice(0, eq) : t;
  }
  return t.slice(0, 2); // single-dash short option, value may be attached
}

// PHASE 1C NARROW RUN GRAMMAR (Codex msg dcc2ed12 + PM msg 84fb1399). The prior
// broad per-family grammar still fabricated succeeded receipts through first-class
// branches that were never routed through positive validation — the npm/bun script
// branch (`npm test --help`), subcommand branches (`ruff check --help`, `biome
// check --help`, `cargo clippy -- --help`), the npx unwrap (`npx --help vitest`),
// and the wrapper strip (`sudo --version node x.test.js`). Both reviewers directed:
// STOP expanding the matrix. Support ONLY the exact direct forms the real S1c/S2b +
// fixture evidence uses — a direct test-file run by a node runtime, and an
// `npm`/`pnpm`/`yarn` test/lint/build SCRIPT — with an explicit run-flag allowlist
// and NO wrappers, launchers, extra flags, or passthrough. Every OTHER family (bare
// test runners, linters, build tools, go/cargo/make, deno/bun, python/ruby,
// npx/dlx, wrappers like sudo/env/command/nice/nohup/time, and leading NAME=value
// env assignments) is intentionally UNSUPPORTED and stays a tool event with NO
// receipt, to be reintroduced later behind its own audited parser. False negatives
// are explicitly preferred over any fabricated verification in this phase.

const NODE_RUNTIMES = new Set(["node", "ts-node", "tsx", "babel-node"]);
// The ONLY node runtime flags a real direct test-file run legitimately carries. A
// flag NOT in this allowlist — including -e/--eval/-p/--print/--check/-c (eval /
// print / syntax-check modes that run no test), --version/--help, and any unknown
// flag — makes the invocation unrecognized → no receipt. Kept deliberately minimal;
// broader flags are reintroduced only when a real evidence form needs them.
const NODE_RUN_SAFE = new Set([
  "-r", "--require", "--import", "--loader", "--experimental-loader",
  "--experimental-vm-modules", "--conditions", "-C",
]);
// node run-flags that consume a SEPARATE value token, so the value is not mistaken
// for the executed script positional. An attached form (`--require=x`, `-Cdir`)
// consumes nothing.
const NODE_VALUE_FLAGS = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader", "--conditions", "-C"]);

// A standalone `--` separator followed by at least one token: an argument
// passthrough whose content we do not interpret. `npm test -- --listTests` smuggles
// a no-run mode into the passthrough, so a passthrough carrying tokens conservatively
// yields no receipt (a real filtered run like `npm test -- foo` becomes a false
// negative, which this phase prefers).
function hasPassthroughTokens(args) {
  const i = args.indexOf("--");
  return i >= 0 && i < args.length - 1;
}

// The first argument token that is not an option flag (a subcommand or positional).
function firstNonFlag(tokens) {
  for (const t of tokens) if (!t.startsWith("-")) return t;
  return null;
}

// A whole token whose basename follows a test/spec naming convention — checked as
// an entire path, never as a substring. `paginate.test.js`, `./src/x.test.ts`,
// `api_test.py`, `foo_spec.rb` match; `console.log('paginate.test.js')` and
// `"a string mentioning paginate.test.js"` do NOT (their basenames are not paths).
function isTestFileToken(token) {
  const base = basename(token);
  return (
    /^[\w@.-]*[._-](?:test|spec)\.(?:c|m)?[jt]sx?$/i.test(base) ||
    /^[\w@.-]*[._-](?:test|spec)\.(?:py|rb|go)$/i.test(base)
  );
}

// A direct test-file run by a node runtime (the S1c/S2b evidence form). Mints
// "test" ONLY when every flag is in NODE_RUN_SAFE, there is no `--` passthrough
// carrying tokens, and the first positional (after skipping run-safe value flags)
// is a test file. Rejects eval/print/check modes, --version/--help, unknown flags,
// and a run with no test-file target.
function nodeRun(args) {
  if (hasPassthroughTokens(args)) return null;
  let k = 0;
  while (k < args.length) {
    const t = args[k];
    if (t === "--") break;
    if (t.startsWith("-")) {
      const opt = optName(t);
      if (!NODE_RUN_SAFE.has(opt)) return null; // eval/print/check/version/unknown
      const attached = t.includes("=") || (!t.startsWith("--") && t.length > 2);
      if (NODE_VALUE_FLAGS.has(opt) && !attached) k += 1; // skip its separate value
      k += 1;
      continue;
    }
    // First positional: it must be the executed test file, or nothing mints.
    return isTestFileToken(t) ? "test" : null;
  }
  return null; // no script target ran
}

// An `npm`/`pnpm`/`yarn` verification SCRIPT run. Mints ONLY for `<pm> test` or
// `<pm> run <script>` where the (implicit or named) script is a known verification
// script (test/lint/build/typecheck/compile), with NO flags, NO `--` passthrough,
// NO `dlx` launcher, and NO `--if-present`. Any flag (`npm test --help`,
// `--coverage`, `--version`, `--if-present`), a passthrough (`npm test --
// --listTests`), or `pnpm dlx <tool>` yields no receipt. A trailing positional
// test-name filter (`npm test rate-limiter`) is allowed — it is a real run.
function pkgScriptKind(args) {
  if (args[0] === "dlx") return null; // pnpm/yarn dlx launches an arbitrary tool, not a script
  if (hasPassthroughTokens(args)) return null;
  for (const t of args) {
    if (t === "--") break;
    if (t.startsWith("-")) return null; // no flags this phase (kills --help/--version/--if-present)
  }
  const sub = firstNonFlag(args); // no flags remain, so this is args[0]
  if (!sub) return null;
  if (sub === "run") return runScriptKind(args.slice(1));
  return runScriptKind([sub]); // `npm test`, `yarn lint`, `pnpm build`
}

// Classify a SINGLE executed segment. Returns a receipt kind or null. Anchors on
// the EXACT executable basename (the literal head token — no wrapper or env-prefix
// stripping, no launcher unwrap) and mints ONLY for the two supported evidence
// forms; every other head is a tool event with no receipt.
function segmentKind(segment) {
  const tokens = tokenizeSegment(segment);
  if (tokens.length === 0) return null;
  const exe = basename(tokens[0]);
  const args = tokens.slice(1);
  if (!exe) return null;

  // --- direct test-file run by a node runtime (S1c/S2b evidence form) ---
  if (NODE_RUNTIMES.has(exe)) return nodeRun(args);

  // --- npm / pnpm / yarn test|lint|build script (fixture evidence form) ---
  if (exe === "npm" || exe === "pnpm" || exe === "yarn") return pkgScriptKind(args);

  return null; // every other family: tool event only, no receipt (reintroduce later)
}

// Map a package.json script name (from `npm run <name>` / `npm <name>`) to a
// receipt kind. Only the conventional verification scripts count.
function runScriptKind(rest) {
  const name = firstNonFlag(rest);
  if (name === "test") return "test";
  if (name === "lint") return "lint";
  if (name === "build" || name === "typecheck" || name === "compile") return "build";
  return null;
}


// A command whose shell form is genuinely ambiguous about WHAT executes —
// command substitution (`` `…` `` or `$(…)`) or a heredoc — is treated as
// non-evidence: we emit NO receipt rather than misread substituted/heredoc text
// as an executed verification. `echo `printf safe; npm test`` must not launder a
// success, and `cat <<'EOF'\nnpm test\nEOF` must not fabricate that a test ran.
// Conservative by design: false negatives are preferable to fabricated verification.
function hasAmbiguousShellForm(command) {
  const s = String(command);
  if (s.includes("`")) return true; // backtick command substitution
  if (/\$\(/.test(s)) return true; // $(…) command substitution
  if (/<<-?\s*['"]?[\w.-]+/.test(s)) return true; // heredoc
  return false;
}

// A Bash command is verification evidence if an executed segment is a recognized
// run. Given the observed AGGREGATE exit status of the whole Bash command, we
// decide (a) whether a receipt should be minted at all — a verification run
// reached through a conditional may never have executed — and (b) its honest
// status. The shell reports the exit status of the LAST executed command, so a
// run only owns that status when it is the final foreground segment.
//
// The conditional guards (PM msg 632d4192): a run reached via `&&`/`||` mints a
// receipt ONLY when the aggregate result PROVES that branch executed —
//  - `pred && run`: a succeeded aggregate proves the whole chain (incl. run)
//    executed and passed; any other aggregate cannot tell "pred failed, run
//    skipped" from "run failed" -> no receipt (never `test:failed` for a
//    skipped run, as `false && node x.test.js` used to mint).
//  - `pred || run`: a failed aggregate proves pred failed (so run executed) and
//    carries run's failing status; a succeeded aggregate means pred succeeded
//    and run was SKIPPED -> no receipt (never `test:unknown` for a skipped run,
//    as `true || node x.test.js` used to mint).
// `unknown` is reserved for a run that DEFINITELY executed but whose outcome is
// masked by a later/piped segment (`node x.test.js | tee out`, `... ; echo`);
// it must never mean "may have been skipped". A backgrounded run (`... &`) does
// not own the shell result either -> `unknown`.
//
// Returns { kind, status } (status: succeeded | failed | unknown) or null.
function classifyReceipt(rawCommand, aggregateStatus) {
  // Strip shell comments first (quote-aware): a commented-out separator/runner
  // (`echo safe # ; npm test`) must not leak into a phantom executed segment.
  const command = stripComments(rawCommand);
  // Command substitution / heredocs make it ambiguous what actually executes —
  // emit no receipt rather than misread substituted or heredoc text as a run.
  if (hasAmbiguousShellForm(command)) return null;
  const segs = segmentsWithSep(command);
  if (segs.length === 0) return null;
  const kinds = segs.map((s) => segmentKind(s.text));

  // The last segment that is itself a recognized verification run.
  let vIdx = kinds.length - 1;
  while (vIdx >= 0 && !kinds[vIdx]) vIdx -= 1;
  if (vIdx < 0) return null; // no segment actually ran a verification

  const kind = kinds[vIdx];
  const vSep = segs[vIdx].sep; // the operator that PRECEDES (gates) this run
  const isFinalForeground = vIdx === kinds.length - 1 && !segs[vIdx].bg;
  const succeeded = aggregateStatus === "succeeded";
  const failed = aggregateStatus === "failed";

  if (isFinalForeground) {
    // The run is the final foreground segment: it owns the aggregate exit status.
    // Whether that status is meaningful depends on how the run was REACHED.
    if (vSep === "" || vSep === ";" || vSep === "|") {
      // Unconditional position → the run executed; the aggregate is its status.
      return { kind, status: succeeded ? "succeeded" : failed ? "failed" : "unknown" };
    }
    if (vSep === "&&") return succeeded ? { kind, status: "succeeded" } : null;
    if (vSep === "||") return failed ? { kind, status: "failed" } : null;
    return null;
  }

  // The run is NOT the final foreground segment (a later segment owns the exit
  // status, or the run was backgrounded). In an unconditional position it
  // definitely RAN but its outcome is masked → `unknown`. Reached via a
  // conditional it MAY have been skipped, and `unknown` must never mean that →
  // emit nothing.
  if (vSep === "&&" || vSep === "||") return null;
  return { kind, status: "unknown" };
}

function clip(text, max) {
  if (typeof text !== "string") return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[${text.length - max} more chars omitted]`;
}

// Flatten a message content field to plain text for a given block type.
function blockText(block) {
  if (typeof block === "string") return block;
  if (block && typeof block === "object") {
    if (typeof block.text === "string") return block.text;
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) {
      return block.content
        .map((c) => (typeof c === "string" ? c : typeof c?.text === "string" ? c.text : ""))
        .join("");
    }
  }
  return "";
}

// Detect a Claude Code local-slash-command wrapper for Explainify's OWN
// invocation. Slash commands are recorded as a user message whose text wraps a
// <command-name>…</command-name> block (often with <command-message>/
// <command-args>). Only Explainify's own commands (`/explain-session`,
// `/explainify…`) are control flow to exclude; a user typing about some other
// slash command is left to normal selection. Matches the command-name payload
// specifically so an unrelated mention of the string in prose is not excluded.
function isExplainifySlashWrapper(content) {
  const blocks = Array.isArray(content) ? content : typeof content === "string" ? [{ type: "text", text: content }] : [];
  for (const block of blocks) {
    if (block && typeof block === "object" && block.type !== "text" && block.type !== undefined) continue;
    const text = blockText(block);
    const m = /<command-name>\s*\/?([^<\s]+)/i.exec(text);
    if (m && /^explain-session$|^explainify/i.test(m[1])) return true;
  }
  return false;
}

// A record whose content Explainify itself produced — the assistant
// success/failure/echo of our own MCP tool / plugin invocation. Claude Code
// attributes such records to the originating plugin (e.g.
// `attributionPlugin: "explainify-session"`); some shapes instead carry a nested
// tool attribution. This is control flow about the capture, not session
// evidence, and a failure response can embed a checkout path — so it is excluded
// before selection. Matches Explainify's own attribution specifically so an
// unrelated plugin's output is left to normal selection.
const EXPLAINIFY_ATTRIBUTIONS = /^explainify(-session)?$/i;
function isExplainifyAttributed(obj) {
  if (!obj || typeof obj !== "object") return false;
  const candidates = [obj.attributionPlugin, obj.attribution?.plugin, obj.attribution?.pluginName, obj.pluginName, obj.message?.attributionPlugin];
  return candidates.some((v) => typeof v === "string" && EXPLAINIFY_ATTRIBUTIONS.test(v.trim()));
}

// Normalize a repo-relative path for prefix matching: strip a leading "./" and
// use forward slashes so both "a/b" and ".\\a\\b" compare consistently.
function normalizeRel(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

// --- Phase 1E CodeExcerpt derivation (R1/R2/R5) -----------------------------
//
// A CodeExcerpt is attested code evidence: it is derived ONLY from a successful
// direct Edit/Write tool event (raw structured input, pre-truncation), joined to
// an actual repository.changedFiles entry by NORMALIZED repo-relative path, and
// classified against the FINAL file content. We never infer code or topology; an
// event we cannot bind confidently becomes a visible `unknown`/`unsupported`
// excerpt with a reason, never a guessed or clipped hunk.

// Convert a tool-input file path (usually absolute) to a normalized repo-relative
// path against the repository root, or null if it escapes the repo / can't be
// resolved. This is the join key to repository.changedFiles.
function toRepoRel(filePath, repoRoot) {
  if (!filePath || typeof filePath !== "string") return null;
  const raw = filePath.replace(/\\/g, "/");
  let rel;
  if (repoRoot) {
    const abs = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
    rel = path.relative(repoRoot, abs);
  } else {
    // No root: only a already-relative path can be used, normalized.
    if (path.isAbsolute(raw)) return null;
    rel = raw;
  }
  rel = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  if (rel === "" || rel === ".." || rel.startsWith("../") || path.isAbsolute(rel)) return null;
  return rel;
}

// Find the UNIQUE line span (1-based, inclusive) of `snippet` inside `content`,
// or a reason it is not landed. Returns { startLine, endLine } when snippet
// occurs exactly once, else { reason }. Comparison is on exact text (the raw,
// un-redacted preimage) so the span is faithful to the real file.
function uniqueLineSpan(content, snippet) {
  if (typeof content !== "string") return { reason: "final file content is unavailable, so the change cannot be confirmed landed" };
  if (typeof snippet !== "string" || snippet.length === 0) return { reason: "the change carried no comparable text" };
  const first = content.indexOf(snippet);
  if (first < 0) return { reason: "the edited text is not present in the final file (a later change overwrote it)" };
  const second = content.indexOf(snippet, first + 1);
  if (second >= 0) return { reason: "the edited text appears more than once in the final file; a unique span cannot be bound" };
  const startLine = content.slice(0, first).split("\n").length;
  const endLine = startLine + (snippet.split("\n").length - 1);
  return { startLine, endLine, charStart: first, charEnd: first + snippet.length };
}

// An Edit REPLACES the unique `old_string` occurrence with `new_string`. Merely
// finding `new_string` in the final file does not prove THIS edit landed: the
// identical text may have pre-existed elsewhere while the edit's own region was
// reverted (Codex blocker #1). We prove the edit's effect only when every
// occurrence of `old_string` in the final file lies INSIDE the matched
// `new_string` span (legitimate when new_string is a superset of old_string) —
// any occurrence OUTSIDE that span means the replaced text still exists, so the
// edit was reverted/overwritten and cannot be attested as landed. Returns null
// when landed is provable, else a reason string. An empty/absent old_string (a
// pure insertion) has nothing to revert, so it is treated as landed.
function editReverted(content, oldText, span) {
  if (typeof oldText !== "string" || oldText.length === 0) return null;
  for (let idx = content.indexOf(oldText); idx >= 0; idx = content.indexOf(oldText, idx + 1)) {
    const inside = idx >= span.charStart && idx + oldText.length <= span.charEnd;
    if (!inside) {
      return "the replaced text still appears in the final file outside the edited region, so this edit cannot be confirmed landed (it may have been reverted or its result overwritten)";
    }
  }
  return null;
}

// Deterministic, syntax-aware unique-declaration rule (R5): return a symbol name
// ONLY when the hunk's `after` text introduces exactly one unambiguous TOP-LEVEL
// declaration; otherwise null (the UI then shows file + exact line span). The
// match anchors at column 0 (optionally after `export`/`export default`) so a
// declaration nested inside a function body (e.g. an indented `let slug`) is NOT
// counted, and a literal token appearing inside a string/expression can never be
// mistaken for a resolved symbol. If the hunk introduces two top-level
// declarations, the symbol is ambiguous → null.
const DECL_RE = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
// Symbol resolution is a JS/TS-family rule; the keyword grammar only holds for
// those. For any other (or extensionless) file we omit the symbol rather than
// guess with the wrong grammar (Codex blocker #2, language-unsupported case).
const JS_LIKE_EXT = /\.(mjs|cjs|jsx?|tsx?)$/i;

// Blank out the CONTENT of comments and string/template literals so a
// declaration-looking token inside them (`/* function foo(){} */`, a backtick
// template, a quoted string) is never mistaken for real top-level code. A single
// forward pass over the characters with an explicit state machine; newlines are
// preserved so per-line matching keeps stable line numbers. Regex literals are
// left as code (a `/`-led regex at column 0 preceded by a declaration keyword is
// not a construct DECL_RE can be fooled by), and template `${…}` interpolation is
// blanked (conservative: an interpolated declaration is never a top-level one).
function stripNonCode(src) {
  let out = "";
  let state = "code"; // code | line | block | sq | dq | tpl
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1];
    switch (state) {
      case "code":
        if (c === "/" && n === "/") { state = "line"; out += "  "; i += 1; }
        else if (c === "/" && n === "*") { state = "block"; out += "  "; i += 1; }
        else if (c === "'") { state = "sq"; out += " "; }
        else if (c === '"') { state = "dq"; out += " "; }
        else if (c === "`") { state = "tpl"; out += " "; }
        else out += c;
        break;
      case "line":
        if (c === "\n") { state = "code"; out += "\n"; } else out += " ";
        break;
      case "block":
        if (c === "*" && n === "/") { state = "code"; out += "  "; i += 1; }
        else out += c === "\n" ? "\n" : " ";
        break;
      case "sq":
        if (c === "\\") { out += "  "; i += 1; }
        else if (c === "'") { state = "code"; out += " "; }
        else out += c === "\n" ? "\n" : " ";
        break;
      case "dq":
        if (c === "\\") { out += "  "; i += 1; }
        else if (c === '"') { state = "code"; out += " "; }
        else out += c === "\n" ? "\n" : " ";
        break;
      case "tpl":
        if (c === "\\") { out += "  "; i += 1; }
        else if (c === "`") { state = "code"; out += " "; }
        else out += c === "\n" ? "\n" : " ";
        break;
      default:
        out += c;
    }
  }
  return out;
}
function extractSymbol(afterText, rel) {
  if (typeof afterText !== "string") return null;
  if (rel && !JS_LIKE_EXT.test(rel)) return null; // unsupported language → omit
  const names = new Set();
  for (const line of stripNonCode(afterText).split("\n")) {
    const m = DECL_RE.exec(line); // no leading-whitespace allowance → column 0 only
    if (m) names.add(m[1]);
  }
  return names.size === 1 ? [...names][0] : null;
}

// Explainify's OWN output/pointer tree in the target repo. Writing it is a side
// effect of running the tool, never user session work.
function isInternalToolPath(p) {
  const rel = normalizeRel(p);
  return rel === ".explainify" || rel.startsWith(".explainify/");
}

// The two plugin-installer-owned settings files whose UNCHANGED presence is an
// install artifact, not session work. We omit them ONLY when their content is
// byte-identical to the SessionStart baseline (recorded start hash). Any OTHER
// `.claude/**` path — CLAUDE.md, skills, hooks, or these two files if edited
// during the session — is legitimate agent-native work and is never hidden.
const INSTALLER_SETTINGS_FILES = new Set([".claude/settings.json", ".claude/settings.local.json"]);
function isUnchangedInstallerSetting(rel, currentSha, baselineHashes) {
  if (!INSTALLER_SETTINGS_FILES.has(rel)) return false;
  const recorded = baselineHashes && baselineHashes[rel];
  return Boolean(recorded && currentSha && recorded === currentSha);
}

// Heuristic semantic classification of a user/assistant text block. Returns an
// excerpt kind or null to exclude. Kept intentionally conservative: we would
// rather exclude a borderline line (and count it) than mislabel chatter as a
// decision.
function classifyText(role, text) {
  const t = text.trim();
  if (t.length < 12) return null; // boilerplate / acks
  const lower = t.toLowerCase();
  if (role === "user") {
    // Explicit requirements/asks from the human.
    return "user_requirement";
  }
  // assistant
  if (/\berror\b|failed|cannot|exception|traceback|does not|doesn't work/.test(lower)) return "error";
  if (/\b(unresolved|still (?:need|todo)|blocked|remaining|left to do|next step|TODO)\b/i.test(t)) return "unresolved";
  if (/\b(decid|chose|choose|approach|because|instead of|trade-?off|rather than|will use|going to)\b/.test(lower)) return "agent_decision";
  if (/\b(this|the|it|now|added|created|updated|implement)\b/.test(lower)) return "agent_explanation";
  return "agent_explanation";
}

// Parse the JSONL text into records, tracking the record uuid used for
// locators. Malformed lines are skipped and counted.
function parseRecords(jsonl) {
  const records = [];
  let malformed = 0;
  const lines = jsonl.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    try {
      records.push({ line: i + 1, obj: JSON.parse(raw) });
    } catch {
      malformed += 1;
    }
  }
  return { records, malformed };
}

/**
 * Build a SessionEvidenceBundle from a Claude transcript and repository facts.
 *
 * @param {object} args
 * @param {string} args.transcript         raw JSONL text of the transcript
 * @param {string} args.transcriptSha256   whole-file hash of the transcript on disk
 * @param {object} args.session            { id, cwd, captureEvent, startedAt?, endedAt?, finalMessageSha256? }
 * @param {object} [args.request]          caller context { question, audience{role,technicalDepth} } — NOT evidence
 * @param {object} args.repository         { baseRevision?, headRevision?, dirty, changedFiles[] }
 * @param {Array}  [args.receipts]         optional externally-collected receipts (merged after derived ones)
 * @param {object} [args.limits]           byte/count overrides
 * @returns {{ bundle: object }}
 */
export function buildBundleFromTranscript(args) {
  const limits = { ...DEFAULTS, ...(args.limits || {}) };
  const { records, malformed } = parseRecords(args.transcript);

  const excerpts = [];
  const toolEvents = [];
  const exclusionCounts = new Map();
  let redactionCount = 0;
  const addExclusion = (kind, n = 1) => exclusionCounts.set(kind, (exclusionCounts.get(kind) || 0) + n);
  if (malformed) addExclusion("malformed_jsonl_line", malformed);

  // Redact + size-bound a piece of content. Returns null if the content still
  // holds a secret after redaction (caller counts and excludes it) — the
  // fail-closed leg of the secret gate at the item level. Hashing is done by
  // the caller with the field-appropriate hash function.
  const prepare = (text, max) => {
    const { text: red, count } = redact(clip(text, max));
    if (!scanClean(red)) return null;
    redactionCount += count;
    return red;
  };

  let objectiveExcerptId = null;
  let excerptSeq = 0;
  let toolSeq = 0;
  // A single monotonic counter stamped on every kept excerpt AND tool event as it
  // is appended, in transcript order. This is the ONLY attested cross-type order
  // the capture proves; the emitted `observedOrder` timeline (v2) is derived from
  // it, and the ChangeStory's observed_sequence edges are validated against it so a
  // reordered story fails closed (Phase 1E findings #1/#2).
  let orderSeq = 0;

  for (const { obj } of records) {
    const type = obj?.type;
    const uuid = obj?.uuid;
    const msg = obj?.message;

    // Claude Code injects its OWN control records that are not user-authored
    // evidence. Skill/agent system prompts carry `isMeta: true` — e.g. the
    // "Base directory for this skill: <plugin path>/SKILL.md" block, which would
    // otherwise leak a checkout path into the objective/excerpts. Exclude and
    // count every meta record before any selection so it can never become
    // trusted evidence. This makes "no checkout-path leak" an adapter-level
    // invariant, independent of which session invoked the tool.
    if (obj?.isMeta === true) {
      addExclusion("meta_record");
      continue;
    }

    // Only user/assistant message records carry evidence content. Any other
    // record type (queue-operation, attachment, ai-title, mode, system, …) is
    // metadata, not trusted evidence → excluded and counted, never coerced.
    if (type !== "user" && type !== "assistant") {
      if (type) addExclusion(`record_type:${type}`);
      continue;
    }

    // A local slash command is recorded as a user message wrapping
    // <command-name>…</command-name>. Explainify's own /explain-session
    // invocation is control flow, not a session requirement, and must never be
    // captured as an objective/excerpt. Exclude + count it before selection.
    if (type === "user" && isExplainifySlashWrapper(msg?.content)) {
      addExclusion("slash_command_wrapper");
      continue;
    }

    // The assistant response to Explainify's OWN invocation (the tool's
    // success/failure/echo) is attributed to the explainify-session plugin/MCP
    // tool. It is control flow about the capture itself — and, on failure, can
    // carry a checkout path or internal error text — not session work. Exclude +
    // count it (with the wrapper above, this is the full "wrapper + failure/echo"
    // boundary) before any excerpt selection.
    if (isExplainifyAttributed(obj)) {
      addExclusion("explainify_tool_output");
      continue;
    }
    const content = msg?.content;
    const blocks = Array.isArray(content) ? content : typeof content === "string" ? [{ type: "text", text: content }] : [];

    for (let b = 0; b < blocks.length; b += 1) {
      const block = blocks[b];
      const btype = block?.type;

      if (btype === "thinking") {
        addExclusion("model_reasoning"); // contract: model reasoning excluded
        continue;
      }

      if (btype === "text" || btype === undefined) {
        const text = blockText(block);
        const role = type === "user" ? "user" : "assistant";
        // The first substantive user requirement becomes the OBSERVED objective
        // source (distinct from the caller's request.question).
        if (!objectiveExcerptId && role === "user" && text.trim().length >= 12) {
          const red = prepare(text, limits.maxExcerptChars);
          if (red) {
            objectiveExcerptId = "excerpt-objective";
            const ex = {
              id: objectiveExcerptId,
              kind: "user_requirement",
              role,
              text: red,
              locator: `jsonl:${uuid}#content[${b}]`,
            };
            ex.sha256 = hashExcerpt(ex);
            ex._seq = orderSeq++;
            excerpts.push(ex);
            continue;
          }
          addExclusion("secret_bearing_excerpt");
          continue;
        }
        const kind = classifyText(role, text);
        if (!kind) {
          addExclusion("chatter_or_boilerplate");
          continue;
        }
        if (excerpts.length >= limits.maxExcerpts) {
          addExclusion("excerpt_over_limit");
          continue;
        }
        const red = prepare(text, limits.maxExcerptChars);
        if (!red) {
          addExclusion("secret_bearing_excerpt");
          continue;
        }
        excerptSeq += 1;
        const ex = {
          id: `excerpt-${excerptSeq}`,
          kind,
          role,
          text: red,
          locator: `jsonl:${uuid}#content[${b}]`,
        };
        ex.sha256 = hashExcerpt(ex);
        ex._seq = orderSeq++;
        excerpts.push(ex);
        continue;
      }

      if (btype === "tool_use") {
        const toolName = block?.name || "unknown";
        const isChange = CHANGE_TOOLS.has(toolName);
        const isInspect = INSPECT_TOOLS.has(toolName);
        if (!isChange && !isInspect) {
          addExclusion(`unknown_tool:${toolName}`); // fail-closed: don't trust unknown tools
          continue;
        }
        if (toolEvents.length >= limits.maxToolEvents) {
          addExclusion("tool_event_over_limit");
          continue;
        }
        // Denied-path guard on tool inputs (e.g. Read of a .env / key file).
        const inputRaw = JSON.stringify(block?.input ?? {});
        const pathLike = block?.input?.file_path || block?.input?.path || block?.input?.notebook_path || "";
        if (isDeniedPath(pathLike) || isDeniedPath(inputRaw)) {
          addExclusion("denied_path_tool");
          continue;
        }
        const red = prepare(inputRaw, limits.maxToolSummaryChars);
        if (!red) {
          addExclusion("secret_bearing_tool_input");
          continue;
        }
        toolSeq += 1;
        const ev = {
          id: `tool-${toolSeq}`,
          toolName,
          // "unknown" until a matching tool_result proves succeeded/failed/denied.
          // A tool use with no result stays "unknown" — never a fabricated success.
          status: "unknown",
          inputSummary: red,
          outputSummary: "",
          inputLocator: `jsonl:${uuid}#content[${b}]`,
          // input/output hashes are finalized AFTER status settles (below), because
          // the input hash binds status and a tool_result can change it.
          _useId: block?.id,
          _command: toolName === "Bash" ? (block?.input?.command ?? "") : "",
          // Raw structured input for CodeExcerpt derivation (R2): captured BEFORE
          // the 800-char inputSummary truncation, ONLY for direct Edit/Write (the
          // supported code-change forms). MultiEdit/NotebookEdit are NOT candidates
          // (R1) — they stay tool events with no code excerpt.
          _codeInput:
            toolName === "Edit"
              ? { tool: "Edit", filePath: block?.input?.file_path, before: block?.input?.old_string, after: block?.input?.new_string }
              : toolName === "Write"
                ? { tool: "Write", filePath: block?.input?.file_path, after: block?.input?.content }
                : null,
          // Attested transcript position (see orderSeq); stripped before emit.
          _seq: orderSeq++,
        };
        toolEvents.push(ev);
        continue;
      }

      if (btype === "tool_result") {
        // Attach output + status to the matching tool event (by tool_use_id),
        // with the result record's OWN locator (never the input's).
        const useId = block?.tool_use_id;
        const ev = toolEvents.find((e) => e._useId === useId);
        if (!ev) {
          addExclusion("orphan_tool_result");
          continue;
        }
        const outText = blockText(block);
        const denied = /permission denied|not permitted|user (?:denied|rejected)/i.test(outText);
        ev.status = denied ? "denied" : block?.is_error ? "failed" : "succeeded";
        const red = prepare(outText, limits.maxToolSummaryChars);
        if (red && red.length > 0) {
          ev.outputSummary = red;
          ev.outputLocator = `jsonl:${uuid}#content[${b}]`;
        } else if (red == null) {
          addExclusion("secret_bearing_tool_output");
        }
        // Hashes are finalized once, after all results are paired (below), so the
        // input hash binds the settled status.
        continue;
      }

      if (btype === "image") {
        addExclusion("image_block");
        continue;
      }
      addExclusion(`unknown_block:${btype}`);
    }
  }

  // Finalize tool-event hashes now that every status is settled. The input hash
  // binds the status (so a resultless "unknown" tool cannot be relabeled
  // "succeeded"); the output hash binds it too when output is present. Both are
  // computed here, after all tool_results have been paired.
  for (const ev of toolEvents) {
    ev.inputSha256 = hashToolInput(ev);
    if (ev.outputLocator) ev.outputSha256 = hashToolOutput(ev);
  }

  // Derive verification receipts from Bash toolEvents BEFORE stripping internals,
  // so command/output locators come straight from the observed tool event.
  const receipts = [];
  let receiptSeq = 0;
  for (const ev of toolEvents) {
    if (ev.toolName !== "Bash" || !ev._command) continue;
    // The classifier decides — from the command shape AND the observed aggregate
    // exit status — whether a real verification run happened and what its honest
    // status is. It returns null when nothing ran, when the run may have been
    // skipped by a conditional guard, or when the shape is ambiguous. It never
    // fabricates a success/failure: `unknown` means "definitely ran, outcome
    // masked", never "may have been skipped". We never invent an exit code.
    const classified = classifyReceipt(ev._command, ev.status);
    if (!classified) continue;
    const { kind, status } = classified;
    const command = prepare(ev._command, limits.maxReceiptChars);
    if (command == null) {
      addExclusion("secret_bearing_receipt");
      continue;
    }
    receiptSeq += 1;
    const rc = {
      id: `receipt-${receiptSeq}`,
      kind,
      command,
      status,
      scope: ev._command.slice(0, 120),
      content: ev.outputSummary || "",
      commandLocator: ev.inputLocator,
      ...(ev.outputLocator ? { outputLocator: ev.outputLocator } : {}),
    };
    rc.sha256 = hashReceipt(rc);
    // A derived receipt is the verification outcome OF this Bash tool event; it
    // occupies the same attested transcript position, so the observedOrder timeline
    // places it immediately after its originating event (findings #1/#2).
    rc._originSeq = ev._seq;
    receipts.push(rc);
  }

  // Merge any externally-collected receipts (e.g. a CLI-run gate), hashed the
  // same way. These carry their own explicit status; no exit code is invented.
  for (const rc of args.receipts || []) {
    const content = prepare(rc.content ?? "", limits.maxReceiptChars);
    if (content == null) {
      addExclusion("secret_bearing_receipt");
      continue;
    }
    receiptSeq += 1;
    const status = ["succeeded", "failed", "unknown"].includes(rc.status) ? rc.status : "unknown";
    const out = {
      id: rc.id || `receipt-${receiptSeq}`,
      kind: rc.kind,
      command: rc.command ?? "",
      status,
      ...(status !== "unknown" && Number.isInteger(rc.exitCode) ? { exitCode: rc.exitCode } : {}),
      scope: rc.scope ?? "",
      content,
      commandLocator: rc.commandLocator || `external:${rc.id || `receipt-${receiptSeq}`}`,
      ...(rc.outputLocator ? { outputLocator: rc.outputLocator } : {}),
    };
    out.sha256 = hashReceipt(out);
    // An externally-collected receipt has no originating in-transcript Bash event;
    // it is appended to the timeline after every in-transcript item, in the order
    // supplied. orderSeq has already advanced past every excerpt/tool event, so
    // reusing it here keeps external receipts strictly last and mutually ordered.
    out._originSeq = orderSeq++;
    receipts.push(out);
  }

  // --- Phase 1E (findings #1/#2): the attested observed-order timeline ---
  // ONE total order over every kept excerpt, tool event, and receipt, derived
  // strictly from the transcript position each was stamped with — never from a
  // guessed causal topology. A receipt sits immediately AFTER its originating tool
  // event (odd key = originSeq*2+1) while excerpts/tool events take the even slot
  // (seq*2), so a failed Bash → Edit → passed Bash session serializes in its true
  // order. The ChangeStory may only assert observed_sequence between items adjacent
  // in THIS timeline; a reordered story fails validation.
  const timeline = [
    ...excerpts.map((e) => ({ kind: "excerpt", id: e.id, key: e._seq * 2 })),
    ...toolEvents.map((t) => ({ kind: "tool_event", id: t.id, key: t._seq * 2 })),
    ...receipts.map((rc) => ({ kind: "receipt", id: rc.id, key: rc._originSeq * 2 + 1 })),
  ].sort((a, b) => a.key - b.key);
  const observedOrder = timeline.map((t) => ({ kind: t.kind, id: t.id }));

  // Strip internal join/order keys before emitting.
  for (const ev of toolEvents) {
    delete ev._useId;
    delete ev._command;
    delete ev._seq;
  }
  for (const ex of excerpts) delete ex._seq;
  for (const rc of receipts) delete rc._originSeq;

  // Observed objective: the first user requirement, else the first selected
  // excerpt of any kind (so sourceId always resolves). A session with zero
  // selectable evidence cannot be explained → fail closed.
  if (excerpts.length === 0) {
    throw new Error("No selectable evidence in session; cannot produce a resolvable objective.");
  }
  const objectiveSource = excerpts.find((e) => e.id === objectiveExcerptId) || excerpts[0];
  const objective = { text: objectiveSource.text, sourceId: objectiveSource.id };

  // changedFiles: drop denied paths, then tool-owned output, then UNCHANGED
  // installer settings, counting each. Installing and running the plugin writes
  // tool-owned `.explainify/**` (bundles, pointers, receipts) and installer-owned
  // `.claude/settings*.json` into the target repo. Attributing those install
  // side effects to the session inflates the causal "session changed N files"
  // claim (Codex finding). But `.claude/**` is also where legitimate agent-native
  // work lives (CLAUDE.md, skills, hooks, edited settings), so we do NOT blanket-
  // exclude it: only the two installer settings files, and only when their
  // content still matches the SessionStart baseline hash, are omitted. Everything
  // else — including those two files if edited during the session — is kept.
  const installerBaseline = args.repository?.installerBaselineHashes || null;
  let deniedPathCount = 0;
  const changedFiles = [];
  for (const c of args.repository?.changedFiles || []) {
    if (isDeniedPath(c.path)) {
      deniedPathCount += 1;
      addExclusion("denied_changed_file");
      continue;
    }
    if (isInternalToolPath(c.path)) {
      addExclusion("internal_tool_dir");
      continue;
    }
    if (isUnchangedInstallerSetting(normalizeRel(c.path), c.sha256, installerBaseline)) {
      addExclusion("installer_config");
      continue;
    }
    changedFiles.push(c);
  }

  // --- Phase 1E: derive hash-bound CodeExcerpts (v2) ---
  // Candidates are ONLY successful direct Edit/Write events (R1). Each is joined
  // to an emitted changed file by normalized repo-relative path, classified
  // landed/superseded/unknown against the final file content, secret-scanned, and
  // byte/line bounded (R2). An event we cannot bind cleanly becomes a visible
  // unknown/unsupported excerpt with a reason — never a guessed or clipped hunk.
  const repoRoot = args.repository?.root || null;
  const finalContent = args.repository?.finalContent || {}; // { [repoRelPath]: string }
  const changedByPath = new Map(changedFiles.map((c) => [c.path, c]));
  const codeEvidence = [];
  let codeEvidenceBytes = 0;
  let codeSeq = 0;

  const emitCode = (fields) => {
    const c = { id: `code-${codeSeq}`, ...fields };
    c.sha256 = hashCodeExcerpt(c);
    codeEvidence.push(c);
  };

  for (const ev of toolEvents) {
    const ci = ev._codeInput;
    if (!ci) continue; // not an Edit/Write
    if (ev.status !== "succeeded") continue; // R1: only successful direct edits are candidates
    const rel = toRepoRel(ci.filePath, repoRoot);
    // The join is exact: the edited path must be one of the (post-filter) changed
    // files. An edit to a path we did not emit as changed (denied, tool-owned,
    // unchanged installer setting, or outside the diff) yields no code excerpt.
    if (!rel || !changedByPath.has(rel)) continue;
    if (codeEvidence.length >= SCHEMA_LIMITS.maxCodeExcerpts) {
      addExclusion("code_excerpt_over_limit");
      continue;
    }
    const changed = changedByPath.get(rel);
    codeSeq += 1;
    const base = {
      toolEventId: ev.id,
      path: rel,
      changeStatus: changed.status,
      transcriptLocator: ev.inputLocator,
      ...(changed.sha256 ? { finalContentSha256: changed.sha256 } : {}),
    };
    const kind = ci.tool === "Edit" ? "hunk" : "full_file";

    // R2: code evidence must be the EXACT, bounded, clean preimage — not a
    // clipped or redacted approximation. Unlike a prose excerpt (which may be
    // redacted and still useful), a hunk is presented as "the actual code that
    // was implemented"; a redacted hunk (`«redacted»` in place of a token) would
    // misrepresent the file. So we require the RAW text to already be clean (no
    // redaction needed) AND within the byte/line limits; any failure → unsupported
    // with a reason, never a clipped or redacted hunk shown as real code.
    const cleanBounded = (text, label) => {
      if (typeof text !== "string") return { unsupported: `${label} was not captured as text` };
      if (isDeniedPath(text)) return { unsupported: `${label} referenced a denied path` };
      if (!scanClean(text)) return { unsupported: `${label} held secret-shaped content and cannot be shown as exact code` };
      if (Buffer.byteLength(text, "utf8") > SCHEMA_LIMITS.maxCodeExcerptBytes) return { unsupported: `${label} exceeds the ${SCHEMA_LIMITS.maxCodeExcerptBytes}-byte exact-code limit` };
      if (text.length && text.split("\n").length > SCHEMA_LIMITS.maxCodeExcerptLines) return { unsupported: `${label} exceeds the ${SCHEMA_LIMITS.maxCodeExcerptLines}-line exact-code limit` };
      return { text };
    };

    const afterRes = cleanBounded(ci.after, kind === "hunk" ? "new_string" : "file content");
    const beforeRes = kind === "hunk" ? cleanBounded(ci.before, "old_string") : { text: undefined };
    const unsupportedReason = afterRes.unsupported || beforeRes.unsupported;
    if (unsupportedReason) {
      emitCode({ ...base, kind: "unsupported", completeness: "unknown", unknownReason: unsupportedReason });
      addExclusion("code_excerpt_unsupported");
      continue;
    }
    const before = beforeRes.text;
    const after = afterRes.text;
    redactionCount += (afterRes.redactions || 0) + (beforeRes.redactions || 0);

    // Aggregate byte budget across all before/after (R2).
    const addBytes = Buffer.byteLength(after ?? "", "utf8") + Buffer.byteLength(before ?? "", "utf8");
    if (codeEvidenceBytes + addBytes > SCHEMA_LIMITS.maxCodeEvidenceBytes) {
      emitCode({ ...base, kind: "unsupported", completeness: "unknown", unknownReason: "aggregate code-evidence byte budget exhausted; exact code omitted" });
      addExclusion("code_excerpt_unsupported");
      continue;
    }
    codeEvidenceBytes += addBytes;

    // R1: classify landed/superseded/unknown against the FINAL file content, and
    // R5: record the unique final line span (codeLocator) only when landed.
    // Classification compares the RAW preimage (ci.after) to the final content —
    // NOT the redacted form — so redaction never changes where the code landed.
    const symbol = extractSymbol(ci.after, rel);
    const finalText = Object.prototype.hasOwnProperty.call(finalContent, rel) ? finalContent[rel] : undefined;
    let completeness;
    let codeLocator;
    let unknownReason;
    if (changed.status === "deleted") {
      completeness = "unknown";
      unknownReason = "the file was deleted after this edit, so the edited text no longer exists to confirm";
    } else if (finalText === undefined) {
      completeness = "unknown";
      unknownReason = "final file content was not available to confirm the edit landed";
    } else {
      const span = uniqueLineSpan(finalText, ci.after);
      if (span.reason) {
        completeness = span.reason.includes("overwrote") ? "superseded" : "unknown";
        unknownReason = span.reason;
      } else {
        // The `new_string` span is unique — but for an Edit we must also prove the
        // replaced `old_string` no longer survives outside that span, or the edit
        // was reverted while identical text pre-existed elsewhere (blocker #1).
        const revertReason = kind === "hunk" ? editReverted(finalText, ci.before, span) : null;
        if (revertReason) {
          completeness = "unknown";
          unknownReason = revertReason;
        } else {
          completeness = "landed";
          codeLocator = `file:${rel}#L${span.startLine}-L${span.endLine}`;
        }
      }
    }
    emitCode({
      ...base,
      kind,
      completeness,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ...(symbol ? { symbol } : {}),
      ...(codeLocator ? { codeLocator } : {}),
      ...(unknownReason ? { unknownReason } : {}),
    });
  }

  // Strip the raw code-input join key now that codeEvidence is derived.
  for (const ev of toolEvents) delete ev._codeInput;

  const exclusions = [...exclusionCounts.entries()]
    .map(([kind, count]) => ({ kind, count, reason: reasonFor(kind) }))
    .sort((a, b) => a.kind.localeCompare(b.kind));

  // request context (caller intent) — defaulted, never sourced from the session.
  const rq = args.request || {};
  const request = {
    question: typeof rq.question === "string" ? rq.question : "What did this session do and why?",
    audience: {
      role: rq.audience?.role || "engineer",
      technicalDepth: ["overview", "working", "expert"].includes(rq.audience?.technicalDepth)
        ? rq.audience.technicalDepth
        : "working",
    },
  };

  const bundle = {
    schemaVersion: BUNDLE_SCHEMA_VERSION_V2,
    request,
    session: {
      id: args.session.id,
      source: "claude_code",
      captureEvent: args.session.captureEvent,
      cwd: args.session.cwd,
      transcriptSha256: args.transcriptSha256,
      ...(args.session.startedAt ? { startedAt: args.session.startedAt } : {}),
      ...(args.session.endedAt ? { endedAt: args.session.endedAt } : {}),
      ...(args.session.finalMessageSha256 ? { finalMessageSha256: args.session.finalMessageSha256 } : {}),
    },
    objective,
    excerpts,
    toolEvents,
    repository: {
      ...(args.repository?.baseRevision ? { baseRevision: args.repository.baseRevision } : {}),
      ...(args.repository?.headRevision ? { headRevision: args.repository.headRevision } : {}),
      dirty: Boolean(args.repository?.dirty),
      changedFiles,
    },
    receipts,
    exclusions,
    privacy: {
      redactionCount,
      deniedPathCount,
      secretScan: "pass", // every kept item passed scanClean; secret-bearing items were excluded
      publication: "local_only",
    },
    codeEvidence,
    // v2 attested cross-type order (findings #1/#2): the single provable timeline.
    observedOrder,
  };

  assertBundle(bundle);
  return { bundle };
}

function reasonFor(kind) {
  if (kind.startsWith("record_type:")) return "Non-message record is metadata, not trusted evidence.";
  if (kind.startsWith("unknown_tool:")) return "Unrecognized tool payload excluded rather than coerced into trusted evidence.";
  if (kind.startsWith("unknown_block:")) return "Unrecognized content block excluded.";
  const map = {
    malformed_jsonl_line: "Line was not valid JSON.",
    model_reasoning: "Model reasoning (thinking) is excluded by the privacy boundary.",
    chatter_or_boilerplate: "Progress chatter / acknowledgement, not evidence.",
    excerpt_over_limit: "Excerpt count limit reached; remaining text excerpts omitted.",
    tool_event_over_limit: "Tool-event count limit reached; remaining tool events omitted.",
    code_excerpt_over_limit: "Code-evidence count limit reached; remaining code changes omitted.",
    code_excerpt_unsupported: "A code change could not be retained as exact bounded code (over-limit, secret-bearing, or budget-exhausted) and is shown as unsupported.",
    denied_path_tool: "Tool touched a denied path (.env/credential/key/cache/binary).",
    denied_changed_file: "Changed file is on a denied path.",
    meta_record: "Claude Code injected control record (isMeta) — a skill/agent system prompt, not user-authored evidence.",
    slash_command_wrapper: "Explainify's own slash-command invocation is control flow, not a session requirement.",
    explainify_tool_output: "Response attributed to Explainify's own plugin/MCP tool (success/failure/echo) is control flow about the capture, not session evidence.",
    internal_tool_dir: "Explainify-owned output/pointer directory (.explainify/**) is not a user session change.",
    installer_config: "Installer-written settings file unchanged since SessionStart (matches baseline hash) — install artifact, not session work.",
    secret_bearing_excerpt: "Excerpt still held a secret after redaction; excluded.",
    secret_bearing_tool_input: "Tool input still held a secret after redaction; excluded.",
    secret_bearing_tool_output: "Tool output still held a secret after redaction; output omitted.",
    secret_bearing_receipt: "Receipt still held a secret after redaction; excluded.",
    orphan_tool_result: "tool_result had no matching tool_use in scope.",
    image_block: "Image content is not textual evidence.",
  };
  return map[kind] || "Excluded from bounded evidence selection.";
}

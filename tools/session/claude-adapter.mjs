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

import { isDeniedPath, redact, scanClean } from "./safety.mjs";
import {
  assertBundle,
  BUNDLE_SCHEMA_VERSION,
  hashExcerpt,
  hashToolInput,
  hashToolOutput,
  hashReceipt,
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

// Informational / dry-run flags that mean the tool started but performed NO
// verification (help/version/config dumps, test collection without running,
// dry runs). Rejected across ALL receipt kinds: evidence of verification
// PERFORMED is required, not merely that a verification-capable binary ran.
const INFO_FLAGS = new Set([
  "--help", "-h", "-?", "--version", "-V", "--collect-only",
  "--print-config", "--show-config", "--showConfig", "--dry-run",
  // collect / list / no-run aliases: the tool starts but runs no verification.
  "--co", // pytest short alias for --collect-only
  "--listTests", // jest lists matching tests without running them
  "--no-run", // cargo test --no-run compiles but executes no test
  "--just-print", "--recon", // make aliases for -n (dry run)
]);
function hasInfoFlag(exe, args) {
  for (const t of args) {
    const opt = optName(t);
    if (opt && INFO_FLAGS.has(opt)) return true;
    if (exe === "make" && opt === "-n") return true; // make -n is a dry run
  }
  return false;
}

// The first argument token that is not an option flag (a subcommand or a
// positional). Used to read `npm <sub>`, `go <sub>`, `cargo <sub>`, `deno <sub>`.
function firstNonFlag(tokens) {
  for (const t of tokens) if (!t.startsWith("-")) return t;
  return null;
}

// The first POSITIONAL argument (the executed script), skipping option flags and
// the single value consumed by a known value-taking flag. This identifies the
// actual script target rather than regex-scanning every later argument.
function firstPositional(tokens, valueFlags) {
  let k = 0;
  while (k < tokens.length) {
    const t = tokens[k];
    if (t.startsWith("-")) { k += valueFlags.has(t) ? 2 : 1; continue; }
    return t;
  }
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

// Strip leading `NAME=value` env assignments and leading wrappers (sudo/time/…)
// so the head is the real executable. Returns { exe, args } with exe = the head's
// exact path basename and args = the remaining tokens.
const WRAPPERS = new Set(["sudo", "time", "command", "env", "nice", "nohup", "exec", "xvfb-run"]);
function headExecutable(tokens) {
  let i = 0;
  for (;;) {
    if (i < tokens.length && /^[A-Za-z_]\w*=/.test(tokens[i])) { i += 1; continue; }
    if (i < tokens.length && WRAPPERS.has(basename(tokens[i]))) {
      i += 1;
      while (i < tokens.length && tokens[i].startsWith("-")) i += 1;
      continue;
    }
    break;
  }
  if (i >= tokens.length) return { exe: "", args: [] };
  return { exe: basename(tokens[i]), args: tokens.slice(i + 1) };
}

const TEST_RUNNERS = new Set(["vitest", "jest", "mocha", "ava", "tap", "jasmine", "pytest", "phpunit", "rspec"]);
const LINT_BINS = new Set(["eslint", "tslint", "flake8", "pylint", "standard", "biome", "golangci-lint"]);
const BUILD_BINS = new Set(["tsc", "webpack", "rollup", "esbuild"]);
const NODE_RUNTIMES = new Set(["node", "ts-node", "tsx", "babel-node"]);
// node modes that do NOT execute a script as a test: eval / print / syntax-check.
const NODE_NONRUN = new Set(["-e", "--eval", "-p", "--print", "--check", "-c"]);
const NODE_VALUE_FLAGS = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader", "--conditions", "-C", "--title"]);
const PY_VALUE_FLAGS = new Set(["-W", "-X", "-m"]);
const RUBY_VALUE_FLAGS = new Set(["-I", "-r"]);

// Classify a SINGLE executed segment. Returns a receipt kind or null. Anchors on
// the EXACT executable basename (not a `\b`/substring match) and, for runtimes,
// on the recognized execution FORM and the actual script target — so only a real
// verification RUN mints a receipt.
function segmentKind(segment) {
  const tokens = tokenizeSegment(segment);
  if (tokens.length === 0) return null;
  let { exe, args } = headExecutable(tokens);
  if (!exe) return null;

  // Unwrap `npx <tool>` / `pnpm dlx <tool>` / `yarn dlx <tool>` to the real tool.
  if (exe === "npx") {
    let j = 0;
    while (j < args.length && args[j].startsWith("-")) j += 1; // skip npx flags (-y, --no-install)
    if (j >= args.length) return null;
    exe = basename(args[j]);
    args = args.slice(j + 1);
  } else if ((exe === "pnpm" || exe === "yarn") && args[0] === "dlx") {
    let j = 1;
    while (j < args.length && args[j].startsWith("-")) j += 1;
    if (j >= args.length) return null;
    exe = basename(args[j]);
    args = args.slice(j + 1);
  }

  // An informational/dry-run invocation of any recognized tool ran no verification.
  if (hasInfoFlag(exe, args)) return null;

  // --- dedicated test runners (exact basename) ---
  // A `list` subcommand (`vitest list`) enumerates tests without running them.
  if (TEST_RUNNERS.has(exe)) return firstNonFlag(args) === "list" ? null : "test";

  // --- language runtimes: only a real script/module RUN of a test counts ---
  // Option matching normalizes attached/equal value forms (`-e"code"`,
  // `--eval=code`, `-p"x"`, `-mpytest`) so an inline value cannot hide the flag.
  if (NODE_RUNTIMES.has(exe)) {
    if (args.some((t) => NODE_NONRUN.has(optName(t)))) return null; // eval/print/check ran no test
    const script = firstPositional(args, NODE_VALUE_FLAGS);
    return script && isTestFileToken(script) ? "test" : null;
  }
  if (exe === "python" || exe === "python3") {
    const opts = args.map(optName);
    if (opts.includes("-c")) return null; // inline program, not a test run
    const mIdx = opts.indexOf("-m");
    if (mIdx >= 0) {
      // `-m` value may be attached (`-mpytest`) or the next token (`-m pytest`).
      const mod = args[mIdx].length > 2 ? args[mIdx].slice(2) : args[mIdx + 1];
      return mod === "pytest" || mod === "unittest" ? "test" : null; // py_compile etc → not a test
    }
    const script = firstPositional(args, PY_VALUE_FLAGS);
    return script && isTestFileToken(script) ? "test" : null;
  }
  if (exe === "ruby") {
    const opts = args.map(optName);
    if (opts.includes("-c") || opts.includes("-e")) return null; // syntax-check / inline, not a run
    const script = firstPositional(args, RUBY_VALUE_FLAGS);
    return script && isTestFileToken(script) ? "test" : null;
  }
  if (exe === "deno") {
    return firstNonFlag(args) === "test" ? "test" : null; // `deno fmt`/`deno lint`/… are not test runs
  }
  if (exe === "bun") {
    const sub = firstNonFlag(args);
    if (sub === "test") return "test";
    if (sub === "run") return runScriptKind(args.slice(args.indexOf("run") + 1)); // `bun build` → not a test
    return null;
  }

  // --- package managers (npm/pnpm/yarn): a real `test`/`lint`/`build` script ---
  if (exe === "npm" || exe === "pnpm" || exe === "yarn") {
    const sub = firstNonFlag(args);
    if (!sub) return null;
    if (sub === "run") return runScriptKind(args.slice(args.indexOf("run") + 1));
    return runScriptKind([sub]); // `npm test`, `yarn lint`, `pnpm build`
  }

  // --- lint binaries (exact basename) ---
  if (LINT_BINS.has(exe)) return "lint";
  if (exe === "ruff") return firstNonFlag(args) === "check" ? "lint" : null; // `ruff format` is not lint

  // --- build binaries (exact basename) ---
  if (BUILD_BINS.has(exe)) return "build";
  if (exe === "vite") return firstNonFlag(args) === "build" ? "build" : null;
  if (exe === "make") return "build"; // make --version / -n already rejected above

  // --- go / cargo subcommands ---
  if (exe === "go") {
    const sub = firstNonFlag(args);
    if (sub === "test") return "test";
    if (sub === "build") return "build";
    return null;
  }
  if (exe === "cargo") {
    const sub = firstNonFlag(args);
    if (sub === "test") return "test";
    if (sub === "clippy") return "lint";
    if (sub === "build") return "build";
    return null;
  }

  return null;
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
// run. We report BOTH the receipt kind and whether the Bash tool-result exit
// status authoritatively reflects that run's outcome. The shell reports the exit
// status of the LAST executed command in a list/pipeline, so a verification run
// only "owns" the Bash status when it is the final segment and was not reached
// through `||` (a fallback). Otherwise a trailing `echo`/`tee`/`true`
// (`node x.test.js | tee out`, `... ; echo done`) or a masking `... || true`
// would let a FAILING test render as succeeded — verification laundering by
// status. When a real verification segment ran but does NOT own the final
// status, we still emit a receipt (the run happened) but force status
// "unknown" — never a fabricated success.
//
// Returns { kind, statusAuthoritative } or null when nothing executed a run.
function classifyReceipt(command) {
  // Command substitution / heredocs make it ambiguous what actually executes —
  // emit no receipt rather than misread substituted or heredoc text as a run.
  if (hasAmbiguousShellForm(command)) return null;
  const segs = segmentsWithSep(command);
  if (segs.length === 0) return null;
  const kinds = segs.map((s) => segmentKind(s.text));
  if (!kinds.some(Boolean)) return null; // no segment actually ran a verification

  const lastKind = kinds[kinds.length - 1];
  const lastSep = segs[segs.length - 1].sep;
  const lastBg = segs[segs.length - 1].bg;
  // The final segment owns the Bash exit status. Trust it only when that final
  // segment is itself the verification run, was not reached via `||`, and was not
  // BACKGROUNDED with `&` (a backgrounded run finishes asynchronously and does not
  // own the shell result — `node x.test.js &` / `... & wait` must not launder).
  if (lastKind && lastSep !== "||" && !lastBg) {
    return { kind: lastKind, statusAuthoritative: true };
  }
  // A verification ran earlier but a later (or ||-guarded) segment owns the exit
  // status. Report the last verification segment's kind with an unknown status.
  let i = kinds.length - 1;
  while (i >= 0 && !kinds[i]) i -= 1;
  return { kind: kinds[i], statusAuthoritative: false };
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

  for (const { obj } of records) {
    const type = obj?.type;
    const uuid = obj?.uuid;
    const msg = obj?.message;

    // Only user/assistant message records carry evidence content. Any other
    // record type (queue-operation, attachment, ai-title, mode, system, …) is
    // metadata, not trusted evidence → excluded and counted, never coerced.
    if (type !== "user" && type !== "assistant") {
      if (type) addExclusion(`record_type:${type}`);
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
    const classified = classifyReceipt(ev._command);
    if (!classified) continue;
    const { kind, statusAuthoritative } = classified;
    const command = prepare(ev._command, limits.maxReceiptChars);
    if (command == null) {
      addExclusion("secret_bearing_receipt");
      continue;
    }
    // Honest status: succeeded/failed follow the observed tool_result ONLY when
    // the verification run authoritatively owns the Bash exit status. When the
    // run's outcome is masked by a trailing/`||`-guarded segment (e.g.
    // `node x.test.js | tee out`, `... || true`, `... ; echo done`), the Bash
    // tool-result status reflects that other segment, not the test — so we force
    // "unknown" rather than launder a possibly-failing run into "succeeded".
    // Denied or no-result tools also yield "unknown". We never fabricate an exit
    // code — the transcript does not record the process exit code.
    const status = !statusAuthoritative
      ? "unknown"
      : ev.status === "succeeded"
        ? "succeeded"
        : ev.status === "failed"
          ? "failed"
          : "unknown";
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
    receipts.push(out);
  }

  // Strip internal join keys before emitting.
  for (const ev of toolEvents) {
    delete ev._useId;
    delete ev._command;
  }

  // Observed objective: the first user requirement, else the first selected
  // excerpt of any kind (so sourceId always resolves). A session with zero
  // selectable evidence cannot be explained → fail closed.
  if (excerpts.length === 0) {
    throw new Error("No selectable evidence in session; cannot produce a resolvable objective.");
  }
  const objectiveSource = excerpts.find((e) => e.id === objectiveExcerptId) || excerpts[0];
  const objective = { text: objectiveSource.text, sourceId: objectiveSource.id };

  // changedFiles: drop denied paths defensively and count them.
  let deniedPathCount = 0;
  const changedFiles = [];
  for (const c of args.repository?.changedFiles || []) {
    if (isDeniedPath(c.path)) {
      deniedPathCount += 1;
      addExclusion("denied_changed_file");
      continue;
    }
    changedFiles.push(c);
  }

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
    schemaVersion: BUNDLE_SCHEMA_VERSION,
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
    denied_path_tool: "Tool touched a denied path (.env/credential/key/cache/binary).",
    denied_changed_file: "Changed file is on a denied path.",
    secret_bearing_excerpt: "Excerpt still held a secret after redaction; excluded.",
    secret_bearing_tool_input: "Tool input still held a secret after redaction; excluded.",
    secret_bearing_tool_output: "Tool output still held a secret after redaction; output omitted.",
    secret_bearing_receipt: "Receipt still held a secret after redaction; excluded.",
    orphan_tool_result: "tool_result had no matching tool_use in scope.",
    image_block: "Image content is not textual evidence.",
  };
  return map[kind] || "Excluded from bounded evidence selection.";
}

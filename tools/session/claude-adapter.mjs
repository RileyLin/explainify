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

// STRICT POSITIVE run grammars (PM msg f13c6e9d + Codex msg b584356f): a
// succeeded receipt must mean the claimed verification actually RAN. A
// "recognized binary MINUS a denylist of no-run flags = verification" fallback
// always lags — every freeze drew a new no-run probe that the binary accepted by
// default (`go test -c`, `mocha --dry-run`, `webpack configtest`, `cargo test --
// --list`, `make -p`, `npm test -- --listTests`, `python -m pytest --fixtures`,
// `biome version`, `golangci-lint linters`, `tsc --build --clean`, …). So each
// supported binary is matched against a narrow POSITIVE run form: mint ONLY when
// the parsed invocation is a recognized real execution; leave every unrecognized
// flag, subcommand, or `--` passthrough as a tool event only (no receipt). In
// this phase false negatives are explicitly preferable to fabricated verification.

// Run-compatible flags per family — ALLOWLISTS, not denylists. A flag NOT listed
// makes the whole invocation unrecognized (→ no receipt), so a new no-run flag can
// never slip through by default. Kept intentionally small: only flags that a real
// verification run legitimately carries. optName() normalizes attached/equal forms.
const RUNNER_RUN_SAFE = new Set([
  "-q", "--quiet", "-v", "--verbose", "--ci", "--run", "--runInBand", "-i",
  "--coverage", "--silent", "--color", "--no-color", "--bail", "--watch",
  "-w", "-x", "-k", "-s", "--reporter", "--reporters", "--config", "-c",
  "--maxWorkers", "--forceExit", "-o", "--passWithNoTests", "--shard",
]);
const DENO_TEST_RUN_SAFE = new Set([
  "--allow-read", "--allow-net", "--allow-write", "--allow-env", "--allow-run",
  "--allow-all", "-A", "--allow-sys", "--allow-ffi", "--coverage", "--filter",
  "--parallel", "--no-check", "--reload", "--quiet", "-q", "--jobs", "--doc",
]);
const LINT_RUN_SAFE = new Set([
  "--fix", "--quiet", "-q", "--max-warnings", "--cache", "--no-cache", "--ext",
  "--color", "--no-color", "--format", "-f", "--config", "-c", "--rulesdir",
]);
const TSC_RUN_SAFE = new Set([
  "--noEmit", "--build", "-b", "--project", "-p", "--incremental", "--strict",
  "--pretty", "--outDir", "--declaration", "--sourceMap", "--composite",
  "--watch", "-w", "--force",
]);
const WEBPACK_RUN_SAFE = new Set([
  "--mode", "--config", "-c", "--env", "--progress", "--color", "--no-color",
  "--watch", "-w", "--devtool", "--output-path",
]);
const BUILD_RUN_SAFE = new Set([ // rollup / esbuild
  "--config", "-c", "--bundle", "--outfile", "--outdir", "--minify", "--format",
  "--platform", "--target", "--sourcemap", "--watch", "-w", "-o", "--file",
  "--dir", "--environment",
]);
const GO_TEST_RUN_SAFE = new Set([
  "-run", "-v", "-count", "-race", "-cover", "-covermode", "-coverprofile",
  "-timeout", "-short", "-tags", "-parallel", "-bench", "-benchmem", "-cpu",
  "-failfast", "-shuffle", "-json", "-vet",
]);
const GO_BUILD_RUN_SAFE = new Set([
  "-o", "-v", "-race", "-tags", "-ldflags", "-gcflags", "-mod", "-a",
  "-trimpath", "-buildmode", "-p", "-work",
]);
const CARGO_TEST_RUN_SAFE = new Set([
  "--release", "--all", "--workspace", "--lib", "--bin", "--bins", "--test",
  "--tests", "--features", "--all-features", "--no-default-features", "-p",
  "--package", "-j", "--jobs", "--quiet", "-q", "--verbose", "-v", "--doc",
  "--all-targets", "--target",
]);
const CARGO_BUILD_RUN_SAFE = new Set([
  "--release", "--all", "--workspace", "--lib", "--bin", "--bins", "--features",
  "--all-features", "--no-default-features", "-p", "--package", "-j", "--jobs",
  "--quiet", "-q", "--verbose", "-v", "--target", "--all-targets",
]);
// make: run-safe short-flag CHARACTERS and long flags. Short flags can bundle
// (`-kj4`), and some consume the rest of the cluster as a value (`-j4`, `-C dir`),
// so make needs its own cluster-aware validator (makeFlagsRunSafe). Any flag
// outside these sets (e.g. -n/-q/-t/-p, --just-print, --print-data-base) makes
// the invocation unrecognized → no receipt.
const MAKE_SHORT_RUN_SAFE = new Set(["j", "C", "f", "k", "s", "w", "B", "l", "e", "i", "o", "I", "W", "L"]);
const MAKE_SHORT_VALUE = new Set(["j", "C", "f", "l", "o", "I", "W"]); // consume the rest of the cluster as a value
const MAKE_LONG_RUN_SAFE = new Set([
  "--jobs", "--directory", "--file", "--makefile", "--keep-going", "--silent",
  "--always-make", "--load-average", "--print-directory", "--no-print-directory",
  "--environment-overrides", "--warn-undefined-variables", "--output-sync",
]);
// Bare-word POSITIONAL subcommands that MEAN "run/verify" for a family. A bare
// positional that is not one of these (and is not a pathy target) makes the
// invocation unrecognized — this is what rejects `vitest list`, `biome version`,
// `golangci-lint linters`, `webpack configtest`, `webpack help` without a denylist.
const RUNNER_RUN_KEYWORDS = new Set(["run", "watch", "bench"]);
const LINT_RUN_KEYWORDS = new Set(["run", "check", "lint", "ci"]);
const WEBPACK_RUN_KEYWORDS = new Set(["build", "watch", "bundle"]);
const EMPTY_SET = new Set();

// Linters that lint file/dir TARGETS directly, with no run subcommand.
const LINT_TARGET_BINS = new Set(["eslint", "tslint", "flake8", "pylint", "standard"]);

// Value-taking flags per family: a SEPARATE value token (`--reporter json`) is
// consumed so it is not mistaken for a bare-word non-run subcommand.
const RUNNER_VALUE_FLAGS = new Set(["--reporter", "--reporters", "--config", "-c", "--maxWorkers", "--shard", "-o", "-k", "-s"]);
const LINT_VALUE_FLAGS = new Set(["--format", "-f", "--config", "-c", "--ext", "--max-warnings", "--rulesdir"]);
const TSC_VALUE_FLAGS = new Set(["--project", "-p", "--outDir"]);
const WEBPACK_VALUE_FLAGS = new Set(["--mode", "--config", "-c", "--devtool", "--output-path"]);
const BUILD_VALUE_FLAGS = new Set(["--config", "-c", "--outfile", "--outdir", "--format", "--platform", "--target", "-o", "--file", "--dir", "--environment"]);

// A positional that looks like a file/dir/glob TARGET (contains `/`, `.`, or `*`,
// or is the cwd `.`/`..`) rather than a bare-word subcommand. Test files
// (`paginate.test.js`) and target dirs (`src/`, `./...`, `tests/`) are targets; a
// bare word (`list`, `version`, `configtest`) is a subcommand to be validated.
function isTargetPositional(token) {
  const t = String(token);
  return t.includes("/") || t.includes(".") || t.includes("*");
}

// STRICT POSITIVE run validator shared by the runner/lint/build grammars. Mints
// (returns true) ONLY when the invocation is a recognized real run: no `--`
// passthrough carrying tokens; EVERY flag's option name is in `flags`; and every
// bare-word POSITIONAL (not a pathy target, not a value consumed by a value-taking
// flag) is an allowed run KEYWORD. Any unrecognized flag or subcommand → false, so
// a new no-run mode can never pass by default (false negatives preferred).
function strictRun(args, { flags, keywords = EMPTY_SET, valueFlags = EMPTY_SET }) {
  if (hasPassthroughTokens(args)) return false;
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (t === "--") break;
    if (t.startsWith("-")) {
      const opt = optName(t);
      if (!flags.has(opt)) return false;
      // A value-taking flag with a SEPARATE value (`--config x`, `-k expr`) consumes
      // the next token so it is not read as a bare-word subcommand. An attached value
      // (`--config=x`, `-kexpr`) is self-contained and consumes nothing.
      const attached = t.includes("=") || (!t.startsWith("--") && t.length > 2);
      if (valueFlags.has(opt) && !attached) k += 1;
      continue;
    }
    if (isTargetPositional(t)) continue; // a file/dir/glob target
    if (!keywords.has(t)) return false; // a bare-word non-run subcommand
  }
  return true;
}

// Every FLAG token's option name is in `allowed`; a flag outside it (or a `--`
// passthrough) makes the invocation unrecognized. Positionals (targets, patterns,
// flag values) are ignored here. Stops at a standalone `--` (passthrough is
// handled separately by hasPassthroughTokens).
function flagsAllowed(args, allowed) {
  for (const t of args) {
    if (t === "--") break;
    const opt = optName(t);
    if (opt && !allowed.has(opt)) return false;
  }
  return true;
}

// Go variant: Go uses single-dash long flags (`-run`, `-list`), so goFlag() (not
// optName) parses them.
function goFlagsAllowed(args, allowed) {
  for (const t of args) {
    if (t === "--") break;
    const opt = goFlag(t);
    if (opt && !allowed.has(opt)) return false;
  }
  return true;
}

// A standalone `--` separator followed by at least one token: an argument
// passthrough whose content we do not interpret. `npm test -- --listTests`,
// `cargo test -- --list` carry no-run modes into the passthrough, so a passthrough
// carrying tokens conservatively yields no receipt (a real filtered run like
// `npm test -- rate-limiter` becomes a false negative, which this phase prefers).
function hasPassthroughTokens(args) {
  const i = args.indexOf("--");
  return i >= 0 && i < args.length - 1;
}

// make short-flag clusters are run-safe: every character is a run-safe short flag,
// except a value-taking short (`-j4`, `-Cdir`) whose remainder is a value and ends
// the cluster. A no-run short (n/q/t/p/d) anywhere makes the cluster unrecognized.
function makeFlagsRunSafe(args) {
  for (const t of args) {
    if (t === "--") break;
    if (!t.startsWith("-")) continue; // positional target (recipe name)
    if (t.startsWith("--")) {
      const opt = optName(t);
      if (!MAKE_LONG_RUN_SAFE.has(opt)) return false;
      continue;
    }
    // short-flag cluster: `-kj4` → k, then j consumes "4"
    for (let c = 1; c < t.length; c += 1) {
      const ch = t[c];
      if (MAKE_SHORT_VALUE.has(ch)) break; // rest of the token is this flag's value
      if (!MAKE_SHORT_RUN_SAFE.has(ch)) return false;
    }
  }
  return true;
}

// The option NAME of a Go-style single-dash long flag (`-list`, `-run`, `-c`),
// splitting an attached value (`-list=.` → `-list`). optName() cannot parse
// these — it would read `-list` as the short option `-l`. Used only in the go
// branch, where flags are single-dash long by convention.
function goFlag(token) {
  const t = String(token);
  if (!t.startsWith("-")) return null;
  const eq = t.indexOf("=");
  return eq >= 0 ? t.slice(0, eq) : t;
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

  // Every branch below is a STRICT POSITIVE run grammar: it mints ONLY when the
  // parsed invocation matches a recognized real-execution form for that exact
  // binary. There is no "recognized binary MINUS a denylist = verification"
  // fallback — an unrecognized flag, subcommand, or `--` passthrough carrying
  // tokens leaves the command a tool event with no receipt (false negatives are
  // preferred this phase over fabricated verification).

  // --- dedicated test runners (exact basename): a real run form only ---
  // Mints only when every flag is run-compatible and every bare positional is a
  // target or a run keyword. Rejects `vitest list`, `jest --listTests`,
  // `pytest --collect-only/--fixtures/--markers`, `mocha --dry-run`,
  // `rspec --dry-run`, `phpunit --list-tests`, `--help`/`--version`, etc.
  if (TEST_RUNNERS.has(exe)) {
    return strictRun(args, { flags: RUNNER_RUN_SAFE, keywords: RUNNER_RUN_KEYWORDS, valueFlags: RUNNER_VALUE_FLAGS }) ? "test" : null;
  }

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
      const attached = args[mIdx].length > 2;
      const mod = attached ? args[mIdx].slice(2) : args[mIdx + 1];
      if (mod !== "pytest" && mod !== "unittest") return null; // py_compile etc → not a test
      // The args AFTER the module are the runner's own args — a real run form only
      // (rejects `python -m pytest --fixtures`, `python -mpytest --collect-only`).
      const runnerArgs = attached ? args.slice(mIdx + 1) : args.slice(mIdx + 2);
      return strictRun(runnerArgs, { flags: RUNNER_RUN_SAFE, keywords: RUNNER_RUN_KEYWORDS, valueFlags: RUNNER_VALUE_FLAGS }) ? "test" : null;
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
    // Only `deno test` with run-compatible flags; `deno fmt`/`lint`/`--help` → null.
    if (firstNonFlag(args) !== "test") return null;
    return flagsAllowed(args, DENO_TEST_RUN_SAFE) && !hasPassthroughTokens(args) ? "test" : null;
  }
  if (exe === "bun") {
    const sub = firstNonFlag(args);
    if (sub === "test") return flagsAllowed(args, RUNNER_RUN_SAFE) && !hasPassthroughTokens(args) ? "test" : null;
    if (sub === "run") return runScriptKind(args.slice(args.indexOf("run") + 1)); // `bun build` → not a test
    return null;
  }

  // --- package managers (npm/pnpm/yarn): a real `test`/`lint`/`build` script ---
  if (exe === "npm" || exe === "pnpm" || exe === "yarn") {
    // A `--` passthrough carrying tokens can smuggle a no-run mode into the script
    // (`npm test -- --listTests`), so it yields no receipt. `--if-present` exits
    // zero when the script is absent, so a succeeded status does not prove the
    // verification ran.
    if (hasPassthroughTokens(args)) return null;
    if (args.some((t) => optName(t) === "--if-present")) return null;
    const sub = firstNonFlag(args);
    if (!sub) return null;
    if (sub === "run") return runScriptKind(args.slice(args.indexOf("run") + 1));
    return runScriptKind([sub]); // `npm test`, `yarn lint`, `pnpm build`
  }

  // --- linters that lint TARGETS directly (no subcommand) ---
  // A real run form only: run-compatible flags + file/dir targets. Rejects
  // `eslint --env-info/--print-config/--init`, `tslint --init`,
  // `flake8 --bug-report`, `pylint --generate-rcfile`, `--help`/`--version`.
  if (LINT_TARGET_BINS.has(exe)) {
    return strictRun(args, { flags: LINT_RUN_SAFE, valueFlags: LINT_VALUE_FLAGS }) ? "lint" : null;
  }
  if (exe === "ruff") return firstNonFlag(args) === "check" ? "lint" : null; // `ruff format`/`ruff --version` are not lint
  if (exe === "biome") {
    const sub = firstNonFlag(args); // `biome check`/`lint`/`ci` lint; `biome version`/`format` do not
    return sub && LINT_RUN_KEYWORDS.has(sub) ? "lint" : null;
  }
  if (exe === "golangci-lint") {
    return firstNonFlag(args) === "run" ? "lint" : null; // `golangci-lint linters`/`version`/`help` → null
  }

  // --- build binaries (exact basename): a real compile form only ---
  if (exe === "tsc") {
    // A real type-check/compile: run-compatible flags only. Rejects `tsc --init`,
    // `--showConfig`, `--listFilesOnly`, `--build --clean`, `--build --dry`,
    // `--version`, `--help` (none are in TSC_RUN_SAFE).
    return strictRun(args, { flags: TSC_RUN_SAFE, valueFlags: TSC_VALUE_FLAGS }) ? "build" : null;
  }
  if (exe === "webpack") {
    // A real bundle: run-compatible flags + optional build keyword. Rejects
    // `webpack configtest`, `webpack help`, `webpack --configtest x`.
    return strictRun(args, { flags: WEBPACK_RUN_SAFE, keywords: WEBPACK_RUN_KEYWORDS, valueFlags: WEBPACK_VALUE_FLAGS }) ? "build" : null;
  }
  if (exe === "rollup" || exe === "esbuild") {
    return strictRun(args, { flags: BUILD_RUN_SAFE, valueFlags: BUILD_VALUE_FLAGS }) ? "build" : null;
  }
  if (exe === "vite") return firstNonFlag(args) === "build" ? "build" : null;
  if (exe === "make") {
    // A recipe-executing invocation only. make's query/print/dry modes execute no
    // recipe and must mint nothing: `-q`/`--question`, `-t`/`--touch`,
    // `-n`/`--just-print`, `-p`/`--print-data-base`, `-d`, and bundled clusters
    // carrying any of them. makeFlagsRunSafe is cluster-aware (`-kj4` is run-safe).
    return makeFlagsRunSafe(args) && !hasPassthroughTokens(args) ? "build" : null;
  }

  // --- go / cargo subcommands: a real run form only ---
  if (exe === "go") {
    const sub = firstNonFlag(args);
    // `go test` runs tests, but only with run-compatible flags. Go uses single-dash
    // long flags, so goFlag()/goFlagsAllowed parse them. Rejects `go test -c`
    // (compiles a binary, runs nothing), `go test -list` (enumerates only).
    if (sub === "test") return goFlagsAllowed(args, GO_TEST_RUN_SAFE) ? "test" : null;
    if (sub === "build") return goFlagsAllowed(args, GO_BUILD_RUN_SAFE) ? "build" : null;
    return null;
  }
  if (exe === "cargo") {
    const sub = firstNonFlag(args);
    // `cargo test` runs tests, but `--no-run` compiles without running and a `--`
    // passthrough can smuggle `-- --list` (list mode). Run-compatible flags only.
    if (sub === "test") {
      return flagsAllowed(args, CARGO_TEST_RUN_SAFE) && !hasPassthroughTokens(args) ? "test" : null;
    }
    if (sub === "clippy") return flagsAllowed(args, CARGO_TEST_RUN_SAFE) ? "lint" : null;
    if (sub === "build") return flagsAllowed(args, CARGO_BUILD_RUN_SAFE) ? "build" : null;
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

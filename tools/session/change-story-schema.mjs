// ChangeStory — the v2 (Phase 1E) narration/topology layer that lives in the
// session PACKAGE, built by synthesis from a validated v2 SessionEvidenceBundle.
//
// The bundle is the attested EVIDENCE (excerpts, tool events, receipts, and the
// hash-bound codeEvidence CodeExcerpts). The ChangeStory never invents evidence:
// every node, edge, step field, code change, and verification carries an
// EvidenceRef back to a bundle source, and `assertChangeStory` re-resolves each
// ref against the bundle and recomputes its canonical hash. A dangling ref, a
// tampered hash, an unsupported edge type, or a code change that does not match
// the bundle's CodeExcerpt byte-for-byte fails closed — exactly like assertBundle.
//
// Dependency-free except for the canonical hashers it shares with bundle-schema,
// so producer (synthesis) and consumer (renderer / any future web view) cannot
// disagree on what a hash covers.

import { createHash } from "node:crypto";
import {
  hashExcerpt,
  hashToolInput,
  hashToolOutput,
  hashReceipt,
  hashCodeExcerpt,
} from "./bundle-schema.mjs";
import { stableStringify } from "./receipt.mjs";

export const CHANGE_STORY_SCHEMA_VERSION = 2;

// Phase 1F semantic-compaction bound (task #39): the overview may present at most
// this many evidence-backed implementation/verification step nodes. Framing nodes
// (objective, outcome) and a surfaced risk/unknown node do not count. This is a
// tamper-evident CONTRACT, not just a builder preference: a rehashed story that
// inflates the overview past the cap fails closed here. The builder imports this
// same constant so producer and validator cannot disagree on the bound.
export const MAX_OVERVIEW_STEPS = 5;

// Semantic evidence view (R4) — what the topology MEANS.
export const VIEW_TYPES = ["workflow", "architecture", "sequence", "dataflow", "lifecycle"];
// Layout engine only (R4) — reused vocabulary from the web app's flow.ts.
export const RENDER_HINTS = ["sequential", "graph", "hierarchy"];
export const NODE_KINDS = ["objective", "step", "verification", "outcome", "unknown"];
// observed_sequence is the ONLY edge derivable-as-fact from the capture (R4): it
// asserts that two step nodes are adjacent in the bundle's attested observedOrder.
// "derived" connects the objective/outcome framing nodes to the observed steps —
// those are synthesis framing, NOT a proven transition, so they are always
// inferred, never observed. Under the Phase 1F contract (task #39 gate 5, task #40
// REVISE finding #4) the inferred cross-file causal kinds caused_by/architecture/
// dataflow are NOT permitted at all: this builder never infers a cross-file
// relationship, so those kinds are dropped from the enum and any story naming one
// fails closed at the kind check. Only two kinds survive: the provable
// observed_sequence (step↔step) and the framing-only derived edge.
export const EDGE_KINDS = ["observed_sequence", "derived"];
export const RELATIONSHIP_STATUSES = ["observed", "inferred", "unknown"];
export const INTENT_STATUSES = ["observed", "inferred"];

// EvidenceRef: a compact pointer from a story element back to a bundle source,
// carrying the source's canonical hash so the ref can be re-verified.
//   type ∈ excerpt | tool_input | tool_output | receipt | code_excerpt
//   ref  = the bundle item's id
//   sha256 = the item's canonical hash at story-build time
export const EVIDENCE_REF_TYPES = ["excerpt", "tool_input", "tool_output", "receipt", "code_excerpt"];

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const HEX64 = /^[0-9a-f]{64}$/;

// The exact bounded output slice the builder surfaces for a verification block. A
// verification's outputExcerpt must equal source.slice(0, VERIFY_OUTPUT_MAX)
// byte-for-byte (task #40 REVISE finding #3): no empty-string, prefix, or truncated
// substitute is accepted. The builder imports this constant so producer and
// validator cannot disagree on the canonical slice.
export const VERIFY_OUTPUT_MAX = 300;

// --------------------------------------------------------------------------
// Overview-node label fitting (task #50 REVISE — PM/codex readability finding).
// The overview SVG draws each label as a single <text> line inside a fixed
// node box. The old renderer truncated by CHARACTER COUNT (label.slice(0,43)),
// which is font-unaware: 44 chars of bold 13px can still exceed the box under
// any real font (PM measured +36.08 / +12.75 user-space units, clipped mid-word
// at 320px and desktop). This is the SINGLE deterministic treatment shared by
// the renderer (to emit) and any check (to reproduce the exact drawn string),
// so producer and validator cannot disagree on what the box shows.
//
// Geometry (must match renderOverviewSvg): the label starts at x = NLABEL_X
// inside a NODE_W-wide box, so the horizontal budget is NODE_W - NLABEL_X - pad.
// We bound the STRING to a deterministic max advance using a conservative
// per-glyph width for the 13px semibold face, then the renderer ALSO pins the
// physical draw width with SVG textLength + lengthAdjust so the browser cannot
// paint past the budget regardless of which font actually loads.
export const OVERVIEW_NODE_W = 320; // node box width (user units) — matches renderer
export const OVERVIEW_NLABEL_X = 14; // label left inset inside the box
export const OVERVIEW_LABEL_PAD = 14; // right inset so glyphs never touch the edge
// Max physical advance (user units) the label text may occupy.
export const OVERVIEW_LABEL_MAX_ADVANCE = OVERVIEW_NODE_W - OVERVIEW_NLABEL_X - OVERVIEW_LABEL_PAD; // 292
export const OVERVIEW_ELLIPSIS = "…";

// A single flat average (the old 8.4/glyph) is NOT an advance bound: task #51
// showed "W"×34 slipping through the "fits, render natural" branch because W
// actually advances ~14.34px at this face, not 8.4. The fit DECISION must use a
// per-glyph UPPER BOUND, never an average. This table is the measured advance
// (getComputedTextLength ÷ n) of each printable ASCII glyph at the overview label
// face — 13px / weight 600, font stack Inter,ui-sans-serif,system-ui — in the
// same headless Chromium the reviewers use (scripts/glyph-table-probe.mjs).
// Index = codePoint - 0x20 (0x20 SPACE first). Advance ≥ ink getBBox width, and
// the reviewer gate measures ink getBBox, so an advance-based estimate is a
// strictly safe upper bound on the drawn box width.
export const OVERVIEW_GLYPH_ADVANCE = [
  0, 5.929, 6.773, 10.893, 9.045, 13.025, 11.337, 3.98, 5.941, 5.941, 6.798,
  10.893, 4.939, 5.396, 4.939, 4.748, 9.045, 9.045, 9.045, 9.045, 9.045, 9.045,
  9.045, 9.045, 9.045, 9.045, 5.199, 5.199, 10.893, 10.893, 10.893, 7.541, 13,
  10.061, 9.909, 9.541, 10.791, 8.88, 8.88, 10.67, 10.88, 4.837, 4.837, 10.074,
  8.284, 12.937, 10.88, 11.051, 9.528, 11.051, 10.01, 8.793, 9.159, 10.556,
  10.061, 14.339, 10.023, 9.414, 9.426, 5.941, 4.748, 5.941, 10.893, 6.5, 6.5,
  8.773, 9.306, 7.706, 9.306, 8.817, 5.265, 9.306, 9.255, 4.456, 4.456, 8.646,
  4.456, 13.546, 9.255, 8.931, 9.306, 9.306, 6.411, 7.738, 6.214, 9.255, 8.474,
  12.01, 8.385, 8.474, 7.566, 9.255, 4.748, 9.255, 10.893,
];
// Any code point outside the measured ASCII range (accents, CJK, emoji, symbols,
// the ellipsis itself) is charged this conservative constant. It is ≥ the widest
// single glyph we ever observed (ASCII "W" 14.339; emoji "😀" 13.546; CJK ~7.8),
// so a non-ASCII glyph can never advance more than we budget for it. This may
// slightly over-truncate very wide scripts, which is safe (fits) — never unsafe.
export const OVERVIEW_GLYPH_FALLBACK = 14.5;
// Applied to every estimate so sub-pixel hinting / minor font-metric drift across
// Chromium builds cannot push a "fits" label past the real budget.
export const OVERVIEW_GLYPH_SAFETY = 1.02;

// Upper-bound advance (user units) of one code point at the overview label face.
function glyphAdvance(cp) {
  if (cp >= 0x20 && cp <= 0x7e) return OVERVIEW_GLYPH_ADVANCE[cp - 0x20];
  return OVERVIEW_GLYPH_FALLBACK;
}

// Upper-bound advance of a whole string. Deterministic (pure arithmetic on code
// points), so renderer and validator/test compute byte-identical results.
export function overviewLabelAdvance(text) {
  let total = 0;
  for (const ch of String(text)) total += glyphAdvance(ch.codePointAt(0));
  return total * OVERVIEW_GLYPH_SAFETY;
}

// Return the exact string the overview will DRAW for a node label: the full label
// when its UPPER-BOUND advance fits the budget, else the longest prefix whose
// upper-bound advance (plus the ellipsis) still fits, with the ellipsis appended.
// Because the fit test is an upper bound, a returned full (untruncated) label is
// guaranteed to draw inside the budget; a returned truncated label is additionally
// hard-pinned by the renderer via SVG textLength so it physically cannot exceed
// the budget under any font at all.
export function fitOverviewLabel(label) {
  const text = String(label);
  const budget = OVERVIEW_LABEL_MAX_ADVANCE;
  if (overviewLabelAdvance(text) <= budget) return text;
  const chars = Array.from(text); // code points, so multibyte glyphs count as one
  const ellipsisAdvance = glyphAdvance(OVERVIEW_ELLIPSIS.codePointAt(0)) * OVERVIEW_GLYPH_SAFETY;
  const contentBudget = budget - ellipsisAdvance;
  let used = 0;
  let n = 0;
  for (const ch of chars) {
    const w = glyphAdvance(ch.codePointAt(0)) * OVERVIEW_GLYPH_SAFETY;
    if (used + w > contentBudget) break;
    used += w;
    n++;
  }
  n = Math.max(1, n); // always keep at least one content glyph
  return chars.slice(0, n).join("") + OVERVIEW_ELLIPSIS;
}

// --------------------------------------------------------------------------
// Quote-aware TOP-LEVEL shell safety for verification promotion (task #40 REVISE
// finding #1). A bare Bash event may be surfaced as a verification ONLY when its
// command is a SINGLE, unconditional, foreground run of a recognized test runner.
// An allowed-runner *prefix* is not enough: `node --test x.test.js || cat stale.log`
// (status succeeded, stale "pass 99/99" output) would otherwise launder a fake
// green. These helpers mirror the frozen Phase 1C adapter's quote-aware parser
// (stripComments / segmentsWithSep / tokenizeSegment / ambiguous-form guard) so the
// trust decision here matches the capture layer; replicated (not imported) to keep
// the frozen capture boundary untouched.
// --------------------------------------------------------------------------

function stripShellComments(command) {
  const src = String(command);
  let out = "";
  let quote = null;
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
      if (atWordStart) { while (i < src.length && src[i] !== "\n") i += 1; if (i < src.length) out += "\n"; continue; }
    }
    out += c;
  }
  return out;
}

function shellSegments(command) {
  const src = String(command);
  const parts = [];
  let start = 0;
  let prevSep = "";
  let quote = null;
  const push = (endIndex, nextSep, bg = false) => {
    parts.push({ sep: prevSep, text: src.slice(start, endIndex).trim(), bg });
    prevSep = nextSep;
    start = endIndex;
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote === "'") { if (c === "'") quote = null; continue; }
    if (quote === '"') { if (c === "\\") { i += 1; continue; } if (c === '"') quote = null; continue; }
    if (c === "\\") { i += 1; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "&" && src[i + 1] === "&") { push(i, "&&"); start = i + 2; i += 1; continue; }
    if (c === "|" && src[i + 1] === "|") { push(i, "||"); start = i + 2; i += 1; continue; }
    if (c === "|") { push(i, "|"); start = i + 1; continue; }
    if (c === ";") { push(i, ";"); start = i + 1; continue; }
    if (c === "\n") { push(i, ";"); start = i + 1; continue; }
    if (c === "&") {
      const next = src[i + 1];
      const prev = src[i - 1];
      const isRedirection = next === ">" || prev === ">" || prev === "<";
      if (!isRedirection) { push(i, "&", true); start = i + 1; continue; }
    }
  }
  parts.push({ sep: prevSep, text: src.slice(start).trim(), bg: false });
  // NOTE: raw parts are returned UNFILTERED (empty segments kept). A dangling
  // top-level separator (`node --test &&`, `node --test ;`, `node --test |`,
  // trailing newline) produces a trailing empty segment; the verification-grammar
  // caller must see it and reject, so it must not be silently filtered away here
  // (task #39 / task #43 finding: dangling separators before empty filtering).
  return parts;
}

function shellTokens(segment) {
  const src = String(segment);
  const tokens = [];
  let cur = "";
  let has = false;
  let quote = null;
  const flush = () => { if (has) tokens.push(cur); cur = ""; has = false; };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote === "'") { if (c === "'") quote = null; else cur += c; has = true; continue; }
    if (quote === '"') {
      if (c === "\\") { const n = src[i + 1]; if (n !== undefined) { cur += n; i += 1; } has = true; continue; }
      if (c === '"') quote = null; else cur += c;
      has = true; continue;
    }
    if (c === "\\") { const n = src[i + 1]; if (n !== undefined) { cur += n; i += 1; has = true; } continue; }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === " " || c === "\t") { flush(); continue; }
    cur += c; has = true;
  }
  flush();
  return tokens;
}

function hasAmbiguousShellForm(command) {
  const s = String(command);
  if (s.includes("`")) return true;      // backtick command substitution
  if (/\$\(/.test(s)) return true;        // $(…) command substitution
  if (/<<-?\s*['"]?[\w.-]+/.test(s)) return true; // heredoc
  return false;
}

const shellBasename = (t) => String(t).split("/").pop();
function shellOptName(token) {
  const t = String(token);
  if (!t.startsWith("-")) return null;
  if (t === "-" || t === "--") return t;
  if (t.startsWith("--")) { const eq = t.indexOf("="); return eq >= 0 ? t.slice(0, eq) : t; }
  return t.slice(0, 2);
}
// NARROW VERIFICATION GRAMMAR (task #43 REVISE, PM msg ba024d69). The earlier
// per-family grammar kept leaking edge cases (wrapper binaries `c8`/`nyc` that
// launch an arbitrary command, `vitest list`/`npx vitest list` no-run subcommands,
// dangling `node --test &&`). The directive: STOP expanding runner support. Mirror
// ONLY the two already-audited Phase 1C direct forms the real dogfood evidence
// uses — a direct `*.test.*` file run by a node runtime, and an `npm`/`pnpm`/`yarn`
// verification SCRIPT — plus the literal-head single-segment `node --test` this
// session needs. Everything else (bare runners incl. vitest/jest/mocha/ava/tap,
// wrappers c8/nyc, npx/dlx launchers, slash/path heads, positional runner
// subcommands, env-assignment prefixes) is intentionally UNSUPPORTED and can never
// mint or validate a verification. False negatives are preferred over any laundered
// verification. This mirrors tools/session/claude-adapter.mjs (frozen capture
// boundary) rather than importing it, to keep that module pristine.
const NODE_RUNTIMES = new Set(["node", "ts-node", "tsx", "babel-node"]);
// The ONLY node runtime flags a real direct test-file / `--test` run legitimately
// carries. A flag NOT here — -e/--eval/-p/--print/--check/-c, --version/--help,
// --dry-run, --list*, any unknown flag — makes the invocation unrecognized.
const NODE_RUN_SAFE = new Set([
  "-r", "--require", "--import", "--loader", "--experimental-loader",
  "--experimental-vm-modules", "--conditions", "-C", "--test",
]);
// node run-flags consuming a SEPARATE value token (so the value is not mistaken for
// the executed script). An attached form (`--require=x`, `-Cdir`) consumes nothing.
const NODE_VALUE_FLAGS = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader", "--conditions", "-C"]);
const VERIFY_SCRIPTS = new Set(["test", "lint", "build", "typecheck", "compile"]);
function isTestFileToken(token) {
  const base = shellBasename(token);
  return /^[\w@.-]*[._-](?:test|spec)\.(?:c|m)?[jt]sx?$/i.test(base)
    || /^[\w@.-]*[._-](?:test|spec)\.(?:py|rb|go)$/i.test(base);
}
const hasPassthroughTokens = (args) => { const i = args.indexOf("--"); return i >= 0 && i < args.length - 1; };
const firstNonFlag = (tokens) => { for (const t of tokens) if (!t.startsWith("-")) return t; return null; };
// Redirection operators are not script positionals. `node --test 2>&1` (the real
// dogfood verification) carries `2>&1`; without stripping it the positional walk
// would misread it as the executed target. Attached form (`2>&1`, `>out`, `&>log`)
// is one token; a bare operator (`2>`, `>`, `>>`, `<`, `&>`) consumes the next token
// as its target. Redirections never change WHICH runner executes, so dropping them
// is safe and keeps the grammar anchored on the real head + script target.
const REDIR_ATTACHED = /^(?:&|\d*)(?:>>|>|<).+/;   // operator with attached target
const REDIR_BARE = /^(?:&|\d*)(?:>>|>|<)$/;         // bare operator; target is next token
function stripRedirections(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (REDIR_BARE.test(t)) { i += 1; continue; }  // skip operator + its separate target
    if (REDIR_ATTACHED.test(t)) continue;           // operator with attached target
    out.push(t);
  }
  return out;
}

// A direct test-file run OR `node --test` by a node runtime. Mints ONLY when every
// flag is NODE_RUN_SAFE, there is no `--` passthrough carrying tokens, and either
// `--test` is present or the first positional is a test file. Rejects eval/print/
// check/version/help/list modes, unknown flags, and a run with no test target.
function nodeRun(args) {
  if (hasPassthroughTokens(args)) return false;
  let sawTest = false;
  let k = 0;
  while (k < args.length) {
    const t = args[k];
    if (t === "--") break;
    if (t.startsWith("-")) {
      const opt = shellOptName(t);
      if (!NODE_RUN_SAFE.has(opt)) return false; // eval/print/check/version/list/unknown
      if (opt === "--test") sawTest = true;
      const attached = t.includes("=") || (!t.startsWith("--") && t.length > 2);
      if (NODE_VALUE_FLAGS.has(opt) && !attached) k += 1; // skip its separate value
      k += 1;
      continue;
    }
    // First positional: the executed test file, or nothing mints.
    return isTestFileToken(t);
  }
  return sawTest; // `node --test` with no positional is the built-in runner
}

// An `npm`/`pnpm`/`yarn` verification SCRIPT. Mints ONLY for `<pm> <verify-script>`
// or `<pm> run <verify-script>` with NO flags, NO `--` passthrough, NO `dlx`. Any
// flag (`npm test --help`/`--coverage`/`--version`), passthrough, or `pnpm dlx`
// yields nothing. `bun` is NOT accepted (Phase 1C supports only npm/pnpm/yarn).
function pkgScriptKind(args) {
  if (args[0] === "dlx") return false; // pnpm/yarn dlx launches an arbitrary tool
  if (hasPassthroughTokens(args)) return false;
  for (const t of args) { if (t === "--") break; if (t.startsWith("-")) return false; }
  const sub = firstNonFlag(args);
  if (!sub) return false;
  const name = sub === "run" ? firstNonFlag(args.slice(args.indexOf("run") + 1)) : sub;
  return VERIFY_SCRIPTS.has(name);
}

// Classify a SINGLE executed segment's tokens. Anchors on the EXACT executable
// basename (literal head token — NO wrapper/env-prefix stripping, NO launcher
// unwrap) and accepts ONLY the two supported evidence forms.
function isRunnerTokens(tokens0) {
  const tokens = stripRedirections(tokens0);
  if (!tokens.length) return false;
  // Literal head only: a slash/path head (`/tmp/node --test`, `./node`) is an
  // arbitrary binary that merely shares a runner's basename — reject it (task #43).
  if (tokens[0].includes("/")) return false;
  const exe = tokens[0];
  const args = tokens.slice(1);
  if (!exe) return false;
  if (NODE_RUNTIMES.has(exe)) return nodeRun(args);
  if (exe === "npm" || exe === "pnpm" || exe === "yarn") return pkgScriptKind(args);
  return false; // every other head (vitest/jest/c8/nyc/npx/slash-path/…): unsupported
}

// A Bash command is verification evidence ONLY when it is a single, unconditional,
// foreground run of one of the two audited runner forms. Compounds/pipes/separators
// (`||`, `&&`, `|`, `;`, newline) — INCLUDING a dangling trailing separator —
// backgrounding (`&`), command substitution, heredocs, comments hiding a separator,
// info/no-run flags, and wrapper/launcher heads all disqualify it, so a
// status-masking or laundered command can never mint or validate a verification.
export function isVerificationCommand(rawCommand) {
  const command = stripShellComments(String(rawCommand ?? ""));
  if (!command.trim()) return false;
  if (hasAmbiguousShellForm(command)) return false;
  const segs = shellSegments(command); // UNFILTERED: dangling separators stay visible
  // Exactly one segment total, and it must be non-empty. A dangling top-level
  // separator (`node --test &&`, `node --test ;`, `node --test |`, trailing
  // newline) yields >1 raw segment (one empty), so it is rejected here.
  if (segs.length !== 1) return false;
  const seg = segs[0];
  if (!seg || !seg.text) return false;
  if (seg.bg || seg.sep !== "") return false; // backgrounded or non-leading segment
  return isRunnerTokens(shellTokens(seg.text));
}

// --- allowed key sets, for strict unknown-field rejection (Codex blocker #3) ---
//
// The ChangeStory hash (canonicalChangeStory) binds only KNOWN semantic fields.
// Without exact key enforcement, an attacker could add an UNhashed field carrying
// accepted semantics (e.g. steps[0].intent.injectedClaim) and still pass. Every
// object level in the IR is validated against these allow-lists so no field
// outside the hashed surface is accepted.
const STORY_KEYS = {
  story: ["schemaVersion", "objective", "outcome", "overview", "steps", "evidenceDrawer", "provenance"],
  claim: ["text", "status", "evidence"],
  overview: ["viewType", "renderHint", "nodes", "edges"],
  node: ["id", "kind", "label", "stepId", "evidence"],
  edge: ["from", "to", "kind", "relationshipStatus", "label", "evidence"],
  step: ["id", "title", "intent", "toolActivity", "codeChange", "verification", "outcome", "unknowns"],
  toolActivity: ["toolName", "status", "summary", "evidence"],
  // codeChange entries are inline CodeExcerpts, bound by their own hash; enforce
  // the same key surface the bundle CodeExcerpt uses so no extra field rides along.
  codeChange: ["id", "toolEventId", "path", "changeStatus", "kind", "completeness", "before", "after", "symbol", "codeLocator", "transcriptLocator", "finalContentSha256", "unknownReason", "sha256"],
  verification: ["command", "status", "exitCode", "outputExcerpt", "evidence"],
  unknown: ["text", "reason"],
  evidenceRef: ["type", "ref", "sha256"],
  drawer: ["quotes", "excludedCounts"],
  quote: ["id", "kind", "role", "text", "locator", "sha256"],
  excludedCount: ["kind", "count", "reason"],
  provenance: ["bundleSha256", "changeStorySha256"],
};

// --- canonical serializations (positional arrays, deterministic order) ---

function canonicalEvidenceRef(e) {
  return [e?.type ?? "", e?.ref ?? "", e?.sha256 ?? ""];
}
function canonicalRefs(list) {
  return Array.isArray(list) ? list.map(canonicalEvidenceRef) : [];
}
function canonicalClaim(c) {
  // objective/outcome/intent/step-outcome share a { text, status?, evidence[] } shape.
  return [c?.text ?? "", c?.status ?? "", canonicalRefs(c?.evidence)];
}
function canonicalNode(n) {
  return ["node", n?.id ?? "", n?.kind ?? "", n?.label ?? "", n?.stepId ?? "", canonicalRefs(n?.evidence)];
}
function canonicalEdge(e) {
  return ["edge", e?.from ?? "", e?.to ?? "", e?.kind ?? "", e?.relationshipStatus ?? "", e?.label ?? "", canonicalRefs(e?.evidence)];
}
function canonicalToolActivity(a) {
  return ["tool_activity", a?.toolName ?? "", a?.status ?? "", a?.summary ?? "", canonicalRefs(a?.evidence)];
}
function canonicalVerification(v) {
  return ["verification", v?.command ?? "", v?.status ?? "", v?.exitCode ?? null, v?.outputExcerpt ?? "", canonicalRefs(v?.evidence)];
}
function canonicalStep(s) {
  return [
    "story_step",
    s?.id ?? "",
    s?.title ?? "",
    canonicalClaim(s?.intent),
    Array.isArray(s?.toolActivity) ? s.toolActivity.map(canonicalToolActivity) : [],
    // codeChange is bound by each CodeExcerpt's own hash (which binds all its
    // fields); the story re-checks that hash against the bundle in assertChangeStory.
    Array.isArray(s?.codeChange) ? s.codeChange.map((c) => c?.sha256 ?? "") : [],
    Array.isArray(s?.verification) ? s.verification.map(canonicalVerification) : [],
    canonicalClaim(s?.outcome),
    Array.isArray(s?.unknowns) ? s.unknowns.map((u) => [u?.text ?? "", u?.reason ?? ""]) : [],
  ];
}
function canonicalDrawer(d) {
  return [
    "evidence_drawer",
    Array.isArray(d?.quotes) ? d.quotes.map((q) => [q?.id ?? "", q?.kind ?? "", q?.role ?? "", q?.text ?? "", q?.locator ?? "", q?.sha256 ?? ""]) : [],
    Array.isArray(d?.excludedCounts) ? d.excludedCounts.map((x) => [x?.kind ?? "", x?.count ?? 0, x?.reason ?? ""]) : [],
  ];
}

// hashChangeStory binds the FULL semantic content of the story — view, topology,
// every step, and the evidence drawer — but NOT the provenance block that carries
// the hash itself. A relabel of any field, node, edge, or step invalidates it.
export function canonicalChangeStory(story) {
  const o = story?.overview ?? {};
  return JSON.stringify([
    "change_story",
    story?.schemaVersion ?? "",
    canonicalClaim(story?.objective),
    canonicalClaim(story?.outcome),
    [
      "overview",
      o.viewType ?? "",
      o.renderHint ?? "",
      Array.isArray(o.nodes) ? o.nodes.map(canonicalNode) : [],
      Array.isArray(o.edges) ? o.edges.map(canonicalEdge) : [],
    ],
    Array.isArray(story?.steps) ? story.steps.map(canonicalStep) : [],
    canonicalDrawer(story?.evidenceDrawer),
  ]);
}
export const hashChangeStory = (story) => sha256(canonicalChangeStory(story));

// ==========================================================================
// SHARED CANONICAL DERIVATION (task #39 REVISE round 4).
//
// The Phase 1F step partition is a PURE, DETERMINISTIC function of the validated
// bundle. Round 3 duplicated a SUBSET of that function in the validator (it
// re-derived fold necessity from the mutable `story.steps` and bound only an
// aggregate's id + path set), so a rehashed story could still drift from what the
// builder would deterministically produce (task #44 findings #1/#2).
//
// This section is the SINGLE source of truth. `deriveChangeDescriptors(bundle)`
// reconstructs the entire ordered descriptor partition — diagnosis, per-file change
// units, verifications, and any cap-produced aggregate — from BUNDLE-REQUIRED
// evidence alone. The builder (synthesis) maps its `descriptors` into `story.steps`
// and its `verifications` into the outcome; the validator re-runs the SAME function
// and asserts the story's complete ordered step partition is canonically identical.
// Producer and tamper-check therefore cannot disagree by construction: fold
// necessity, aggregate id, members, earliest anchor, title/intent, tool-activity
// refs, and outcome text + evidence are all bound to this one derivation.
//
// It lives in this (lower) schema module — which the builder already imports — so
// there is no circular dependency and no drift-prone second implementation.
// ==========================================================================

// EvidenceRef helpers — bind a bundle item by id + its canonical hash. Exported so
// the builder shares the exact binding (a ref's sha256 is the bundle hash).
export const refExcerpt = (e) => ({ type: "excerpt", ref: e.id, sha256: hashExcerpt(e) });
export const refToolInput = (t) => ({ type: "tool_input", ref: t.id, sha256: hashToolInput(t) });
export const refToolOutput = (t) => ({ type: "tool_output", ref: t.id, sha256: hashToolOutput(t) });
export const refReceipt = (rc) => ({ type: "receipt", ref: rc.id, sha256: hashReceipt(rc) });
export const refCode = (c) => ({ type: "code_excerpt", ref: c.id, sha256: hashCodeExcerpt(c) });

// Short, human label for a tool event's input (never the raw JSON blob).
function toolLabel(ev) {
  const name = ev.toolName;
  let detail = "";
  try {
    const parsed = JSON.parse(ev.inputSummary);
    detail = parsed.file_path || parsed.path || parsed.notebook_path || parsed.command || "";
  } catch { detail = ""; }
  if (detail && detail.length > 80) detail = detail.slice(0, 77) + "…";
  return detail ? `${name} ${detail}` : name;
}
// Just the friendly target (path/command) of a tool event, without the tool-name prefix.
function toolTarget(ev) {
  const full = toolLabel(ev);
  const stripped = full.replace(/^\w+\s/, "");
  return stripped && stripped !== ev.toolName ? stripped : "";
}

// --- behavior-specific label derivation from the exact landed code ---
const DECL_RE = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const JS_LIKE_EXT = /\.(mjs|cjs|jsx?|tsx?)$/i;
// Blank the CONTENT of comments and string/template literals (newlines preserved)
// so a declaration-looking token inside them is never mistaken for real code.
function stripNonCodeLocal(src) {
  let out = "";
  let state = "code";
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
function topLevelDecls(text) {
  const names = new Set();
  for (const line of stripNonCodeLocal(text || "").split("\n")) {
    const m = DECL_RE.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}
function exportedNames(text) {
  const names = new Set();
  const re = /export\s*\{([^}]*)\}/g;
  const stripped = stripNonCodeLocal(text || "");
  let m;
  while ((m = re.exec(stripped))) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}
function testNames(text) {
  const names = [];
  const re = /\b(?:test|it)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(text || ""))) names.push(m[2]);
  return names;
}
const setDiff = (after, before) => [...after].filter((x) => !before.has(x));
function clip(s, n = 72) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function newDecls(before, after) {
  const b = topLevelDecls(before || "");
  return setDiff(topLevelDecls(after || ""), b);
}
function deriveChangeLabel(path, landed) {
  const isJsLike = JS_LIKE_EXT.test(path || "");
  const decls = [];
  const exportsAdded = [];
  const tests = [];
  const modifiedSymbols = [];
  for (const c of landed) {
    if (isJsLike) {
      for (const d of newDecls(c.before, c.after)) if (!decls.includes(d)) decls.push(d);
      const be = exportedNames(c.before);
      for (const e of setDiff(exportedNames(c.after), be)) if (!exportsAdded.includes(e)) exportsAdded.push(e);
      if (c.symbol && (c.before || "").length && topLevelDecls(c.before).has(c.symbol)) {
        if (!modifiedSymbols.includes(c.symbol)) modifiedSymbols.push(c.symbol);
      }
    }
    const bt = new Set(testNames(c.before));
    for (const t of testNames(c.after)) if (!bt.has(t) && !tests.includes(t)) tests.push(t);
  }
  if (decls.length) return { title: clip(`Add ${decls.join(", ")}`), intent: `Add ${decls.join(", ")} in ${path}.` };
  if (exportsAdded.length) return { title: clip(`Expose ${exportsAdded.join(", ")}`), intent: `Export ${exportsAdded.join(", ")} from ${path}.` };
  if (tests.length) {
    const head = tests.length === 1 ? tests[0] : `${tests.length} tests: ${tests.join("; ")}`;
    return { title: clip(`Add ${head}`), intent: `Add ${tests.length} test(s) in ${path}: ${tests.join("; ")}.` };
  }
  if (modifiedSymbols.length) return { title: clip(`Update ${modifiedSymbols.join(", ")}`), intent: `Update ${modifiedSymbols.join(", ")} in ${path}.` };
  const rel = path || "a file";
  return { title: clip(`Edit ${rel}`), intent: `Edit ${rel}.` };
}
function deriveAggregateLabel(units) {
  const decls = [];
  const exportsAdded = [];
  let testCount = 0;
  const files = [];
  for (const u of units) {
    if (!files.includes(u.path)) files.push(u.path);
    const isJsLike = JS_LIKE_EXT.test(u.path || "");
    for (const c of u.landed) {
      if (isJsLike) {
        for (const d of newDecls(c.before, c.after)) if (!decls.includes(d)) decls.push(d);
        for (const e of setDiff(exportedNames(c.after), exportedNames(c.before))) if (!exportsAdded.includes(e)) exportsAdded.push(e);
      }
      const bt = new Set(testNames(c.before));
      testCount += testNames(c.after).filter((t) => !bt.has(t)).length;
    }
  }
  const bits = [];
  if (decls.length) bits.push(`add ${decls.join(", ")}`);
  if (exportsAdded.length) bits.push(`export ${exportsAdded.join(", ")}`);
  if (testCount) bits.push(`${testCount} test(s)`);
  const detail = bits.length ? bits.join("; ") : files.join(", ");
  return {
    title: clip(`Implement across ${files.length} file(s): ${detail}`, 80),
    intent: clip(`Implementation across ${files.join(", ")} — ${detail}.`, 240),
  };
}
// Deterministic parse of a test-runner RESULT summary from attested output.
function parseTestSummary(output) {
  const s = String(output || "");
  const grab = (re) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  let pass = grab(/(?:^|\n)\s*(?:ℹ|#)\s*pass\s+(\d+)/i);
  let fail = grab(/(?:^|\n)\s*(?:ℹ|#)\s*fail\s+(\d+)/i);
  let total = grab(/(?:^|\n)\s*(?:ℹ|#)\s*tests?\s+(\d+)/i);
  if (pass === null && fail === null && total === null) return null;
  if (fail === null) fail = 0;
  if (pass === null) pass = total !== null ? Math.max(0, total - fail) : 0;
  if (total === null) total = pass + fail;
  return { pass, fail, total };
}

// Cap the overview at `max` steps (gate 1). Diagnosis + verification descriptors are
// never folded; the fold targets CHANGE units only, collapsing the overflow into ONE
// aggregate change step that retains EVERY landed CodeExcerpt ref (evidence grouped,
// never dropped). Mutates `descriptors` in place, preserving attested order.
function capOverview(descriptors, max) {
  if (descriptors.length <= max) return;
  const changes = descriptors.filter((d) => d.kind === "change");
  const nonChange = descriptors.length - changes.length;
  const slots = max - nonChange;
  if (slots < 1) return;
  const keepIndividual = Math.max(0, slots - 1);
  if (changes.length <= slots) return;
  const folded = changes.slice(keepIndividual);
  if (folded.length <= 1) return;
  const units = folded.map((d) => d.unit);
  const allLanded = units.flatMap((u) => u.landed);
  const allUnknown = units.flatMap((u) => u.unknown);
  const allToolActivity = units.flatMap((u) => u.toolActivity);
  const earliest = folded.reduce((a, b) => ((a.anchorPos ?? Infinity) <= (b.anchorPos ?? Infinity) ? a : b));
  const label = deriveAggregateLabel(units);
  const aggregate = {
    kind: "change",
    anchorRef: earliest.anchorRef,
    anchorPos: earliest.anchorPos,
    unit: { path: units.map((u) => u.path).join(", "), landed: allLanded, unknown: allUnknown },
    step: {
      id: `step:agg:${earliest.step.id.replace(/^step:/, "")}`,
      title: label.title,
      intent: { text: label.intent, status: "inferred", evidence: [earliest.anchorRef] },
      toolActivity: allToolActivity,
      ...(allLanded.length ? { codeChange: allLanded.map((c) => ({ ...c })) } : {}),
      outcome: {
        text: `${allLanded.length} landed change(s) across ${units.length} file(s).`,
        evidence: allLanded.length ? allLanded.map(refCode) : [earliest.anchorRef],
      },
      unknowns: allUnknown.map((c) => ({ text: `${c.path}: exact code not confirmed as landed`, reason: c.unknownReason || "unconfirmed" })),
    },
  };
  const foldedIds = new Set(folded.map((d) => d.step.id));
  const remaining = descriptors.filter((d) => !foldedIds.has(d.step.id));
  remaining.push(aggregate);
  remaining.sort((a, b) => (a.anchorPos ?? Infinity) - (b.anchorPos ?? Infinity));
  descriptors.length = 0;
  descriptors.push(...remaining);
}

// The single deterministic derivation. Returns the ordered descriptor partition
// (each { kind, step, anchorRef, anchorPos }) and the unified verification set,
// both computed from BUNDLE-REQUIRED evidence only — never from a caller-supplied
// story. The builder maps these into story.steps/outcome; the validator re-runs it
// and asserts the story's steps are canonically identical.
export function deriveChangeDescriptors(bundle) {
  const codeByToolEvent = new Map();
  for (const c of bundle.codeEvidence ?? []) {
    if (!codeByToolEvent.has(c.toolEventId)) codeByToolEvent.set(c.toolEventId, []);
    codeByToolEvent.get(c.toolEventId).push(c);
  }
  const posOf = new Map();
  (bundle.observedOrder || []).forEach((o, i) => posOf.set(`${o.kind}:${o.id}`, i));

  const objectiveSourceId = bundle.objective ? bundle.objective.sourceId : null;
  const finalExplanation = [...(bundle.excerpts ?? [])].reverse().find((e) => e.kind === "agent_explanation");
  const finalExplanationId = finalExplanation ? finalExplanation.id : null;
  const CHANGE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
  const REASONING_KINDS = new Set(["agent_decision", "agent_explanation", "error", "unresolved"]);
  const descriptors = [];

  // Attested verifications, unified across receipts and un-promoted Bash events.
  const receiptLocators = new Set((bundle.receipts ?? []).map((rc) => rc.commandLocator).filter(Boolean));
  const VERIFY_TOOLS = new Set(["Bash"]);
  const verifications = [];
  for (const rc of bundle.receipts ?? []) {
    const summary = parseTestSummary(rc.content);
    verifications.push({
      kind: "receipt",
      anchorRef: refReceipt(rc),
      anchorPos: posOf.get(`receipt:${rc.id}`),
      idPart: rc.id,
      command: rc.command,
      status: rc.status,
      exitCode: rc.exitCode,
      output: (rc.content || "").slice(0, VERIFY_OUTPUT_MAX),
      summary,
      toolActivity: [{ toolName: "Bash", status: rc.status === "unknown" ? "unknown" : rc.status, summary: rc.command, evidence: [refReceipt(rc)] }],
    });
  }
  for (const ev of bundle.toolEvents ?? []) {
    if (!VERIFY_TOOLS.has(ev.toolName)) continue;
    if (ev.status !== "succeeded" && ev.status !== "failed") continue;
    if (ev.inputLocator && receiptLocators.has(ev.inputLocator)) continue;
    const cmd = toolTarget(ev) || ev.toolName;
    if (!isVerificationCommand(cmd)) continue;
    const output = ev.outputSummary || "";
    const summary = parseTestSummary(output);
    if (!summary) continue;
    const anchorRef = refToolInput(ev);
    verifications.push({
      kind: "bash",
      anchorRef,
      anchorPos: posOf.get(`tool_event:${ev.id}`),
      idPart: ev.id,
      command: cmd,
      status: ev.status,
      exitCode: undefined,
      output: output.slice(0, VERIFY_OUTPUT_MAX),
      summary,
      toolActivity: [{ toolName: "Bash", status: ev.status, summary: cmd, evidence: ev.outputLocator ? [refToolInput(ev), refToolOutput(ev)] : [refToolInput(ev)] }],
    });
  }
  const firstFailPos = verifications
    .filter((v) => v.status === "failed")
    .reduce((min, v) => Math.min(min, v.anchorPos ?? Infinity), Infinity);

  // (a) diagnosis reasoning steps (gate 2 exception): a reasoning excerpt with an
  // observed FAILING verification before it AND a landed change after it.
  const landedPositions = (bundle.codeEvidence ?? [])
    .filter((c) => c.completeness === "landed")
    .map((c) => {
      const ev = (bundle.toolEvents ?? []).find((t) => t.id === c.toolEventId);
      return ev ? posOf.get(`tool_event:${ev.id}`) : undefined;
    })
    .filter((p) => p !== undefined);
  for (const e of bundle.excerpts ?? []) {
    if (!REASONING_KINDS.has(e.kind)) continue;
    if (e.id === objectiveSourceId || e.id === finalExplanationId) continue;
    const pos = posOf.get(`excerpt:${e.id}`);
    if (pos === undefined) continue;
    const hasPriorFailure = firstFailPos < pos;
    const hasLaterLanding = landedPositions.some((lp) => lp > pos);
    if (!(hasPriorFailure && hasLaterLanding)) continue;
    const anchorRef = refExcerpt(e);
    const quoted = e.text.slice(0, 200);
    descriptors.push({
      kind: "diagnosis",
      anchorRef,
      anchorPos: pos,
      step: {
        id: `step:${e.id}`,
        title: clip(`Diagnosis: ${e.text.slice(0, 60)}`),
        intent: { text: quoted, status: "observed", evidence: [anchorRef] },
        toolActivity: [],
        outcome: { text: "Root cause identified from the failing check.", evidence: [anchorRef] },
        unknowns: [],
      },
    });
  }

  // (b) change steps: GROUP landed edits by implementation unit (file). One step per
  // unit, carrying every landed CodeExcerpt, anchored at the unit's EARLIEST attested
  // change tool event (gate 3). Labels are behavior-specific.
  const unitOrder = [];
  const unitMap = new Map();
  for (const ev of bundle.toolEvents ?? []) {
    if (ev.status !== "succeeded") continue;
    if (!CHANGE_TOOLS.has(ev.toolName)) continue;
    const all = codeByToolEvent.get(ev.id) || [];
    const path = all[0]?.path || toolTarget(ev) || ev.toolName;
    const pos = posOf.get(`tool_event:${ev.id}`);
    if (!unitMap.has(path)) { unitMap.set(path, { path, eventRefs: [], landed: [], unknown: [], earliestPos: pos, earliestEvId: ev.id, toolActivity: [] }); unitOrder.push(path); }
    const u = unitMap.get(path);
    if (pos !== undefined && (u.earliestPos === undefined || pos < u.earliestPos)) { u.earliestPos = pos; u.earliestEvId = ev.id; }
    for (const c of all) {
      if (c.completeness === "landed") u.landed.push(c);
      else u.unknown.push(c);
    }
    u.toolActivity.push({
      toolName: ev.toolName,
      status: ev.status,
      summary: toolLabel(ev),
      evidence: ev.outputLocator ? [refToolInput(ev), refToolOutput(ev)] : [refToolInput(ev)],
    });
  }
  const changeUnits = unitOrder.map((path) => unitMap.get(path));
  const unitDescriptors = changeUnits.map((u) => {
    const anchorEv = (bundle.toolEvents ?? []).find((t) => t.id === u.earliestEvId);
    const anchorRef = refToolInput(anchorEv);
    const label = deriveChangeLabel(u.path, u.landed);
    return {
      kind: "change",
      anchorRef,
      anchorPos: u.earliestPos,
      unit: u,
      step: {
        id: `step:${u.earliestEvId}`,
        title: label.title,
        intent: { text: label.intent, status: "inferred", evidence: [anchorRef] },
        toolActivity: u.toolActivity,
        ...(u.landed.length ? { codeChange: u.landed.map((c) => ({ ...c })) } : {}),
        outcome: {
          text: u.landed.length ? `${u.landed.length} landed change(s) in ${u.path}.` : `Change applied to ${u.path}.`,
          evidence: u.landed.length ? u.landed.map(refCode) : [anchorRef],
        },
        unknowns: u.unknown.map((c) => ({ text: `${c.path}: exact code not confirmed as landed`, reason: c.unknownReason || "unconfirmed" })),
      },
    };
  });
  descriptors.push(...unitDescriptors);

  // (c) verification steps: one per attested verification, anchored at its slot.
  for (const v of verifications) {
    const countTxt = v.summary ? ` (${v.summary.pass}/${v.summary.total} passed${v.summary.fail ? `, ${v.summary.fail} failed` : ""})` : "";
    descriptors.push({
      kind: "verification",
      anchorRef: v.anchorRef,
      anchorPos: v.anchorPos,
      verify: v,
      step: {
        id: `step:${v.idPart}`,
        title: clip(`${v.status === "failed" ? "Failing" : v.status === "succeeded" ? "Passing" : "Ran"} check: ${v.command}${countTxt}`, 90),
        intent: { text: `Run \`${v.command}\` to verify behavior.`, status: "inferred", evidence: [v.anchorRef] },
        toolActivity: v.toolActivity,
        verification: [
          {
            command: v.command,
            status: v.status,
            ...(v.exitCode !== undefined ? { exitCode: v.exitCode } : {}),
            outputExcerpt: v.output,
            evidence: [v.anchorRef],
          },
        ],
        outcome: {
          text: v.status === "failed"
            ? `Verification failed${v.summary ? ` — ${v.summary.fail} of ${v.summary.total} test(s) failing` : ""}.`
            : v.status === "succeeded"
              ? `Verification passed${v.summary ? ` — ${v.summary.pass}/${v.summary.total} test(s)` : ""}.`
              : "Verification outcome masked.",
          evidence: [v.anchorRef],
        },
        unknowns: [],
      },
    });
  }

  // Order every step by its attested timeline position, then apply the cap (gate 1).
  descriptors.sort((a, b) => (a.anchorPos ?? Infinity) - (b.anchorPos ?? Infinity));
  capOverview(descriptors, MAX_OVERVIEW_STEPS);

  // (d) story-level OUTCOME summary — the visible first-viewport verification claim.
  // Derived here (not in the builder) so the validator can re-run it and require the
  // story's outcome text/status/evidence to equal this bundle-derived summary exactly
  // (task #45 finding #2: a rehashed outcome may not claim 99/99 while retaining the
  // real 5/5 refs). Mirrors the prior builder computation byte-for-byte.
  const landedCount = (bundle.codeEvidence ?? []).filter((c) => c.completeness === "landed").length;
  const changedCount = (bundle.repository?.changedFiles ?? []).length;
  const passCount = verifications.filter((v) => v.status === "succeeded").length;
  const failCount = verifications.filter((v) => v.status === "failed").length;
  const lastVerify = verifications.slice().sort((a, b) => (a.anchorPos ?? 0) - (b.anchorPos ?? 0)).pop();
  const testTotals = lastVerify && lastVerify.summary ? lastVerify.summary : null;
  const verifSentence = verifications.length
    ? testTotals
      ? ` The final test run reported ${testTotals.pass}/${testTotals.total} passing${testTotals.fail ? ` (${testTotals.fail} failing)` : ""}.`
      : ` ${passCount} passing and ${failCount} failing verification run(s) were recorded.`
    : "";
  const outcomeText = changedCount
    ? `The session changed ${changedCount} file(s); ${landedCount} code change(s) are confirmed present in the final tree.${verifSentence}`
    : "The session investigated the objective without a recorded file change.";
  const outcome = {
    text: outcomeText,
    status: "inferred",
    evidence: [
      ...verifications.slice(0, 3).map((v) => v.anchorRef),
      ...(finalExplanation ? [refExcerpt(finalExplanation)] : []),
    ],
  };

  return { descriptors, verifications, outcome };
}

// --- fail-closed validator ---
//
// Called WITH the validated bundle so every EvidenceRef can be re-resolved. The
// bundle is the single source of truth for what evidence exists and what it
// hashes to; the story may only point at it, never assert beyond it.
export function validateChangeStory(story, bundle) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const isStr = (v) => typeof v === "string";
  const nonEmpty = (v) => isStr(v) && v.length > 0;
  const isHex = (v) => isStr(v) && HEX64.test(v);
  const inSet = (v, set) => isStr(v) && set.includes(v);

  // Reject any key outside the allow-list at a given level (blocker #3): a field
  // not covered by canonicalChangeStory carries UNhashed semantics and must fail.
  const strictKeys = (obj, allowed, path) => {
    if (!isObj(obj)) return;
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) err(`${path}.${k}`, "unknown field (not part of the hashed change-story schema)");
    }
  };

  if (!isObj(story)) return { ok: false, errors: ["changeStory: not an object"] };
  if (!isObj(bundle)) return { ok: false, errors: ["changeStory: a validated bundle is required to resolve evidence refs"] };
  strictKeys(story, STORY_KEYS.story, "changeStory");

  // Build resolver maps: id -> recomputed canonical hash, per source type.
  const resolvers = {
    excerpt: new Map(),
    tool_input: new Map(),
    tool_output: new Map(),
    receipt: new Map(),
    code_excerpt: new Map(),
  };
  for (const e of bundle.excerpts ?? []) if (isObj(e) && nonEmpty(e.id)) resolvers.excerpt.set(e.id, hashExcerpt(e));
  for (const t of bundle.toolEvents ?? []) {
    if (!isObj(t) || !nonEmpty(t.id)) continue;
    resolvers.tool_input.set(t.id, hashToolInput(t));
    if (nonEmpty(t.outputLocator) || (isStr(t.outputSummary) && t.outputSummary.length > 0)) resolvers.tool_output.set(t.id, hashToolOutput(t));
  }
  const receiptById = new Map();
  for (const rc of bundle.receipts ?? []) if (isObj(rc) && nonEmpty(rc.id)) { resolvers.receipt.set(rc.id, hashReceipt(rc)); receiptById.set(rc.id, rc); }
  const toolEventById = new Map();
  for (const t of bundle.toolEvents ?? []) if (isObj(t) && nonEmpty(t.id)) toolEventById.set(t.id, t);
  const codeById = new Map();
  for (const c of bundle.codeEvidence ?? []) if (isObj(c) && nonEmpty(c.id)) { resolvers.code_excerpt.set(c.id, hashCodeExcerpt(c)); codeById.set(c.id, c); }
  // Authoritative command derived from a tool event's attested input (mirrors the
  // synthesis toolTarget: the friendly command/path field of the input JSON). Used
  // to re-resolve a verification's displayed command against the immutable source.
  const commandOfToolEvent = (t) => {
    try {
      const parsed = JSON.parse(t?.inputSummary ?? "");
      return parsed.file_path || parsed.path || parsed.notebook_path || parsed.command || "";
    } catch { return ""; }
  };
  // The EXACT canonical bounded output slice the builder surfaces. A verification's
  // outputExcerpt must equal this byte-for-byte (finding #3) — no empty string, no
  // prefix, no truncated substitute passes.
  const canonicalOutputSlice = (source) => String(source ?? "").slice(0, VERIFY_OUTPUT_MAX);
  // A verification's displayed command must equal the source command (builder copies
  // it whole) or, when the builder clipped a long command with an ellipsis, be that
  // exact clipped prefix — never an arbitrary shorter substring.
  const commandMatchesSource = (cmd, source) => {
    const src = String(source ?? "");
    if (cmd === src) return true;
    return isStr(cmd) && cmd.endsWith("…") && src.startsWith(cmd.slice(0, -1));
  };
  const excerptTextById = new Map();
  for (const e of bundle.excerpts ?? []) if (isObj(e) && nonEmpty(e.id)) excerptTextById.set(e.id, e.text ?? "");

  // Position of every attested item in the bundle's observedOrder timeline. This
  // is the ONLY order the capture proves (findings #1/#2); observed_sequence edges
  // and the step ordering are validated against it, so a reordered story fails.
  const posByKey = new Map();
  (Array.isArray(bundle.observedOrder) ? bundle.observedOrder : []).forEach((o, i) => {
    if (isObj(o) && nonEmpty(o.kind) && nonEmpty(o.id)) posByKey.set(`${o.kind}:${o.id}`, i);
  });
  // Resolve an EvidenceRef to its observedOrder key, mapping ref types to timeline
  // kinds (tool_input/tool_output → the tool event; code_excerpt → its tool event).
  const orderKeyOfRef = (ref) => {
    if (!isObj(ref) || !nonEmpty(ref.ref)) return null;
    switch (ref.type) {
      case "excerpt": return `excerpt:${ref.ref}`;
      case "tool_input":
      case "tool_output": return `tool_event:${ref.ref}`;
      case "receipt": return `receipt:${ref.ref}`;
      case "code_excerpt": {
        const c = codeById.get(ref.ref);
        return c && nonEmpty(c.toolEventId) ? `tool_event:${c.toolEventId}` : null;
      }
      default: return null;
    }
  };
  // A step/verification node's anchor is its FIRST evidence ref; its anchor
  // position is that ref's slot in the attested timeline.
  const anchorRefOfNode = (n) => (Array.isArray(n?.evidence) && n.evidence.length ? n.evidence[0] : null);
  const anchorPosOfNode = (n) => {
    const key = orderKeyOfRef(anchorRefOfNode(n));
    return key && posByKey.has(key) ? posByKey.get(key) : null;
  };
  // Exact evidence-ref equality (type + id + hash) — an observed edge's refs must
  // BE its endpoints' anchors, not merely two arbitrary refs of the right count.
  const sameRef = (a, b) => isObj(a) && isObj(b) && a.type === b.type && a.ref === b.ref && a.sha256 === b.sha256;

  // Resolve one EvidenceRef: dangling id or hash drift both fail closed.
  const checkRef = (ref, path) => {
    if (!isObj(ref)) return err(path, "evidence ref must be an object");
    strictKeys(ref, STORY_KEYS.evidenceRef, path);
    if (!inSet(ref.type, EVIDENCE_REF_TYPES)) return err(`${path}.type`, `one of ${EVIDENCE_REF_TYPES.join("|")}`);
    if (!nonEmpty(ref.ref)) return err(`${path}.ref`, "required source id");
    if (!isHex(ref.sha256)) return err(`${path}.sha256`, "required sha-256 hex");
    const table = resolvers[ref.type];
    if (!table.has(ref.ref)) return err(`${path}`, `dangling reference: no ${ref.type} "${ref.ref}" in the bundle`);
    if (table.get(ref.ref) !== ref.sha256) err(`${path}.sha256`, `does not match the bundle ${ref.type} "${ref.ref}" (hash drift)`);
  };
  const checkRefs = (list, path) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) return err(path, "must be an array of evidence refs");
    list.forEach((r, i) => checkRef(r, `${path}[${i}]`));
  };
  const checkClaim = (c, path, { requireStatus = false, statusSet = INTENT_STATUSES, requireEvidence = false } = {}) => {
    if (!isObj(c)) return err(path, "required object");
    strictKeys(c, STORY_KEYS.claim, path);
    if (!nonEmpty(c.text)) err(`${path}.text`, "required non-empty string");
    if (requireStatus && !inSet(c.status, statusSet)) err(`${path}.status`, `one of ${statusSet.join("|")}`);
    checkRefs(c.evidence, `${path}.evidence`);
    if (requireEvidence && (!Array.isArray(c.evidence) || c.evidence.length === 0)) err(`${path}.evidence`, "at least one evidence ref required");
  };

  if (story.schemaVersion !== CHANGE_STORY_SCHEMA_VERSION) err("schemaVersion", `must be ${CHANGE_STORY_SCHEMA_VERSION}`);

  checkClaim(story.objective, "objective");
  checkClaim(story.outcome, "outcome");

  // overview topology
  const nodeIds = new Set();
  const stepIds = new Set();
  const nodeById = new Map();
  const ov = story.overview;
  if (!isObj(ov)) {
    err("overview", "required object");
  } else {
    strictKeys(ov, STORY_KEYS.overview, "overview");
    if (!inSet(ov.viewType, VIEW_TYPES)) err("overview.viewType", `one of ${VIEW_TYPES.join("|")}`);
    if (!inSet(ov.renderHint, RENDER_HINTS)) err("overview.renderHint", `one of ${RENDER_HINTS.join("|")}`);
    if (!Array.isArray(ov.nodes) || ov.nodes.length === 0) {
      err("overview.nodes", "required non-empty array");
    } else {
      ov.nodes.forEach((n, i) => {
        const p = `overview.nodes[${i}]`;
        if (!isObj(n)) return err(p, "not an object");
        strictKeys(n, STORY_KEYS.node, p);
        if (!nonEmpty(n.id)) err(`${p}.id`, "required");
        else { if (nodeIds.has(n.id)) err(`${p}.id`, `duplicate node id "${n.id}"`); nodeIds.add(n.id); nodeById.set(n.id, n); }
        if (!inSet(n.kind, NODE_KINDS)) err(`${p}.kind`, `one of ${NODE_KINDS.join("|")}`);
        if (!nonEmpty(n.label)) err(`${p}.label`, "required");
        if (n.stepId !== undefined && !nonEmpty(n.stepId)) err(`${p}.stepId`, "must be non-empty when present");
        checkRefs(n.evidence, `${p}.evidence`);
      });
    }
    if (!Array.isArray(ov.edges)) {
      err("overview.edges", "required array");
    } else {
      ov.edges.forEach((e, i) => {
        const p = `overview.edges[${i}]`;
        if (!isObj(e)) return err(p, "not an object");
        strictKeys(e, STORY_KEYS.edge, p);
        if (!inSet(e.kind, EDGE_KINDS)) err(`${p}.kind`, `one of ${EDGE_KINDS.join("|")}`);
        if (!inSet(e.relationshipStatus, RELATIONSHIP_STATUSES)) err(`${p}.relationshipStatus`, `one of ${RELATIONSHIP_STATUSES.join("|")}`);
        // R4: only observed_sequence may be asserted as "observed"; any other
        // edge kind must be marked inferred/unknown (never claimed as fact).
        if (e.kind !== "observed_sequence" && e.relationshipStatus === "observed") {
          err(`${p}`, `edge kind "${e.kind}" cannot be "observed" — only observed_sequence is provable from the capture (R4)`);
        }
        if (!nodeIds.has(e.from)) err(`${p}.from`, `unknown node "${e.from}"`);
        if (!nodeIds.has(e.to)) err(`${p}.to`, `unknown node "${e.to}"`);
        if (e.from === e.to) err(`${p}`, "an edge must connect two distinct nodes");
        checkRefs(e.evidence, `${p}.evidence`);
        // Phase 1F gate 5 / finding #4: a "derived" edge is FRAMING ONLY — it may
        // only bracket the observed steps (objective→step, step→outcome, or
        // objective→outcome when there are no steps). It may never connect two step
        // nodes: a step↔step relationship is a transition, and the only provable
        // transition is observed_sequence. This blocks smuggling an inferred
        // cross-file "derived" link between two implementation steps.
        if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
          const fromIsStep = nonEmpty(nodeById.get(e.from)?.stepId);
          const toIsStep = nonEmpty(nodeById.get(e.to)?.stepId);
          if (e.kind === "derived") {
            const fromKind = nodeById.get(e.from)?.kind;
            const toKind = nodeById.get(e.to)?.kind;
            const framesStart = fromKind === "objective";
            const framesEnd = toKind === "outcome";
            if (!(framesStart || framesEnd)) {
              err(`${p}`, `a derived edge is framing-only — it must touch the objective or outcome node, never link two steps (task #39 gate 5)`);
            }
            if (fromIsStep && toIsStep) {
              err(`${p}`, `a derived edge may not connect two step nodes; a step→step relationship must be observed_sequence (task #39 gate 5 / finding #4)`);
            }
          }
          if (fromIsStep && toIsStep && e.kind !== "observed_sequence") {
            err(`${p}`, `an edge between two step nodes must be observed_sequence, not "${e.kind}" (finding #4)`);
          }
        }
        // An observed_sequence edge is a PROVEN transition: both endpoints must be
        // step/verification nodes anchored in the observedOrder timeline, it must
        // carry evidence for BOTH endpoints, and the from-anchor MUST precede the
        // to-anchor in that timeline. A reordered story (S2 emitted Edit before the
        // failing check) therefore fails closed (findings #1/#2).
        if (e.kind === "observed_sequence" && nodeIds.has(e.from) && nodeIds.has(e.to)) {
          const fromNode = nodeById.get(e.from);
          const toNode = nodeById.get(e.to);
          const fromPos = anchorPosOfNode(fromNode);
          const toPos = anchorPosOfNode(toNode);
          if (fromPos === null || toPos === null) {
            err(`${p}`, "an observed_sequence edge must connect two nodes anchored in the bundle observedOrder timeline");
          } else if (!(fromPos < toPos)) {
            err(`${p}`, `observed_sequence must follow the attested order: "${e.from}" (pos ${fromPos}) does not precede "${e.to}" (pos ${toPos})`);
          }
          // The edge's two refs must BE the anchors of its endpoints, in order —
          // not merely two refs of the right count. Two copies of an unrelated ref
          // (e.g. the objective) no longer count as "proof" (blocker #1).
          if (!Array.isArray(e.evidence) || e.evidence.length !== 2) {
            err(`${p}.evidence`, "an observed_sequence edge must cite exactly the two evidence anchors of its endpoints");
          } else {
            const fromAnchor = anchorRefOfNode(fromNode);
            const toAnchor = anchorRefOfNode(toNode);
            if (!sameRef(e.evidence[0], fromAnchor)) err(`${p}.evidence[0]`, `must equal the "from" node's anchor evidence`);
            if (!sameRef(e.evidence[1], toAnchor)) err(`${p}.evidence[1]`, `must equal the "to" node's anchor evidence`);
          }
        }
      });
    }
  }

  // steps
  if (!Array.isArray(story.steps) || story.steps.length === 0) {
    err("steps", "required non-empty array");
  } else {
    story.steps.forEach((s, i) => {
      const p = `steps[${i}]`;
      if (!isObj(s)) return err(p, "not an object");
      strictKeys(s, STORY_KEYS.step, p);
      // R4: step id derives from immutable evidence, not step-N enumeration.
      if (!nonEmpty(s.id)) err(`${p}.id`, "required");
      else {
        if (stepIds.has(s.id)) err(`${p}.id`, `duplicate step id "${s.id}"`);
        stepIds.add(s.id);
        if (/^step-\d+$/.test(s.id)) err(`${p}.id`, "must derive from evidence, not step-N enumeration (R4)");
      }
      if (!nonEmpty(s.title)) err(`${p}.title`, "required");
      // intent: "observed" is only honest when it cites a quoted excerpt.
      checkClaim(s.intent, `${p}.intent`, { requireStatus: true, statusSet: INTENT_STATUSES });
      if (isObj(s.intent) && s.intent.status === "observed") {
        const excerptRef = Array.isArray(s.intent.evidence) ? s.intent.evidence.find((r) => isObj(r) && r.type === "excerpt") : null;
        if (!excerptRef) {
          err(`${p}.intent`, "an observed intent must cite an excerpt (R4); mark it inferred otherwise");
        } else if (excerptTextById.has(excerptRef.ref)) {
          // The narrative text must actually come FROM the cited excerpt, not an
          // unrelated ref (finding #3): the intent text must be a substring of the
          // cited excerpt's text (the builder quotes a bounded prefix of it).
          const src = excerptTextById.get(excerptRef.ref);
          if (nonEmpty(s.intent.text) && !src.includes(s.intent.text)) {
            err(`${p}.intent.text`, "an observed intent's text must be quoted from the excerpt it cites (finding #3)");
          }
        }
      }
      if (!Array.isArray(s.toolActivity)) err(`${p}.toolActivity`, "required array");
      else s.toolActivity.forEach((a, j) => {
        const ap = `${p}.toolActivity[${j}]`;
        if (!isObj(a)) return err(ap, "not an object");
        strictKeys(a, STORY_KEYS.toolActivity, ap);
        if (!nonEmpty(a.toolName)) err(`${ap}.toolName`, "required");
        checkRefs(a.evidence, `${ap}.evidence`);
      });
      // codeChange: each inline CodeExcerpt must match a bundle codeEvidence entry
      // byte-for-byte (same id, same recomputed hash) and only a LANDED excerpt may
      // be narrated inside a step's implemented code change (R1).
      if (s.codeChange !== undefined) {
        if (!Array.isArray(s.codeChange)) err(`${p}.codeChange`, "must be an array");
        else s.codeChange.forEach((c, j) => {
          const cp = `${p}.codeChange[${j}]`;
          if (!isObj(c)) return err(cp, "not an object");
          strictKeys(c, STORY_KEYS.codeChange, cp);
          if (!nonEmpty(c.id)) return err(`${cp}.id`, "required");
          if (!codeById.has(c.id)) return err(cp, `references CodeExcerpt "${c.id}" not present in bundle.codeEvidence`);
          if (!isHex(c.sha256) || c.sha256 !== hashCodeExcerpt(c)) err(`${cp}.sha256`, "does not bind its CodeExcerpt fields (hash mismatch)");
          if (resolvers.code_excerpt.get(c.id) !== c.sha256) err(cp, `does not match bundle CodeExcerpt "${c.id}" byte-for-byte`);
          if (c.completeness !== "landed") err(cp, `only a landed CodeExcerpt may appear as a step code change; "${c.id}" is "${c.completeness}" (surface it as an unknown instead)`);
        });
      }
      if (s.verification !== undefined) {
        if (!Array.isArray(s.verification)) err(`${p}.verification`, "must be an array");
        else s.verification.forEach((v, j) => {
          const vp = `${p}.verification[${j}]`;
          if (!isObj(v)) return err(vp, "not an object");
          strictKeys(v, STORY_KEYS.verification, vp);
          if (!nonEmpty(v.command)) err(`${vp}.command`, "required");
          if (!inSet(v.status, ["succeeded", "failed", "unknown"])) err(`${vp}.status`, "one of succeeded|failed|unknown");
          checkRefs(v.evidence, `${vp}.evidence`);
          // BYTE-BOUND VERIFICATION SEMANTICS (finding #2): a verification block does
          // not just have to point at SOME resolvable ref — its displayed command,
          // status, exitCode and output must actually MATCH the receipt / Bash tool
          // event it cites. Without this, a story could relabel a failed run as
          // "succeeded" (or fabricate the command/output) while still citing a real,
          // hash-valid ref. Resolve the FIRST cited ref to its attested source and
          // re-check every surfaced field against it.
          const vref = Array.isArray(v.evidence) ? v.evidence.find((r) => isObj(r) && (r.type === "receipt" || r.type === "tool_input" || r.type === "tool_output")) : null;
          if (!vref) {
            err(`${vp}.evidence`, "a verification must cite the receipt or Bash tool event it reports (finding #2)");
          } else if (vref.type === "receipt") {
            const rc = receiptById.get(vref.ref);
            if (!rc) err(vp, `cites receipt "${vref.ref}" absent from the bundle (finding #2)`);
            else {
              if (!commandMatchesSource(v.command, rc.command)) err(`${vp}.command`, `does not match the cited receipt's command (finding #2)`);
              if (v.status !== rc.status) err(`${vp}.status`, `"${v.status}" does not match the cited receipt's status "${rc.status}" (finding #2)`);
              // EXACT exitCode presence + value parity (finding #3): a source with no
              // exitCode must have none on the story; a fabricated exitCode:0 fails.
              const rcExit = rc.exitCode === undefined ? undefined : rc.exitCode;
              if (v.exitCode !== rcExit) err(`${vp}.exitCode`, `must equal the cited receipt's exit code exactly (finding #3): source ${rcExit === undefined ? "absent" : rcExit}, story ${v.exitCode === undefined ? "absent" : v.exitCode}`);
              // outputExcerpt must equal the builder's exact canonical bounded slice
              // (finding #3): erasing it to "" or substituting text fails closed.
              if (v.outputExcerpt !== canonicalOutputSlice(rc.content)) err(`${vp}.outputExcerpt`, `must equal the exact canonical bounded slice of the cited receipt output (finding #3)`);
            }
          } else {
            const ev = toolEventById.get(vref.ref);
            if (!ev) err(vp, `cites tool event "${vref.ref}" absent from the bundle (finding #2)`);
            else {
              if (ev.toolName !== "Bash") err(vp, `cites a ${ev.toolName} event as verification; only a Bash check is verification evidence (finding #2)`);
              if (!commandMatchesSource(v.command, commandOfToolEvent(ev))) err(`${vp}.command`, `does not match the cited Bash event's command (finding #2)`);
              if (v.status !== ev.status) err(`${vp}.status`, `"${v.status}" does not match the cited Bash event's status "${ev.status}" (finding #2)`);
              // A bare Bash event carries no exitCode, so the story must not claim one
              // (finding #3): a fabricated exitCode:0 fails closed.
              if (v.exitCode !== undefined) err(`${vp}.exitCode`, `a Bash-event verification has no attested exit code; the story must not fabricate one (finding #3)`);
              if (v.outputExcerpt !== canonicalOutputSlice(ev.outputSummary)) err(`${vp}.outputExcerpt`, `must equal the exact canonical bounded slice of the cited Bash event output (finding #3)`);
              // The cited command must itself be a recognized single-runner command
              // (finding #1): binds the validator to the same quote-aware grammar the
              // builder uses, so a laundering compound cannot validate even if crafted.
              if (!isVerificationCommand(commandOfToolEvent(ev))) err(`${vp}`, `the cited Bash command is not a recognized single test-runner run; a compound/masked command is not verification (finding #1)`);
            }
          }
        });
      }
      checkClaim(s.outcome, `${p}.outcome`);
      if (s.unknowns !== undefined) {
        if (!Array.isArray(s.unknowns)) err(`${p}.unknowns`, "must be an array");
        else s.unknowns.forEach((u, j) => {
          const up = `${p}.unknowns[${j}]`;
          if (!isObj(u)) return err(up, "not an object");
          strictKeys(u, STORY_KEYS.unknown, up);
          if (!nonEmpty(u.text)) err(`${up}.text`, "required");
        });
      }
    });
  }

  // Step nodes and story.steps must be a strict, order-matched bijection, and the
  // steps must run monotonically forward along the attested timeline (blocker #1).
  // A step node is any overview node carrying a stepId (kind step | verification).
  // Without this, swapping story.steps[0]/[1] (and rehashing) would still validate
  // while node selection shows the wrong panel.
  if (isObj(ov) && Array.isArray(ov.nodes) && Array.isArray(story.steps)) {
    const stepNodes = ov.nodes.filter((n) => isObj(n) && nonEmpty(n.stepId));
    // Each step node must reference a real step.
    for (const n of stepNodes) if (!stepIds.has(n.stepId)) err("overview", `step node references unknown step "${n.stepId}"`);
    // Order-matched bijection: the stepId sequence must equal the story.steps id
    // sequence exactly (same length, same members, same order).
    const nodeStepIds = stepNodes.map((n) => n.stepId);
    const storyStepIds = story.steps.map((s) => (isObj(s) ? s.id : ""));
    if (nodeStepIds.length !== storyStepIds.length) {
      err("overview.nodes", `step nodes (${nodeStepIds.length}) do not match story.steps (${storyStepIds.length}) one-to-one`);
    } else {
      for (let i = 0; i < storyStepIds.length; i += 1) {
        if (nodeStepIds[i] !== storyStepIds[i]) {
          err(`overview.nodes`, `step-node order does not match story.steps at index ${i}: node "${nodeStepIds[i]}" vs step "${storyStepIds[i]}"`);
          break;
        }
      }
    }
    // Monotonic along the timeline: each step node's anchor must resolve and each
    // must strictly follow the previous one's anchor position.
    let prevPos = -1;
    stepNodes.forEach((n, i) => {
      const pos = anchorPosOfNode(n);
      if (pos === null) {
        err(`overview.nodes`, `step node "${n.stepId}" is not anchored in the bundle observedOrder timeline`);
      } else if (!(pos > prevPos)) {
        err(`overview.nodes`, `steps must run forward along the attested order; step node ${i} ("${n.stepId}", pos ${pos}) does not follow the previous (pos ${prevPos})`);
      } else {
        prevPos = pos;
      }
    });

    // ADJACENCY (task #38 blocker): the per-edge check above only proves each
    // observed_sequence edge points forward — it does NOT prove the observed edges
    // form the complete, gap-free chain of the story. Without this, a recomputed
    // story could rewire an observed edge from step 0 straight to step 2, cite both
    // exact endpoint anchors, skip the diagnosis step entirely, and still validate.
    // Require the observed_sequence edge SET to equal EXACTLY the consecutive
    // step-node pairs: one edge per adjacent pair, none skipped, duplicated, or
    // extra. (Non-observed derived/inferred edges — objective→first, last→outcome —
    // are unconstrained here; only proven transitions must be exact.)
    if (Array.isArray(ov.edges)) {
      const observed = ov.edges.filter((e) => isObj(e) && e.kind === "observed_sequence");
      const expected = [];
      for (let i = 0; i < stepNodes.length - 1; i += 1) {
        expected.push(`${stepNodes[i].id}→${stepNodes[i + 1].id}`);
      }
      const expectedSet = new Set(expected);
      const seen = new Set();
      for (const e of observed) {
        const key = `${e.from}→${e.to}`;
        if (!expectedSet.has(key)) {
          err("overview.edges", `observed_sequence edge "${key}" is not a consecutive step-node pair — observed edges may not skip steps or connect non-adjacent nodes (task #38)`);
        } else if (seen.has(key)) {
          err("overview.edges", `observed_sequence edge "${key}" is duplicated — each adjacent step pair must be proven exactly once (task #38)`);
        }
        seen.add(key);
      }
      for (const key of expected) {
        if (!seen.has(key)) {
          err("overview.edges", `missing observed_sequence edge for adjacent step pair "${key}" — the proven transition chain must be complete (task #38)`);
        }
      }
    }

    // COMPACTION CAP (Phase 1F, task #39, gate 1): the overview presents at most
    // MAX_OVERVIEW_STEPS implementation/verification step nodes. A step node is any
    // node carrying a stepId; framing (objective/outcome) and risk/unknown nodes do
    // not. A rehashed story that re-inflates the overview to a per-Edit replay fails
    // closed here — the bound is part of the tamper surface, not a soft preference.
    if (stepNodes.length > MAX_OVERVIEW_STEPS) {
      err("overview.nodes", `the overview presents ${stepNodes.length} step nodes, exceeding the compaction cap of ${MAX_OVERVIEW_STEPS} (task #39 gate 1)`);
    }
  }

  // COMPACTION COMPLETENESS (Phase 1F, task #39, gate 3): every LANDED CodeExcerpt
  // in the bundle must appear in EXACTLY ONE step's codeChange, by id. This makes
  // grouping tamper-evident in both directions: dropping a landed change to shrink
  // the story (hiding real work) OR showing one landed change under two steps
  // (double-counting to inflate a unit) both fail closed. Non-landed excerpts are
  // never narrated as code changes (enforced per-step above), so they are excluded
  // from this partition. Only checked once the per-step codeChange shape is known.
  if (Array.isArray(story.steps)) {
    const landedIds = new Set();
    for (const c of bundle.codeEvidence ?? []) {
      if (isObj(c) && nonEmpty(c.id) && c.completeness === "landed") landedIds.add(c.id);
    }
    const seenCode = new Map(); // id -> count across all steps
    for (const s of story.steps) {
      if (!isObj(s) || !Array.isArray(s.codeChange)) continue;
      for (const c of s.codeChange) {
        if (isObj(c) && nonEmpty(c.id)) seenCode.set(c.id, (seenCode.get(c.id) || 0) + 1);
      }
    }
    for (const id of landedIds) {
      const n = seenCode.get(id) || 0;
      if (n === 0) err("steps", `landed CodeExcerpt "${id}" is not shown in any step's code change — compaction must not drop attested landed work (task #39 gate 3)`);
      else if (n > 1) err("steps", `landed CodeExcerpt "${id}" appears in ${n} steps — each landed change must belong to exactly one step (task #39 gate 3)`);
    }
    // And no step may show a landed CodeExcerpt that the bundle does not mark landed
    // (already covered by the byte-for-byte + landed-only per-step checks, but the
    // partition would otherwise silently ignore an id absent from landedIds).
    for (const [id, n] of seenCode) {
      if (!landedIds.has(id) && n > 0) err("steps", `step code change references CodeExcerpt "${id}" which is not a landed excerpt in the bundle (task #39 gate 3)`);
    }
  }

  // GROUPING-KEY MEMBERSHIP (Phase 1F, task #39 gate 3, task #40 REVISE finding #3):
  // the partition check above proves each landed excerpt appears in exactly one step
  // BY ID — but not that it sits in the RIGHT step. Two extra invariants make the
  // grouping tamper-evident so a swap/split (e.g. moving one file's landed edit into
  // another file's step, or splitting one file across two steps) fails closed:
  //   (a) all landed excerpts of a single file/unit (same path) must reside in ONE
  //       step — a path split across steps is rejected;
  //   (b) a step's anchor (its node's first evidence) must be the EARLIEST attested
  //       change event among its members — a step anchored AFTER one of its own code
  //       members (the tell-tale of a swapped-in foreign excerpt) is rejected.
  if (Array.isArray(story.steps) && isObj(ov) && Array.isArray(ov.nodes)) {
    const stepNodeByStepId = new Map();
    for (const n of ov.nodes) if (isObj(n) && nonEmpty(n.stepId)) stepNodeByStepId.set(n.stepId, n);

    // FULL-PARTITION CANONICAL EQUALITY (task #39 REVISE round 4, task #44 findings
    // #1/#2). Round 3 re-derived only a SUBSET of the builder's partition here — it
    // computed fold necessity from the mutable `story.steps` (finding #1) and bound
    // an aggregate's id + path set but not its title/intent/tool-activity/outcome
    // (finding #2). The drift-proof fix is to re-run the SINGLE shared derivation and
    // require the story's ENTIRE ordered step partition to be canonically identical
    // to what the builder deterministically produces from the bundle. Because the
    // derivation reads ONLY bundle-required evidence (implementation edits, diagnosis
    // reasoning, and the narrow-grammar verification set) — never `story.steps` — an
    // attacker cannot change fold necessity by adding/removing a story step, and
    // every aggregate semantic field (members, earliest anchor, derived id,
    // title/intent, tool-activity refs, outcome text + evidence) is bound exactly.
    let derived = null;
    try {
      derived = deriveChangeDescriptors(bundle);
    } catch {
      derived = null;
      err("steps", "the shared canonical derivation could not be recomputed from the bundle (task #39 finding #1/#2)");
    }
    if (derived) {
      const expectedSteps = derived.descriptors.map((d) => d.step);
      const expectedById = new Map(expectedSteps.map((s) => [s.id, s]));
      const expectedIdOrder = expectedSteps.map((s) => s.id);
      const actualIdOrder = story.steps.map((s) => (isObj(s) ? s.id : ""));
      // (1) Same steps, same order. A missing/extra/renamed/reordered step is a
      // partition that the builder would not produce from this bundle.
      if (expectedIdOrder.length !== actualIdOrder.length) {
        err("steps", `the story presents ${actualIdOrder.length} step(s) but the bundle deterministically yields ${expectedIdOrder.length} (task #39 finding #1: the partition is reconstructed from bundle evidence, not story steps)`);
      } else {
        for (let i = 0; i < expectedIdOrder.length; i += 1) {
          if (expectedIdOrder[i] !== actualIdOrder[i]) {
            err("steps", `step ${i} is "${actualIdOrder[i]}" but the bundle-derived partition has "${expectedIdOrder[i]}" at that position (task #39 finding #1/#2)`);
          }
        }
      }
      // (2) Every present step must be canonically identical to its derived twin —
      // this binds title, intent (text/status/evidence), tool activity (name/status/
      // summary/evidence refs), codeChange members, verification blocks, outcome text
      // + evidence, and unknowns, all at once. An aggregate whose label, tool refs, or
      // outcome evidence was hand-edited (finding #2) no longer matches its twin.
      for (const s of story.steps) {
        if (!isObj(s) || !isStr(s.id)) continue;
        const twin = expectedById.get(s.id);
        if (!twin) {
          err("steps", `step "${s.id}" is not a step the bundle-derived partition contains (task #39 finding #1/#2)`);
          continue;
        }
        if (JSON.stringify(canonicalStep(s)) !== JSON.stringify(canonicalStep(twin))) {
          err("steps", `step "${s.id}" does not match the deterministic builder result recomputed from the bundle — its title/intent/tool-activity/code/verification/outcome must equal the canonical derivation (task #39 finding #2)`);
        }
      }

      // (3) FIRST-VIEWPORT NODE LABEL (task #45 finding #1): the selectable overview
      // node label is the first thing a reader sees, yet full-step equality bound only
      // step.title, not the node's own `label`. Require every step node's label to
      // equal its canonical step title, so a rehashed node label cannot diverge from
      // the bundle-derived step it points at.
      for (const [stepId, node] of stepNodeByStepId) {
        const twin = expectedById.get(stepId);
        if (twin && isObj(node) && node.label !== twin.title) {
          err("overview.nodes", `step node "${stepId}" label "${node.label}" does not equal its canonical step title "${twin.title}" — the selectable overview label must equal the bundle-derived title (task #45 finding #1)`);
        }
      }

      // (4) STORY-LEVEL OUTCOME (task #45 finding #2): the visible verification claim
      // (outcome text/status/evidence) is derived by the SAME shared function; require
      // the story's outcome to equal that bundle-derived summary canonically. Round 4
      // bound only which verification refs the outcome may cite — so an attacker could
      // keep the real 5/5 refs while rewriting the sentence to "99/99 passing". Binding
      // the full derived claim closes that surviving form of task #40 finding #2.
      if (derived.outcome && JSON.stringify(canonicalClaim(story.outcome)) !== JSON.stringify(canonicalClaim(derived.outcome))) {
        err("outcome", "does not match the deterministic verification summary recomputed from the bundle — its text/status/evidence must equal the bundle-derived outcome (task #45 finding #2)");
      }
    }

    // The ONLY step that may legitimately span multiple file paths is a cap-produced
    // aggregate the shared derivation itself emitted. Anything else spanning paths is
    // a collapse/relabel attack. (Redundant with full-partition equality above, kept
    // as cheap, independent defense-in-depth for the grouping tamper surface.)
    const expectedAggIds = new Set(
      derived ? derived.descriptors.filter((d) => isObj(d.step) && isStr(d.step.id) && d.step.id.startsWith("step:agg:")).map((d) => d.step.id) : [],
    );

    // (a) same-file grouping: a path may not be split across steps.
    const stepsByPath = new Map();
    for (const s of story.steps) {
      if (!isObj(s) || !Array.isArray(s.codeChange)) continue;
      for (const c of s.codeChange) {
        if (!isObj(c) || !nonEmpty(c.id)) continue;
        const src = codeById.get(c.id);
        if (!src || src.completeness !== "landed") continue;
        const path = src.path ?? "";
        if (!stepsByPath.has(path)) stepsByPath.set(path, new Set());
        stepsByPath.get(path).add(s.id);
      }
    }
    for (const [path, ids] of stepsByPath) {
      if (ids.size > 1) err("steps", `landed changes to "${path}" are split across ${ids.size} steps — all edits to one file/unit must group into a single step (task #39 gate 3 / finding #3)`);
    }

    // (b) SINGLE PATH per non-aggregate step (finding #3 round 2): only a canonical
    // `step:agg:*` may carry landed changes for more than one path. This closes the
    // collapse attack — moving all of a later file's codeChange into an earlier
    // step (and emptying the later step) leaves the later PATH in exactly one step
    // (so the split check above passes) but makes the earlier NON-aggregate step
    // bind two paths, which is rejected here. So a non-aggregate step's title/tool
    // activity/outcome can no longer contradict a foreign file's members.
    for (const s of story.steps) {
      if (!isObj(s) || !Array.isArray(s.codeChange) || !s.codeChange.length) continue;
      const paths = new Set();
      for (const c of s.codeChange) {
        const src = isObj(c) ? codeById.get(c.id) : null;
        if (src && src.completeness === "landed") paths.add(src.path ?? "");
      }
      if (paths.size > 1 && !(isStr(s.id) && expectedAggIds.has(s.id))) {
        err("steps", `non-aggregate step "${s.id}" binds ${paths.size} distinct file paths (${[...paths].join(", ")}); only a canonical cap-produced aggregate (step:agg:*) may span files (task #39 gate 3 / finding #3)`);
      }
    }

    // (c) anchor is the earliest attested change event among the step's members.
    for (const s of story.steps) {
      if (!isObj(s) || !Array.isArray(s.codeChange) || !s.codeChange.length) continue;
      const node = stepNodeByStepId.get(s.id);
      const anchorPos = node ? anchorPosOfNode(node) : null;
      if (anchorPos === null) continue; // absence is caught by the monotonic-order check
      for (const c of s.codeChange) {
        const src = isObj(c) ? codeById.get(c.id) : null;
        if (!src || !nonEmpty(src.toolEventId)) continue;
        const memberPos = posByKey.get(`tool_event:${src.toolEventId}`);
        if (memberPos !== undefined && anchorPos > memberPos) {
          err("steps", `step "${s.id}" is anchored at pos ${anchorPos}, after one of its own code members at pos ${memberPos} — a step must anchor at its earliest attested change event (task #39 gate 3 / finding #3)`);
        }
      }
    }
  }

  // OUTCOME VERIFICATION CLAIM (finding #2, outcome part): gate 4 requires the
  // derived outcome to BIND the attested verification. Make that binding honest:
  // every verification-typed ref the outcome cites must equal a ref actually carried
  // by some verification step (whose command/status/output are byte-bound to source
  // above), and — when the story contains any verification step — the outcome MUST
  // cite at least one such ref. So an outcome cannot spin a passing/failing claim off
  // a phantom or relabeled verification, nor drop the binding to hide a failing run.
  if (isObj(story.outcome) && Array.isArray(story.steps)) {
    const stepVerifRefs = [];
    for (const s of story.steps) {
      if (!isObj(s) || !Array.isArray(s.verification)) continue;
      for (const v of s.verification) {
        if (isObj(v) && Array.isArray(v.evidence)) for (const r of v.evidence) if (isObj(r)) stepVerifRefs.push(r);
      }
    }
    const hasVerifStep = stepVerifRefs.length > 0;
    const outcomeEvidence = Array.isArray(story.outcome.evidence) ? story.outcome.evidence : [];
    const outcomeVerifRefs = outcomeEvidence.filter((r) => isObj(r) && (r.type === "receipt" || r.type === "tool_input" || r.type === "tool_output"));
    for (const r of outcomeVerifRefs) {
      if (!stepVerifRefs.some((sr) => sameRef(sr, r))) {
        err("outcome.evidence", `cites a verification ref (${r.type} "${r.ref}") that no verification step carries — the outcome may only bind verifications proven in a step (finding #2)`);
      }
    }
    if (hasVerifStep && outcomeVerifRefs.length === 0) {
      err("outcome.evidence", "the outcome must bind at least one attested verification when the story contains a verification step (gate 4 / finding #2)");
    }
  }

  // evidence drawer — quotes are subordinate; each must resolve to an excerpt.
  const d = story.evidenceDrawer;
  if (!isObj(d)) {
    err("evidenceDrawer", "required object");
  } else {
    strictKeys(d, STORY_KEYS.drawer, "evidenceDrawer");
    if (!Array.isArray(d.quotes)) err("evidenceDrawer.quotes", "required array");
    else d.quotes.forEach((q, i) => {
      const qp = `evidenceDrawer.quotes[${i}]`;
      if (!isObj(q)) return err(qp, "not an object");
      strictKeys(q, STORY_KEYS.quote, qp);
      if (!nonEmpty(q.id)) err(`${qp}.id`, "required");
      else if (!resolvers.excerpt.has(q.id)) err(qp, `quote "${q.id}" is not a selected excerpt`);
      else if (resolvers.excerpt.get(q.id) !== q.sha256) err(`${qp}.sha256`, "does not match the bundle excerpt (hash drift)");
    });
    if (d.excludedCounts !== undefined) {
      if (!Array.isArray(d.excludedCounts)) err("evidenceDrawer.excludedCounts", "must be an array");
      else d.excludedCounts.forEach((x, i) => strictKeys(x, STORY_KEYS.excludedCount, `evidenceDrawer.excludedCounts[${i}]`));
    }
  }

  // provenance — binds the story to itself and to the bundle it was built from.
  const pv = story.provenance;
  if (!isObj(pv)) {
    err("provenance", "required object");
  } else {
    strictKeys(pv, STORY_KEYS.provenance, "provenance");
    if (!isHex(pv.bundleSha256)) err("provenance.bundleSha256", "required sha-256 hex");
    // The story must bind the EXACT bundle it was built from (finding #3): recompute
    // the canonical bundle hash and require it to match, so a story cannot be paired
    // with a different (or tampered) bundle while still validating.
    else if (pv.bundleSha256 !== sha256(stableStringify(bundle))) err("provenance.bundleSha256", "does not bind the source bundle (hash mismatch)");
    if (!isHex(pv.changeStorySha256)) err("provenance.changeStorySha256", "required sha-256 hex");
    else if (pv.changeStorySha256 !== hashChangeStory(story)) err("provenance.changeStorySha256", "does not bind the change story (hash mismatch)");
  }

  return { ok: errors.length === 0, errors };
}

export function assertChangeStory(story, bundle) {
  const { ok, errors } = validateChangeStory(story, bundle);
  if (!ok) throw new Error(`Invalid ChangeStory:\n - ${errors.join("\n - ")}`);
  return story;
}

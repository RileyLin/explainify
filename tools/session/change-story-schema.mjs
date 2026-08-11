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
  return parts.filter((p) => p.text.length > 0);
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
// Any info / no-run / non-executing flag that a laundering command could carry to
// print a result without running tests. Rejected wherever it appears.
const NO_RUN_FLAGS = new Set([
  "-h", "--help", "-v", "--version", "--dry-run", "--dryrun",
  "--list", "--list-tests", "--listtests", "-e", "--eval", "-p", "--print",
  "--check", "-c", "--compile-only",
]);
const isNoRunFlag = (tok) => { const o = shellOptName(tok); return o ? NO_RUN_FLAGS.has(o.toLowerCase()) : false; };
function isTestFileToken(token) {
  const base = shellBasename(token);
  return /^[\w@.-]*[._-](?:test|spec)\.(?:c|m)?[jt]sx?$/i.test(base)
    || /^[\w@.-]*[._-](?:test|spec)\.(?:py|rb|go)$/i.test(base);
}
const NODE_RUNTIMES = new Set(["node", "ts-node", "tsx", "babel-node"]);
const PKG_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const RUNNER_BINS = new Set(["vitest", "jest", "mocha", "ava", "tap", "c8", "nyc"]);
const VERIFY_SCRIPTS = new Set(["test", "lint", "build", "typecheck", "compile"]);

// Does a SINGLE recognized-runner segment's token stream actually invoke a test
// runner (with no info/no-run flag or argument passthrough)?
function isRunnerTokens(tokens0) {
  let tokens = tokens0.slice();
  // strip leading NAME=value env assignments
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
  if (!tokens.length) return false;
  // `--` passthrough carrying tokens can smuggle a no-run mode (`npm test -- --listTests`)
  const dd = tokens.indexOf("--");
  if (dd >= 0 && dd < tokens.length - 1) return false;
  for (const t of tokens) if (isNoRunFlag(t)) return false;
  let head = shellBasename(tokens[0]);
  let rest = tokens.slice(1);
  // launcher unwrap: `npx <tool>`, `pnpm dlx <tool>`, `yarn dlx <tool>`
  if (head === "npx") { if (!rest.length) return false; head = shellBasename(rest[0]); rest = rest.slice(1); }
  else if ((head === "pnpm" || head === "yarn") && rest[0] === "dlx") { if (rest.length < 2) return false; head = shellBasename(rest[1]); rest = rest.slice(2); }
  if (NODE_RUNTIMES.has(head)) {
    if (rest.some((t) => t === "--test")) return true;             // node built-in runner
    return rest.some((t) => !t.startsWith("-") && isTestFileToken(t)); // direct *.test.* run
  }
  if (PKG_MANAGERS.has(head)) {
    const first = rest.find((t) => !t.startsWith("-"));
    if (!first) return false;
    if (first === "run") { const name = rest.slice(rest.indexOf("run") + 1).find((t) => !t.startsWith("-")); return VERIFY_SCRIPTS.has(name); }
    return VERIFY_SCRIPTS.has(first); // `npm test`, `yarn lint`, `bun test`
  }
  if (RUNNER_BINS.has(head)) return true; // vitest / jest / mocha / … run by default
  return false;
}

// A Bash command is verification evidence ONLY when it is a single, unconditional,
// foreground run of a recognized test runner. Compounds/pipes/separators (`||`,
// `&&`, `|`, `;`, newline), backgrounding (`&`), command substitution, heredocs,
// comments hiding a separator, and info/no-run flags all disqualify it — so a
// status-masking or laundered command can never mint or validate a verification.
export function isVerificationCommand(rawCommand) {
  const command = stripShellComments(String(rawCommand ?? ""));
  if (!command.trim()) return false;
  if (hasAmbiguousShellForm(command)) return false;
  const segs = shellSegments(command);
  if (segs.length !== 1) return false;     // any top-level separator/pipe/compound
  const seg = segs[0];
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
    // A canonical cap-produced aggregate step (and ONLY it) may span multiple paths;
    // it is the sole multi-path form the builder emits (capOverview → `step:agg:*`).
    const isAggregateStep = (s) => isObj(s) && isStr(s.id) && s.id.startsWith("step:agg:");

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
      if (paths.size > 1 && !isAggregateStep(s)) {
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

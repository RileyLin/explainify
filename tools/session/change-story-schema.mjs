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

export const CHANGE_STORY_SCHEMA_VERSION = 2;

// Semantic evidence view (R4) — what the topology MEANS.
export const VIEW_TYPES = ["workflow", "architecture", "sequence", "dataflow", "lifecycle"];
// Layout engine only (R4) — reused vocabulary from the web app's flow.ts.
export const RENDER_HINTS = ["sequential", "graph", "hierarchy"];
export const NODE_KINDS = ["objective", "step", "verification", "outcome", "unknown"];
// Only observed_sequence is derivable from the current capture (R4); the others
// are declared so a tampered story naming them without direct evidence fails.
export const EDGE_KINDS = ["observed_sequence", "caused_by", "architecture", "dataflow"];
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

  if (!isObj(story)) return { ok: false, errors: ["changeStory: not an object"] };
  if (!isObj(bundle)) return { ok: false, errors: ["changeStory: a validated bundle is required to resolve evidence refs"] };

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
  for (const rc of bundle.receipts ?? []) if (isObj(rc) && nonEmpty(rc.id)) resolvers.receipt.set(rc.id, hashReceipt(rc));
  const codeById = new Map();
  for (const c of bundle.codeEvidence ?? []) if (isObj(c) && nonEmpty(c.id)) { resolvers.code_excerpt.set(c.id, hashCodeExcerpt(c)); codeById.set(c.id, c); }

  // Resolve one EvidenceRef: dangling id or hash drift both fail closed.
  const checkRef = (ref, path) => {
    if (!isObj(ref)) return err(path, "evidence ref must be an object");
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
  const ov = story.overview;
  if (!isObj(ov)) {
    err("overview", "required object");
  } else {
    if (!inSet(ov.viewType, VIEW_TYPES)) err("overview.viewType", `one of ${VIEW_TYPES.join("|")}`);
    if (!inSet(ov.renderHint, RENDER_HINTS)) err("overview.renderHint", `one of ${RENDER_HINTS.join("|")}`);
    if (!Array.isArray(ov.nodes) || ov.nodes.length === 0) {
      err("overview.nodes", "required non-empty array");
    } else {
      ov.nodes.forEach((n, i) => {
        const p = `overview.nodes[${i}]`;
        if (!isObj(n)) return err(p, "not an object");
        if (!nonEmpty(n.id)) err(`${p}.id`, "required");
        else { if (nodeIds.has(n.id)) err(`${p}.id`, `duplicate node id "${n.id}"`); nodeIds.add(n.id); }
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
        const hasExcerpt = Array.isArray(s.intent.evidence) && s.intent.evidence.some((r) => isObj(r) && r.type === "excerpt");
        if (!hasExcerpt) err(`${p}.intent`, "an observed intent must cite an excerpt (R4); mark it inferred otherwise");
      }
      if (!Array.isArray(s.toolActivity)) err(`${p}.toolActivity`, "required array");
      else s.toolActivity.forEach((a, j) => {
        const ap = `${p}.toolActivity[${j}]`;
        if (!isObj(a)) return err(ap, "not an object");
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
          if (!nonEmpty(v.command)) err(`${vp}.command`, "required");
          if (!inSet(v.status, ["succeeded", "failed", "unknown"])) err(`${vp}.status`, "one of succeeded|failed|unknown");
          checkRefs(v.evidence, `${vp}.evidence`);
        });
      }
      checkClaim(s.outcome, `${p}.outcome`);
      if (s.unknowns !== undefined && !Array.isArray(s.unknowns)) err(`${p}.unknowns`, "must be an array");
    });
  }

  // Every step node in the overview must reference an existing step, and vice versa.
  if (isObj(ov) && Array.isArray(ov.nodes)) {
    ov.nodes.forEach((n, i) => {
      if (isObj(n) && n.kind === "step" && nonEmpty(n.stepId) && !stepIds.has(n.stepId)) {
        err(`overview.nodes[${i}].stepId`, `references unknown step "${n.stepId}"`);
      }
    });
  }

  // evidence drawer — quotes are subordinate; each must resolve to an excerpt.
  const d = story.evidenceDrawer;
  if (!isObj(d)) {
    err("evidenceDrawer", "required object");
  } else {
    if (!Array.isArray(d.quotes)) err("evidenceDrawer.quotes", "required array");
    else d.quotes.forEach((q, i) => {
      const qp = `evidenceDrawer.quotes[${i}]`;
      if (!isObj(q)) return err(qp, "not an object");
      if (!nonEmpty(q.id)) err(`${qp}.id`, "required");
      else if (!resolvers.excerpt.has(q.id)) err(qp, `quote "${q.id}" is not a selected excerpt`);
      else if (resolvers.excerpt.get(q.id) !== q.sha256) err(`${qp}.sha256`, "does not match the bundle excerpt (hash drift)");
    });
    if (d.excludedCounts !== undefined && !Array.isArray(d.excludedCounts)) err("evidenceDrawer.excludedCounts", "must be an array");
  }

  // provenance — binds the story to itself and to the bundle it was built from.
  const pv = story.provenance;
  if (!isObj(pv)) {
    err("provenance", "required object");
  } else {
    if (!isHex(pv.bundleSha256)) err("provenance.bundleSha256", "required sha-256 hex");
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

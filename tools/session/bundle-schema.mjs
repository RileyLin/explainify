// SessionEvidenceBundle — the provider-neutral contract between Phase 1A
// (capture / this module: the producer) and Phase 1B (synthesis: the consumer).
// Frozen against docs/product/session-to-explain-v1.md @d203e9f (final consumer
// bindings: session.finalMessageSha256; tool status bound in the always-present
// input canonical hash; objective.text must equal its cited excerpt). Synthesis
// consumes THIS shape and never reads a Claude transcript directly.
//
// This module is dependency-free so both the adapter and the 1B reader import
// the same validator AND the same canonical-hash functions. Because the hash
// binding lives here, producer and consumer cannot disagree on what a hash
// covers — the validator recomputes every hash and rejects mismatches.

import { createHash } from "node:crypto";

// v1 is the original evidence bundle; v2 (Phase 1E) ADDS a hash-bound
// `codeEvidence` collection (CodeExcerpt[]) derived by the adapter and joined to
// repository.changedFiles. Both versions validate; a v1 bundle must NOT carry
// codeEvidence, a v2 bundle MUST. The default emitted by the adapter is v2.
export const BUNDLE_SCHEMA_VERSION = 1;
export const BUNDLE_SCHEMA_VERSION_V2 = 2;
export const SUPPORTED_BUNDLE_SCHEMA_VERSIONS = [BUNDLE_SCHEMA_VERSION, BUNDLE_SCHEMA_VERSION_V2];

// CodeExcerpt classification (Phase 1E, R1/R2/R5).
export const CODE_EXCERPT_KINDS = ["hunk", "full_file", "unsupported"];
export const CODE_COMPLETENESS = ["landed", "superseded", "unknown"];

export const EXCERPT_KINDS = [
  "user_requirement",
  "agent_decision",
  "agent_explanation",
  "error",
  "unresolved",
];
export const EXCERPT_ROLES = ["user", "assistant", "tool"];
export const TOOL_STATUSES = ["succeeded", "failed", "denied", "unknown"];
export const RECEIPT_STATUSES = ["succeeded", "failed", "unknown"];
export const CAPTURE_EVENTS = ["tool_call", "stop", "session_end", "fixture"];
export const SESSION_SOURCES = ["claude_code", "generic_agent"];
export const CHANGE_STATUSES = ["added", "modified", "deleted", "renamed"];
export const RECEIPT_KINDS = ["test", "lint", "build", "command", "git_status"];
export const TECHNICAL_DEPTHS = ["overview", "working", "expert"];

// Shared size bounds. The adapter clips to these; the validator rejects any
// field or whole-bundle that exceeds them, so an oversize bundle never reaches
// synthesis. Kept generous enough for real excerpts but far below transcript
// scale.
export const LIMITS = {
  maxFieldChars: 8000, // any single text/summary/content field
  maxBundleBytes: 512 * 1024, // whole serialized bundle
  maxExcerpts: 200,
  maxToolEvents: 200,
  maxReceipts: 100,
  // Phase 1E code evidence (R2): an exact, bounded preimage of real code. A
  // before/after that would exceed either bound is NOT clipped — the whole
  // CodeExcerpt becomes kind:"unsupported" with a reason, so a truncated hunk is
  // never presented as exact code. maxFieldChars still caps the field for the
  // shared `bounded` check; these are the tighter, code-specific gates the
  // adapter enforces before emission.
  maxCodeExcerptBytes: 4000, // per before/after field, UTF-8 bytes
  maxCodeExcerptLines: 120, // per before/after field, line count
  maxCodeEvidenceBytes: 48 * 1024, // aggregate over all codeEvidence before/after
  maxCodeExcerpts: 60,
};

const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

// --- canonical hash bindings (the single source of truth) ---
//
// Hashes bind the FULL evidence record — its semantic labels (id, kind, role,
// status) and locators — not just the free text. A relabel (changing toolName,
// status, kind, or a locator) therefore invalidates the hash, so a tampered
// bundle cannot pass validation by keeping the same text. Every serialization
// is a positional array with deterministic order.
//
// Two invariants are not hash-based but enforced by validateBundle for the same
// no-drift reason (contract @d203e9f): a tool's status is bound in the
// always-present INPUT hash (so a resultless "unknown" tool cannot be relabeled
// "succeeded"), and objective.text must equal its cited source excerpt's text.

// Excerpt hash binds id, kind, role, text, and locator.
export function canonicalExcerpt(e) {
  return JSON.stringify(["excerpt", e.id ?? "", e.kind ?? "", e.role ?? "", e.text ?? "", e.locator ?? ""]);
}
export const hashExcerpt = (e) => sha256(canonicalExcerpt(e));

// Tool input hash binds id, tool name, STATUS, input summary, and input locator.
// Status is bound here (the always-present hash) — not only in the optional
// output hash — so a resultless tool whose status is "unknown" cannot be
// relabeled "succeeded" without invalidating a hash. An output-bearing tool
// therefore binds its status twice (input + output); both must agree.
export function canonicalToolInput(t) {
  return JSON.stringify(["tool_input", t.id ?? "", t.toolName ?? "", t.status ?? "", t.inputSummary ?? "", t.inputLocator ?? ""]);
}
export const hashToolInput = (t) => sha256(canonicalToolInput(t));

// Tool output hash binds id, status, output summary, and output locator.
export function canonicalToolOutput(t) {
  return JSON.stringify(["tool_output", t.id ?? "", t.status ?? "", t.outputSummary ?? "", t.outputLocator ?? ""]);
}
export const hashToolOutput = (t) => sha256(canonicalToolOutput(t));

// Receipt hash binds id, kind, command, status, optional exit code, scope,
// content, and both locators.
export function canonicalReceipt(rc) {
  return JSON.stringify([
    "receipt",
    rc.id ?? "",
    rc.kind ?? "",
    rc.command ?? "",
    rc.status ?? "",
    rc.exitCode ?? null,
    rc.scope ?? "",
    rc.content ?? "",
    rc.commandLocator ?? "",
    rc.outputLocator ?? "",
  ]);
}
export const hashReceipt = (rc) => sha256(canonicalReceipt(rc));

// CodeExcerpt hash binds EVERY semantic field (R3): a relabel of the path, the
// completeness classification, the resolved symbol, either locator, or the
// before/after code text invalidates the hash, so a tampered code story cannot
// pass validation by keeping the text. Optional fields serialize as "" / null in
// a fixed positional order so producer and consumer canonicalize identically.
export function canonicalCodeExcerpt(c) {
  return JSON.stringify([
    "code_excerpt",
    c.id ?? "",
    c.toolEventId ?? "",
    c.path ?? "",
    c.changeStatus ?? "",
    c.kind ?? "",
    c.completeness ?? "",
    c.before ?? "",
    c.after ?? "",
    c.symbol ?? "",
    c.codeLocator ?? "",
    c.transcriptLocator ?? "",
    c.finalContentSha256 ?? "",
    c.unknownReason ?? "",
  ]);
}
export const hashCodeExcerpt = (c) => sha256(canonicalCodeExcerpt(c));

// --- allowed key sets, for strict unknown-field rejection ---

const KEYS = {
  // `codeEvidence` is v2-only: required when schemaVersion===2, forbidden at v1.
  bundle: ["schemaVersion", "request", "session", "objective", "excerpts", "toolEvents", "repository", "receipts", "exclusions", "privacy", "codeEvidence", "observedOrder"],
  observedOrderEntry: ["kind", "id"],
  codeExcerpt: ["id", "toolEventId", "path", "changeStatus", "kind", "completeness", "before", "after", "symbol", "codeLocator", "transcriptLocator", "finalContentSha256", "unknownReason", "sha256"],
  request: ["question", "audience"],
  audience: ["role", "technicalDepth"],
  session: ["id", "source", "captureEvent", "cwd", "transcriptSha256", "startedAt", "endedAt", "finalMessageSha256"],
  objective: ["text", "sourceId"],
  excerpt: ["id", "kind", "role", "text", "locator", "sha256"],
  toolEvent: ["id", "toolName", "status", "inputSummary", "outputSummary", "inputLocator", "inputSha256", "outputLocator", "outputSha256"],
  repository: ["baseRevision", "headRevision", "dirty", "changedFiles"],
  changedFile: ["path", "status", "sha256"],
  receipt: ["id", "kind", "command", "status", "exitCode", "scope", "content", "commandLocator", "outputLocator", "sha256"],
  exclusion: ["kind", "count", "reason"],
  privacy: ["redactionCount", "deniedPathCount", "secretScan", "publication"],
};

// Accumulating strict validator. Returns { ok, errors } and never throws on
// shape problems. Strict: rejects unknown fields, dangling references,
// duplicate IDs, hash/content mismatches, over-limit fields/bundles, and
// unsupported enum values. A structurally invalid bundle must never reach
// synthesis, so this is the fail-closed gate.
export function validateBundle(bundle) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const isStr = (v) => typeof v === "string";
  const nonEmpty = (v) => isStr(v) && v.length > 0;
  const isHex = (v) => isStr(v) && HEX64.test(v);
  const inSet = (v, set) => isStr(v) && set.includes(v);
  const bounded = (v, path) => {
    if (isStr(v) && v.length > LIMITS.maxFieldChars) err(path, `exceeds ${LIMITS.maxFieldChars} chars`);
  };
  // Reject unknown keys against an allow-list.
  const strictKeys = (obj, allowed, path) => {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) err(`${path}.${k}`, "unknown field");
    }
  };

  // A repo-relative path is safe iff it is non-empty, uses forward slashes, is
  // not absolute, and contains no `.`/`..` traversal segment. R3 requires the
  // CodeExcerpt path to be a normalized repo-relative path with no traversal.
  const isSafeRelPath = (p) => {
    if (!nonEmpty(p)) return false;
    if (p.includes("\\")) return false; // must be forward-slash normalized
    if (p.startsWith("/")) return false; // absolute
    if (/^[A-Za-z]:/.test(p)) return false; // windows drive
    const segs = p.split("/");
    return !segs.some((s) => s === "" || s === "." || s === "..");
  };
  const utf8 = (v) => (isStr(v) ? Buffer.byteLength(v, "utf8") : 0);
  const lineCount = (v) => (isStr(v) && v.length ? v.split("\n").length : 0);

  if (!isObj(bundle)) return { ok: false, errors: ["bundle: not an object"] };
  strictKeys(bundle, KEYS.bundle, "bundle");
  const isV2 = bundle.schemaVersion === BUNDLE_SCHEMA_VERSION_V2;
  if (!SUPPORTED_BUNDLE_SCHEMA_VERSIONS.includes(bundle.schemaVersion)) {
    err("schemaVersion", `one of ${SUPPORTED_BUNDLE_SCHEMA_VERSIONS.join("|")}`);
  }
  // codeEvidence is v2-only. At v1 its mere presence is an unknown-field-style
  // violation; at v2 it is required. This keeps the two shapes non-overlapping.
  if (!isV2 && bundle.codeEvidence !== undefined) {
    err("bundle.codeEvidence", "present only in schemaVersion 2");
  }
  // observedOrder (the attested cross-type timeline) is likewise v2-only.
  if (!isV2 && bundle.observedOrder !== undefined) {
    err("bundle.observedOrder", "present only in schemaVersion 2");
  }

  // request (caller context — NOT evidence)
  const rq = bundle.request;
  if (!isObj(rq)) {
    err("request", "required object missing");
  } else {
    strictKeys(rq, KEYS.request, "request");
    if (!isStr(rq.question)) err("request.question", "required string");
    bounded(rq.question, "request.question");
    if (!isObj(rq.audience)) {
      err("request.audience", "required object");
    } else {
      strictKeys(rq.audience, KEYS.audience, "request.audience");
      if (!nonEmpty(rq.audience.role)) err("request.audience.role", "required non-empty string");
      if (!inSet(rq.audience.technicalDepth, TECHNICAL_DEPTHS)) err("request.audience.technicalDepth", `one of ${TECHNICAL_DEPTHS.join("|")}`);
    }
  }

  // session
  const s = bundle.session;
  if (!isObj(s)) {
    err("session", "required object missing");
  } else {
    strictKeys(s, KEYS.session, "session");
    if (!nonEmpty(s.id)) err("session.id", "required non-empty string");
    if (!inSet(s.source, SESSION_SOURCES)) err("session.source", `one of ${SESSION_SOURCES.join("|")}`);
    if (!inSet(s.captureEvent, CAPTURE_EVENTS)) err("session.captureEvent", `one of ${CAPTURE_EVENTS.join("|")}`);
    if (!nonEmpty(s.cwd)) err("session.cwd", "required non-empty string");
    if (!isHex(s.transcriptSha256)) err("session.transcriptSha256", "required sha-256 hex");
    if (s.startedAt !== undefined && !isStr(s.startedAt)) err("session.startedAt", "must be string");
    if (s.endedAt !== undefined && !isStr(s.endedAt)) err("session.endedAt", "must be string");
    if (s.finalMessageSha256 !== undefined && !isHex(s.finalMessageSha256)) err("session.finalMessageSha256", "must be sha-256 hex when present");
  }

  // Collect ids across excerpts/tools/receipts for uniqueness + reference checks.
  const excerptIds = new Set();
  const toolEventIds = new Set(); // for the CodeExcerpt.toolEventId join (R3)
  const receiptIds = new Set(); // for the observedOrder bijection (findings #1/#2)
  const changedFileByPath = new Map(); // path -> { status, sha256 } for the code join
  const allIds = new Set();
  const dupCheck = (id, path) => {
    if (!nonEmpty(id)) { err(`${path}.id`, "required"); return; }
    if (allIds.has(id)) err(`${path}.id`, `duplicate id "${id}"`);
    allIds.add(id);
  };

  // excerpts
  if (!Array.isArray(bundle.excerpts)) {
    err("excerpts", "required array");
  } else {
    if (bundle.excerpts.length > LIMITS.maxExcerpts) err("excerpts", `exceeds ${LIMITS.maxExcerpts}`);
    bundle.excerpts.forEach((e, i) => {
      const p = `excerpts[${i}]`;
      if (!isObj(e)) return err(p, "not an object");
      strictKeys(e, KEYS.excerpt, p);
      dupCheck(e.id, p);
      if (nonEmpty(e.id)) excerptIds.add(e.id);
      if (!inSet(e.kind, EXCERPT_KINDS)) err(`${p}.kind`, `one of ${EXCERPT_KINDS.join("|")}`);
      if (!inSet(e.role, EXCERPT_ROLES)) err(`${p}.role`, `one of ${EXCERPT_ROLES.join("|")}`);
      if (!isStr(e.text)) err(`${p}.text`, "required string");
      bounded(e.text, `${p}.text`);
      if (!nonEmpty(e.locator)) err(`${p}.locator`, "required");
      if (!isHex(e.sha256)) err(`${p}.sha256`, "required sha-256 hex");
      else if (e.sha256 !== hashExcerpt(e)) err(`${p}.sha256`, "does not bind id/kind/role/text/locator (hash mismatch)");
    });
  }

  // toolEvents — separate input/output locators + hashes; output optional.
  if (!Array.isArray(bundle.toolEvents)) {
    err("toolEvents", "required array");
  } else {
    if (bundle.toolEvents.length > LIMITS.maxToolEvents) err("toolEvents", `exceeds ${LIMITS.maxToolEvents}`);
    bundle.toolEvents.forEach((t, i) => {
      const p = `toolEvents[${i}]`;
      if (!isObj(t)) return err(p, "not an object");
      strictKeys(t, KEYS.toolEvent, p);
      dupCheck(t.id, p);
      if (nonEmpty(t.id)) toolEventIds.add(t.id);
      if (!nonEmpty(t.toolName)) err(`${p}.toolName`, "required");
      if (!inSet(t.status, TOOL_STATUSES)) err(`${p}.status`, `one of ${TOOL_STATUSES.join("|")}`);
      if (!isStr(t.inputSummary)) err(`${p}.inputSummary`, "required string");
      bounded(t.inputSummary, `${p}.inputSummary`);
      if (!isStr(t.outputSummary)) err(`${p}.outputSummary`, "required string");
      bounded(t.outputSummary, `${p}.outputSummary`);
      if (!nonEmpty(t.inputLocator)) err(`${p}.inputLocator`, "required");
      if (!isHex(t.inputSha256)) err(`${p}.inputSha256`, "required sha-256 hex");
      else if (t.inputSha256 !== hashToolInput(t)) err(`${p}.inputSha256`, "does not bind id/toolName/status/inputSummary/inputLocator (hash mismatch)");
      // Output is optional but must be internally consistent: if there is an
      // output summary there must be a locator + matching hash, and vice versa.
      const hasOut = t.outputSummary.length > 0 || t.outputLocator !== undefined || t.outputSha256 !== undefined;
      if (hasOut) {
        if (!nonEmpty(t.outputLocator)) err(`${p}.outputLocator`, "required when output present");
        if (!isHex(t.outputSha256)) err(`${p}.outputSha256`, "required sha-256 hex when output present");
        else if (t.outputSha256 !== hashToolOutput(t)) err(`${p}.outputSha256`, "does not bind id/status/outputSummary/outputLocator (hash mismatch)");
        if (nonEmpty(t.outputLocator) && nonEmpty(t.inputLocator) && t.outputLocator === t.inputLocator) {
          err(`${p}.outputLocator`, "a tool output must not borrow its input locator");
        }
      }
    });
  }

  // repository
  const r = bundle.repository;
  if (!isObj(r)) {
    err("repository", "required object missing");
  } else {
    strictKeys(r, KEYS.repository, "repository");
    if (r.baseRevision !== undefined && !isStr(r.baseRevision)) err("repository.baseRevision", "must be string");
    if (r.headRevision !== undefined && !isStr(r.headRevision)) err("repository.headRevision", "must be string");
    if (typeof r.dirty !== "boolean") err("repository.dirty", "required boolean");
    if (!Array.isArray(r.changedFiles)) {
      err("repository.changedFiles", "required array");
    } else {
      r.changedFiles.forEach((c, i) => {
        const p = `repository.changedFiles[${i}]`;
        if (!isObj(c)) return err(p, "not an object");
        strictKeys(c, KEYS.changedFile, p);
        if (!nonEmpty(c.path)) err(`${p}.path`, "required");
        if (!inSet(c.status, CHANGE_STATUSES)) err(`${p}.status`, `one of ${CHANGE_STATUSES.join("|")}`);
        if (c.sha256 !== undefined && !isHex(c.sha256)) err(`${p}.sha256`, "must be sha-256 hex when present");
        if (nonEmpty(c.path)) changedFileByPath.set(c.path, { status: c.status, sha256: c.sha256 });
      });
    }
  }

  // codeEvidence (v2, Phase 1E) — hash-bound CodeExcerpts derived by the adapter
  // from successful Edit/Write tool events and joined to repository.changedFiles.
  // Every field is bound by hashCodeExcerpt (R3); referential integrity is
  // fail-closed: a dangling toolEventId, a path not in changedFiles, an inconsistent
  // completeness/kind, or an over-limit before/after all reject the whole bundle.
  if (isV2) {
    if (!Array.isArray(bundle.codeEvidence)) {
      err("codeEvidence", "required array in schemaVersion 2");
    } else {
      if (bundle.codeEvidence.length > LIMITS.maxCodeExcerpts) err("codeEvidence", `exceeds ${LIMITS.maxCodeExcerpts}`);
      let aggregateBytes = 0;
      bundle.codeEvidence.forEach((c, i) => {
        const p = `codeEvidence[${i}]`;
        if (!isObj(c)) return err(p, "not an object");
        strictKeys(c, KEYS.codeExcerpt, p);
        dupCheck(c.id, p);
        // toolEventId must resolve to a selected tool event (no dangling ref).
        if (!nonEmpty(c.toolEventId)) err(`${p}.toolEventId`, "required");
        else if (!toolEventIds.has(c.toolEventId)) err(`${p}.toolEventId`, `dangling reference "${c.toolEventId}" (must resolve to a selected tool event)`);
        // path must be a normalized repo-relative path AND join an actual changed file.
        if (!isSafeRelPath(c.path)) err(`${p}.path`, "must be a normalized repo-relative path (no absolute/traversal/backslash)");
        else if (!changedFileByPath.has(c.path)) err(`${p}.path`, `path "${c.path}" is not in repository.changedFiles (exact join required)`);
        if (!inSet(c.changeStatus, CHANGE_STATUSES)) err(`${p}.changeStatus`, `one of ${CHANGE_STATUSES.join("|")}`);
        else if (changedFileByPath.has(c.path) && changedFileByPath.get(c.path).status !== c.changeStatus) {
          err(`${p}.changeStatus`, `must equal changedFiles["${c.path}"].status`);
        }
        if (!inSet(c.kind, CODE_EXCERPT_KINDS)) err(`${p}.kind`, `one of ${CODE_EXCERPT_KINDS.join("|")}`);
        if (!inSet(c.completeness, CODE_COMPLETENESS)) err(`${p}.completeness`, `one of ${CODE_COMPLETENESS.join("|")}`);

        // before/after bounds (R2): present iff kind !== unsupported; each within
        // per-item byte + line limits; the aggregate within maxCodeEvidenceBytes.
        for (const field of ["before", "after"]) {
          const v = c[field];
          if (v !== undefined) {
            if (!isStr(v)) { err(`${p}.${field}`, "must be string when present"); continue; }
            bounded(v, `${p}.${field}`);
            if (utf8(v) > LIMITS.maxCodeExcerptBytes) err(`${p}.${field}`, `exceeds ${LIMITS.maxCodeExcerptBytes} UTF-8 bytes (must be unsupported, not clipped)`);
            if (lineCount(v) > LIMITS.maxCodeExcerptLines) err(`${p}.${field}`, `exceeds ${LIMITS.maxCodeExcerptLines} lines (must be unsupported, not clipped)`);
            aggregateBytes += utf8(v);
          }
        }
        if (c.kind === "unsupported") {
          if (c.before !== undefined || c.after !== undefined) err(`${p}`, "unsupported code excerpt must not carry before/after code");
        } else {
          // A supported hunk/full_file must carry the exact code it stands for.
          if (!isStr(c.after)) err(`${p}.after`, "required for a supported code excerpt");
          if (c.kind === "hunk" && !isStr(c.before)) err(`${p}.before`, "required for a hunk (the exact old_string)");
        }

        // completeness ↔ codeLocator/unknownReason coupling (R1/R5).
        if (c.completeness === "landed") {
          if (c.kind === "unsupported") err(`${p}`, "an unsupported excerpt cannot be classified landed");
          if (!nonEmpty(c.codeLocator)) err(`${p}.codeLocator`, "required when completeness is landed (final file byte/line span)");
        } else {
          if (c.codeLocator !== undefined) err(`${p}.codeLocator`, "present only when completeness is landed");
          if (!nonEmpty(c.unknownReason)) err(`${p}.unknownReason`, `required when completeness is "${c.completeness}"`);
        }
        if (c.kind === "unsupported" && !nonEmpty(c.unknownReason)) err(`${p}.unknownReason`, "required when kind is unsupported");

        // transcriptLocator is mandatory (R5) and must not be reused as codeLocator.
        if (!nonEmpty(c.transcriptLocator)) err(`${p}.transcriptLocator`, "required (jsonl pointer to the tool input)");
        if (nonEmpty(c.codeLocator) && nonEmpty(c.transcriptLocator) && c.codeLocator === c.transcriptLocator) {
          err(`${p}.codeLocator`, "a code locator must not borrow the transcript locator (R5)");
        }
        if (c.symbol !== undefined && !isStr(c.symbol)) err(`${p}.symbol`, "must be string when present");
        // finalContentSha256, when present, must equal the joined changed file's hash.
        if (c.finalContentSha256 !== undefined) {
          if (!isHex(c.finalContentSha256)) err(`${p}.finalContentSha256`, "must be sha-256 hex when present");
          else if (changedFileByPath.has(c.path)) {
            const fileSha = changedFileByPath.get(c.path).sha256;
            if (fileSha !== undefined && fileSha !== c.finalContentSha256) {
              err(`${p}.finalContentSha256`, `must equal changedFiles["${c.path}"].sha256`);
            }
          }
        }
        if (!isHex(c.sha256)) err(`${p}.sha256`, "required sha-256 hex");
        else if (c.sha256 !== hashCodeExcerpt(c)) err(`${p}.sha256`, "does not bind all CodeExcerpt fields (hash mismatch)");
      });
      if (aggregateBytes > LIMITS.maxCodeEvidenceBytes) err("codeEvidence", `aggregate before/after ${aggregateBytes} exceeds ${LIMITS.maxCodeEvidenceBytes} bytes`);
    }
  }

  // receipts — canonical hash + command/output locators + honest status.
  if (!Array.isArray(bundle.receipts)) {
    err("receipts", "required array");
  } else {
    if (bundle.receipts.length > LIMITS.maxReceipts) err("receipts", `exceeds ${LIMITS.maxReceipts}`);
    bundle.receipts.forEach((rc, i) => {
      const p = `receipts[${i}]`;
      if (!isObj(rc)) return err(p, "not an object");
      strictKeys(rc, KEYS.receipt, p);
      dupCheck(rc.id, p);
      if (!inSet(rc.kind, RECEIPT_KINDS)) err(`${p}.kind`, `one of ${RECEIPT_KINDS.join("|")}`);
      if (!isStr(rc.command)) err(`${p}.command`, "required string");
      if (!inSet(rc.status, RECEIPT_STATUSES)) err(`${p}.status`, `one of ${RECEIPT_STATUSES.join("|")}`);
      if (rc.exitCode !== undefined && !Number.isInteger(rc.exitCode)) err(`${p}.exitCode`, "must be integer when present");
      if (rc.status === "unknown" && rc.exitCode !== undefined) err(`${p}.exitCode`, "must be absent when status is unknown");
      if (!isStr(rc.scope)) err(`${p}.scope`, "required string");
      if (!isStr(rc.content)) err(`${p}.content`, "required string");
      bounded(rc.content, `${p}.content`);
      if (!nonEmpty(rc.commandLocator)) err(`${p}.commandLocator`, "required");
      if (rc.outputLocator !== undefined && !nonEmpty(rc.outputLocator)) err(`${p}.outputLocator`, "must be non-empty when present");
      if (!isHex(rc.sha256)) err(`${p}.sha256`, "required sha-256 hex");
      else if (rc.sha256 !== hashReceipt(rc)) err(`${p}.sha256`, "does not bind canonical receipt (hash mismatch)");
      if (nonEmpty(rc.id)) receiptIds.add(rc.id);
    });
  }

  // observedOrder (v2, findings #1/#2) — the single attested cross-type timeline.
  // It MUST be a bijection over every kept excerpt, tool event, and receipt: each
  // appears exactly once, no dangling id, no duplicate, none omitted. This is what
  // makes the ChangeStory's observed_sequence edges provable — the story may only
  // claim adjacency that this order supports, so the order itself must be complete
  // and unambiguous or the whole bundle fails closed.
  if (isV2) {
    if (!Array.isArray(bundle.observedOrder)) {
      err("observedOrder", "required array in schemaVersion 2");
    } else {
      const kindSets = { excerpt: excerptIds, tool_event: toolEventIds, receipt: receiptIds };
      const seen = new Set();
      bundle.observedOrder.forEach((o, i) => {
        const p = `observedOrder[${i}]`;
        if (!isObj(o)) return err(p, "not an object");
        strictKeys(o, KEYS.observedOrderEntry, p);
        const set = kindSets[o.kind];
        if (!set) return err(`${p}.kind`, "one of excerpt|tool_event|receipt");
        if (!nonEmpty(o.id)) return err(`${p}.id`, "required");
        if (!set.has(o.id)) return err(p, `dangling ${o.kind} reference "${o.id}"`);
        const key = `${o.kind}:${o.id}`;
        if (seen.has(key)) err(p, `duplicate timeline entry for ${o.kind} "${o.id}"`);
        seen.add(key);
      });
      // Completeness: every selected item must appear exactly once.
      const expected = excerptIds.size + toolEventIds.size + receiptIds.size;
      if (seen.size !== expected) {
        err("observedOrder", `must list every excerpt/tool event/receipt exactly once (has ${seen.size}, expected ${expected})`);
      }
    }
  }

  // exclusions
  if (!Array.isArray(bundle.exclusions)) {
    err("exclusions", "required array");
  } else {
    bundle.exclusions.forEach((x, i) => {
      const p = `exclusions[${i}]`;
      if (!isObj(x)) return err(p, "not an object");
      strictKeys(x, KEYS.exclusion, p);
      if (!nonEmpty(x.kind)) err(`${p}.kind`, "required");
      if (!Number.isInteger(x.count) || x.count < 0) err(`${p}.count`, "required non-negative integer");
      if (!nonEmpty(x.reason)) err(`${p}.reason`, "required");
    });
  }

  // objective — sourceId must resolve to a selected excerpt (no dangling ref),
  // AND objective.text must EQUAL that excerpt's text. 1B synthesizes from
  // objective.text, so an unbound text field could carry an instruction the
  // session never made while still pointing at an innocent source. Binding it to
  // the referenced excerpt's verbatim text closes that injection surface.
  const o = bundle.objective;
  if (!isObj(o)) {
    err("objective", "required object missing");
  } else {
    strictKeys(o, KEYS.objective, "objective");
    if (!nonEmpty(o.text)) err("objective.text", "required non-empty string");
    bounded(o.text, "objective.text");
    if (!nonEmpty(o.sourceId)) err("objective.sourceId", "required non-empty string");
    else if (!excerptIds.has(o.sourceId)) err("objective.sourceId", `dangling reference "${o.sourceId}" (must resolve to a selected excerpt)`);
    else {
      const src = Array.isArray(bundle.excerpts) ? bundle.excerpts.find((e) => isObj(e) && e.id === o.sourceId) : null;
      if (src && isStr(o.text) && isStr(src.text) && o.text !== src.text) {
        err("objective.text", `must equal its source excerpt "${o.sourceId}" text (observed objective cannot be reworded away from its evidence)`);
      }
    }
  }

  // privacy — the boundary's hard guarantees
  const pv = bundle.privacy;
  if (!isObj(pv)) {
    err("privacy", "required object missing");
  } else {
    strictKeys(pv, KEYS.privacy, "privacy");
    if (!Number.isInteger(pv.redactionCount) || pv.redactionCount < 0) err("privacy.redactionCount", "required non-negative integer");
    if (!Number.isInteger(pv.deniedPathCount) || pv.deniedPathCount < 0) err("privacy.deniedPathCount", "required non-negative integer");
    if (pv.secretScan !== "pass") err("privacy.secretScan", 'must be "pass" (a failing scan must abort capture, never ship)');
    if (pv.publication !== "local_only") err("privacy.publication", 'must be "local_only" in v1');
  }

  // whole-bundle size bound
  try {
    const bytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
    if (bytes > LIMITS.maxBundleBytes) err("bundle", `serialized size ${bytes} exceeds ${LIMITS.maxBundleBytes} bytes`);
  } catch {
    err("bundle", "not serializable");
  }

  return { ok: errors.length === 0, errors };
}

// Throwing wrapper for call sites that treat an invalid bundle as fatal.
export function assertBundle(bundle) {
  const { ok, errors } = validateBundle(bundle);
  if (!ok) throw new Error(`Invalid SessionEvidenceBundle:\n - ${errors.join("\n - ")}`);
  return bundle;
}

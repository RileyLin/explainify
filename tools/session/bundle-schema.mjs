// SessionEvidenceBundle — the provider-neutral intermediate contract between
// Phase 1A (capture / this module: the producer) and Phase 1B (synthesis: the
// consumer). Frozen against docs/product/session-to-explain-v1.md. Synthesis
// consumes THIS shape and never reads a Claude transcript directly.
//
// This module is dependency-free (no MCP SDK, no repo app code) so both the
// adapter and the 1B reader can import the validator without pulling in a
// transport. It is the single source of truth for the boundary shape.

export const BUNDLE_SCHEMA_VERSION = 1;

export const EXCERPT_KINDS = [
  "user_requirement",
  "agent_decision",
  "agent_explanation",
  "error",
  "unresolved",
];
export const EXCERPT_ROLES = ["user", "assistant", "tool"];
export const TOOL_STATUSES = ["succeeded", "failed", "denied"];
export const CAPTURE_EVENTS = ["tool_call", "stop", "session_end", "fixture"];
export const SESSION_SOURCES = ["claude_code", "generic_agent"];
export const CHANGE_STATUSES = ["added", "modified", "deleted", "renamed"];
export const RECEIPT_KINDS = ["test", "lint", "build", "command", "git_status"];

const HEX64 = /^[0-9a-f]{64}$/;

// Accumulating validator. Returns { ok, errors } — never throws on shape
// problems so callers (CLI, MCP tool, tests) get every violation at once
// rather than only the first. A structurally invalid bundle must never reach
// synthesis, so this is the fail-closed gate.
export function validateBundle(bundle) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const isStr = (v) => typeof v === "string";
  const nonEmpty = (v) => isStr(v) && v.length > 0;
  const isHex = (v) => isStr(v) && HEX64.test(v);
  const inSet = (v, set) => isStr(v) && set.includes(v);

  if (!isObj(bundle)) {
    return { ok: false, errors: ["bundle: not an object"] };
  }
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    err("schemaVersion", `must be ${BUNDLE_SCHEMA_VERSION}`);
  }

  // session
  const s = bundle.session;
  if (!isObj(s)) {
    err("session", "required object missing");
  } else {
    if (!nonEmpty(s.id)) err("session.id", "required non-empty string");
    if (!inSet(s.source, SESSION_SOURCES)) err("session.source", `one of ${SESSION_SOURCES.join("|")}`);
    if (!inSet(s.captureEvent, CAPTURE_EVENTS)) err("session.captureEvent", `one of ${CAPTURE_EVENTS.join("|")}`);
    if (!nonEmpty(s.cwd)) err("session.cwd", "required non-empty string");
    if (!isHex(s.transcriptSha256)) err("session.transcriptSha256", "required sha-256 hex");
    if (s.startedAt !== undefined && !isStr(s.startedAt)) err("session.startedAt", "must be string");
    if (s.endedAt !== undefined && !isStr(s.endedAt)) err("session.endedAt", "must be string");
  }

  // objective
  const o = bundle.objective;
  if (!isObj(o)) {
    err("objective", "required object missing");
  } else {
    if (!nonEmpty(o.text)) err("objective.text", "required non-empty string");
    if (!nonEmpty(o.sourceId)) err("objective.sourceId", "required non-empty string");
  }

  // excerpts
  const seenIds = new Set();
  if (!Array.isArray(bundle.excerpts)) {
    err("excerpts", "required array");
  } else {
    bundle.excerpts.forEach((e, i) => {
      const p = `excerpts[${i}]`;
      if (!isObj(e)) return err(p, "not an object");
      if (!nonEmpty(e.id)) err(`${p}.id`, "required");
      else if (seenIds.has(e.id)) err(`${p}.id`, `duplicate id "${e.id}"`);
      else seenIds.add(e.id);
      if (!inSet(e.kind, EXCERPT_KINDS)) err(`${p}.kind`, `one of ${EXCERPT_KINDS.join("|")}`);
      if (!inSet(e.role, EXCERPT_ROLES)) err(`${p}.role`, `one of ${EXCERPT_ROLES.join("|")}`);
      if (!isStr(e.text)) err(`${p}.text`, "required string");
      if (!nonEmpty(e.locator)) err(`${p}.locator`, "required");
      if (!isHex(e.sha256)) err(`${p}.sha256`, "required sha-256 hex");
    });
  }

  // toolEvents
  if (!Array.isArray(bundle.toolEvents)) {
    err("toolEvents", "required array");
  } else {
    bundle.toolEvents.forEach((t, i) => {
      const p = `toolEvents[${i}]`;
      if (!isObj(t)) return err(p, "not an object");
      if (!nonEmpty(t.id)) err(`${p}.id`, "required");
      else if (seenIds.has(t.id)) err(`${p}.id`, `duplicate id "${t.id}"`);
      else seenIds.add(t.id);
      if (!nonEmpty(t.toolName)) err(`${p}.toolName`, "required");
      if (!inSet(t.status, TOOL_STATUSES)) err(`${p}.status`, `one of ${TOOL_STATUSES.join("|")}`);
      if (!isStr(t.inputSummary)) err(`${p}.inputSummary`, "required string");
      if (!isStr(t.outputSummary)) err(`${p}.outputSummary`, "required string");
      if (!nonEmpty(t.locator)) err(`${p}.locator`, "required");
      if (!isHex(t.sha256)) err(`${p}.sha256`, "required sha-256 hex");
    });
  }

  // repository
  const r = bundle.repository;
  if (!isObj(r)) {
    err("repository", "required object missing");
  } else {
    if (r.baseRevision !== undefined && !isStr(r.baseRevision)) err("repository.baseRevision", "must be string");
    if (r.headRevision !== undefined && !isStr(r.headRevision)) err("repository.headRevision", "must be string");
    if (typeof r.dirty !== "boolean") err("repository.dirty", "required boolean");
    if (!Array.isArray(r.changedFiles)) {
      err("repository.changedFiles", "required array");
    } else {
      r.changedFiles.forEach((c, i) => {
        const p = `repository.changedFiles[${i}]`;
        if (!isObj(c)) return err(p, "not an object");
        if (!nonEmpty(c.path)) err(`${p}.path`, "required");
        if (!inSet(c.status, CHANGE_STATUSES)) err(`${p}.status`, `one of ${CHANGE_STATUSES.join("|")}`);
        if (c.sha256 !== undefined && !isHex(c.sha256)) err(`${p}.sha256`, "must be sha-256 hex when present");
      });
    }
  }

  // receipts
  if (!Array.isArray(bundle.receipts)) {
    err("receipts", "required array");
  } else {
    bundle.receipts.forEach((rc, i) => {
      const p = `receipts[${i}]`;
      if (!isObj(rc)) return err(p, "not an object");
      if (!nonEmpty(rc.id)) err(`${p}.id`, "required");
      else if (seenIds.has(rc.id)) err(`${p}.id`, `duplicate id "${rc.id}"`);
      else seenIds.add(rc.id);
      if (!inSet(rc.kind, RECEIPT_KINDS)) err(`${p}.kind`, `one of ${RECEIPT_KINDS.join("|")}`);
      if (!isStr(rc.command)) err(`${p}.command`, "required string");
      if (!Number.isInteger(rc.exitCode)) err(`${p}.exitCode`, "required integer");
      if (!isStr(rc.scope)) err(`${p}.scope`, "required string");
      if (!isStr(rc.content)) err(`${p}.content`, "required string");
      if (!isHex(rc.sha256)) err(`${p}.sha256`, "required sha-256 hex");
    });
  }

  // exclusions
  if (!Array.isArray(bundle.exclusions)) {
    err("exclusions", "required array");
  } else {
    bundle.exclusions.forEach((x, i) => {
      const p = `exclusions[${i}]`;
      if (!isObj(x)) return err(p, "not an object");
      if (!nonEmpty(x.kind)) err(`${p}.kind`, "required");
      if (!Number.isInteger(x.count) || x.count < 0) err(`${p}.count`, "required non-negative integer");
      if (!nonEmpty(x.reason)) err(`${p}.reason`, "required");
    });
  }

  // privacy — the boundary's hard guarantees
  const pv = bundle.privacy;
  if (!isObj(pv)) {
    err("privacy", "required object missing");
  } else {
    if (!Number.isInteger(pv.redactionCount) || pv.redactionCount < 0) err("privacy.redactionCount", "required non-negative integer");
    if (!Number.isInteger(pv.deniedPathCount) || pv.deniedPathCount < 0) err("privacy.deniedPathCount", "required non-negative integer");
    if (pv.secretScan !== "pass") err("privacy.secretScan", 'must be "pass" (a failing scan must abort capture, never ship)');
    if (pv.publication !== "local_only") err("privacy.publication", 'must be "local_only" in v1');
  }

  return { ok: errors.length === 0, errors };
}

// Throwing wrapper for call sites that treat an invalid bundle as fatal.
export function assertBundle(bundle) {
  const { ok, errors } = validateBundle(bundle);
  if (!ok) {
    throw new Error(`Invalid SessionEvidenceBundle:\n - ${errors.join("\n - ")}`);
  }
  return bundle;
}

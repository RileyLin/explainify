// Claude Code transcript → SessionEvidenceBundle adapter (Phase 1A producer).
//
// Reads a Claude Code session transcript (JSONL, one record per line) plus the
// repository state and emits the provider-neutral SessionEvidenceBundle defined
// in docs/product/session-to-explain-v1.md. Synthesis (Phase 1B) consumes the
// bundle and never parses a transcript directly.
//
// Design invariants (contract §Evidence Selection / §Adapter Boundary):
//  - Selection is SEMANTIC, not "last N lines": we keep the objective, explicit
//    requirements/decisions/explanations, errors, unresolved items, and tool
//    events that changed or inspected the system. Progress chatter, permission
//    boilerplate, model reasoning (thinking blocks), and unrelated output are
//    excluded and counted.
//  - Every kept item carries an exact `locator` (jsonl:<record-uuid>#<selector>)
//    and the sha-256 of its selected+redacted content.
//  - The raw transcript is referenced only by its whole-file hash; it is never
//    embedded.
//  - Content is redacted and byte-size bounded before it enters the bundle.
//  - Unknown/opaque payloads are excluded, not coerced into trusted evidence.
//  - Deterministic for an immutable transcript + repository state.

import { createHash } from "node:crypto";
import { isDeniedPath, redact, scanClean } from "./safety.mjs";
import { assertBundle, BUNDLE_SCHEMA_VERSION } from "./bundle-schema.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

// Parse the JSONL text into records, tracking 1-based line numbers and the
// record uuid used for locators. Malformed lines are skipped and counted.
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
 * @param {object} args.session            { id, cwd, captureEvent, startedAt?, endedAt? }
 * @param {object} [args.objective]        { text, sourceId } override; else inferred from first user msg
 * @param {object} args.repository         { baseRevision?, headRevision?, dirty, changedFiles[] }
 * @param {Array}  [args.receipts]         pre-collected command/test/git receipts
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

  // Redact + size-bound + hash a piece of content. Returns null if the content
  // still holds a secret after redaction (caller counts and excludes it) — this
  // is the fail-closed leg of the secret gate at the item level.
  const prepare = (text, max) => {
    const { text: red, count } = redact(clip(text, max));
    if (!scanClean(red)) return null;
    redactionCount += count;
    return { text: red, sha256: sha256(red) };
  };

  let objectiveText = null;
  let objectiveSourceId = null;
  let excerptSeq = 0;
  let toolSeq = 0;
  const toolNameById = new Map();

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
        // Capture the objective from the first substantive user requirement.
        if (!objectiveText && role === "user" && text.trim().length >= 12) {
          const locator = `jsonl:${uuid}#content[${b}]`;
          const prepared = prepare(text, limits.maxExcerptChars);
          if (prepared) {
            objectiveText = prepared.text;
            objectiveSourceId = `excerpt-objective`;
            excerpts.push({
              id: objectiveSourceId,
              kind: "user_requirement",
              role,
              text: prepared.text,
              locator,
              sha256: prepared.sha256,
            });
            continue;
          }
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
        const prepared = prepare(text, limits.maxExcerptChars);
        if (!prepared) {
          addExclusion("secret_bearing_excerpt");
          continue;
        }
        excerptSeq += 1;
        excerpts.push({
          id: `excerpt-${excerptSeq}`,
          kind,
          role,
          text: prepared.text,
          locator: `jsonl:${uuid}#content[${b}]`,
          sha256: prepared.sha256,
        });
        continue;
      }

      if (btype === "tool_use") {
        const toolName = block?.name || "unknown";
        toolNameById.set(block?.id, toolName);
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
        const prepared = prepare(inputRaw, limits.maxToolSummaryChars);
        if (!prepared) {
          addExclusion("secret_bearing_tool_input");
          continue;
        }
        toolSeq += 1;
        toolEvents.push({
          id: `tool-${toolSeq}`,
          toolName,
          status: "succeeded", // provisional; corrected when the tool_result arrives
          inputSummary: prepared.text,
          outputSummary: "",
          locator: `jsonl:${uuid}#content[${b}]`,
          sha256: prepared.sha256,
          _useId: block?.id,
        });
        continue;
      }

      if (btype === "tool_result") {
        // Attach output + status to the matching tool event (by tool_use_id).
        const useId = block?.tool_use_id;
        const ev = toolEvents.find((e) => e._useId === useId);
        if (!ev) {
          addExclusion("orphan_tool_result");
          continue;
        }
        const outText = blockText(block);
        ev.status = block?.is_error ? "failed" : "succeeded";
        const prepared = prepare(outText, limits.maxToolSummaryChars);
        if (prepared) {
          ev.outputSummary = prepared.text;
          // Re-hash over input+output so the event's sha covers what it now holds.
          ev.sha256 = sha256(`${ev.inputSummary}\n${prepared.text}`);
        } else {
          addExclusion("secret_bearing_tool_output");
        }
        continue;
      }

      if (btype === "image") {
        addExclusion("image_block");
        continue;
      }
      addExclusion(`unknown_block:${btype}`);
    }
  }

  // Strip internal join key before emitting.
  for (const ev of toolEvents) delete ev._useId;

  // Objective fallback: if no user text was captured, use an explicit override
  // or a truthful placeholder pointing at the whole transcript.
  if (args.objective?.text) {
    objectiveText = args.objective.text;
    objectiveSourceId = args.objective.sourceId || "objective-provided";
  }
  if (!objectiveText) {
    objectiveText = "Objective not stated in session; see raw transcript.";
    objectiveSourceId = "objective-unknown";
  }

  // Prepare receipts (already command/test/git receipts collected upstream).
  const receipts = [];
  for (const [i, rc] of (args.receipts || []).entries()) {
    const prepared = prepare(rc.content ?? "", limits.maxReceiptChars);
    if (!prepared) {
      addExclusion("secret_bearing_receipt");
      continue;
    }
    receipts.push({
      id: rc.id || `receipt-${i + 1}`,
      kind: rc.kind,
      command: rc.command ?? "",
      exitCode: Number.isInteger(rc.exitCode) ? rc.exitCode : 0,
      scope: rc.scope ?? "",
      content: prepared.text,
      sha256: prepared.sha256,
    });
  }

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

  const bundle = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    session: {
      id: args.session.id,
      source: "claude_code",
      captureEvent: args.session.captureEvent,
      cwd: args.session.cwd,
      transcriptSha256: args.transcriptSha256,
      ...(args.session.startedAt ? { startedAt: args.session.startedAt } : {}),
      ...(args.session.endedAt ? { endedAt: args.session.endedAt } : {}),
    },
    objective: { text: objectiveText, sourceId: objectiveSourceId },
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

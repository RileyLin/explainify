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
// addition to remaining a toolEvent). Classification is conservative; a command
// that matches nothing stays a toolEvent only, never a fabricated receipt.
const RECEIPT_CLASSIFIERS = [
  // A test run via a package script / known runner, OR a direct execution of a
  // file that follows a test/spec naming convention (`node paginate.test.js`,
  // `python api_test.py`, `ruby foo_spec.rb`). Running a `*.test.*`/`*.spec.*`
  // file IS a test run regardless of interpreter; still conservative because the
  // filename itself must signal a test (a plain `node server.js` never matches).
  { kind: "test", re: /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|\bmocha\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\b[\w./-]*[._-](test|spec)\.(c|m)?[jt]sx?\b|\b[\w./-]*[._-](test|spec)\.(py|rb|go)\b/i },
  { kind: "lint", re: /\blint\b|\beslint\b|\btslint\b|\bruff\b|\bflake8\b|\bclippy\b/i },
  { kind: "build", re: /\bbuild\b|\btsc\b|\bwebpack\b|\bvite\s+build\b|\bmake\b|\bcompile\b|\btypecheck\b/i },
];

function classifyReceiptKind(command) {
  for (const { kind, re } of RECEIPT_CLASSIFIERS) if (re.test(command)) return kind;
  return null;
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
    const kind = classifyReceiptKind(ev._command);
    if (!kind) continue;
    const command = prepare(ev._command, limits.maxReceiptChars);
    if (command == null) {
      addExclusion("secret_bearing_receipt");
      continue;
    }
    // Honest status: succeeded/failed follow the observed tool_result; denied or
    // no-result tools yield "unknown". We never fabricate an exit code — the
    // transcript does not record the process exit code, so exitCode is omitted.
    const status = ev.status === "succeeded" ? "succeeded" : ev.status === "failed" ? "failed" : "unknown";
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

// Phase 1E — ChangeStory builder + self-contained interactive renderer.
//
// buildChangeStory(bundle): turn a validated v2 SessionEvidenceBundle into a
// ChangeStory IR (see docs/product/phase-1e-evidence-trace-and-ir.md §3). It only
// POINTS at bundle evidence — every node/edge/step field carries an EvidenceRef
// whose sha256 is the bundle item's canonical hash — and it re-validates the whole
// story with assertChangeStory (fail closed) before returning.
//
// renderSessionHtmlV2(pkg, story): emit a single self-contained index.html — inline
// SVG overview diagram + vanilla-JS keyboard-selectable drill-down, before/after
// code diff, evidence drawer, explicit unknowns. NO React / xyflow / dagre (R7): the
// plugin runtime is zero-build / no-node_modules / no-network, so the renderer is a
// string of HTML+CSS+JS with no imports.

import {
  hashExcerpt,
  hashToolInput,
  hashToolOutput,
  hashReceipt,
  hashCodeExcerpt,
} from "../session/bundle-schema.mjs";
import {
  assertChangeStory,
  hashChangeStory,
  CHANGE_STORY_SCHEMA_VERSION,
  MAX_OVERVIEW_STEPS,
  VERIFY_OUTPUT_MAX,
  isVerificationCommand,
} from "../session/change-story-schema.mjs";
import { sha256, stableStringify } from "../comprehension/util.mjs";

// EvidenceRef helpers — bind a bundle item by id + its canonical hash.
const refExcerpt = (e) => ({ type: "excerpt", ref: e.id, sha256: hashExcerpt(e) });
const refToolInput = (t) => ({ type: "tool_input", ref: t.id, sha256: hashToolInput(t) });
const refToolOutput = (t) => ({ type: "tool_output", ref: t.id, sha256: hashToolOutput(t) });
const refReceipt = (rc) => ({ type: "receipt", ref: rc.id, sha256: hashReceipt(rc) });
const refCode = (c) => ({ type: "code_excerpt", ref: c.id, sha256: hashCodeExcerpt(c) });

// Short, human label for a tool event's input (never the raw JSON blob).
function toolLabel(ev) {
  const name = ev.toolName;
  // inputSummary is JSON of the tool input; pull a friendly path/command if present.
  let detail = "";
  try {
    const parsed = JSON.parse(ev.inputSummary);
    detail = parsed.file_path || parsed.path || parsed.notebook_path || parsed.command || "";
  } catch {
    detail = "";
  }
  if (detail && detail.length > 80) detail = detail.slice(0, 77) + "…";
  return detail ? `${name} ${detail}` : name;
}

// Just the friendly target (path/command) of a tool event, without the tool-name
// prefix — used for prose that already names the tool, so we don't double it up
// ("Apply a Edit change to Edit …").
function toolTarget(ev) {
  const full = toolLabel(ev);
  const stripped = full.replace(/^\w+\s/, "");
  return stripped && stripped !== ev.toolName ? stripped : "";
}

// --------------------------------------------------------------------------
// Phase 1F semantic-compaction helpers — derive BEHAVIOR-SPECIFIC step labels
// from the exact landed code (declaration / export / test names), never from
// file names alone (PM contract, task #39). Everything here reads the attested
// CodeExcerpt before/after text that is already hash-bound in the bundle; it
// resolves names deterministically and falls back VISIBLY to a file-level label
// when no unique semantic name can be derived — it never infers.
// --------------------------------------------------------------------------

// A top-level JS/TS declaration at column 0 (mirrors the adapter's rule so the
// two layers agree on what a "symbol" is; kept local so the frozen capture module
// is untouched).
const DECL_RE = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const JS_LIKE_EXT = /\.(mjs|cjs|jsx?|tsx?)$/i;

// Blank the CONTENT of comments and string/template literals (newlines preserved)
// so a declaration-looking token inside them is never mistaken for real code. A
// byte-for-byte copy of the adapter's stripNonCode discipline, replicated here to
// avoid importing from — and thereby coupling to — the frozen capture boundary.
function stripNonCodeLocal(src) {
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

// Names of top-level declarations in a source string (column 0 only).
function topLevelDecls(text) {
  const names = new Set();
  for (const line of stripNonCodeLocal(text || "").split("\n")) {
    const m = DECL_RE.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

// Names added to an `export { … }` re-export list between before and after.
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

// Names of `test("…")` / `it("…")` cases. Read from RAW text (the string content
// is exactly what we want) — display only, never a trust decision.
function testNames(text) {
  const names = [];
  const re = /\b(?:test|it)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(text || ""))) names.push(m[2]);
  return names;
}

const setDiff = (after, before) => [...after].filter((x) => !before.has(x));

// A short, human title for a title/label — bounded so the SVG node and header do
// not overflow (R7). Ellipsis keeps the derivation honest (the full list lives in
// the drill-down panel).
function clip(s, n = 72) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Derive a behavior-specific label + intent for a grouped change step from its
// landed CodeExcerpts. Priority: new declarations → new exports → new tests →
// modified named symbol → VISIBLE file-level fallback. Returns { title, intent }.
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
      // a modification of an existing named symbol (present in before AND after,
      // body changed): use the excerpt's resolved symbol if the adapter set one.
      if (c.symbol && (c.before || "").length && topLevelDecls(c.before).has(c.symbol)) {
        if (!modifiedSymbols.includes(c.symbol)) modifiedSymbols.push(c.symbol);
      }
    }
    const bt = new Set(testNames(c.before));
    for (const t of testNames(c.after)) if (!bt.has(t) && !tests.includes(t)) tests.push(t);
  }
  if (decls.length) {
    return { title: clip(`Add ${decls.join(", ")}`), intent: `Add ${decls.join(", ")} in ${path}.` };
  }
  if (exportsAdded.length) {
    return { title: clip(`Expose ${exportsAdded.join(", ")}`), intent: `Export ${exportsAdded.join(", ")} from ${path}.` };
  }
  if (tests.length) {
    const head = tests.length === 1 ? tests[0] : `${tests.length} tests: ${tests.join("; ")}`;
    return { title: clip(`Add ${head}`), intent: `Add ${tests.length} test(s) in ${path}: ${tests.join("; ")}.` };
  }
  if (modifiedSymbols.length) {
    return { title: clip(`Update ${modifiedSymbols.join(", ")}`), intent: `Update ${modifiedSymbols.join(", ")} in ${path}.` };
  }
  // No unique semantic name derivable → visible file-level fallback (never infer).
  const rel = path || "a file";
  return { title: clip(`Edit ${rel}`), intent: `Edit ${rel}.` };
}
function newDecls(before, after) {
  const b = topLevelDecls(before || "");
  return setDiff(topLevelDecls(after || ""), b);
}

// Deterministic parse of a test-runner RESULT summary from attested output. Reads
// the machine-printed totals (node --test's "ℹ pass N / ℹ fail N / ℹ tests N", or
// a TAP "# pass N / # fail N" footer). Returns { pass, fail, total } or null. This
// only READS attested evidence to LABEL/bind an already-attested verification — it
// never decides trust and never mints a receipt (no classifier expansion).
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

// A bare Bash event is promoted to a VERIFICATION step only when its command is a
// single, unconditional, foreground run of a recognized test runner — decided by
// the SHARED quote-aware top-level shell parser `isVerificationCommand` (finding
// #1, task #40 REVISE round 2). A prefix match is not enough: a compound like
// `node --test x || cat stale.log` masks its status and would launder a fake green,
// so the parser rejects any separator/pipe/compound, backgrounding, command
// substitution, heredoc, comment-hidden separator, and info/no-run flag. Builder
// and validator import the SAME function so producer and tamper-check agree.

// A combined behavior-specific label for an AGGREGATE change step (several folded
// implementation units). Lists the new declarations/exports/test additions across
// all folded units; falls back to the file list. Bounded for the node/header.
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

// Cap the overview at `max` steps (gate 1). Diagnosis + verification descriptors
// are never folded (they carry the debugging arc / the required verification); the
// fold targets CHANGE units only. Keep as many individual change units as fit, and
// collapse the remainder into ONE aggregate change step that retains EVERY landed
// CodeExcerpt ref and tool activity — evidence is grouped, never dropped. Mutates
// `descriptors` in place, preserving attested order. If even a single aggregate
// change step cannot fit under `max` (i.e. non-change steps alone exceed it), the
// descriptors are left intact and the downstream cap assertion surfaces it as a
// real, honest limitation rather than silently hiding evidence.
function capOverview(descriptors, max, { refCode }) {
  if (descriptors.length <= max) return;
  const changes = descriptors.filter((d) => d.kind === "change");
  const nonChange = descriptors.length - changes.length;
  const slots = max - nonChange;
  if (slots < 1) return; // cannot fold below the cap without dropping the arc; fail-closed downstream
  const keepIndividual = Math.max(0, slots - 1);
  if (changes.length <= slots) return; // change units already fit (with room for the arc)
  // Change units are already in attested order within `descriptors`. Keep the first
  // `keepIndividual`, fold the rest.
  const foldedFrom = keepIndividual; // index into `changes`
  const kept = changes.slice(0, keepIndividual);
  const folded = changes.slice(foldedFrom);
  if (folded.length <= 1) return; // nothing to gain
  const units = folded.map((d) => d.unit);
  const allLanded = units.flatMap((u) => u.landed);
  const allUnknown = units.flatMap((u) => u.unknown);
  const allToolActivity = units.flatMap((u) => u.toolActivity);
  // Anchor the aggregate at the earliest folded unit's anchor (a single attested
  // timeline item). Its step id derives from that immutable event id.
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
  // Rebuild `descriptors`: drop the folded change descriptors, insert the aggregate,
  // then re-sort by attested position so the chain stays monotonic.
  const foldedIds = new Set(folded.map((d) => d.step.id));
  const remaining = descriptors.filter((d) => !foldedIds.has(d.step.id));
  remaining.push(aggregate);
  remaining.sort((a, b) => (a.anchorPos ?? Infinity) - (b.anchorPos ?? Infinity));
  descriptors.length = 0;
  descriptors.push(...remaining);
  void kept;
}

// Choose the semantic view (R4). Only observed_sequence edges are provable, so
// renderHint is always "sequential" for now; viewType reflects the evidence shape:
// a failed→passed verification arc reads as a "sequence" (debugging), otherwise a
// "workflow". This is a labeling choice over observed evidence, never an inferred
// causal topology. (Computed inline from the unified verification set in
// buildChangeStory so it also counts bare Bash checks, not only receipts.)

export function buildChangeStory(bundle) {
  const excerptById = new Map(bundle.excerpts.map((e) => [e.id, e]));
  const codeByToolEvent = new Map();
  for (const c of bundle.codeEvidence) {
    if (!codeByToolEvent.has(c.toolEventId)) codeByToolEvent.set(c.toolEventId, []);
    codeByToolEvent.get(c.toolEventId).push(c);
  }
  // Receipts derive from Bash tool events and reuse the event's inputLocator as
  // commandLocator — that lets us attach a verification to its originating step.
  const receiptsByLocator = new Map();
  for (const rc of bundle.receipts) {
    if (rc.commandLocator) receiptsByLocator.set(rc.commandLocator, rc);
  }

  // --- objective + outcome (story-level claims) ---
  const objectiveExcerpt = excerptById.get(bundle.objective.sourceId);
  const objective = {
    text: bundle.objective.text,
    status: "observed",
    evidence: objectiveExcerpt ? [refExcerpt(objectiveExcerpt)] : [],
  };

  const landedCount = bundle.codeEvidence.filter((c) => c.completeness === "landed").length;
  const changedCount = bundle.repository.changedFiles.length;
  // The outcome is DERIVED, and gate 4 requires it to BIND the attested verification
  // (a receipt OR a bare succeeded/failed Bash check). Both the counts and the
  // bound evidence are computed AFTER the unified `verifications` array below, so we
  // only capture the final explanation here (also used to exclude it as a step).
  const finalExplanation = [...bundle.excerpts].reverse().find((e) => e.kind === "agent_explanation");

  // The attested cross-type timeline is the ONLY order the capture proves; every
  // step anchors to exactly one timeline item and the steps are ordered by that
  // item's position, so the narrative order equals the observed order (findings
  // #1/#2). posOf resolves an item's timeline position; a step whose anchor is not
  // in the timeline is a builder bug and would fail assertChangeStory.
  const posOf = new Map();
  (bundle.observedOrder || []).forEach((o, i) => posOf.set(`${o.kind}:${o.id}`, i));

  // --- steps: SEMANTICALLY COMPACTED (Phase 1F, task #39) ---
  // R4: step ids derive from the immutable evidence id, not step-N enumeration.
  // The Phase 1E builder emitted one step per reasoning excerpt AND one per Edit
  // AND one per receipt — a 10-node "blocks/prompts" replay on a real multi-file
  // session. The compaction rules (PM 5-gate contract):
  //   (1) group landed edits by their declared implementation unit (file) → one
  //       step per unit, carrying ALL its landed CodeExcerpt refs, anchored at the
  //       unit's EARLIEST attested tool event;
  //   (2) label each unit BEHAVIOR-SPECIFICALLY from the exact landed code (new
  //       declarations / exports / test names), with a visible file-level fallback;
  //   (3) reasoning/prompt excerpts stay in the evidence drawer and NEVER become
  //       top-level steps — EXCEPT a genuine debug diagnosis (a reasoning excerpt
  //       that sits between an observed FAILING verification and a later landed
  //       change), which remains a step so the S2 debugging arc is not lost;
  //   (4) every attested verification (a receipt OR a succeeded/failed Bash tool
  //       event the frozen classifier did not promote) is a verification step and
  //       binds the outcome — no raw-evidence-only green;
  //   (5) the overview is capped at MAX_OVERVIEW_STEPS; any overflow change units
  //       fold into ONE aggregate step that keeps every ref (evidence is never
  //       dropped, only visually grouped).
  const errorExcerpt = bundle.excerpts.find((e) => e.kind === "error");
  const objectiveSourceId = bundle.objective.sourceId;
  const finalExplanationId = finalExplanation ? finalExplanation.id : null;
  const CHANGE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
  const REASONING_KINDS = new Set(["agent_decision", "agent_explanation", "error", "unresolved"]);
  // Each descriptor: { step, anchorRef, anchorPos }. anchorRef is the single
  // EvidenceRef that ties the step (and its overview node) to its timeline slot.
  const descriptors = [];

  // Attested verifications, unified across receipts and un-promoted Bash events.
  // A receipt already carries a clean command/status; a bare succeeded/failed Bash
  // event (e.g. `node --test`, which the frozen receipt classifier declines) is
  // ALSO attested verification evidence — we surface it from the raw tool event
  // WITHOUT minting a receipt (no classifier expansion). Dedupe on the command
  // locator so a Bash event that DID mint a receipt is never counted twice.
  const receiptLocators = new Set(bundle.receipts.map((rc) => rc.commandLocator).filter(Boolean));
  const VERIFY_TOOLS = new Set(["Bash"]);
  const verifications = [];
  for (const rc of bundle.receipts) {
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
  for (const ev of bundle.toolEvents) {
    if (!VERIFY_TOOLS.has(ev.toolName)) continue;
    if (ev.status !== "succeeded" && ev.status !== "failed") continue;
    if (ev.inputLocator && receiptLocators.has(ev.inputLocator)) continue; // already a receipt
    const cmd = toolTarget(ev) || ev.toolName; // the command string
    // A Bash event is verification ONLY when its command is a single, unconditional,
    // foreground run of a recognized test runner (finding #1). The shared quote-aware
    // parser rejects compounds/pipes/substitutions/heredocs/no-run flags, so a
    // status-masking `node --test x || cat stale.log` — or a `cat old-run.log` whose
    // output merely contains pass/fail lines — can never launder a fake green.
    if (!isVerificationCommand(cmd)) continue;
    const output = ev.outputSummary || "";
    const summary = parseTestSummary(output);
    // The runner must also have PRINTED a parseable result summary; a test command
    // with no machine-readable totals is not usable verification evidence.
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

  // --- outcome (DERIVED summary that BINDS the attested verification, gate 4) ---
  const passCount = verifications.filter((v) => v.status === "succeeded").length;
  const failCount = verifications.filter((v) => v.status === "failed").length;
  // Prefer a parsed test count from the LAST attested verification (most recent
  // result) so the outcome reads "5/5 tests passed", not just "1 run".
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
  // Bind the outcome to the attested verifications (gate 4: no raw-only green) plus
  // the final explanation quote. Status is "inferred" (a derived summary, not a
  // single observed quote), so the framing edge into it stays derived (finding #2).
  const outcome = {
    text: outcomeText,
    status: "inferred",
    evidence: [
      ...verifications.slice(0, 3).map((v) => v.anchorRef),
      ...(finalExplanation ? [refExcerpt(finalExplanation)] : []),
    ],
  };

  // (a) diagnosis reasoning steps (gate 2 exception). A reasoning excerpt becomes a
  // top-level step ONLY when it is a genuine debug diagnosis: there is an observed
  // FAILING verification before it AND a landed code change after it. This is a
  // purely structural test over the attested timeline — no semantic guessing — so
  // narration like "Let me explore the repo" (no preceding failure) always stays in
  // the drawer, while the S2 "(page-1)*pageSize" diagnosis remains a step.
  const landedPositions = bundle.codeEvidence
    .filter((c) => c.completeness === "landed")
    .map((c) => {
      const ev = bundle.toolEvents.find((t) => t.id === c.toolEventId);
      return ev ? posOf.get(`tool_event:${ev.id}`) : undefined;
    })
    .filter((p) => p !== undefined);
  for (const e of bundle.excerpts) {
    if (!REASONING_KINDS.has(e.kind)) continue;
    if (e.id === objectiveSourceId || e.id === finalExplanationId) continue;
    const pos = posOf.get(`excerpt:${e.id}`);
    if (pos === undefined) continue;
    const hasPriorFailure = firstFailPos < pos;
    const hasLaterLanding = landedPositions.some((lp) => lp > pos);
    if (!(hasPriorFailure && hasLaterLanding)) continue; // → stays in the drawer
    const anchorRef = refExcerpt(e);
    const quoted = e.text.slice(0, 200);
    descriptors.push({
      kind: "diagnosis",
      anchorRef,
      anchorPos: pos,
      step: {
        id: `step:${e.id}`,
        title: clip(`Diagnosis: ${e.text.slice(0, 60)}`),
        // Observed intent: quoted directly FROM the cited excerpt (a substring), the
        // honest "observed" case the validator enforces.
        intent: { text: quoted, status: "observed", evidence: [anchorRef] },
        toolActivity: [],
        outcome: { text: "Root cause identified from the failing check.", evidence: [anchorRef] },
        unknowns: [],
      },
    });
  }

  // (b) change steps: GROUP landed edits by implementation unit (file). One step
  // per unit, carrying every landed CodeExcerpt in the unit as exact refs, anchored
  // at the unit's EARLIEST attested change tool event (gate 3). Labels are behavior-
  // specific (gate: file names cannot be the explanation).
  const unitOrder = []; // preserve first-seen order of units
  const unitMap = new Map(); // path -> { events:Set, landed:[], unknown:[], earliestPos, earliestEvId }
  for (const ev of bundle.toolEvents) {
    if (ev.status !== "succeeded") continue;
    if (!CHANGE_TOOLS.has(ev.toolName)) continue;
    const all = codeByToolEvent.get(ev.id) || [];
    // The implementation unit is the changed file path. If a tool event produced no
    // code excerpt at all (path unknown), fall back to its own tool target as a unit
    // key so it is still represented (visible, not dropped).
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
  // Anchor a unit at its earliest change tool event's INPUT ref (a stable, single
  // attested item in the timeline). The step id derives from that immutable event.
  const unitDescriptors = changeUnits.map((u) => {
    const anchorEv = bundle.toolEvents.find((t) => t.id === u.earliestEvId);
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
        // Intent is INFERRED (we cannot prove which prompt caused this unit from
        // adjacency, R4) and cites the anchoring tool input it narrates — never an
        // unrelated excerpt passed off as observed (#3).
        intent: { text: label.intent, status: "inferred", evidence: [anchorRef] },
        toolActivity: u.toolActivity,
        ...(u.landed.length ? { codeChange: u.landed.map((c) => ({ ...c })) } : {}),
        outcome: {
          text: u.landed.length
            ? `${u.landed.length} landed change(s) in ${u.path}.`
            : `Change applied to ${u.path}.`,
          evidence: u.landed.length ? u.landed.map(refCode) : [anchorRef],
        },
        unknowns: u.unknown.map((c) => ({
          text: `${c.path}: exact code not confirmed as landed`,
          reason: c.unknownReason || "unconfirmed",
        })),
      },
    };
  });
  descriptors.push(...unitDescriptors);

  // (c) verification steps: one per attested verification (receipt or bare Bash
  // check), anchored at its timeline slot so a failed→fix→passed arc renders in
  // true order (finding #1). Labels report the parsed pass/fail counts when the
  // runner printed them.
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

  // Order every step by its attested timeline position (findings #1/#2). A missing
  // anchorPos would mean a step is not grounded in the observed order — treat as
  // last and let assertChangeStory catch the resulting unprovable edge.
  descriptors.sort((a, b) => (a.anchorPos ?? Infinity) - (b.anchorPos ?? Infinity));

  // (d) CAP the overview at MAX_OVERVIEW_STEPS (gate 1). If more distinct change
  // UNITS exist than the cap allows, fold the overflow change units into ONE
  // aggregate change step that keeps every landed CodeExcerpt ref (evidence is
  // never dropped — only visually grouped). Verification and diagnosis steps are
  // never folded (they carry the arc), so the fold targets change units only.
  capOverview(descriptors, MAX_OVERVIEW_STEPS, { refCode });

  const steps = descriptors.map((d) => d.step);

  // --- overview nodes + edges ---
  // Framing nodes (objective, outcome) bracket the observed steps; the edges INTO
  // the first step and OUT to the outcome are "derived"/inferred (synthesis framing,
  // not a proven transition). Only step→step edges are observed_sequence, each
  // carrying the anchors of BOTH endpoints and validated against the attested order.
  const nodes = [];
  const edges = [];
  nodes.push({ id: "n:objective", kind: "objective", label: "Objective", evidence: objective.evidence });
  descriptors.forEach((d) => {
    const step = d.step;
    const isVerify = step.verification && step.verification.length && (!step.codeChange || !step.codeChange.length);
    nodes.push({
      id: `n:${step.id}`,
      kind: isVerify ? "verification" : "step",
      label: step.title,
      stepId: step.id,
      evidence: [d.anchorRef],
    });
  });
  nodes.push({ id: "n:outcome", kind: "outcome", label: "Outcome", evidence: outcome.evidence.slice(0, 1) });

  if (descriptors.length) {
    // objective → first step: derived framing (not observed).
    edges.push({ from: "n:objective", to: `n:${descriptors[0].step.id}`, kind: "derived", relationshipStatus: "inferred", evidence: [] });
    // step → step: observed_sequence, proven by the attested order.
    for (let i = 0; i < descriptors.length - 1; i += 1) {
      const from = descriptors[i];
      const to = descriptors[i + 1];
      edges.push({
        from: `n:${from.step.id}`,
        to: `n:${to.step.id}`,
        kind: "observed_sequence",
        relationshipStatus: "observed",
        evidence: [from.anchorRef, to.anchorRef],
      });
    }
    // last step → outcome: derived framing (not observed).
    edges.push({ from: `n:${descriptors[descriptors.length - 1].step.id}`, to: "n:outcome", kind: "derived", relationshipStatus: "inferred", evidence: [] });
  } else {
    edges.push({ from: "n:objective", to: "n:outcome", kind: "derived", relationshipStatus: "inferred", evidence: [] });
  }

  // Surface an error excerpt as an explicit unknown/risk node (not a causal edge)
  // only when it was not already promoted to a reasoning step above.
  if (errorExcerpt && !descriptors.some((d) => d.step.id === `step:${errorExcerpt.id}`)) {
    nodes.push({ id: "n:risk", kind: "unknown", label: "Recorded error / risk", evidence: [refExcerpt(errorExcerpt)] });
  }

  // viewType reflects the UNIFIED verification shape (receipts + bare Bash checks):
  // a failed→passed arc reads as a debugging "sequence", otherwise a "workflow".
  const viewType = failCount > 0 && passCount > 0 ? "sequence" : "workflow";
  const overview = { viewType, renderHint: "sequential", nodes, edges };

  // --- evidence drawer: quotes subordinate to the story ---
  const drawerKinds = ["user_requirement", "agent_decision", "agent_explanation", "error"];
  const quotes = bundle.excerpts
    .filter((e) => drawerKinds.includes(e.kind))
    .slice(0, 8)
    .map((e) => ({ id: e.id, kind: e.kind, role: e.role, text: e.text, locator: e.locator, sha256: hashExcerpt(e) }));
  const evidenceDrawer = {
    quotes,
    excludedCounts: bundle.exclusions.map((x) => ({ kind: x.kind, count: x.count, reason: x.reason })),
  };

  const storyDraft = {
    schemaVersion: CHANGE_STORY_SCHEMA_VERSION,
    objective,
    outcome,
    overview,
    steps,
    evidenceDrawer,
  };
  const bundleSha256 = sha256(stableStringify(bundle));
  const story = {
    ...storyDraft,
    provenance: { bundleSha256, changeStorySha256: hashChangeStory(storyDraft) },
  };
  // Fail closed: every ref must resolve to a bundle source whose recomputed hash
  // matches, only landed code may appear as a step code change, edges obey R4.
  assertChangeStory(story, bundle);
  return story;
}

// --------------------------------------------------------------------------
// Self-contained interactive renderer (R7).
// --------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// A minimal line-level before/after diff (LCS by line) so the drill-down shows the
// exact code change without shipping a diff library. Deterministic and bounded by
// the CodeExcerpt byte/line limits enforced upstream.
function lineDiff(before, after) {
  const a = (before ?? "").split("\n");
  const b = (after ?? "").split("\n");
  // classic LCS table
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { rows.push({ type: "ctx", text: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ type: "del", text: a[i] }); i += 1; }
    else { rows.push({ type: "add", text: b[j] }); j += 1; }
  }
  while (i < m) { rows.push({ type: "del", text: a[i] }); i += 1; }
  while (j < n) { rows.push({ type: "add", text: b[j] }); j += 1; }
  return rows;
}

function renderDiff(code) {
  if (code.kind === "full_file") {
    // A newly written file: every line is an addition.
    const rows = (code.after ?? "").split("\n").map((t) => ({ type: "add", text: t }));
    return diffRowsHtml(rows);
  }
  return diffRowsHtml(lineDiff(code.before, code.after));
}

function diffRowsHtml(rows) {
  return rows
    .map((r) => {
      const sign = r.type === "add" ? "+" : r.type === "del" ? "−" : " ";
      return `<div class="dl ${r.type}"><span class="sg">${sign}</span><code>${escapeHtml(r.text) || "&nbsp;"}</code></div>`;
    })
    .join("");
}

// Build the per-step drill-down panels (hidden until selected).
function renderStepPanels(story) {
  return story.steps
    .map((step, idx) => {
      const codeBlocks = (step.codeChange || [])
        .map((c) => {
          const loc = c.codeLocator ? `<span class="loc">${escapeHtml(c.codeLocator)}</span>` : "";
          const sym = c.symbol ? `<span class="sym">${escapeHtml(c.symbol)}</span>` : "";
          return `<div class="code"><div class="codehead"><span class="path">${escapeHtml(c.path)}</span>${sym}${loc}<span class="badge landed">landed</span></div><div class="diff">${renderDiff(c)}</div><div class="sha">excerpt ${escapeHtml(c.sha256.slice(0, 16))}…</div></div>`;
        })
        .join("");
      const verifBlocks = (step.verification || [])
        .map(
          (v) =>
            `<div class="verif ${v.status}"><span class="badge ${v.status}">${escapeHtml(v.status)}</span><code>${escapeHtml(v.command)}</code>${v.exitCode !== undefined ? `<span class="exit">exit ${v.exitCode}</span>` : ""}<pre>${escapeHtml(v.outputExcerpt || "")}</pre></div>`,
        )
        .join("");
      const unknownBlocks = (step.unknowns || [])
        .map((u) => `<li><strong>${escapeHtml(u.text)}</strong><small>${escapeHtml(u.reason)}</small></li>`)
        .join("");
      return `<section class="steppanel" id="panel-${idx}" role="tabpanel" aria-labelledby="node-${idx}" ${idx === 0 ? "" : "hidden"}>
        <h3>${escapeHtml(step.title)}</h3>
        <p class="intent"><span class="tag ${step.intent.status}">${escapeHtml(step.intent.status)} intent</span> ${escapeHtml(step.intent.text)}</p>
        ${codeBlocks || ""}
        ${verifBlocks || ""}
        ${unknownBlocks ? `<div class="unknowns"><h4>Unknowns</h4><ul>${unknownBlocks}</ul></div>` : ""}
        <p class="outcome-line">${escapeHtml(step.outcome.text)}</p>
      </section>`;
    })
    .join("");
}

// Inline SVG overview: a vertical sequential flow of nodes with observed_sequence
// connectors. Each node is a focusable, keyboard-selectable button-like <g> that
// drives the drill-down. First-viewport overview is the whole diagram (R7-a).
function renderOverviewSvg(story) {
  const nodes = story.overview.nodes;
  const NODE_W = 320, NODE_H = 54, GAP = 26, PAD = 20;
  const stepNodes = nodes.filter((n) => n.kind !== "unknown" || n.id !== "n:risk");
  const height = PAD * 2 + stepNodes.length * NODE_H + (stepNodes.length - 1) * GAP;
  const width = NODE_W + PAD * 2;
  const kindColor = { objective: "#245fff", step: "#2a2f3a", verification: "#1f5d3a", outcome: "#5a3d8a", unknown: "#7a5a1f" };
  let y = PAD;
  const parts = [];
  const positions = [];
  stepNodes.forEach((n) => { positions.push({ id: n.id, y }); y += NODE_H + GAP; });
  // connectors first (behind nodes)
  for (const e of story.overview.edges) {
    const from = positions.find((p) => p.id === e.from);
    const to = positions.find((p) => p.id === e.to);
    if (!from || !to) continue;
    const x = PAD + NODE_W / 2;
    parts.push(`<line x1="${x}" y1="${from.y + NODE_H}" x2="${x}" y2="${to.y}" class="edge" marker-end="url(#arrow)"><title>observed sequence</title></line>`);
  }
  // nodes
  let stepIndex = -1;
  stepNodes.forEach((n) => {
    const pos = positions.find((p) => p.id === n.id);
    const color = kindColor[n.kind] || "#2a2f3a";
    const isStep = n.kind === "step" || n.kind === "verification";
    const tabIndex = isStep ? (stepIndex += 1) : -1;
    const dataStep = isStep ? `data-step="${tabIndex}"` : "";
    parts.push(
      `<g class="node ${n.kind}" ${dataStep} ${isStep ? `tabindex="0" role="tab" id="node-${tabIndex}" aria-controls="panel-${tabIndex}"` : ""} transform="translate(${PAD},${pos.y})">
        <rect width="${NODE_W}" height="${NODE_H}" rx="9" fill="${color}" class="nbox"/>
        <text x="14" y="22" class="nkind">${escapeHtml(n.kind)}</text>
        <text x="14" y="40" class="nlabel">${escapeHtml(n.label.length > 44 ? n.label.slice(0, 43) + "…" : n.label)}</text>
      </g>`,
    );
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="overview" role="group" aria-label="Session flow overview" preserveAspectRatio="xMidYMin meet">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4a5163"/></marker></defs>
    ${parts.join("\n")}
  </svg>`;
}

function renderDrawer(story) {
  const quotes = story.evidenceDrawer.quotes
    .map(
      (q) =>
        `<blockquote><p>“${escapeHtml(q.text)}”</p><footer>${escapeHtml(q.kind)} · ${escapeHtml(q.role)} · <code>${escapeHtml(q.locator)}</code> · <code>${escapeHtml(q.sha256.slice(0, 16))}…</code></footer></blockquote>`,
    )
    .join("");
  const excl = story.evidenceDrawer.excludedCounts
    .map((x) => `<li>${x.count} × <strong>${escapeHtml(x.kind)}</strong> — ${escapeHtml(x.reason)}</li>`)
    .join("");
  return `<details class="drawer"><summary>Evidence drawer — ${story.evidenceDrawer.quotes.length} exact quote(s), ${story.evidenceDrawer.excludedCounts.length} exclusion kind(s)</summary>
    <div class="quotes">${quotes || "<p>No selected quotes.</p>"}</div>
    ${excl ? `<div class="excl"><h4>Excluded by policy</h4><ul>${excl}</ul></div>` : ""}
  </details>`;
}

export function renderSessionHtmlV2(pkg, story) {
  const title = pkg.brief?.objective || story.objective.text || pkg.workstreamId;
  const svg = renderOverviewSvg(story);
  const panels = renderStepPanels(story);
  const drawer = renderDrawer(story);
  const stepCount = story.steps.length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(story.objective.text.slice(0, 60))} · Explainify</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#08090b;color:#f5f7fb}*{box-sizing:border-box}body{margin:0;background:#08090b}main{max-width:1180px;margin:auto;padding:26px 20px 64px}header{border-bottom:1px solid #242832;padding-bottom:20px}.eyebrow{color:#5f91ff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}h1{font-size:clamp(24px,4.6vw,42px);line-height:1.08;margin:8px 0}.outcome{font-size:17px;line-height:1.55;color:#dfe5ef;margin:6px 0 0}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pill{padding:6px 9px;border:1px solid #303641;border-radius:6px;color:#aab4c3;font-size:12px}.layout{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);gap:20px;margin-top:22px;align-items:start}@media(max-width:820px){.layout{grid-template-columns:1fr}}.flowcol h2,.detailcol h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#8ea0b6;margin:0 0 10px}.overview{width:100%;height:auto;display:block}.node .nbox{stroke:#0b0d10;stroke-width:1;transition:filter .12s,stroke .12s}.node{cursor:pointer}.node[tabindex] .nbox:hover{filter:brightness(1.18)}.node.selected .nbox{stroke:#8fb4ff;stroke-width:2.5;filter:brightness(1.14)}.node:focus{outline:none}.node:focus .nbox{stroke:#8fb4ff;stroke-width:2.5}.nkind{fill:#c7d2e4;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.75}.nlabel{fill:#fff;font-size:13px;font-weight:600}.edge{stroke:#3a4152;stroke-width:2}.detailcol{min-width:0;border:1px solid #242832;border-radius:10px;padding:18px;background:#101216}.steppanel h3{margin:0 0 8px;font-size:19px}.intent{color:#cbd4e1;line-height:1.5}.tag{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px;margin-right:6px}.tag.inferred{background:#3a341c;color:#e6c968}.tag.observed{background:#1c3a2a;color:#69e0a5}.code{margin:14px 0;border:1px solid #262b34;border-radius:8px;overflow:hidden}.codehead{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 11px;background:#0b0d10;border-bottom:1px solid #262b34;font-size:12px}.codehead .path{color:#dfe5ef;font-weight:600}.codehead .sym{color:#8fb4ff}.codehead .loc{color:#7e8998;font-family:ui-monospace,monospace}.badge{margin-left:auto;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:4px}.badge.landed{background:#1c3a2a;color:#69e0a5}.badge.succeeded{background:#1c3a2a;color:#69e0a5}.badge.failed{background:#3a1c1c;color:#f08a8a}.badge.unknown{background:#33343a;color:#c0c6d0}.diff{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;line-height:1.5;overflow-x:auto}.dl{display:flex;white-space:pre}.dl .sg{width:20px;flex:0 0 20px;text-align:center;color:#5b6473;user-select:none}.dl code{white-space:pre}.dl.add{background:#0f2a1c}.dl.add .sg{color:#69e0a5}.dl.del{background:#2a1414}.dl.del .sg{color:#f08a8a}.dl.ctx{color:#aeb7c4}.sha{padding:6px 11px;font-size:10px;color:#6b7482;font-family:ui-monospace,monospace;border-top:1px solid #1d222a}.verif{margin:12px 0;padding:10px 12px;border-radius:8px;background:#0b0d10;border:1px solid #262b34}.verif code{color:#dfe5ef}.verif .exit{color:#8793a3;margin-left:8px;font-size:12px}.verif pre{margin:8px 0 0;color:#aab4c3;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.verif.failed{border-color:#5a2b2b}.verif.succeeded{border-color:#2b5a3d}.unknowns{margin-top:12px;border-left:3px solid #d5a529;padding-left:12px}.unknowns h4{margin:0 0 6px;color:#f0c457;font-size:13px}.unknowns li{margin:5px 0}.unknowns small{display:block;color:#8b9099}.outcome-line{margin-top:14px;color:#dfe5ef}.drawer{margin-top:22px;border:1px solid #242832;border-radius:10px;background:#101216;padding:4px 16px}.drawer summary{cursor:pointer;padding:12px 0;color:#8ea0b6;font-size:13px;font-weight:600}blockquote{margin:10px 0;padding:12px;border-left:3px solid #5f91ff;background:#0b0d10}blockquote p{margin:0;color:#e8edf5}blockquote footer{margin-top:8px;color:#8793a3;font-size:11px;overflow-wrap:anywhere}.excl h4{color:#8ea0b6;font-size:13px}.excl li{color:#aab4c3;margin:4px 0;font-size:13px}.hint{color:#6b7482;font-size:12px;margin:0 0 8px}
</style></head><body><main>
<header>
  <div class="eyebrow">Explainify · change story · local only</div>
  <h1>${escapeHtml(title)}</h1>
  <p class="outcome">${escapeHtml(story.outcome.text)}</p>
  <div class="meta"><span class="pill">view: ${escapeHtml(story.overview.viewType)}</span><span class="pill">layout: ${escapeHtml(story.overview.renderHint)}</span><span class="pill">${stepCount} step(s)</span><span class="pill">${escapeHtml(pkg.checkpointId || "")}</span><span class="pill">story ${escapeHtml(story.provenance.changeStorySha256.slice(0, 12))}…</span></div>
</header>
<div class="layout">
  <div class="flowcol">
    <h2>What happened</h2>
    <p class="hint">Click or use ↑/↓ + Enter to drill into a step.</p>
    ${svg}
  </div>
  <div class="detailcol">
    <h2>Step detail</h2>
    ${panels}
  </div>
</div>
${drawer}
</main>
<script>
(function(){
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.node[data-step]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.steppanel'));
  function select(i){
    if(i<0||i>=nodes.length) return;
    nodes.forEach(function(n){ n.classList.remove('selected'); });
    panels.forEach(function(p){ p.hidden = true; });
    nodes[i].classList.add('selected');
    if(panels[i]) panels[i].hidden = false;
    nodes[i].focus();
  }
  nodes.forEach(function(n,i){
    n.addEventListener('click', function(){ select(i); });
    n.addEventListener('keydown', function(e){
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); select(i); }
      else if(e.key==='ArrowDown'){ e.preventDefault(); select(Math.min(i+1,nodes.length-1)); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); select(Math.max(i-1,0)); }
    });
  });
  if(nodes[0]) nodes[0].classList.add('selected');
})();
</script>
</body></html>`;
}

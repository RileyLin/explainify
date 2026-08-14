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
} from "../session/bundle-schema.mjs";
import {
  assertChangeStory,
  hashChangeStory,
  CHANGE_STORY_SCHEMA_VERSION,
  deriveChangeDescriptors,
  refExcerpt,
  fitOverviewLabel,
  OVERVIEW_LABEL_MAX_ADVANCE,
} from "../session/change-story-schema.mjs";
import { sha256, stableStringify } from "../comprehension/util.mjs";

// Choose the semantic view (R4). Only observed_sequence edges are provable, so
// renderHint is always "sequential" for now; viewType reflects the evidence shape:
// a failed→passed verification arc reads as a "sequence" (debugging), otherwise a
// "workflow". This is a labeling choice over observed evidence, never an inferred
// causal topology. (Computed inline from the unified verification set in
// buildChangeStory so it also counts bare Bash checks, not only receipts.)

export function buildChangeStory(bundle) {
  const excerptById = new Map(bundle.excerpts.map((e) => [e.id, e]));

  // --- objective (story-level claim) ---
  const objectiveExcerpt = excerptById.get(bundle.objective.sourceId);
  const objective = {
    text: bundle.objective.text,
    status: "observed",
    evidence: objectiveExcerpt ? [refExcerpt(objectiveExcerpt)] : [],
  };

  const errorExcerpt = bundle.excerpts.find((e) => e.kind === "error");

  // --- steps: SEMANTICALLY COMPACTED (Phase 1F, task #39) ---
  // The ENTIRE ordered step partition — diagnosis, per-file change units, the
  // unified verification set, and any cap-produced aggregate — is derived by the
  // SHARED pure function `deriveChangeDescriptors(bundle)` in change-story-schema.mjs
  // (task #39 REVISE round 4). The validator re-runs the SAME function and asserts
  // story.steps is canonically identical, so producer and tamper-check cannot drift:
  // fold necessity, aggregate id/members/anchor/label/tool-refs and outcome are all
  // bound to this one bundle-derived result, never to the mutable story. The builder
  // no longer re-implements the partition; it only maps descriptors into the story
  // shell (nodes/edges/outcome/drawer).
  const { descriptors, verifications, outcome } = deriveChangeDescriptors(bundle);
  const steps = descriptors.map((d) => d.step);
  // The story-level outcome (visible verification claim) is DERIVED by the shared
  // function too (task #45 finding #2), so the validator re-runs it and binds
  // text/status/evidence to the bundle — the builder only consumes it here.
  const passCount = verifications.filter((v) => v.status === "succeeded").length;
  const failCount = verifications.filter((v) => v.status === "failed").length;

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
        ${(() => {
          // Deterministic fit shared with the schema (task #50 REVISE r2/r3):
          // fitOverviewLabel truncates using a measured PER-GLYPH UPPER BOUND
          // (not an average — task #51 showed an average lets wide glyphs like
          // W/M bypass), so a returned FULL label is guaranteed to fit the box.
          // A returned TRUNCATED label is ALSO hard-pinned via textLength below
          // so the browser cannot paint past the box under any font fallback.
          const fitted = fitOverviewLabel(n.label);
          const pin = fitted !== n.label ? ` textLength="${OVERVIEW_LABEL_MAX_ADVANCE}" lengthAdjust="spacingAndGlyphs"` : "";
          return `<text x="14" y="40" class="nlabel"${pin}>${escapeHtml(fitted)}</text>`;
        })()}
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

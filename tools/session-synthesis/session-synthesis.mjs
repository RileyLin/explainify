import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSourceManifest } from "../workstream-brief/freeze.mjs";
import { buildCoverageReceipt } from "../workstream-brief/brief.mjs";
import { scanOutput } from "../comprehension/evidence.mjs";
import { sha256, stableStringify } from "../comprehension/util.mjs";
import { assertBundle, canonicalReceipt } from "../session/bundle-schema.mjs";

const RECEIPT_KINDS = new Set(["command_receipt", "test_receipt", "deployment_receipt", "raft_message", "raft_task_state"]);

function fail(message) {
  throw new Error(`Invalid SessionEvidenceBundle: ${message}`);
}

export function validateSessionBundle(input) {
  return assertBundle(structuredClone(input));
}

function evidenceLink(source) {
  const receiptBacked = RECEIPT_KINDS.has(source.kind);
  return {
    sourceId: source.id,
    ...(receiptBacked ? { receiptId: `receipt:${source.id}` } : {}),
    locator: receiptBacked ? `${source.id}#receipt:${source.id}` : source.locator,
    ...(source.revision ? { revision: source.revision } : {}),
    sha256: source.sha256,
    evidenceLevel: source.evidenceLevel,
    evidenceLabel: source.evidenceLabel,
  };
}

function finalizeBrief(semantic, coverageReceipt, manifest) {
  const draft = { ...semantic, checkpointId: "" };
  const checkpointId = `checkpoint-${sha256(stableStringify(draft)).slice(0, 12)}`;
  const finalized = { ...draft, checkpointId };
  return {
    ...finalized,
    receipt: {
      semanticBriefSha256: sha256(stableStringify(finalized)),
      sourceManifestSha256: manifest.bundleSha256,
      coverageReceiptSha256: sha256(stableStringify(coverageReceipt)),
      unsupportedObservedClaimCount: 0,
      secretScan: "pass",
      publication: "local_only",
    },
  };
}

function claim(id, text, evidence, status = "observed", unknownReason) {
  return {
    id,
    text,
    status,
    evidence,
    ...(unknownReason ? { unknownReason } : {}),
  };
}

function chooseView(bundle, sourceById) {
  const decision = bundle.excerpts.find((item) => item.kind === "agent_decision");
  const successful = bundle.toolEvents.filter((event) => event.status === "succeeded");
  const changed = bundle.repository.changedFiles;
  if (successful.length >= 2 && changed.length >= 2) {
    return {
      type: "workflow",
      title: "How the session changed the system",
      reason: "Selected because the evidence records an ordered tool workflow and multiple changed files.",
      steps: successful.slice(0, 4).map((event) => ({
        id: event.id,
        label: event.inputSummary,
        detail: event.outputSummary,
        evidenceSourceIds: [`tool:${event.id}:input`, ...(event.outputSummary ? [`tool:${event.id}:output`] : [])],
      })),
    };
  }
  return {
    type: "code_walkthrough",
    title: "Code path inspected by the session",
    reason: "Selected because the evidence supports file-level changes but not a multi-component topology.",
    steps: changed.slice(0, 4).map((file) => ({
      id: `file-${file.path}`,
      label: `${file.status}: ${file.path}`,
      detail: decision?.text || "No supported architectural relationship was captured.",
      evidenceSourceIds: [`file:${file.path}`].filter((id) => sourceById.has(id)),
    })),
  };
}

export function synthesizeSession(input) {
  const bundle = validateSessionBundle(structuredClone(input));
  const evidenceLabel = "receipt-attested from selected local session evidence";
  const sources = [];
  const add = (source) => sources.push({ evidenceLevel: "receipt_attested", evidenceLabel, captured: true, ...source });

  for (const excerpt of bundle.excerpts) {
    add({ id: `excerpt:${excerpt.id}`, kind: excerpt.kind === "agent_decision" ? "decision" : "raft_message", locator: excerpt.locator, content: excerpt.text });
  }
  for (const event of bundle.toolEvents) {
    add({ id: `tool:${event.id}:input`, kind: "command_receipt", locator: event.inputLocator, content: event.inputSummary });
    if (event.outputSummary) add({ id: `tool:${event.id}:output`, kind: "command_receipt", locator: event.outputLocator, content: event.outputSummary });
  }
  for (const file of bundle.repository.changedFiles) {
    add({ id: `file:${file.path}`, kind: "git_span", locator: file.path, ...(bundle.repository.headRevision ? { revision: bundle.repository.headRevision } : {}), content: stableStringify(file) });
  }
  for (const receipt of bundle.receipts) {
    add({ id: `receipt:${receipt.id}`, kind: receipt.kind === "test" ? "test_receipt" : "command_receipt", locator: receipt.commandLocator, ...(bundle.repository.headRevision ? { revision: bundle.repository.headRevision } : {}), content: canonicalReceipt(receipt) });
  }
  for (const exclusion of bundle.exclusions) {
    sources.push({
      id: `exclusion:${exclusion.kind}`,
      kind: "command_receipt",
      locator: `excluded:${exclusion.kind}`,
      evidenceLevel: "receipt_attested",
      evidenceLabel,
      captured: false,
      exclusionReason: "policy",
      content: `${exclusion.count} ${exclusion.kind} item(s) excluded: ${exclusion.reason}`,
    });
  }

  const freshnessCursor = bundle.session.endedAt || bundle.session.startedAt;
  if (!freshnessCursor) fail("session needs startedAt or endedAt for deterministic freshness");
  const workstreamId = `session:${bundle.session.id}`;
  const freezeBundle = { schemaVersion: 1, workstreamId, freshnessCursor, sources };
  const manifest = buildSourceManifest(freezeBundle);
  const coverageReceipt = buildCoverageReceipt(manifest);
  const sourceById = new Map(manifest.sources.map((source) => [source.id, source]));
  const links = (...ids) => ids.map((id) => sourceById.get(id)).filter(Boolean).map(evidenceLink);

  const objectiveLink = links(`excerpt:${bundle.objective.sourceId}`);
  const fileIds = bundle.repository.changedFiles.map((file) => `file:${file.path}`);
  const receiptIds = bundle.receipts.map((receipt) => `receipt:${receipt.id}`);
  const decision = bundle.excerpts.find((item) => item.kind === "agent_decision");
  const error = bundle.excerpts.find((item) => item.kind === "error");
  const unresolved = bundle.excerpts.find((item) => item.kind === "unresolved");
  const outcomeEvidence = [...objectiveLink, ...links(...fileIds.slice(0, 3)), ...links(...receiptIds.slice(0, 2))];
  const outcomeText = bundle.repository.changedFiles.length
    ? `The session completed ${bundle.repository.changedFiles.length} recorded file change(s) for: ${bundle.objective.text}`
    : `The session investigated the objective without a captured file change: ${bundle.objective.text}`;
  const unknowns = [];
  if (bundle.repository.dirty) unknowns.push(claim("unknown-dirty-tree", "The repository remained dirty at capture, so uncaptured working-tree changes may exist.", [], "unknown", "repository dirty state is receipt-attested but the missing diff is not selected"));
  if (unresolved) unknowns.push(claim("unknown-session", unresolved.text, links(`excerpt:${unresolved.id}`), "unknown", "the session explicitly recorded this as unresolved"));
  if (bundle.exclusions.length) unknowns.push(claim("unknown-exclusions", "Some session material was excluded by policy and is not represented as evidence.", [], "unknown", bundle.exclusions.map((item) => item.reason).join("; ")));

  const semantic = {
    schemaVersion: 1,
    workstreamId,
    checkpointId: "",
    freshnessCursor,
    objective: bundle.request.question,
    currentOutcome: claim("session-outcome", outcomeText, outcomeEvidence),
    sinceLastLooked: bundle.repository.changedFiles.map((file) => claim(`change-${sha256(file.path).slice(0, 10)}`, `${file.status}: ${file.path}`, links(`file:${file.path}`))),
    reviewFirst: decision
      ? [claim("session-rationale", decision.text, links(`excerpt:${decision.id}`))]
      : [claim("review-objective", "Review the objective and changed-file evidence first; no explicit design decision was selected.", objectiveLink)],
    verification: bundle.receipts.map((receipt) =>
      claim(`verify-${receipt.id}`, `${receipt.command}: ${receipt.status}${receipt.exitCode !== undefined ? ` (exit ${receipt.exitCode})` : ""}. ${receipt.content}`, links(`receipt:${receipt.id}`), receipt.status === "succeeded" ? "observed" : "unknown", receipt.status === "succeeded" ? undefined : "the receipt does not prove a successful exit"),
    ),
    risks: error ? [claim("session-error", error.text, links(`excerpt:${error.id}`))] : [],
    blockers: [],
    unknowns,
    decisionsNeeded: [],
    coverageReceiptPath: "coverage-receipt.json",
    sourceManifestPath: "manifest-v0.1.json",
    correctionReceiptPaths: [],
    evidenceLabel,
  };
  const brief = finalizeBrief(semantic, coverageReceipt, manifest);
  const quotes = bundle.excerpts
    .filter((item) => ["user_requirement", "agent_decision", "agent_explanation", "error"].includes(item.kind))
    .slice(0, 4)
    .map((item) => ({ id: item.id, kind: item.kind, text: item.text, role: item.role, locator: item.locator, sha256: item.sha256, sourceId: `excerpt:${item.id}` }));
  if (quotes.length < 2) fail("session explanation requires at least two useful selected quotes");
  const view = chooseView(bundle, sourceById);
  const session = {
    schemaVersion: 1,
    sessionId: bundle.session.id,
    question: bundle.request.question,
    audience: bundle.request.audience,
    quotes,
    view,
    privacy: bundle.privacy,
  };
  const pkg = {
    packageVersion: 1,
    workstreamId,
    checkpointId: brief.checkpointId,
    brief,
    manifest,
    coverageReceipt,
    rawSources: sources.map(({ id, content }) => ({ id, content })),
    session,
    sessionSha256: sha256(stableStringify(session)),
  };
  scanOutput(stableStringify(pkg));
  return { package: pkg, receipt: null, html: renderSessionHtml(pkg) };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function renderSessionHtml(pkg) {
  const { brief } = pkg;
  const claimRows = brief.sinceLastLooked.map((item) => `<li><strong>${escapeHtml(item.text)}</strong><small>${escapeHtml(item.evidence[0]?.locator || "")}</small></li>`).join("");
  const quoteRows = pkg.session.quotes.map((quote) => `<blockquote><p>“${escapeHtml(quote.text)}”</p><footer>${escapeHtml(quote.role)} · <code>${escapeHtml(quote.locator)}</code> · <code>${quote.sha256.slice(0, 16)}…</code></footer></blockquote>`).join("");
  const steps = pkg.session.view.steps.map((step, index) => `<li><span>${index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p><code>${escapeHtml(step.evidenceSourceIds.join(", "))}</code></div></li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(brief.workstreamId)} · Explainify</title><style>
  :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#08090b;color:#f5f7fb}*{box-sizing:border-box}body{margin:0;background:#08090b}main{max-width:1040px;margin:auto;padding:28px 22px 60px;overflow-x:hidden}header{border-bottom:1px solid #242832;padding-bottom:24px}.eyebrow{color:#5f91ff;font-size:12px;font-weight:800;text-transform:uppercase}h1{font-size:clamp(28px,6vw,54px);line-height:1.04;margin:10px 0;letter-spacing:0}h2{font-size:18px;margin:0 0 14px;letter-spacing:0}.outcome{font-size:19px;line-height:1.55;color:#dfe5ef}.meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.pill{padding:7px 10px;border:1px solid #303641;border-radius:6px;color:#aab4c3;font-size:12px}.grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:18px;margin-top:18px;min-width:0}.panel{min-width:0;border:1px solid #242832;border-radius:8px;padding:18px;background:#101216}.panel p,.panel strong{overflow-wrap:anywhere}.panel p{color:#aab4c3;line-height:1.55}ul{list-style:none;margin:0;padding:0}.changes li{padding:12px 0;border-top:1px solid #242832}.changes small{display:block;color:#7e8998;margin-top:6px;overflow-wrap:anywhere}.flow li{display:flex;min-width:0;gap:12px;padding:12px 0;border-top:1px solid #242832}.flow span{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:#245fff}.flow div{min-width:0}.flow p{margin:4px 0}.flow code,blockquote code{font-size:11px;color:#8ea0b6;overflow-wrap:anywhere}blockquote{margin:12px 0;padding:14px;border-left:3px solid #5f91ff;background:#0b0d10}blockquote p{margin:0;color:#e8edf5}blockquote footer{margin-top:9px;color:#8793a3;font-size:11px;overflow-wrap:anywhere}.warning{border-left:3px solid #d5a529}.warning strong{color:#f0c457}@media(max-width:700px){main{padding:20px 14px 44px}.grid{grid-template-columns:minmax(0,1fr)}.panel{padding:15px}h1{font-size:32px}.outcome{font-size:16px}}
  </style></head><body><main><header><div class="eyebrow">Explainify · session brief · local only</div><h1>${escapeHtml(bundleTitle(pkg))}</h1><p class="outcome">${escapeHtml(brief.currentOutcome.text)}</p><div class="meta"><span class="pill">${escapeHtml(pkg.session.view.type)}</span><span class="pill">${brief.coverageReceiptPath}</span><span class="pill">${escapeHtml(brief.checkpointId)}</span></div></header><div class="grid"><section class="panel"><h2>What changed</h2><ul class="changes">${claimRows}</ul></section><section class="panel"><h2>Why / review first</h2><p>${escapeHtml(brief.reviewFirst[0]?.text || "No explicit rationale was captured.")}</p></section></div><section class="panel" style="margin-top:18px"><h2>${escapeHtml(pkg.session.view.title)}</h2><p>${escapeHtml(pkg.session.view.reason)}</p><ol class="flow">${steps}</ol></section><div class="grid"><section class="panel"><h2>Verification</h2><ul class="changes">${brief.verification.map((item) => `<li><strong>${escapeHtml(item.text)}</strong></li>`).join("") || "<li>No verification receipt captured.</li>"}</ul></section><section class="panel warning"><h2>Review first / unknowns</h2><strong>${brief.unknowns.length} unknown(s)</strong><p>${escapeHtml(brief.unknowns.map((item) => item.text).join(" ") || "No explicit unknowns recorded.")}</p></section></div><section class="panel" style="margin-top:18px"><h2>Exact session quotes</h2>${quoteRows}</section></main></body></html>`;
}

function bundleTitle(pkg) {
  return pkg.brief.objective || pkg.workstreamId;
}

export async function writeSessionArtifacts(input, outputDirectory) {
  const result = synthesizeSession(input);
  await mkdir(outputDirectory, { recursive: true });
  const packageText = `${JSON.stringify(result.package, null, 2)}\n`;
  const htmlText = result.html;
  const receiptCore = {
    schemaVersion: 1,
    status: "verified",
    checkpointId: result.package.checkpointId,
    packageSha256: sha256(packageText),
    artifactSha256: sha256(htmlText),
    sessionSha256: result.package.sessionSha256,
    publication: "local_only",
    files: { artifact: "index.html", package: "workstream-package.json", receipt: "receipt.json" },
  };
  const receipt = { ...receiptCore, receiptSha256: sha256(stableStringify(receiptCore)) };
  await writeFile(path.join(outputDirectory, "workstream-package.json"), packageText);
  await writeFile(path.join(outputDirectory, "index.html"), htmlText);
  await writeFile(path.join(outputDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    status: "verified",
    artifactPath: path.resolve(outputDirectory, "index.html"),
    packagePath: path.resolve(outputDirectory, "workstream-package.json"),
    receiptPath: path.resolve(outputDirectory, "receipt.json"),
    openCommand: `open ${path.resolve(outputDirectory, "index.html")}`,
    publication: "local_only",
    checkpointId: result.package.checkpointId,
    receipt,
  };
}

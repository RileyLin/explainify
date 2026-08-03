import { escapeHtml } from "../util.mjs";

function status(value) {
  return `<span class="status status-${escapeHtml(value)}">${escapeHtml(value.replaceAll("_", " "))}</span>`;
}

function evidenceLink(reference, documentPath = "") {
  const [capsuleId, receiptId] = reference.split("#");
  const anchor = `evidence-${capsuleId}-${receiptId}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
  return `<a href="${escapeHtml(documentPath)}#${anchor}"><code>${escapeHtml(reference)}</code></a>`;
}

function evidenceList(references, documentPath = "") {
  return [...new Set(references)]
    .map((reference) => evidenceLink(reference, documentPath))
    .join("");
}

function runColumn(capsule) {
  const metric = capsule.verification.find((item) => item.kind === "metric");
  const cost = capsule.verification.find((item) => item.kind === "cost");
  const test = capsule.verification.find((item) => item.kind === "test");
  const resources = capsule.deployedResources
    .map((item) => `<li><strong>${escapeHtml(item.logicalRole)}</strong> · ${escapeHtml(item.providerType)} <code>${escapeHtml(item.identifierToken)}</code></li>`)
    .join("");
  return `<section class="run">
    <div class="provider">${escapeHtml(capsule.environment.provider)}</div>
    <h3>${escapeHtml(capsule.environment.region)}</h3>
    <p>${escapeHtml(capsule.environment.architecture)}</p>
    <dl>
      <dt>Revision</dt><dd><code>${escapeHtml(capsule.repository.revision.slice(0, 12))}</code>${capsule.repository.dirty ? ` ${status("dirty")}` : ""}</dd>
      <dt>Workload</dt><dd>${escapeHtml(capsule.workloadId)}</dd>
      <dt>Test</dt><dd>${test ? `${status(test.result)} ${escapeHtml(test.scope)}` : status("unknown")}</dd>
      <dt>p95</dt><dd>${metric ? `${escapeHtml(metric.value)} ${escapeHtml(metric.unit)} · ${escapeHtml(metric.scope)}` : status("unknown")}</dd>
      <dt>Cost</dt><dd>${cost ? `${escapeHtml(cost.value)} ${escapeHtml(cost.unit)} · ${escapeHtml(cost.scope)}` : status("unknown")}</dd>
    </dl>
    <h4>Receipt-attested resources</h4><ul>${resources}</ul>
  </section>`;
}

function evidenceRows(capsule) {
  return capsule.receipts.map((receipt) => {
    const anchor = `evidence-${capsule.id}-${receipt.id}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
    return `<tr id="${anchor}"><td>${escapeHtml(capsule.id)}</td><td><code>${escapeHtml(receipt.id)}</code></td><td>${escapeHtml(receipt.kind)}</td><td>${escapeHtml(receipt.sha256)}</td><td>${escapeHtml(receipt.content)}</td></tr>`;
  }).join("");
}

export function renderArchitectureDelta(left, right) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Architecture delta: ${escapeHtml(left.id)} vs ${escapeHtml(right.id)}</title>
<style>
:root{font:15px/1.5 system-ui,sans-serif;color:#14202b;background:#f4f6f8}body{margin:0;padding:24px}main{max-width:1100px;margin:auto}h1{font-size:26px;letter-spacing:0}.delta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cad2da;background:#fff}.side{padding:22px}.side+ .side{border-left:1px solid #cad2da}.provider{text-transform:uppercase;font-size:12px;font-weight:800;color:#087b69}.flow{display:flex;align-items:center;gap:8px;margin:22px 0}.node{border:1px solid #73808d;padding:12px;min-width:100px;background:#fff}.arrow{font-size:20px}.label{color:#526170}.token{font:12px ui-monospace,monospace;overflow-wrap:anywhere}@media(max-width:700px){body{padding:12px}.delta{grid-template-columns:1fr}.side+ .side{border-left:0;border-top:1px solid #cad2da}.flow{flex-wrap:wrap}}
</style></head><body><main><p class="provider">Receipt-attested architecture delta · not provider-verified</p><h1>${escapeHtml(left.environment.provider)} and ${escapeHtml(right.environment.provider)}</h1><div class="delta">
${[left, right].map((capsule) => `<section class="side"><div class="provider">${escapeHtml(capsule.environment.provider)} · ${escapeHtml(capsule.environment.region)}</div><h2>${escapeHtml(capsule.environment.architecture)}</h2><div class="flow">${capsule.deployedResources.map((resource, index) => `${index ? '<span class="arrow">→</span>' : ""}<div class="node"><strong>${escapeHtml(resource.logicalRole)}</strong><div class="label">${escapeHtml(resource.providerType)}</div><div class="token">${escapeHtml(resource.identifierToken)}</div></div>`).join("")}</div><p>Evidence: ${evidenceList(capsule.deployedResources.flatMap((resource) => resource.evidence.map((reference) => `${capsule.id}#${reference}`)), "../index.html")}</p></section>`).join("")}
</div></main></body></html>`;
}

export function renderComparisonHtml(artifact, left, right) {
  const equivalenceRows = artifact.equivalence.map((item) =>
    `<tr><td>${escapeHtml(item.dimension)}</td><td>${status(item.status)}</td><td>${evidenceList(item.evidence)}</td></tr>`,
  ).join("");
  const claimRows = artifact.claims.map((claim) =>
    `<tr><td>${escapeHtml(claim.dimension)}</td><td>${status(claim.status)}</td><td>${escapeHtml(claim.text)}</td><td>${evidenceList(claim.leftEvidence)}</td><td>${evidenceList(claim.rightEvidence)}</td></tr>`,
  ).join("");
  const confounders = artifact.confounders.length
    ? artifact.confounders.map((item) => `<li><strong>${escapeHtml(item.dimension)}</strong> · ${escapeHtml(item.text)} ${evidenceList(item.evidence)}</li>`).join("")
    : "<li>No material comparability mismatch was found in the supplied receipts.</li>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(artifact.question)}</title><style>
:root{font:15px/1.55 system-ui,sans-serif;color:#17212b;background:#eef1f3}*{box-sizing:border-box}body{margin:0}header{background:#17212b;color:#fff;padding:28px}header>div,main{max-width:1180px;margin:auto}header h1{font-size:30px;letter-spacing:0;margin:6px 0}.eyebrow,.provider{color:#29b99f;text-transform:uppercase;font-size:12px;font-weight:800}.attestation{color:#ccd6df}main{padding:20px;min-width:0}.band{background:#fff;border:1px solid #cbd3da;border-radius:6px;padding:20px;margin:16px 0;min-width:0}.runs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border:1px solid #cbd3da;background:#fff;min-width:0}.run{padding:20px;min-width:0;overflow-wrap:anywhere}.run+.run{border-left:1px solid #cbd3da}.run h3{margin:3px 0 12px}.run dl{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;margin:18px 0}.run dt{font-weight:700}.run dd{margin:0;overflow-wrap:anywhere}.status{display:inline-block;padding:2px 6px;border:1px solid #9ba8b4;border-radius:3px;font-size:11px;font-weight:800;text-transform:uppercase}.status-equivalent,.status-observed,.status-pass{border-color:#07866f;color:#06715f}.status-different,.status-fail,.status-dirty{border-color:#bd3547;color:#a42537}.status-not_comparable,.status-unknown,.status-inferred{border-color:#9b7015;color:#7b570f}.table-wrap{max-width:100%;overflow:auto}table{width:100%;min-width:760px;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #d8dee4;padding:9px;overflow-wrap:anywhere}th{font-size:12px;text-transform:uppercase;color:#4e5d6b}code{font:12px ui-monospace,monospace;overflow-wrap:anywhere;word-break:break-all}td a,.run a{display:block;color:#126b8c;min-width:0}.recommendation{border-left:4px solid #087b69}.warning{border-left:4px solid #b1841c}.view-link{font-weight:800;color:#087b69}@media(max-width:760px){header,main{padding:16px}.runs{grid-template-columns:1fr}.run+.run{border-left:0;border-top:1px solid #cbd3da}header h1{font-size:24px}}
</style></head><body><header><div><div class="eyebrow">Local comparative checkpoint</div><h1>${escapeHtml(artifact.question)}</h1><p class="attestation">Receipt-attested, not provider-verified · ${escapeHtml(left.id)} vs ${escapeHtml(right.id)}</p></div></header><main>
<section class="band"><h2>30-second brief</h2><p>${escapeHtml(artifact.brief.summary)}</p><p><strong>Review first:</strong> ${escapeHtml(artifact.brief.reviewFirst[0].text)}</p></section>
<section class="band"><h2>Equivalence gate</h2><div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${equivalenceRows}</tbody></table></div></section>
<section class="band warning"><h2>Confounders before recommendation</h2><ul>${confounders}</ul></section>
<section><h2>Five-minute side-by-side run story</h2><div class="runs">${runColumn(left)}${runColumn(right)}</div></section>
<section class="band"><h2>Architecture delta</h2><p>${escapeHtml(artifact.architectureSummary)}</p><a class="view-link" href="views/architecture-delta.html">Open evidence-specific architecture delta</a></section>
<section class="band"><h2>Comparative claims</h2><div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Status</th><th>Claim</th><th>Left evidence</th><th>Right evidence</th></tr></thead><tbody>${claimRows}</tbody></table></div></section>
<section class="band recommendation"><h2>Conditional recommendation</h2><p>${escapeHtml(artifact.recommendation.text)}</p><p><strong>Confidence:</strong> ${escapeHtml(artifact.recommendation.confidence)} · <strong>Decision depends on:</strong> ${escapeHtml(artifact.recommendation.decisionDependsOn.join("; "))}</p><div class="runs"><div class="run"><strong>Left evidence</strong>${evidenceList(artifact.recommendation.leftEvidence)}</div><div class="run"><strong>Right evidence</strong>${evidenceList(artifact.recommendation.rightEvidence)}</div></div></section>
<section class="band"><h2>Evidence</h2><div class="table-wrap"><table><thead><tr><th>Capsule</th><th>Receipt</th><th>Kind</th><th>SHA-256</th><th>Bounded content</th></tr></thead><tbody>${evidenceRows(left)}${evidenceRows(right)}</tbody></table></div></section>
</main></body></html>`;
}

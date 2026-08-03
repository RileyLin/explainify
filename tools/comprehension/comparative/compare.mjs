import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateCapsule, publicSecretScan } from "./capsule.mjs";
import { renderArchitectureDelta, renderComparisonHtml } from "./compare-render.mjs";
import { hashFile, sha256, stableStringify, writeJson } from "../util.mjs";

function evidence(capsule, references) {
  return references.map((reference) => `${capsule.id}#${reference}`);
}

function repoEvidence(capsule) {
  return evidence(capsule, capsule.repository.statusEvidence);
}

function environmentEvidence(capsule) {
  return evidence(capsule, Object.values(capsule.environment.labelEvidence));
}

function input(capsule, kind) {
  return capsule.inputs.find((item) => item.kind === kind);
}

function verification(capsule, kind) {
  return capsule.verification.find((item) => item.kind === kind);
}

function executionEvidence(capsule) {
  return evidence(
    capsule,
    capsule.execution.flatMap((item) =>
      [item.stdoutReceipt, item.stderrReceipt].filter(Boolean)),
  );
}

function receiptConsistencyEvidence(capsule) {
  const test = verification(capsule, "test");
  const notes = capsule.receipts.filter((item) => item.kind === "agent_note");
  const references = [
    ...(test?.evidence || []),
    ...notes.map((item) => item.id),
  ];
  return references.length ? references : capsule.repository.statusEvidence;
}

function hasReceiptContradiction(capsule) {
  const test = verification(capsule, "test");
  return capsule.receipts.some(
    (item) =>
      item.kind === "agent_note"
      && /\bpass(?:ed)?\b/i.test(item.content)
      && test?.result !== "pass",
  );
}

function equivalenceItem(dimension, status, left, leftRefs, right, rightRefs) {
  return {
    dimension,
    status,
    evidence: [
      ...evidence(left, leftRefs.filter(Boolean)),
      ...evidence(right, rightRefs.filter(Boolean)),
    ],
  };
}

function buildEquivalence(left, right) {
  const leftConfig = input(left, "config");
  const rightConfig = input(right, "config");
  const leftLoad = input(left, "load_profile");
  const rightLoad = input(right, "load_profile");
  const leftWorkload = input(left, "command");
  const rightWorkload = input(right, "command");
  const leftMetric = verification(left, "metric");
  const rightMetric = verification(right, "metric");
  const leftCost = verification(left, "cost");
  const rightCost = verification(right, "cost");
  const bothClean = !left.repository.dirty && !right.repository.dirty;
  const executionPass = left.execution.every((item) => item.exitCode === 0)
    && right.execution.every((item) => item.exitCode === 0);

  return [
    equivalenceItem(
      "code_revision",
      !bothClean ? "unknown" : left.repository.revision === right.repository.revision ? "equivalent" : "different",
      left,
      left.repository.statusEvidence,
      right,
      right.repository.statusEvidence,
    ),
    equivalenceItem(
      "configuration",
      leftConfig?.sha256 === rightConfig?.sha256 ? "equivalent" : "different",
      left,
      [leftConfig?.locator || left.repository.statusEvidence[0]],
      right,
      [rightConfig?.locator || right.repository.statusEvidence[0]],
    ),
    equivalenceItem(
      "workload",
      left.workloadId === right.workloadId && leftWorkload?.sha256 === rightWorkload?.sha256
        ? "equivalent"
        : "different",
      left,
      [leftWorkload?.locator || left.repository.statusEvidence[0]],
      right,
      [rightWorkload?.locator || right.repository.statusEvidence[0]],
    ),
    equivalenceItem(
      "load_profile",
      leftLoad?.sha256 === rightLoad?.sha256 ? "equivalent" : "different",
      left,
      [leftLoad?.locator || left.repository.statusEvidence[0]],
      right,
      [rightLoad?.locator || right.repository.statusEvidence[0]],
    ),
    equivalenceItem(
      "region",
      left.environment.region === right.environment.region ? "equivalent" : "different",
      left,
      [left.environment.labelEvidence.region],
      right,
      [right.environment.labelEvidence.region],
    ),
    equivalenceItem(
      "execution",
      executionPass ? "equivalent" : "different",
      left,
      left.execution.flatMap((item) => [item.stdoutReceipt, item.stderrReceipt]),
      right,
      right.execution.flatMap((item) => [item.stdoutReceipt, item.stderrReceipt]),
    ),
    equivalenceItem(
      "metric_basis",
      !leftMetric || !rightMetric || leftMetric.result !== "observed" || rightMetric.result !== "observed"
        ? "unknown"
        : leftMetric.scope === rightMetric.scope
          ? "equivalent"
          : "different",
      left,
      leftMetric?.evidence || [],
      right,
      rightMetric?.evidence || [],
    ),
    equivalenceItem(
      "pricing_basis",
      !left.pricingBasis || !right.pricingBasis
          || leftCost?.result !== "observed" || rightCost?.result !== "observed"
        ? "unknown"
        : left.pricingBasis.snapshotSha256 === right.pricingBasis.snapshotSha256
            && left.pricingBasis.currency === right.pricingBasis.currency
          ? "equivalent"
          : "different",
      left,
      leftCost?.evidence || [],
      right,
      rightCost?.evidence || [],
    ),
    equivalenceItem(
      "cost_scope",
      !leftCost || !rightCost || leftCost.result !== "observed" || rightCost.result !== "observed"
        ? "unknown"
        : leftCost.scope === rightCost.scope
          ? "equivalent"
          : "different",
      left,
      leftCost?.evidence || [],
      right,
      rightCost?.evidence || [],
    ),
    equivalenceItem(
      "receipt_consistency",
      hasReceiptContradiction(left) || hasReceiptContradiction(right)
        ? "different"
        : "equivalent",
      left,
      receiptConsistencyEvidence(left),
      right,
      receiptConsistencyEvidence(right),
    ),
  ];
}

function equivalenceStatus(equivalence, dimension) {
  return equivalence.find((item) => item.dimension === dimension)?.status || "unknown";
}

function mismatchConfounders(equivalence) {
  const labels = {
    code_revision: "The runs do not establish the same immutable code state.",
    configuration: "Runtime configuration inputs differ.",
    workload: "Workload command or workload identity differs.",
    load_profile: "Load profiles differ.",
    region: "Regions differ and can change latency or service behavior.",
    execution: "At least one execution failed or was partial.",
    metric_basis: "Metric windows, sample counts, or load basis differ or are missing.",
    pricing_basis: "Frozen pricing basis differs or is missing.",
    cost_scope: "Cost windows or included/excluded resources differ or are missing.",
    receipt_consistency: "An agent summary conflicts with test or execution receipts.",
  };
  return equivalence
    .filter((item) => item.status !== "equivalent")
    .map((item) => ({
      dimension: item.dimension,
      text: labels[item.dimension],
      evidence: item.evidence,
    }));
}

function hasInventoryConflict(capsule) {
  return capsule.verification.some(
    (item) => item.kind === "resource_inventory" && item.result === "unknown",
  );
}

function compareClaims(left, right, equivalence) {
  const leftTest = verification(left, "test");
  const rightTest = verification(right, "test");
  const leftMetric = verification(left, "metric");
  const rightMetric = verification(right, "metric");
  const leftCost = verification(left, "cost");
  const rightCost = verification(right, "cost");
  const baseComparable = ["code_revision", "configuration", "workload", "load_profile", "execution"]
    .every((dimension) => equivalenceStatus(equivalence, dimension) === "equivalent");
  const performanceComparable = baseComparable
    && equivalenceStatus(equivalence, "region") === "equivalent"
    && equivalenceStatus(equivalence, "metric_basis") === "equivalent"
    && leftMetric?.result === "observed"
    && rightMetric?.result === "observed";
  const costComparable = baseComparable
    && equivalenceStatus(equivalence, "pricing_basis") === "equivalent"
    && equivalenceStatus(equivalence, "cost_scope") === "equivalent"
    && leftCost?.result === "observed"
    && rightCost?.result === "observed";
  const architectureComparable = !hasInventoryConflict(left) && !hasInventoryConflict(right);

  const architectureEvidenceLeft = evidence(
    left,
    left.deployedResources.flatMap((item) => item.evidence),
  );
  const architectureEvidenceRight = evidence(
    right,
    right.deployedResources.flatMap((item) => item.evidence),
  );
  const claims = [
    {
      id: "architecture",
      dimension: "architecture",
      text: architectureComparable
        ? `${left.environment.provider} uses ${left.environment.architecture}; ${right.environment.provider} uses ${right.environment.architecture}.`
        : "The captured resource inventories conflict, so the architecture delta is not comparable.",
      status: architectureComparable ? "observed" : "not_comparable",
      leftEvidence: architectureEvidenceLeft,
      rightEvidence: architectureEvidenceRight,
      confounders: architectureComparable ? [] : ["resource inventory conflict"],
    },
    {
      id: "behavior",
      dimension: "behavior",
      text: baseComparable && leftTest && rightTest
        ? `The receipt-attested smoke result is ${leftTest.result} on ${left.environment.provider} and ${rightTest.result} on ${right.environment.provider}.`
        : "Behavior cannot be attributed to provider differences because the code, workload, or execution state is not equivalent.",
      status: baseComparable && leftTest && rightTest ? "observed" : "not_comparable",
      leftEvidence: leftTest ? evidence(left, leftTest.evidence) : executionEvidence(left),
      rightEvidence: rightTest ? evidence(right, rightTest.evidence) : executionEvidence(right),
      confounders: baseComparable ? [] : ["code, workload, configuration, or execution mismatch"],
    },
    {
      id: "performance",
      dimension: "performance",
      text: performanceComparable && leftMetric && rightMetric
        ? `Observed p95 was ${leftMetric.value}${leftMetric.unit} on ${left.environment.provider} and ${rightMetric.value}${rightMetric.unit} on ${right.environment.provider} under the same recorded basis.`
        : "Performance is not comparable until code, load, region, execution, and metric basis are equivalent.",
      status: performanceComparable && leftMetric && rightMetric ? "observed" : "not_comparable",
      leftEvidence: leftMetric ? evidence(left, leftMetric.evidence) : executionEvidence(left),
      rightEvidence: rightMetric ? evidence(right, rightMetric.evidence) : executionEvidence(right),
      confounders: performanceComparable ? [] : ["performance equivalence gate failed"],
    },
    {
      id: "cost",
      dimension: "cost",
      text: costComparable && leftCost && rightCost
        ? `Frozen-basis estimate was ${leftCost.value} ${leftCost.unit} on ${left.environment.provider} and ${rightCost.value} ${rightCost.unit} on ${right.environment.provider}.`
        : "Cost is not comparable until code, workload, pricing snapshot, time window, and included/excluded resources align.",
      status: costComparable && leftCost && rightCost ? "observed" : "not_comparable",
      leftEvidence: leftCost ? evidence(left, leftCost.evidence) : repoEvidence(left),
      rightEvidence: rightCost ? evidence(right, rightCost.evidence) : repoEvidence(right),
      confounders: costComparable ? [] : ["cost equivalence gate failed"],
    },
    {
      id: "operations",
      dimension: "operations",
      text: architectureComparable
        ? `The receipt-attested operational models differ: ${left.environment.architecture} versus ${right.environment.architecture}.`
        : "Operational burden is unknown because the resource inventory is internally inconsistent.",
      status: architectureComparable ? "observed" : "unknown",
      leftEvidence: [...environmentEvidence(left), ...architectureEvidenceLeft],
      rightEvidence: [...environmentEvidence(right), ...architectureEvidenceRight],
      confounders: architectureComparable ? [] : ["resource inventory conflict"],
    },
  ];
  for (const claim of claims.filter((item) => item.status === "observed")) {
    if (!claim.leftEvidence.length || !claim.rightEvidence.length) {
      throw new Error(`Observed claim ${claim.id} lacks bilateral evidence`);
    }
  }
  return claims;
}

function buildRecommendation(left, right, claims, confounders) {
  const performance = claims.find((claim) => claim.id === "performance");
  const cost = claims.find((claim) => claim.id === "cost");
  const operations = claims.find((claim) => claim.id === "operations");
  const supportsDecision = performance.status === "observed"
    && cost.status === "observed"
    && operations.status === "observed"
    && confounders.length === 0;
  const observed = claims.filter((claim) => claim.status === "observed");
  const leftEvidence = [...new Set(observed.flatMap((claim) => claim.leftEvidence))];
  const rightEvidence = [...new Set(observed.flatMap((claim) => claim.rightEvidence))];
  if (!supportsDecision) {
    return {
      supported: false,
      text: "No provider choice is supported by these receipts. Align the listed confounders and rerun the pinned workload before deciding.",
      confidence: "low",
      supportingClaims: claims.filter((claim) => claim.status === "observed").map((claim) => claim.id),
      decisionDependsOn: confounders.map((item) => item.dimension),
      leftEvidence: leftEvidence.length ? leftEvidence : repoEvidence(left),
      rightEvidence: rightEvidence.length ? rightEvidence : repoEvidence(right),
    };
  }
  const leftMetric = verification(left, "metric");
  const rightMetric = verification(right, "metric");
  const leftCost = verification(left, "cost");
  const rightCost = verification(right, "cost");
  const lowerLatency = leftMetric.value <= rightMetric.value ? left : right;
  const lowerCost = leftCost.value <= rightCost.value ? left : right;
  return {
    supported: true,
    text: lowerLatency.id === lowerCost.id
      ? `For this frozen workload only, ${lowerLatency.environment.provider} is supported when the decision prioritizes the observed latency and cost measures; provider verification and a longer run remain required before adoption.`
      : `For this frozen workload only, prefer ${lowerLatency.environment.provider} when p95 latency dominates, or ${lowerCost.environment.provider} when the frozen-basis cost estimate dominates; operational-model preference remains a separate criterion.`,
    confidence: "medium",
    supportingClaims: ["performance", "cost", "operations"],
    decisionDependsOn: ["latency priority", "cost scope", "operational model", "provider verification"],
    leftEvidence,
    rightEvidence,
  };
}

function semanticArtifact(artifact) {
  const semantic = { ...artifact };
  delete semantic.generatedAt;
  delete semantic.receipt;
  return semantic;
}

export function compareCapsules(leftInput, rightInput, question) {
  const left = validateCapsule(structuredClone(leftInput));
  const right = validateCapsule(structuredClone(rightInput));
  const equivalence = buildEquivalence(left, right);
  const confounders = mismatchConfounders(equivalence);
  const claims = compareClaims(left, right, equivalence);
  const recommendation = buildRecommendation(left, right, claims, confounders);
  const architectureClaim = claims.find((claim) => claim.id === "architecture");
  const artifact = {
    schemaVersion: 1,
    id: `comparison-${sha256(`${left.provenance.capsuleSha256}:${right.provenance.capsuleSha256}`).slice(0, 12)}`,
    question,
    capsules: [left.id, right.id],
    evidenceLevel: "receipt_attested",
    evidenceLabel: "receipt_attested, not provider-verified",
    readingOrder: ["brief", "equivalence", "confounders", "claims", "recommendation", "evidence"],
    equivalence,
    confounders,
    brief: {
      summary: recommendation.text,
      conclusion: claims.filter((claim) => claim.status === "observed").slice(0, 3),
      whyItMatters: claims.filter((claim) => ["performance", "cost", "operations"].includes(claim.id)),
      reviewFirst: [{
        id: "review-equivalence",
        dimension: "operations",
        text: confounders.length
          ? `Resolve ${confounders.map((item) => item.dimension).join(", ")} before relying on the recommendation.`
          : "Inspect bilateral performance, cost, and operational evidence before choosing a provider.",
        status: confounders.length ? "not_comparable" : "observed",
        leftEvidence: repoEvidence(left),
        rightEvidence: repoEvidence(right),
        confounders: confounders.map((item) => item.dimension),
      }],
    },
    claims,
    architectureSummary: architectureClaim.text,
    recommendation,
    views: [{
      kind: "architecture_delta",
      artifactPath: "views/architecture-delta.html",
      evidence: [...architectureClaim.leftEvidence, ...architectureClaim.rightEvidence],
    }],
    capsuleSummaries: [
      {
        id: left.id,
        provider: left.environment.provider,
        revision: left.repository.revision,
        dirty: left.repository.dirty,
        reproducible: left.repository.reproducible,
      },
      {
        id: right.id,
        provider: right.environment.provider,
        revision: right.repository.revision,
        dirty: right.repository.dirty,
        reproducible: right.repository.reproducible,
      },
    ],
    generatedAt: new Date().toISOString(),
    receipt: {
      capsuleHashes: [
        left.provenance.capsuleSha256,
        right.provenance.capsuleSha256,
      ],
      semanticArtifactSha256: "",
      unsupportedClaimCount: 0,
      secretScan: "pass",
      publication: "local_only",
      providerApiCalled: false,
    },
  };
  artifact.receipt.semanticArtifactSha256 = sha256(stableStringify(semanticArtifact(artifact)));
  publicSecretScan(artifact);
  return { artifact, left, right };
}

export async function compareRunFiles({
  leftPath,
  rightPath,
  question,
  outputDir,
}) {
  const left = JSON.parse(await readFile(leftPath, "utf8"));
  const right = JSON.parse(await readFile(rightPath, "utf8"));
  return writeComparison({ left, right, question, outputDir });
}

export async function writeComparison({ left, right, question, outputDir }) {
  const comparison = compareCapsules(left, right, question);
  await mkdir(path.join(outputDir, "views"), { recursive: true });
  const artifactPath = path.join(outputDir, "index.html");
  const manifestPath = path.join(outputDir, "manifest.json");
  const receiptPath = path.join(outputDir, "receipt.json");
  const architecturePath = path.join(outputDir, "views/architecture-delta.html");
  const html = renderComparisonHtml(comparison.artifact, comparison.left, comparison.right);
  const architectureHtml = renderArchitectureDelta(comparison.left, comparison.right);
  publicSecretScan(html);
  publicSecretScan(architectureHtml);
  await writeJson(manifestPath, comparison.artifact);
  await writeFile(artifactPath, html, "utf8");
  await writeFile(architecturePath, architectureHtml, "utf8");
  const receipt = {
    schemaVersion: 1,
    status: "verified",
    manifestFileSha256: await hashFile(manifestPath),
    artifactSha256: await hashFile(artifactPath),
    architectureViewSha256: await hashFile(architecturePath),
    semanticArtifactSha256: comparison.artifact.receipt.semanticArtifactSha256,
    capsuleHashes: comparison.artifact.receipt.capsuleHashes,
    evidenceLevel: "receipt_attested",
    unsupportedClaimCount: 0,
    secretScan: "pass",
    publication: "local_only",
    providerApiCalled: false,
  };
  await writeJson(receiptPath, receipt);
  return {
    status: "verified",
    artifactPath,
    manifestPath,
    receiptPath,
    architecturePath,
    recommendationSupported: comparison.artifact.recommendation.supported,
    semanticArtifactSha256: comparison.artifact.receipt.semanticArtifactSha256,
    publication: "local_only",
  };
}

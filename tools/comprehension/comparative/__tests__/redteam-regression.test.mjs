import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateCapsule, capsuleSemantic } from "../capsule.mjs";
import { compareCapsules, writeComparison } from "../compare.mjs";
import { loadComparativeFixtures } from "../fixtures.mjs";
import { comparisonToPackage } from "../workstream-package.mjs";
import { sha256, stableStringify } from "../../util.mjs";

// Task #23 successor to immutable 2bbab16 — the five PM red-team reproductions, ported as NEGATIVE
// regressions. Each block reproduces the PM's exact attack and asserts the FIXED behavior: a forged
// or degenerate comparison never renders as an observed provider recommendation, coverage is honest,
// and a private identifier can never reach a claim. The PM's originals proved the defect existed;
// these prove it stays closed. (PM msgs 829a9350 + f154e1bd.)

const root = new URL("../../../../", import.meta.url).pathname;

function rehashCapsule(capsule) {
  capsule.provenance.capsuleSha256 = sha256(stableStringify(capsuleSemantic(capsule)));
  validateCapsule(capsule);
  return capsule;
}

function rehashArtifact(artifact) {
  const semantic = { ...artifact };
  delete semantic.generatedAt;
  delete semantic.receipt;
  artifact.receipt.semanticArtifactSha256 = sha256(stableStringify(semantic));
  return artifact;
}

// PM #1 (Blocker) — a run compared to itself must NEVER yield an observed provider recommendation.
// Identical ids are refused before the source map can collapse.
test("red-team #1a: a self-comparison is refused (never an observed provider winner)", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const capsule = cases.find((entry) => entry.id === "C01").left;
  const { artifact, left, right } = compareCapsules(capsule, capsule, "self comparison");
  assert.throws(() => comparisonToPackage(artifact, left, right), /self-comparison|distinct ids|identical content/i);
});

// PM #1 (Blocker) — two DISTINCT-id capsules on the SAME provider must not yield a provider
// recommendation; the outcome degrades to an evidence-bearing not_comparable (the allowed pair is
// exactly one aws + one gcp, per PM f154e1bd).
test("red-team #1b: two same-provider capsules degrade to not_comparable, not an observed winner", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const original = cases.find((entry) => entry.id === "C01").left;
  const duplicate = structuredClone(original);
  duplicate.id = `${original.id}-same-provider-copy`;
  rehashCapsule(duplicate);

  const { artifact, left, right } = compareCapsules(original, duplicate, "same provider");
  const pkg = comparisonToPackage(artifact, left, right);

  assert.equal(left.environment.provider, right.environment.provider);
  assert.notEqual(left.id, right.id);
  assert.notEqual(pkg.brief.currentOutcome.status, "observed");
  assert.equal(pkg.brief.currentOutcome.status, "not_comparable");
  assert.match(pkg.brief.currentOutcome.text || pkg.brief.currentOutcome.unknownReason, /aws|gcp|provider/i);
});

// PM #1 (Blocker) — a role-swapped AWS/GCP pair stays semantically equivalent: both orderings mint a
// package that round-trips, so the fix does not over-reject a legitimate cross-provider comparison.
test("red-team #1c: a role-swapped aws/gcp pair still mints (fix does not over-reject)", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const c = cases.find((entry) => entry.id === "C01");
  const forward = compareCapsules(c.left, c.right, c.title);
  const swapped = compareCapsules(c.right, c.left, c.title);
  assert.doesNotThrow(() => comparisonToPackage(forward.artifact, forward.left, forward.right));
  assert.doesNotThrow(() => comparisonToPackage(swapped.artifact, swapped.left, swapped.right));
});

// PM #2 (Blocker) — artifact semantics are recomputed canonically from the two capsules, so a forged
// recommendation/label with a recomputed self-hash no longer passes.
test("red-team #2: a forged semantic artifact (recomputed self-hash) is refused", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((candidate) => candidate.id === "C02");
  const comparison = compareCapsules(entry.left, entry.right, entry.title);

  comparison.artifact.confounders = [];
  comparison.artifact.recommendation.supported = true;
  comparison.artifact.recommendation.text = "AWS is independently verified and wins.";
  comparison.artifact.evidenceLabel = "independently_verified";
  rehashArtifact(comparison.artifact);

  assert.throws(
    () => comparisonToPackage(comparison.artifact, comparison.left, comparison.right),
    /does not match the canonical comparison|forged|tampered/i,
  );
});

// PM #3 (High) — every receipt on both capsules is minted, so coverage is honest: no unreferenced
// receipt is silently dropped while the package reports fullyCovered.
test("red-team #3: coverage mints ALL receipts (no silently-omitted unreferenced receipt)", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((candidate) => candidate.id === "C08");
  const { artifact, left, right } = compareCapsules(entry.left, entry.right, entry.title);
  const pkg = comparisonToPackage(artifact, left, right);
  const allReceiptCount = left.receipts.length + right.receipts.length;

  assert.equal(pkg.coverageReceipt.fullyCovered, true);
  assert.equal(pkg.rawSources.length, allReceiptCount);
  assert.equal(
    pkg.rawSources.some((source) => source.id.includes("receipt:provider-export")),
    true,
  );
});

// PM #4 (High) — a private identifier injected into artifact prose (with a recomputed self-hash)
// never reaches a claim: the canonical recomputation rejects the mutated prose, and publicSecretScan
// is a second backstop.
test("red-team #4: a private cloud identifier in artifact prose is refused (never reaches a claim)", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((candidate) => candidate.id === "C01");
  const comparison = compareCapsules(entry.left, entry.right, entry.title);
  const privateIdentifier = "arn:aws:iam::123456789012:role/private-comparison-role";

  comparison.artifact.recommendation.text = `Use ${privateIdentifier}.`;
  rehashArtifact(comparison.artifact);

  assert.throws(
    () => comparisonToPackage(comparison.artifact, comparison.left, comparison.right),
    /does not match the canonical comparison|secret scan|forged|tampered/i,
  );
});

// ── PM re-review of 488ba29 (msg 699c078b): the provider-set invariant must live in the COMPARISON
//    RESULT, not only in currentOutcome.status. These four assert the source-level fix. ──

// PM re-review #1a: a same-provider comparison must NOT return supported:true or winner prose at the
// ENGINE level, and the package must not reuse winner prose next to an amber "no winner" badge.
test("re-review #1a: same-provider yields supported:false + neutral text at the engine and in the package", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const original = cases.find((entry) => entry.id === "C01").left;
  const duplicate = structuredClone(original);
  duplicate.id = `${original.id}-same-provider-copy`;
  rehashCapsule(duplicate);

  const comparison = compareCapsules(original, duplicate, "same provider");
  const pkg = comparisonToPackage(comparison.artifact, comparison.left, comparison.right);

  assert.equal(comparison.artifact.recommendation.supported, false);
  // No winner prose: a provider name must never be asserted as supported/preferred.
  assert.doesNotMatch(comparison.artifact.recommendation.text, /(aws|gcp) is supported|prefer (aws|gcp)/i);
  assert.equal(pkg.brief.currentOutcome.status, "not_comparable");
  // The package outcome must NOT carry winner prose — the exact defect the PM reproduced.
  assert.doesNotMatch(pkg.brief.currentOutcome.text, /(aws|gcp) is supported|prefer (aws|gcp)/i);
});

// PM re-review #1b: a non-{aws,gcp} pair (aws vs azure) must NOT get a provider recommendation at the
// engine level, and the package must render neutral no-winner text.
test("re-review #1b: aws-vs-azure yields supported:false + neutral text (no 'prefer azure')", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((candidate) => candidate.id === "C01");
  const azure = structuredClone(entry.right);
  azure.id = "azure-run";
  azure.environment.provider = "azure";
  rehashCapsule(azure);

  const comparison = compareCapsules(entry.left, azure, "aws vs azure");
  const pkg = comparisonToPackage(comparison.artifact, comparison.left, comparison.right);

  assert.equal(comparison.artifact.recommendation.supported, false);
  assert.doesNotMatch(comparison.artifact.recommendation.text, /prefer azure|azure is supported/i);
  assert.equal(pkg.brief.currentOutcome.status, "not_comparable");
  assert.doesNotMatch(pkg.brief.currentOutcome.text, /prefer azure|azure is supported/i);
});

// PM re-review #2: tied AWS/GCP latency AND cost must produce a role-order-INDEPENDENT conclusion —
// forward and swapped orderings must reach the identical recommendation text (the tie is broken by
// provider name, not by which side is left).
test("re-review #2: tied aws/gcp measures reach the same conclusion regardless of role order", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((candidate) => candidate.id === "C01");
  const right = structuredClone(entry.right);

  for (const kind of ["metric", "cost"]) {
    const leftValue = entry.left.verification.find((item) => item.kind === kind);
    const rightValue = right.verification.find((item) => item.kind === kind);
    rightValue.value = leftValue.value;
    const receipt = right.receipts.find((item) => item.id === rightValue.evidence[0]);
    receipt.content = `${kind}=${leftValue.value}; ${rightValue.scope}`;
    receipt.sha256 = sha256(receipt.content);
  }
  rehashCapsule(right);

  const forward = compareCapsules(entry.left, right, "tied measures");
  const swapped = compareCapsules(right, entry.left, "tied measures");
  const forwardPackage = comparisonToPackage(forward.artifact, forward.left, forward.right);
  const swappedPackage = comparisonToPackage(swapped.artifact, swapped.left, swapped.right);

  // Both orderings agree on a single conclusion — role swapping does not flip the winner.
  assert.equal(
    forwardPackage.brief.currentOutcome.text,
    swappedPackage.brief.currentOutcome.text,
  );
  assert.equal(forward.artifact.recommendation.text, swapped.artifact.recommendation.text);
});

// PM re-review #1 (legacy path): writeComparison / the CLI must not expose recommendationSupported
// true or winner prose for a same-provider pair either.
test("re-review #1c: legacy writeComparison reports supported:false + neutral text for same-provider", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const original = cases.find((entry) => entry.id === "C01").left;
  const duplicate = structuredClone(original);
  duplicate.id = `${original.id}-legacy-copy`;
  rehashCapsule(duplicate);
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "explainify-rereview-"));

  const result = await writeComparison({
    left: original,
    right: duplicate,
    question: "same provider legacy output",
    outputDir,
  });
  const artifact = JSON.parse(await readFile(result.manifestPath, "utf8"));

  assert.equal(result.recommendationSupported, false);
  assert.equal(artifact.recommendation.supported, false);
  assert.doesNotMatch(artifact.recommendation.text, /aws is supported/i);
});

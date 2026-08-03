import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureRun, validateCapsule } from "../capsule.mjs";
import { compareCapsules, writeComparison } from "../compare.mjs";
import { loadComparativeFixtures, verifyFrozenCase } from "../fixtures.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");

function captureSpec(capsule, id, rawPrefix) {
  return {
    id,
    objective: capsule.objective,
    workloadId: capsule.workloadId,
    agent: { ...capsule.agent, executionId: `${id}-execution` },
    repository: capsule.repository,
    environment: capsule.environment,
    inputs: capsule.inputs.map((source) => {
      const input = { ...source };
      delete input.sha256;
      return input;
    }),
    execution: capsule.execution,
    resources: capsule.deployedResources.map((resource, index) => {
      const copy = { ...resource };
      delete copy.identifierToken;
      return {
        ...copy,
        rawIdentifier: `${rawPrefix}-${resource.logicalRole}-${index}`,
      };
    }),
    verification: capsule.verification,
    pricingBasis: capsule.pricingBasis,
    receipts: capsule.receipts,
  };
}

test("all 10 frozen cases verify and render bilateral evidence models", async () => {
  const { cases, manifest } = await loadComparativeFixtures(root);
  assert.equal(cases.length, 10);
  assert.match(manifest.bundle.sha256, /^[0-9a-f]{64}$/);
  const output = await mkdtemp(path.join(os.tmpdir(), "explainify-comparative-"));
  for (const entry of cases) {
    const { artifact } = compareCapsules(entry.left, entry.right, entry.title);
    const result = verifyFrozenCase(entry, artifact);
    assert.equal(result.status, "verified");
    const written = await writeComparison({
      left: entry.left,
      right: entry.right,
      question: entry.title,
      outputDir: path.join(output, entry.id),
    });
    assert.equal(written.publication, "local_only");
    const html = await readFile(written.artifactPath, "utf8");
    assert.ok(html.indexOf("Confounders before recommendation") < html.indexOf("Conditional recommendation"));
    assert.match(html, /Receipt-attested, not provider-verified/i);
    const architectureHtml = await readFile(written.architecturePath, "utf8");
    const evidenceLinks = [...architectureHtml.matchAll(/href="\.\.\/index\.html#(evidence-[^"]+)"/g)];
    assert.ok(evidenceLinks.length > 0);
    assert.equal(
      new Set(evidenceLinks.map((match) => match[1])).size,
      evidenceLinks.length,
    );
    const receipt = JSON.parse(await readFile(written.receiptPath, "utf8"));
    assert.equal(receipt.providerApiCalled, false);
    assert.equal(receipt.secretScan, "pass");
  }
});

test("C03 preserves dirty state and rejects it as reproducible evidence", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((item) => item.id === "C03");
  const { artifact } = compareCapsules(entry.left, entry.right, entry.title);
  const dirty = artifact.capsuleSummaries.find((item) => item.dirty);
  assert.ok(dirty);
  assert.equal(dirty.reproducible, false);
  assert.equal(
    artifact.equivalence.find((item) => item.dimension === "code_revision").status,
    "unknown",
  );
  assert.equal(artifact.recommendation.supported, false);
});

test("C07 rejects the agent summary in favor of the failed test receipt", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((item) => item.id === "C07");
  const { artifact } = compareCapsules(entry.left, entry.right, entry.title);
  assert.equal(
    artifact.equivalence.find((item) => item.dimension === "receipt_consistency").status,
    "different",
  );
  assert.equal(artifact.recommendation.supported, false);
  assert.ok(artifact.confounders.some((item) => item.dimension === "receipt_consistency"));
});

test("capture_run stores only HMAC tokens publicly and a mode-0600 private map", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases[0];
  const output = await mkdtemp(path.join(os.tmpdir(), "explainify-capture-"));
  const rawLeft = "PRIVATE_RESOURCE_CANARY-left";
  const rawRight = "PRIVATE_RESOURCE_CANARY-right";
  const leftCapture = await captureRun(
    captureSpec(entry.left, "captured-left", rawLeft),
    path.join(output, "left"),
  );
  const rightCapture = await captureRun(
    captureSpec(entry.right, "captured-right", rawRight),
    path.join(output, "right"),
  );
  const leftPublic = await readFile(leftCapture.capsulePath, "utf8");
  const rightPublic = await readFile(rightCapture.capsulePath, "utf8");
  assert.doesNotMatch(leftPublic, /PRIVATE_RESOURCE_CANARY/);
  assert.doesNotMatch(rightPublic, /PRIVATE_RESOURCE_CANARY/);
  assert.match(leftPublic, /"identifierToken": "[0-9a-f]{32}"/);
  const leftPrivate = await readFile(leftCapture.privateMapPath, "utf8");
  assert.match(leftPrivate, /PRIVATE_RESOURCE_CANARY-left/);
  assert.equal((await stat(leftCapture.privateMapPath)).mode & 0o777, 0o600);

  const comparisonDir = path.join(output, "comparison");
  const comparison = await writeComparison({
    left: JSON.parse(leftPublic),
    right: JSON.parse(rightPublic),
    question: "Compare two privately aliased captured runs",
    outputDir: comparisonDir,
  });
  for (const file of [comparison.artifactPath, comparison.manifestPath, comparison.receiptPath]) {
    assert.doesNotMatch(await readFile(file, "utf8"), /PRIVATE_RESOURCE_CANARY/);
  }
});

test("capture_run rejects credential-shaped payloads", async () => {
  await assert.rejects(
    captureRun(
      {
        id: "unsafe",
        resources: [{ rawIdentifier: "resource", logicalRole: "compute" }],
        receipts: [],
        password: "should-never-be-accepted",
      },
      path.join(os.tmpdir(), "explainify-unsafe-capture"),
    ),
    /Credentials are not accepted/,
  );
});

test("capsule validation rejects dirty state without bounded diff evidence", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const tampered = structuredClone(cases[0].left);
  tampered.repository.dirty = true;
  tampered.repository.reproducible = false;
  assert.throws(() => validateCapsule(tampered), /git status and bounded diff evidence|capsuleSha256/);
});

test("capsule validation rejects observed cost without frozen pricing", async () => {
  const { cases } = await loadComparativeFixtures(root);
  const tampered = structuredClone(cases[0].left);
  delete tampered.pricingBasis;
  assert.throws(() => validateCapsule(tampered), /cost without frozen pricing/);
});

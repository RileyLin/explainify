import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateCapsule } from "./capsule.mjs";
import { hashFile, sha256, stableStringify } from "../util.mjs";

export async function loadComparativeFixtures(root) {
  const manifestPath = path.join(root, "benchmarks/comparative/manifest-v0.1.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bundlePath = path.join(root, manifest.bundle.path);
  const pricingPath = path.join(root, manifest.pricingSnapshot.path);
  const workloadPath = path.join(root, manifest.workload.path);
  if (await hashFile(bundlePath) !== manifest.bundle.sha256) {
    throw new Error("Comparative fixture bundle SHA-256 mismatch");
  }
  if (await hashFile(pricingPath) !== manifest.pricingSnapshot.sha256) {
    throw new Error("Comparative pricing snapshot SHA-256 mismatch");
  }
  if (await hashFile(workloadPath) !== manifest.workload.sha256) {
    throw new Error("Comparative workload SHA-256 mismatch");
  }
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  if (bundle.cases.length !== 10 || manifest.cases.length !== 10) {
    throw new Error("Comparative benchmark must contain exactly 10 frozen cases");
  }
  const cases = bundle.cases.map((entry, index) => {
    const frozen = manifest.cases[index];
    if (entry.id !== frozen.id) throw new Error(`Fixture order mismatch at ${entry.id}`);
    if (sha256(stableStringify(entry.left)) !== frozen.left.sha256) {
      throw new Error(`${entry.id} left capsule SHA-256 mismatch`);
    }
    if (sha256(stableStringify(entry.right)) !== frozen.right.sha256) {
      throw new Error(`${entry.id} right capsule SHA-256 mismatch`);
    }
    if (sha256(stableStringify(entry.expected)) !== frozen.expectedSha256) {
      throw new Error(`${entry.id} expected result SHA-256 mismatch`);
    }
    validateCapsule(entry.left);
    validateCapsule(entry.right);
    return entry;
  });
  return { manifest, bundle, cases };
}

function hasSide(references, capsuleId) {
  return references.some((reference) => reference.startsWith(`${capsuleId}#receipt:`));
}

export function verifyFrozenCase(entry, artifact) {
  const errors = [];
  const [leftId, rightId] = artifact.capsules;
  if (artifact.evidenceLevel !== "receipt_attested") {
    errors.push("evidence level is not receipt_attested");
  }
  if (artifact.evidenceLabel !== "receipt_attested, not provider-verified") {
    errors.push("visible evidence label is missing");
  }
  if (artifact.recommendation.supported !== entry.expected.recommendationSupported) {
    errors.push("recommendation support does not match frozen expectation");
  }
  const notComparable = new Set(
    artifact.claims
      .filter((claim) => claim.status === "not_comparable")
      .map((claim) => claim.dimension),
  );
  for (const dimension of entry.expected.notComparableDimensions) {
    if (!notComparable.has(dimension)) {
      errors.push(`expected ${dimension} to be not_comparable`);
    }
  }
  if (entry.expected.dirtyRejectedAsReproducible) {
    const dirty = artifact.capsuleSummaries.find((item) => item.dirty);
    if (!dirty || dirty.reproducible !== false) {
      errors.push("dirty capsule was not represented as non-reproducible");
    }
  }
  for (const item of artifact.equivalence) {
    if (!hasSide(item.evidence, leftId) || !hasSide(item.evidence, rightId)) {
      errors.push(`equivalence ${item.dimension} lacks bilateral evidence`);
    }
  }
  for (const item of artifact.confounders) {
    if (!hasSide(item.evidence, leftId) || !hasSide(item.evidence, rightId)) {
      errors.push(`confounder ${item.dimension} lacks bilateral evidence`);
    }
  }
  for (const claim of artifact.claims.filter((item) => item.status === "observed")) {
    if (!hasSide(claim.leftEvidence, leftId) || !hasSide(claim.rightEvidence, rightId)) {
      errors.push(`observed claim ${claim.id} lacks bilateral evidence`);
    }
  }
  if (
    !hasSide(artifact.recommendation.leftEvidence, leftId)
    || !hasSide(artifact.recommendation.rightEvidence, rightId)
  ) {
    errors.push("recommendation lacks bilateral evidence");
  }
  if (artifact.receipt.providerApiCalled !== false) {
    errors.push("provider API was called");
  }
  if (artifact.receipt.publication !== "local_only") {
    errors.push("artifact publication is not local_only");
  }
  if (errors.length) {
    throw new Error(`${entry.id} frozen-case verification failed: ${errors.join("; ")}`);
  }
  return {
    id: entry.id,
    status: "verified",
    recommendationSupported: artifact.recommendation.supported,
    notComparable: [...notComparable],
    semanticArtifactSha256: artifact.receipt.semanticArtifactSha256,
  };
}

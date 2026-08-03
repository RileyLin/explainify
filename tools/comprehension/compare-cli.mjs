#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureRun } from "./comparative/capsule.mjs";
import { compareCapsules, compareRunFiles, writeComparison } from "./comparative/compare.mjs";
import { comparisonToPackage } from "./comparative/workstream-package.mjs";
import { loadComparativeFixtures, verifyFrozenCase } from "./comparative/fixtures.mjs";
import { captureAndCompareRealPair } from "./comparative/real-capture.mjs";

const [command, ...args] = process.argv.slice(2);
const root = process.cwd();

function flag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function required(name) {
  const value = flag(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function compareCase(caseId, outputDir) {
  const { cases } = await loadComparativeFixtures(root);
  const entry = cases.find((item) => item.id === caseId);
  if (!entry) throw new Error(`Unknown comparative case: ${caseId}`);
  const comparison = await writeComparison({
    left: entry.left,
    right: entry.right,
    question: entry.title,
    outputDir,
  });
  const manifest = JSON.parse(await readFile(comparison.manifestPath, "utf8"));
  return {
    ...comparison,
    fixture: verifyFrozenCase(entry, manifest),
  };
}

async function main() {
  if (command === "compare-runs") {
    const leftPath = path.resolve(required("--left"));
    const rightPath = path.resolve(required("--right"));
    const question = required("--question");
    const outputDir = path.resolve(flag("--output") || "comparison-output/run");
    // Legacy comparison artifacts (index.html / manifest.json / receipt.json) for the standalone view.
    const result = await compareRunFiles({ leftPath, rightPath, question, outputDir });
    // PM red-team #5: also emit the portable WorkstreamCheckpointPackage the Phase B reader imports.
    // The adapter recomputes the canonical comparison from the two capsules itself (it does not trust
    // a supplied artifact) and fails closed on any integrity violation, so this is the trustworthy
    // product output. We hand it a fresh canonical artifact from the same two capsules.
    const left = JSON.parse(await readFile(leftPath, "utf8"));
    const right = JSON.parse(await readFile(rightPath, "utf8"));
    const { artifact, left: vLeft, right: vRight } = compareCapsules(left, right, question);
    const pkg = comparisonToPackage(artifact, vLeft, vRight);
    const packagePath = path.join(outputDir, "workstream-package.json");
    await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...result, packagePath, workstreamId: pkg.workstreamId }, null, 2));
    return;
  }
  if (command === "capture-run") {
    const request = JSON.parse(await readFile(path.resolve(required("--request")), "utf8"));
    const result = await captureRun(
      request,
      path.resolve(flag("--output") || "comparison-output/capsules"),
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "compare-case") {
    const caseId = required("--case");
    const result = await compareCase(
      caseId,
      path.resolve(flag("--output") || `comparison-output/${caseId}`),
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "verify-comparative") {
    const { cases, manifest } = await loadComparativeFixtures(root);
    const outputRoot = path.resolve(flag("--output") || "comparison-output/spike");
    const results = [];
    for (const entry of cases) {
      const first = await compareCase(entry.id, path.join(outputRoot, entry.id, "run-1"));
      const second = await compareCase(entry.id, path.join(outputRoot, entry.id, "run-2"));
      if (first.semanticArtifactSha256 !== second.semanticArtifactSha256) {
        throw new Error(`${entry.id} semantic artifact is not stable`);
      }
      results.push(first.fixture);
    }
    const realPair = await captureAndCompareRealPair({
      root,
      caseEntry: cases[0],
      outputDir: path.join(outputRoot, "actual-receipt-pair"),
    });
    console.log(JSON.stringify({
      status: "verified",
      fixtureBundleSha256: manifest.bundle.sha256,
      pricingSnapshotSha256: manifest.pricingSnapshot.sha256,
      workloadSha256: manifest.workload.sha256,
      cases: results,
      actualReceiptPair: realPair,
      publication: "local_only",
      providerApiCalled: false,
    }, null, 2));
    return;
  }
  throw new Error(
    "Usage: compare-cli.mjs compare-runs|capture-run|compare-case|verify-comparative",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

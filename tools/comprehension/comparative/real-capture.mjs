import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { captureRun } from "./capsule.mjs";
import { writeComparison } from "./compare.mjs";

function receiptContent(receipts, id, content) {
  const receipt = receipts.find((item) => item.id === id);
  if (!receipt) throw new Error(`Missing real-capture receipt ${id}`);
  receipt.content = content;
  delete receipt.sha256;
}

function captureSpec(capsule, id, rawPrefix, executionResult, startedAt, completedAt) {
  const receipts = structuredClone(capsule.receipts);
  receiptContent(
    receipts,
    "receipt:command-run",
    `actual local execution; exit=0; result=${JSON.stringify(executionResult)}`,
  );
  receiptContent(receipts, "receipt:command-stderr", "stderr: empty");
  receiptContent(
    receipts,
    "receipt:test",
    `actual workload assertions; result=pass; assertions=${executionResult.assertionCount}/${executionResult.assertionCount}; digest=${executionResult.digest}`,
  );
  const inputs = capsule.inputs.map((source) => {
    const input = { ...source };
    delete input.sha256;
    return input;
  });
  return {
    id,
    objective: capsule.objective,
    workloadId: capsule.workloadId,
    agent: {
      ...capsule.agent,
      executionId: `${id}-actual-local-execution`,
    },
    repository: capsule.repository,
    environment: {
      ...capsule.environment,
      startedAt,
      completedAt,
    },
    inputs,
    execution: capsule.execution.map((execution) => ({
      ...execution,
      startedAt,
      completedAt,
    })),
    resources: capsule.deployedResources.map((resource, index) => {
      const copy = { ...resource };
      delete copy.identifierToken;
      return {
        ...copy,
        rawIdentifier: `${rawPrefix}-${resource.logicalRole}-${index}`,
      };
    }),
    verification: capsule.verification.map((item) =>
      item.kind === "test"
        ? {
          ...item,
          result: "pass",
          scope: `${executionResult.assertionCount} assertions from actual local workload execution`,
        }
        : item),
    pricingBasis: capsule.pricingBasis,
    receipts,
  };
}

function executeWorkload(workloadPath) {
  const startedAt = new Date().toISOString();
  const stdout = execFileSync(process.execPath, [workloadPath], {
    encoding: "utf8",
    env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "", NO_PROXY: "*" },
  }).trim();
  const completedAt = new Date().toISOString();
  const result = JSON.parse(stdout);
  if (
    result.workloadId !== "http-roundtrip-v1"
    || result.failedAssertions !== 0
    || result.assertionCount !== 8
  ) {
    throw new Error("Actual comparative workload failed its receipt contract");
  }
  return { result, startedAt, completedAt };
}

export async function captureAndCompareRealPair({
  root,
  caseEntry,
  outputDir,
}) {
  const workloadPath = path.join(root, "benchmarks/comparative/workload-v0.1.mjs");
  const leftRun = executeWorkload(workloadPath);
  const rightRun = executeWorkload(workloadPath);
  const leftCapture = await captureRun(
    captureSpec(
      caseEntry.left,
      "actual-aws-receipt-run",
      "PRIVATE_RESOURCE_CANARY-actual-aws",
      leftRun.result,
      leftRun.startedAt,
      leftRun.completedAt,
    ),
    path.join(outputDir, "capsules/left"),
  );
  const rightCapture = await captureRun(
    captureSpec(
      caseEntry.right,
      "actual-gcp-receipt-run",
      "PRIVATE_RESOURCE_CANARY-actual-gcp",
      rightRun.result,
      rightRun.startedAt,
      rightRun.completedAt,
    ),
    path.join(outputDir, "capsules/right"),
  );
  const left = JSON.parse(await readFile(leftCapture.capsulePath, "utf8"));
  const right = JSON.parse(await readFile(rightCapture.capsulePath, "utf8"));
  const comparison = await writeComparison({
    left,
    right,
    question: "What did the two actual local receipt-attested runs establish?",
    outputDir: path.join(outputDir, "comparison"),
  });
  for (const publicPath of [
    leftCapture.capsulePath,
    leftCapture.receiptPath,
    rightCapture.capsulePath,
    rightCapture.receiptPath,
    comparison.artifactPath,
    comparison.manifestPath,
    comparison.receiptPath,
  ]) {
    const content = await readFile(publicPath, "utf8");
    if (/PRIVATE_RESOURCE_CANARY/.test(content)) {
      throw new Error(`Private resource identifier leaked into ${publicPath}`);
    }
  }
  return {
    status: "verified",
    workloadId: leftRun.result.workloadId,
    leftCapsulePath: leftCapture.capsulePath,
    rightCapsulePath: rightCapture.capsulePath,
    leftPrivateMapPath: leftCapture.privateMapPath,
    rightPrivateMapPath: rightCapture.privateMapPath,
    comparisonPath: comparison.artifactPath,
    recommendationSupported: comparison.recommendationSupported,
    evidenceLevel: "receipt_attested",
    providerApiCalled: false,
    publication: "local_only",
  };
}

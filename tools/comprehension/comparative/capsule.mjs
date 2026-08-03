import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanOutput } from "../evidence.mjs";
import { sha256, stableStringify, writeJson } from "../util.mjs";

const RECEIPT_ATTESTED = "receipt_attested";
const TOKEN_METHOD = "hmac-sha256-private-map-v1";

function fail(message) {
  throw new Error(`Invalid run capsule: ${message}`);
}

function receiptMap(capsule) {
  return new Map((capsule.receipts || []).map((receipt) => [receipt.id, receipt]));
}

function publicSecretScan(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  scanOutput(text);
  const forbidden = [
    /PRIVATE_RESOURCE_CANARY/i,
    /\barn:aws[a-z-]*:/i,
    /\b\d{12}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
    /(?:client_secret|secret_access_key|private_key)\s*[:=]\s*\S+/i,
  ];
  if (forbidden.some((pattern) => pattern.test(text))) {
    throw new Error("Public capsule secret scan failed");
  }
}

export function capsuleSemantic(capsule) {
  return {
    ...capsule,
    provenance: {
      ...capsule.provenance,
      capsuleSha256: "",
    },
  };
}

function evidenceReferences(capsule) {
  const references = [];
  references.push(...(capsule.repository.statusEvidence || []));
  for (const value of Object.values(capsule.environment.labelEvidence || {})) {
    references.push(value);
  }
  for (const input of capsule.inputs || []) references.push(input.locator);
  for (const execution of capsule.execution || []) {
    if (execution.stdoutReceipt) references.push(execution.stdoutReceipt);
    if (execution.stderrReceipt) references.push(execution.stderrReceipt);
  }
  for (const resource of capsule.deployedResources || []) {
    references.push(...(resource.evidence || []));
  }
  for (const verification of capsule.verification || []) {
    references.push(...(verification.evidence || []));
  }
  return references;
}

export function validateCapsule(capsule) {
  if (!capsule || capsule.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (!capsule.id || !capsule.workloadId) fail("id and workloadId are required");
  if (!capsule.repository?.revision || !/^[0-9a-f]{40}$/.test(capsule.repository.revision)) {
    fail("repository revision must be a full commit SHA");
  }
  if (capsule.provenance?.captureMethod !== "agent_receipts") {
    fail("v0.1 captureMethod must be agent_receipts");
  }
  if (capsule.provenance?.labels !== RECEIPT_ATTESTED) {
    fail("environment labels must be receipt-attested");
  }
  if (capsule.provenance?.resourceTokenMethod !== TOKEN_METHOD) {
    fail(`resourceTokenMethod must be ${TOKEN_METHOD}`);
  }
  if (capsule.provenance?.publication !== "local_only") {
    fail("publication must be local_only");
  }
  if (!["aws", "gcp", "azure", "local", "other"].includes(capsule.environment?.provider)) {
    fail("environment provider is invalid");
  }
  for (const label of ["provider", "region", "architecture"]) {
    if (!capsule.environment?.labelEvidence?.[label]) {
      fail(`${label} label is missing receipt evidence`);
    }
  }

  const receipts = receiptMap(capsule);
  if (receipts.size !== (capsule.receipts || []).length) fail("receipt IDs must be unique");
  for (const receipt of receipts.values()) {
    if (!receipt.id?.startsWith("receipt:")) fail("receipt ID must start with receipt:");
    if (sha256(receipt.content) !== receipt.sha256) fail(`${receipt.id} SHA-256 mismatch`);
  }
  for (const reference of evidenceReferences(capsule)) {
    if (!receipts.has(reference)) fail(`missing evidence receipt ${reference}`);
  }
  for (const input of capsule.inputs || []) {
    if (receipts.get(input.locator)?.sha256 !== input.sha256) {
      fail(`input ${input.id} does not match its receipt`);
    }
  }
  for (const resource of capsule.deployedResources || []) {
    if (!/^[0-9a-f]{32}$/.test(resource.identifierToken || "")) {
      fail(`resource ${resource.logicalRole} must use a truncated 16-byte HMAC token`);
    }
    if (!(resource.evidence || []).length) fail(`resource ${resource.logicalRole} has no evidence`);
  }
  for (const execution of capsule.execution || []) {
    if (!Number.isInteger(execution.exitCode)) fail(`execution ${execution.id} has no exit code`);
    if (!execution.startedAt || !execution.completedAt) {
      fail(`execution ${execution.id} has incomplete timestamps`);
    }
  }
  for (const verification of capsule.verification || []) {
    if (!(verification.evidence || []).length) {
      fail(`verification ${verification.name} has no evidence`);
    }
    if (verification.kind === "metric") {
      for (const field of ["window=", "samples=", "load="]) {
        if (!verification.scope.includes(field)) {
          fail(`metric ${verification.name} scope is missing ${field}`);
        }
      }
    }
    if (verification.kind === "cost") {
      for (const field of ["window=", "included=", "excluded="]) {
        if (!verification.scope.includes(field)) {
          fail(`cost ${verification.name} scope is missing ${field}`);
        }
      }
      if (!capsule.pricingBasis && verification.result === "observed") {
        fail("cost without frozen pricing cannot be observed");
      }
    }
  }

  if (capsule.repository.dirty) {
    if (capsule.repository.reproducible !== false) {
      fail("dirty repositories must be explicitly non-reproducible");
    }
    const kinds = new Set(
      capsule.repository.statusEvidence.map((id) => receipts.get(id)?.kind),
    );
    if (!kinds.has("git_status") || !kinds.has("git_diff")) {
      fail("dirty repositories require both git status and bounded diff evidence");
    }
  } else if (capsule.repository.reproducible !== true) {
    fail("clean immutable repositories must be marked reproducible");
  }

  const expectedHash = sha256(stableStringify(capsuleSemantic(capsule)));
  if (capsule.provenance.capsuleSha256 !== expectedHash) {
    fail("capsuleSha256 mismatch");
  }
  publicSecretScan(capsule);
  return capsule;
}

function normalizeReceipt(receipt) {
  if (!receipt.id || !receipt.kind || typeof receipt.content !== "string") {
    throw new Error("Capture receipts require id, kind, and string content");
  }
  return {
    ...receipt,
    sha256: sha256(receipt.content),
  };
}

export async function captureRun(spec, outputDir) {
  const serialized = JSON.stringify(spec);
  if (/(?:access_key|client_secret|private_key|password|bearer)["']?\s*[:=]/i.test(serialized)) {
    throw new Error("Credentials are not accepted by explainify.capture_run");
  }
  if (!(spec.resources || []).length) throw new Error("At least one resource is required");

  const key = randomBytes(32);
  const aliases = [];
  const receipts = (spec.receipts || []).map(normalizeReceipt);
  const receiptsById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  const resources = spec.resources.map((resource) => {
    if (!resource.rawIdentifier) throw new Error("Capture resource requires rawIdentifier");
    for (const receipt of receipts) {
      if (receipt.content.includes(resource.rawIdentifier)) {
        throw new Error("Raw resource identifiers must not appear in public receipts");
      }
    }
    const token = createHmac("sha256", key)
      .update(resource.rawIdentifier)
      .digest("hex")
      .slice(0, 32);
    aliases.push({ identifierToken: token, rawIdentifier: resource.rawIdentifier });
    const publicResource = { ...resource };
    delete publicResource.rawIdentifier;
    return { ...publicResource, identifierToken: token };
  });

  const inputs = (spec.inputs || []).map((input) => {
    const receipt = receiptsById.get(input.locator);
    if (!receipt) throw new Error(`Missing input receipt ${input.locator}`);
    return { ...input, sha256: receipt.sha256 };
  });
  const publicRequest = {
    ...spec,
    resources: resources.map(({ identifierToken, providerType, logicalRole, evidence }) => ({
      identifierToken,
      providerType,
      logicalRole,
      evidence,
    })),
    receipts,
  };
  delete publicRequest.private;

  const capsule = {
    schemaVersion: 1,
    id: spec.id,
    objective: spec.objective,
    workloadId: spec.workloadId,
    agent: spec.agent,
    repository: spec.repository,
    environment: spec.environment,
    inputs,
    execution: spec.execution,
    deployedResources: resources,
    verification: spec.verification,
    ...(spec.pricingBasis ? { pricingBasis: spec.pricingBasis } : {}),
    receipts,
    provenance: {
      requestSha256: sha256(stableStringify(publicRequest)),
      capsuleSha256: "",
      captureMethod: "agent_receipts",
      resourceTokenMethod: TOKEN_METHOD,
      publication: "local_only",
      labels: RECEIPT_ATTESTED,
    },
  };
  capsule.provenance.capsuleSha256 = sha256(stableStringify(capsuleSemantic(capsule)));
  validateCapsule(capsule);

  await mkdir(outputDir, { recursive: true });
  const capsulePath = path.join(outputDir, `${capsule.id}.capsule.json`);
  const privateMapPath = path.join(outputDir, `${capsule.id}.private-map.json`);
  const receiptPath = path.join(outputDir, `${capsule.id}.capture-receipt.json`);
  await writeJson(capsulePath, capsule);
  await writeFile(
    privateMapPath,
    `${stableStringify({
      schemaVersion: 1,
      keyBase64: key.toString("base64"),
      aliases,
      handling: "local_private_do_not_publish",
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await chmod(privateMapPath, 0o600);
  await writeJson(receiptPath, {
    schemaVersion: 1,
    status: "verified",
    capsuleSha256: capsule.provenance.capsuleSha256,
    resourceTokenMethod: TOKEN_METHOD,
    privateMapStored: true,
    privateMapMode: "0600",
    secretScan: "pass",
    publication: "local_only",
    providerApiCalled: false,
  });
  return {
    status: "verified",
    capsulePath,
    privateMapPath,
    receiptPath,
    publication: "local_only",
  };
}

export { publicSecretScan };

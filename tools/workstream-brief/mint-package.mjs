// Build-time fixture generator (NOT product runtime). Mints WorkstreamCheckpointPackages:
//
//   1. The REAL Explainify package — produced by running the proven engine
//      (buildSourceManifest + buildBrief) over the validated Phase A bundle. This is the
//      authentic artifact the product ships as its example; it is minted, never hand-edited.
//   2. A PORTABLE fixture package with a DIFFERENT workstreamId and DIFFERENT source ids,
//      whose manifest + coverage receipt are produced by the SAME generic engine functions
//      (buildSourceManifest / buildCoverageReceipt) and whose semantic brief is hand-authored,
//      then finalized with the engine's own hashing tail (checkpointId + semanticBriefSha256).
//      This proves the product's package reader/validator has NO Explainify-specific source
//      assumptions — it validates and renders any internally-consistent package.
//
// The reader in src/lib/workstream validates these packages independently (recomputing every
// hash from raw content); this generator only PRODUCES them.
//
// Usage: node tools/workstream-brief/mint-package.mjs <real|portable>
import { buildSourceManifest } from "./freeze.mjs";
import { buildBrief, buildCoverageReceipt } from "./brief.mjs";
import { sha256, stableStringify } from "../comprehension/util.mjs";

const PACKAGE_VERSION = 1;

// Assemble a WorkstreamCheckpointPackage from a raw bundle + a fully-built brief. rawSources
// carries the verbatim content the manifest hashes were computed over, so a reader can recompute
// every source sha256 and re-derive the manifest without trusting any stored hash.
function assemble(bundle, brief, coverageReceipt, manifest) {
  return {
    packageVersion: PACKAGE_VERSION,
    workstreamId: manifest.workstreamId,
    checkpointId: brief.checkpointId,
    brief,
    manifest,
    coverageReceipt,
    rawSources: bundle.sources.map((s) => ({ id: s.id, content: s.content })),
  };
}

// The REAL Explainify package: run the proven engine end-to-end over the validated bundle.
export function mintRealPackage(bundle) {
  const manifest = buildSourceManifest(bundle);
  const { brief, coverageReceipt } = buildBrief(bundle, manifest);
  return assemble(bundle, brief, coverageReceipt, manifest);
}

// Finalize a hand-authored semantic brief exactly as buildBrief's tail does: embed the derived
// checkpointId into the hashed state, then compute semanticBriefSha256 + the receipt. This is the
// ONLY place the fixture generator mirrors engine hashing, and it is build-time tooling — the
// product reader never generates, it only validates.
function finalizeBrief(semantic, coverageReceipt, manifest) {
  const draft = { ...semantic, checkpointId: "" };
  const checkpointId = `checkpoint-${sha256(stableStringify(draft)).slice(0, 12)}`;
  const finalized = { ...draft, checkpointId };
  const semanticBriefSha256 = sha256(stableStringify(finalized));
  return {
    ...finalized,
    receipt: {
      semanticBriefSha256,
      sourceManifestSha256: manifest.bundleSha256,
      coverageReceiptSha256: sha256(stableStringify(coverageReceipt)),
      unsupportedObservedClaimCount: 0,
      secretScan: "pass",
      publication: "local_only",
    },
  };
}

// A PORTABLE fixture: a completely different workstream ("acme-migration") with different source
// ids/kinds and a genuine partial-coverage story (one policy-excluded source), proving the reader
// has no dependence on Explainify's frozen ids.
export function mintPortablePackage() {
  const bundle = {
    schemaVersion: 1,
    workstreamId: "acme-migration",
    freshnessCursor: "2026-07-30T12:00:00Z",
    sources: [
      {
        id: "m1-migration-commit",
        kind: "git_commit",
        locator: "git show a1b2c3d",
        revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        evidenceLevel: "receipt_attested",
        evidenceLabel: "receipt-attested, not independently verified",
        captured: true,
        content: "a1b2c3d feat: migrate billing store from Postgres to DynamoDB; 42 files changed, dual-write cutover behind a flag.",
      },
      {
        id: "m2-cutover-test",
        kind: "test_receipt",
        locator: "npm run test:billing @a1b2c3d",
        revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        evidenceLevel: "receipt_attested",
        evidenceLabel: "receipt-attested, not independently verified",
        captured: true,
        content: "vitest run billing => 58/58 pass; dual-write parity checks 12/12; zero drift over 10k replayed events.",
      },
      {
        id: "m3-owner-approval",
        kind: "raft_message",
        locator: "dm:@ops-lead (owner private thread)",
        evidenceLevel: "receipt_attested",
        evidenceLabel: "receipt-attested, not independently verified",
        captured: false,
        exclusionReason: "policy",
        content: "EXCLUDED BY POLICY: owner DM approving the production cutover window is out of the frozen bundle; recorded so coverage stays honest.",
      },
    ],
  };
  const manifest = buildSourceManifest(bundle);
  const coverageReceipt = buildCoverageReceipt(manifest);
  const byId = (id) => manifest.sources.find((s) => s.id === id);
  const link = (id) => {
    const s = byId(id);
    return {
      sourceId: s.id,
      locator: s.locator,
      ...(s.revision ? { revision: s.revision } : {}),
      sha256: s.sha256,
      evidenceLevel: s.evidenceLevel,
      evidenceLabel: s.evidenceLabel,
    };
  };
  const semantic = {
    schemaVersion: 1,
    workstreamId: manifest.workstreamId,
    checkpointId: "",
    freshnessCursor: manifest.freshnessCursor,
    objective: "Give a returning reader the Acme billing-store migration's current outcome, verification state, and the one excluded approval — without replaying the migration thread.",
    currentOutcome: {
      id: "outcome",
      text: "The billing store migration to DynamoDB is code-complete behind a dual-write flag, with parity verified over replayed events; the production cutover window itself is not represented in covered sources.",
      status: "observed",
      evidence: [link("m1-migration-commit"), link("m2-cutover-test")],
    },
    sinceLastLooked: [
      {
        id: "since-parity",
        text: "Dual-write parity reached 12/12 with zero drift over 10k replayed events at commit a1b2c3d.",
        status: "observed",
        evidence: [link("m2-cutover-test")],
      },
    ],
    reviewFirst: [
      {
        id: "review-cutover",
        text: "Nothing coverage-supported requires an action first; the cutover-window approval lives in an excluded owner DM and is tracked as an unknown.",
        status: "observed",
        evidence: [link("m1-migration-commit")],
      },
    ],
    verification: [
      {
        id: "verify-tests",
        text: "Billing suite passes 58/58 and dual-write parity 12/12 at the reviewed commit; receipt-attested.",
        status: "observed",
        evidence: [link("m2-cutover-test")],
      },
    ],
    risks: [],
    blockers: [],
    unknowns: [
      {
        id: "unknown-approval",
        text: "The owner's production cutover approval is intentionally excluded by policy and is not represented in any claim.",
        status: "unknown",
        evidence: [],
        unknownReason: "owner DMs are out of the frozen bundle by policy",
        missingSourceIds: ["m3-owner-approval"],
      },
    ],
    decisionsNeeded: [],
    coverageReceiptPath: "coverage-receipt.json",
    sourceManifestPath: "manifest-v0.1.json",
    correctionReceiptPaths: [],
    evidenceLabel: "receipt-attested unless a claim is marked independently verified",
  };
  const brief = finalizeBrief(semantic, coverageReceipt, manifest);
  return assemble(bundle, brief, coverageReceipt, manifest);
}

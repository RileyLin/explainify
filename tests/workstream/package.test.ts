import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validatePackage, type WorkstreamCheckpointPackage } from "@/lib/workstream/package";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";

const hash = sha256 as (value: string) => string;
const stable = stableStringify as (value: unknown) => string;

// Task #22 (revised contract): the product is a portable checkpoint READER. validatePackage must
// (a) accept ANY internally-consistent package regardless of workstream/source ids, and (b) fail
// closed on any tamper. These tests prove both against two structurally different packages.
const FIXTURES = path.resolve(__dirname, "fixtures");
function loadPkg(name: string): WorkstreamCheckpointPackage {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as WorkstreamCheckpointPackage;
}
function clone(pkg: WorkstreamCheckpointPackage): WorkstreamCheckpointPackage {
  return JSON.parse(JSON.stringify(pkg)) as WorkstreamCheckpointPackage;
}

// Re-finalize a package's brief after mutating its semantic content, mirroring the engine's
// two-step hashing tail (checkpointId over semantic-with-blank-id, then semantic hash with the id
// filled). This makes the package INTERNALLY consistent so a tampered-evidence test reaches the
// evidence-binding check (step 4) instead of tripping the earlier checkpointId/semantic-hash check.
// It models a buggy or malicious mint that produced a self-consistent but manifest-inconsistent
// brief — exactly the case set-membership would have missed.
function refinalizeBrief(pkg: WorkstreamCheckpointPackage): WorkstreamCheckpointPackage {
  const brief = pkg.brief as unknown as Record<string, unknown>;
  const semantic = { ...brief };
  delete semantic.receipt;
  const checkpointId = `checkpoint-${hash(stable({ ...semantic, checkpointId: "" })).slice(0, 12)}`;
  (brief as { checkpointId: string }).checkpointId = checkpointId;
  const semanticFilled = { ...brief };
  delete semanticFilled.receipt;
  pkg.brief.receipt.semanticBriefSha256 = hash(stable(semanticFilled));
  pkg.checkpointId = checkpointId;
  return pkg;
}

const EXPLAINIFY = loadPkg("explainify-package.json");
const PORTABLE = loadPkg("portable-package.json");

describe("validatePackage — portability across workstreams", () => {
  it("validates the real engine-produced Explainify package", () => {
    const r = validatePackage(EXPLAINIFY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workstreamId).toBe("explainify-phase2");
    expect(r.pkg.checkpointId).toBe("checkpoint-7a3c1d543879");
    expect(r.coverage.scanned).toBe(14);
    expect(r.coverage.fullyCovered).toBe(false);
  });

  it("validates a hand-authored package with completely different ids (no Explainify assumptions)", () => {
    const r = validatePackage(PORTABLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Different workstreamId AND different source-id scheme (m1/m2/m3, not t12/t15/...).
    expect(r.workstreamId).toBe("acme-migration");
    expect(r.pkg.manifest.sources.map((s) => s.id)).toEqual([
      "m1-migration-commit",
      "m2-cutover-test",
      "m3-owner-approval",
    ]);
    expect(r.coverage.requested).toBe(3);
    expect(r.coverage.excluded).toBe(1);
    expect(r.exclusions[0].id).toBe("m3-owner-approval");
  });
});

describe("validatePackage — fails closed on tamper", () => {
  it("rejects a package whose raw source content was altered", () => {
    const t = clone(PORTABLE);
    t.rawSources[0].content = t.rawSources[0].content + " (tampered)";
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/manifest does not match|re-derived|tampered/i);
  });

  it("rejects a package whose manifest coverage metadata was forged (captured flipped)", () => {
    const t = clone(PORTABLE);
    const excluded = t.manifest.sources.find((s) => !s.captured)!;
    excluded.captured = true;
    delete excluded.exclusionReason;
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
  });

  it("rejects a package whose brief claim text was mutated (stale semantic hash)", () => {
    const t = clone(EXPLAINIFY);
    t.brief.currentOutcome.text = "FORGED: everything is fully verified and safe to ship.";
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/semantic hash|checkpointId|tampered/i);
  });

  it("rejects a package whose coverage receipt was inflated to full green", () => {
    const t = clone(EXPLAINIFY);
    t.coverageReceipt.scannedSourceCount = t.coverageReceipt.requestedSourceCount;
    t.coverageReceipt.fullyCovered = true;
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
  });

  it("rejects a package missing rawSources for a manifest source", () => {
    const t = clone(PORTABLE);
    t.rawSources = t.rawSources.slice(0, 1);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rawSource|one-to-one|no matching/i);
  });

  it("rejects an unsupported packageVersion", () => {
    const t = clone(PORTABLE);
    (t as { packageVersion: number }).packageVersion = 2;
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/packageVersion/i);
  });

  it("rejects a non-object payload", () => {
    expect(validatePackage(null).ok).toBe(false);
    expect(validatePackage("nope").ok).toBe(false);
    expect(validatePackage(42).ok).toBe(false);
  });

  it("rejects relabeled evidence: an observed claim link whose sourceId and sha256 belong to different sources", () => {
    // The link keeps a real manifest hash (set-membership passes) but points its sourceId at a
    // DIFFERENT source. Hash-membership alone would accept this; strict id↔hash binding must reject.
    // Re-finalize so the brief is internally consistent and the check reaches step 4.
    const t = clone(PORTABLE);
    const other = t.manifest.sources.find((s) => s.id === "m2-cutover-test")!;
    const link = t.brief.reviewFirst.find((c) => c.id === "review-cutover")!.evidence[0];
    expect(link.sourceId).toBe("m1-migration-commit");
    link.sha256 = other.sha256; // m2's real hash under m1's id
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/relabeled|does not match manifest source/i);
  });

  it("rejects an observed claim citing a sourceId absent from the manifest", () => {
    const t = clone(PORTABLE);
    t.brief.reviewFirst.find((c) => c.id === "review-cutover")!.evidence[0].sourceId = "ghost-source";
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/absent from the frozen manifest/i);
  });

  it("rejects an observed claim citing an uncaptured (excluded) source as evidence", () => {
    // m3-owner-approval is policy-excluded (captured=false); it cannot back an observed claim.
    const t = clone(PORTABLE);
    const excluded = t.manifest.sources.find((s) => s.id === "m3-owner-approval")!;
    const link = t.brief.reviewFirst.find((c) => c.id === "review-cutover")!.evidence[0];
    link.sourceId = excluded.id;
    link.sha256 = excluded.sha256;
    link.evidenceLevel = excluded.evidenceLevel;
    link.evidenceLabel = excluded.evidenceLabel;
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not captured/i);
  });

  it("rejects a forged locator on a valid-hash link (evidence escape path cannot lie)", () => {
    // Keep a real source + real hash, but fabricate the locator the UI would open. The
    // deterministic locator mapping must reject it even though the hash is genuine.
    const t = clone(PORTABLE);
    const link = t.brief.currentOutcome.evidence.find((l) => l.sourceId === "m1-migration-commit")!;
    link.locator = "fabricated://not-the-hashed-source";
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/locator|forged/i);
  });

  it("rejects a forged receiptId on a receipt-backed link", () => {
    // m2-cutover-test is a test_receipt: receiptId must be receipt:<id>. Tamper it.
    const t = clone(PORTABLE);
    const link = t.brief.verification.find((c) => c.id === "verify-tests")!.evidence[0];
    expect(link.sourceId).toBe("m2-cutover-test");
    link.receiptId = "receipt:some-other-source";
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/receiptId|receipt id|forged/i);
  });

  it("rejects decision evidence that resolves to no manifest source", () => {
    const t = clone(PORTABLE);
    t.brief.decisionsNeeded = [
      {
        id: "decision-forged",
        question: "Ship on evidence that is not in this package?",
        owner: "@owner",
        status: "needed",
        evidence: [
          {
            sourceId: "outside-manifest",
            locator: "fabricated://outside",
            sha256: "f".repeat(64),
            evidenceLevel: "independently_verified",
            evidenceLabel: "independently verified",
          },
        ],
      },
    ];
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/decision .* absent from the frozen manifest/i);
  });

  it("rejects a decisionsNeeded link citing an uncaptured (excluded) source", () => {
    // PM ruling (msg 1e30fbbe): an active decision must be supported by CAPTURED evidence; an
    // excluded input belongs in the coverage caveat, not as a decision's cited link. m3-owner-approval
    // is policy-excluded (captured=false), so a decision citing it must fail closed.
    const t = clone(PORTABLE);
    const excluded = t.manifest.sources.find((s) => s.id === "m3-owner-approval")!;
    t.brief.decisionsNeeded = [
      {
        id: "decision-uncaptured",
        question: "Proceed with the cutover based on the owner's (excluded) approval?",
        owner: "@owner",
        status: "needed",
        evidence: [
          {
            sourceId: excluded.id,
            locator: `${excluded.id}#receipt:${excluded.id}`,
            receiptId: `receipt:${excluded.id}`,
            sha256: excluded.sha256,
            evidenceLevel: excluded.evidenceLevel,
            evidenceLabel: excluded.evidenceLabel,
          },
        ],
      },
    ];
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not captured/i);
  });

  it("binds evidence on a non-observed claim (relabeling cannot hide behind a non-green badge)", () => {
    // PM ruling (msg b6ef351f): integrity follows the PRESENCE of an evidence link, not the badge.
    // Give an unknown-status claim a link whose sha256 belongs to a different source; it must fail
    // exactly as an observed claim would, so a future not_comparable/inferred state can't relabel.
    const t = clone(PORTABLE);
    const other = t.manifest.sources.find((s) => s.id === "m2-cutover-test")!;
    const unknown = t.brief.unknowns.find((c) => c.id === "unknown-approval")!;
    expect(unknown.status).toBe("unknown");
    unknown.evidence = [
      {
        sourceId: "m1-migration-commit",
        locator: "m1-migration-commit",
        sha256: other.sha256, // m2's hash under m1's id, on a non-observed claim
        evidenceLevel: other.evidenceLevel,
        evidenceLabel: other.evidenceLabel,
      },
    ];
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/does not match manifest source|relabeled/i);
  });

  it("rejects a brief whose workstreamId disagrees with its manifest", () => {
    const t = clone(PORTABLE);
    t.brief.workstreamId = "different-workstream";
    t.workstreamId = "different-workstream";
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/workstreamId disagrees/i);
  });

  it("rejects a brief whose freshnessCursor disagrees with its manifest", () => {
    const t = clone(PORTABLE);
    t.brief.freshnessCursor = "2099-01-01T00:00:00Z";
    refinalizeBrief(t);
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/freshnessCursor disagrees/i);
  });

  it("rejects an inflated unsupportedObservedClaimCount trust label", () => {
    const t = clone(PORTABLE);
    t.brief.receipt.unsupportedObservedClaimCount = 99;
    // receipt is outside the semantic hash, so no refinalize needed — the reader must catch it.
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unsupportedObservedClaimCount/i);
  });

  it("rejects a forged publication trust label", () => {
    const t = clone(PORTABLE);
    t.brief.receipt.publication = "public";
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/publication/i);
  });

  it("rejects a forged secretScan trust label", () => {
    const t = clone(PORTABLE);
    t.brief.receipt.secretScan = "not-run";
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/secretScan/i);
  });

  it("fails closed on a correction receipt (single-brief contract cannot attest a chain)", () => {
    // A receipt that merely CLAIMS an arbitrary successor must not return correctionVerified:true.
    // Until the correction/export slice binds the immutable original, any receipt fails closed.
    const t = clone(PORTABLE);
    const core = {
      schemaVersion: 1,
      originalCheckpointId: t.brief.checkpointId,
      correctionKind: "wrong",
      note: "Claims a successor exists, but none is in the package.",
      evidence: [],
      submittedAt: "2026-08-03T08:00:00Z",
      correctedCheckpointId: "checkpoint-never-provided",
      correctedSemanticBriefSha256: "0".repeat(64),
      successorBundleSha256: t.manifest.bundleSha256,
      sameInputCheckpoint: false,
      originalSemanticBriefSha256: "0".repeat(64),
      originalManifestSha256: "0".repeat(64),
      originalCoverageReceiptSha256: "0".repeat(64),
      originalPackageSha256: "0".repeat(64),
    };
    t.correctionReceipt = {
      ...core,
      correctionReceiptSha256: hash(stable(core)),
    } as WorkstreamCheckpointPackage["correctionReceipt"];
    const r = validatePackage(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/correction/i);
  });
});

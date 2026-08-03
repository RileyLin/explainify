import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  validatePackage,
  type WorkstreamCheckpointPackage,
} from "@/lib/workstream/package";
import {
  sha256,
  stableStringify,
} from "@engine/../comprehension/util.mjs";

const FIXTURE = path.resolve(
  __dirname,
  "fixtures/portable-package.json",
);

function clonePackage(): WorkstreamCheckpointPackage {
  return JSON.parse(
    readFileSync(FIXTURE, "utf8"),
  ) as WorkstreamCheckpointPackage;
}

function rehashBrief(pkg: WorkstreamCheckpointPackage): void {
  const semantic = {
    ...(pkg.brief as unknown as Record<string, unknown>),
  };
  delete semantic.receipt;
  const checkpointId = `checkpoint-${sha256(
    stableStringify({ ...semantic, checkpointId: "" }),
  ).slice(0, 12)}`;
  pkg.brief.checkpointId = checkpointId;
  pkg.checkpointId = checkpointId;
  pkg.brief.receipt.semanticBriefSha256 = sha256(
    stableStringify({ ...semantic, checkpointId }),
  );
}

// These are PM's exact adversarial reproductions (msg c2df2a73). PM authored them asserting the
// OLD buggy behavior (`ok: true`) to DEMONSTRATE each acceptance defect. They are preserved here
// as a permanent regression guard, flipped to assert the FIXED behavior: the validator must now
// REJECT every one of PM's five inputs. If any of these ever passes again, an integrity finding
// has regressed.
describe("PM adversarial package audit (regression guard — must now fail closed)", () => {
  it("rejects an observed evidence link whose sourceId points at the wrong source", () => {
    const pkg = clonePackage();
    const link = pkg.brief.currentOutcome.evidence[0];
    const wrongSource = pkg.manifest.sources[1];
    link.sourceId = wrongSource.id;
    link.locator = "fabricated://not-the-hashed-source";
    link.evidenceLevel = "independently_verified";
    link.evidenceLabel = "independently verified";
    rehashBrief(pkg);

    expect(validatePackage(pkg)).toMatchObject({ ok: false });
  });

  it("rejects a decision evidence link outside the manifest", () => {
    const pkg = clonePackage();
    pkg.brief.decisionsNeeded = [
      {
        id: "decision-forged",
        question: "Ship based on evidence that is not in this package?",
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
    rehashBrief(pkg);

    expect(validatePackage(pkg)).toMatchObject({ ok: false });
  });

  it("rejects a brief whose workstream and freshness disagree with its manifest", () => {
    const pkg = clonePackage();
    pkg.brief.workstreamId = "different-workstream";
    pkg.workstreamId = "different-workstream";
    pkg.brief.freshnessCursor = "2099-01-01T00:00:00Z";
    rehashBrief(pkg);

    expect(validatePackage(pkg)).toMatchObject({ ok: false });
  });

  it("does NOT mark a receipt verified without a supplied successor checkpoint", () => {
    const pkg = clonePackage();
    const core = {
      schemaVersion: 1,
      originalCheckpointId: pkg.brief.checkpointId,
      correctionKind: "wrong",
      note: "Claims a successor exists, but none is in the package.",
      evidence: [],
      submittedAt: "2026-08-03T08:00:00Z",
      correctedCheckpointId: "checkpoint-never-provided",
      correctedSemanticBriefSha256: "0".repeat(64),
      successorBundleSha256: pkg.manifest.bundleSha256,
      sameInputCheckpoint: false,
      originalSemanticBriefSha256: "0".repeat(64),
      originalManifestSha256: "0".repeat(64),
      originalCoverageReceiptSha256: "0".repeat(64),
      originalPackageSha256: "0".repeat(64),
    };
    pkg.correctionReceipt = {
      ...core,
      correctionReceiptSha256: sha256(stableStringify(core)),
    };

    const result = validatePackage(pkg);
    expect(result.ok).toBe(false);
    // Critically, it must never report correctionVerified:true.
    expect((result as { correctionVerified?: unknown }).correctionVerified).not.toBe(true);
  });

  it("rejects unbound trust receipt labels", () => {
    const pkg = clonePackage();
    pkg.brief.receipt.publication = "public";
    pkg.brief.receipt.secretScan = "not-run";
    pkg.brief.receipt.unsupportedObservedClaimCount = 99;

    expect(validatePackage(pkg)).toMatchObject({ ok: false });
  });
});

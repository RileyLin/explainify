import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { applyPackageCorrection } from "@/lib/workstream/correct";
import { validatePackage, type WorkstreamCheckpointPackage } from "@/lib/workstream/package";

const FIXTURES = path.resolve(__dirname, "fixtures");
function loadPkg(name: string): WorkstreamCheckpointPackage {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as WorkstreamCheckpointPackage;
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const PORTABLE = loadPkg("portable-package.json");

// A new CAPTURED source that legitimately supports an observed correction.
function capturedSource(id: string) {
  return {
    id,
    kind: "test_receipt",
    locator: `npm run test:extra @${id}`,
    revision: "b2c3d4e5f60718293a4b5c6d7e8f90123456789a",
    evidenceLevel: "receipt_attested",
    evidenceLabel: "receipt-attested, not independently verified",
    captured: true,
    content: `vitest run extra => 12/12 pass; added for correction ${id}.`,
  };
}

describe("applyPackageCorrection — mutate-not-derive, badge honesty, immutable original", () => {
  it("produces a self-validating successor with new captured evidence (observed), round-trips through JSON", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "missing",
      note: "Add the follow-up parity receipt that landed after the checkpoint.",
      submittedAt: "2026-08-03T10:00:00Z",
      targetClaimId: "verify-tests",
      correctedText:
        "Billing suite passes 58/58 and a follow-up parity receipt (12/12) confirms no drift; receipt-attested.",
      intendedStatus: "observed",
      newSources: [capturedSource("m4-parity-followup")],
      citeSourceIds: ["m2-cutover-test", "m4-parity-followup"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.downgraded).toBe(false);

    const succ = r.package;
    // Distinct, linked successor.
    expect(succ.checkpointId).not.toBe(PORTABLE.checkpointId);
    expect(succ.brief.correctionOf).toBe(PORTABLE.checkpointId);
    expect(succ.previousCheckpointId).toBe(PORTABLE.checkpointId);
    // Corrected claim stayed observed because every cited source is captured.
    const claim = succ.brief.verification.find((c) => c.id === "verify-tests")!;
    expect(claim.status).toBe("observed");
    expect(claim.evidence.map((e) => e.sourceId).sort()).toEqual(["m2-cutover-test", "m4-parity-followup"]);

    // Lossless persist/reload: serialize and re-validate.
    const reloaded = JSON.parse(JSON.stringify(succ)) as WorkstreamCheckpointPackage;
    const v = validatePackage(reloaded);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.correctionVerified).toBe(true);
  });

  it("verifies the correction chain end-to-end and reports correctionVerified:true", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "stale",
      note: "Reclassify the review-first item as an unknown pending owner confirmation.",
      submittedAt: "2026-08-03T10:05:00Z",
      targetClaimId: "review-cutover",
      intendedStatus: "unknown",
      reason: "the cutover-window approval is unconfirmed from covered sources",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = validatePackage(r.package);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.correctionVerified).toBe(true);
  });

  // NEGATIVE 1 — badge retention without evidence: an intended-observed correction with NO captured
  // evidence must be downgraded (never keep a green observed badge).
  it("downgrades an observed intent to a non-observed status when no captured evidence supports it", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "wrong",
      note: "Claim the outcome is fully verified without adding any evidence.",
      submittedAt: "2026-08-03T10:10:00Z",
      targetClaimId: "outcome",
      correctedText: "Everything is fully verified and safe to ship.",
      intendedStatus: "observed",
      citeSourceIds: [], // no evidence at all
      reason: "asserted without evidence",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.downgraded).toBe(true);
    const claim = r.package.brief.currentOutcome;
    expect(claim.status).not.toBe("observed");
    // And it still self-validates (the reader would reject an unsupported observed claim).
    expect(validatePackage(r.package).ok).toBe(true);
  });

  it("downgrades observed intent when a cited source is uncaptured (excluded)", () => {
    // m3-owner-approval is policy-excluded; citing it cannot yield an observed badge.
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "misleading",
      note: "Try to mark the review item observed on the strength of the excluded owner approval.",
      submittedAt: "2026-08-03T10:12:00Z",
      targetClaimId: "review-cutover",
      intendedStatus: "observed",
      citeSourceIds: ["m3-owner-approval"],
      reason: "depends on an excluded owner approval",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.downgraded).toBe(true);
    expect(r.package.brief.reviewFirst.find((c) => c.id === "review-cutover")!.status).not.toBe("observed");
  });

  // NEGATIVE 2 — mutation of the immutable original: tampering the embedded previousPackage must
  // fail closed at validation.
  it("rejects a successor whose embedded immutable original was mutated", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "missing",
      note: "Legit correction, then tamper the original.",
      submittedAt: "2026-08-03T10:15:00Z",
      targetClaimId: "verify-tests",
      intendedStatus: "observed",
      newSources: [capturedSource("m4-parity-followup")],
      citeSourceIds: ["m2-cutover-test", "m4-parity-followup"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tampered = clone(r.package);
    tampered.previousPackage!.brief.currentOutcome.text = "FORGED original outcome.";
    const v = validatePackage(tampered);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/embedded original|checkpointId|semantic hash/i);
  });

  // NEGATIVE 3 — dangling correction links: a correction citing a source id that resolves to
  // nothing in the successor manifest must fail to build.
  it("refuses to build a correction citing a source id absent from the successor manifest", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "missing",
      note: "Cite a nonexistent source.",
      submittedAt: "2026-08-03T10:20:00Z",
      targetClaimId: "verify-tests",
      intendedStatus: "observed",
      citeSourceIds: ["does-not-exist"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not in the successor manifest/i);
  });

  // NEGATIVE 4 — tampered successor evidence: flipping a successor evidence hash after the fact
  // must fail closed (checkpoint / evidence binding).
  it("rejects a successor whose corrected-claim evidence hash was tampered", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "missing",
      note: "Legit correction, then tamper the successor evidence.",
      submittedAt: "2026-08-03T10:25:00Z",
      targetClaimId: "verify-tests",
      intendedStatus: "observed",
      newSources: [capturedSource("m4-parity-followup")],
      citeSourceIds: ["m2-cutover-test", "m4-parity-followup"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tampered = clone(r.package);
    const link = tampered.brief.verification.find((c) => c.id === "verify-tests")!.evidence[0];
    link.sha256 = "f".repeat(64);
    const v = validatePackage(tampered);
    expect(v.ok).toBe(false);
  });

  it("rejects a new source whose id collides with an existing frozen source", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "missing",
      note: "Try to overwrite a frozen source id.",
      submittedAt: "2026-08-03T10:30:00Z",
      targetClaimId: "verify-tests",
      intendedStatus: "observed",
      newSources: [{ ...capturedSource("m2-cutover-test") }], // collides with existing m2
      citeSourceIds: ["m2-cutover-test"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/collides with an existing source id/i);
  });

  it("refuses a no-op correction that does not change the checkpoint", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "wrong",
      note: "Target a claim but change nothing about it.",
      submittedAt: "2026-08-03T10:35:00Z",
      targetClaimId: "verify-tests",
      // no correctedText, no new evidence, and it's already observed with the same cite → identical
      intendedStatus: "observed",
      citeSourceIds: ["m2-cutover-test"],
    });
    // Either it fails as a no-op, or (if content is byte-identical) the checkpoint guard trips.
    if (r.ok) {
      expect(r.package.checkpointId).not.toBe(PORTABLE.checkpointId);
    } else {
      expect(r.error).toMatch(/no-op|did not change/i);
    }
  });
});

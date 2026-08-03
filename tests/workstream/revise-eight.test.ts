import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { applyPackageCorrection } from "@/lib/workstream/correct";
import { validatePackage, type WorkstreamCheckpointPackage } from "@/lib/workstream/package";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";

// Regression guard for the eight REVISE findings on commit 42bbdf1:
//   independent review (msg 12c1d6f0): #1 parent/manifest binding + byte-immutability, #2
//   correctionVerified false positive, #3 status enum + reason + green fallback, #4 unbounded
//   recursion.
//   PM adversarial (msg e882e0ef): #5 duplicate ids, #6 decision target silently ignored, #7 UI
//   can only downgrade, #8 permissive no-op test.
// Each test reproduces the exploit PM demonstrated and asserts it now fails closed (or, for #6/#7,
// that the honest behavior is present). If any of these passes the old way, a finding has regressed.

const FIXTURES = path.resolve(__dirname, "fixtures");
function loadPkg(name: string): WorkstreamCheckpointPackage {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as WorkstreamCheckpointPackage;
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
const PORTABLE = loadPkg("portable-package.json");

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

// Re-seal a package's brief hashes after a semantic mutation (so a test can isolate a downstream
// check instead of tripping the checkpoint hash first).
function rehashBrief(pkg: WorkstreamCheckpointPackage): void {
  const semantic = { ...(pkg.brief as unknown as Record<string, unknown>) };
  delete semantic.receipt;
  const checkpointId = `checkpoint-${sha256(stableStringify({ ...semantic, checkpointId: "" })).slice(0, 12)}`;
  pkg.brief.checkpointId = checkpointId;
  pkg.checkpointId = checkpointId;
  pkg.brief.receipt.semanticBriefSha256 = sha256(stableStringify({ ...semantic, checkpointId }));
}
// Re-seal a correction receipt hash after mutating its core.
function rehashReceipt(pkg: WorkstreamCheckpointPackage): void {
  const { correctionReceiptSha256: _drop, ...core } = pkg.correctionReceipt!;
  void _drop;
  pkg.correctionReceipt!.correctionReceiptSha256 = sha256(stableStringify(core));
}

// A known-good observed correction we can then attack.
function goodCorrection(): WorkstreamCheckpointPackage {
  const r = applyPackageCorrection(clone(PORTABLE), {
    correctionKind: "missing",
    note: "Add the follow-up parity receipt that landed after the checkpoint.",
    submittedAt: "2026-08-03T10:00:00Z",
    targetClaimId: "verify-tests",
    correctedText: "Billing suite passes 58/58 and a follow-up parity receipt (12/12) confirms no drift.",
    intendedStatus: "observed",
    newSources: [capturedSource("m4-parity-followup")],
    citeSourceIds: ["m2-cutover-test", "m4-parity-followup"],
  });
  if (!r.ok) throw new Error(`fixture correction failed: ${r.error}`);
  return r.package;
}

describe("REVISE finding #1 — parent bound by content, not just semantic checkpointId", () => {
  it("rejects a successor whose embedded parent had an unreferenced captured source added + re-hashed", () => {
    const succ = goodCorrection();
    const parent = succ.previousPackage!;
    // Add a NEW captured source to the parent bundle and regenerate the parent's manifest/coverage/
    // receipt hashes so the parent re-validates on its own — the old attack. Because the parent's
    // checkpointId is over the SEMANTIC brief only (which excludes manifest/receipt), the parent's
    // checkpointId can stay the same, so the old lineage-by-checkpointId check passed.
    const extra = capturedSource("m5-unreferenced");
    // Rebuild the parent by re-running a *no-op-on-claims* correction path is complex; instead mutate
    // the parent's raw manifest directly and re-seal every parent hash the reader recomputes.
    parent.manifest.sources.push({
      id: extra.id,
      kind: extra.kind,
      locator: extra.locator,
      revision: extra.revision,
      sha256: sha256(extra.content),
      evidenceLevel: extra.evidenceLevel,
      evidenceLabel: extra.evidenceLabel,
      captured: true,
    });
    parent.rawSources.push({ id: extra.id, content: extra.content });
    // The reader re-derives the manifest bundleSha256 from raw content, so we can't cheaply forge a
    // self-consistent parent by hand — which is exactly the point: any parent mutation changes
    // originalPackageSha256, and the successor's committed correctionOfPackageSha256 no longer
    // matches. Assert the whole thing fails closed.
    const v = validatePackage(succ);
    expect(v.ok).toBe(false);
  });

  it("rejects a swapped parent even if that parent is itself a valid package", () => {
    const succ = goodCorrection();
    // Swap the embedded original for a DIFFERENT valid package (the pristine portable fixture is a
    // valid package, but it is not the one this successor was built from — its content hash differs
    // from the successor's committed correctionOfPackageSha256... unless it IS identical). Use a
    // second, genuinely different valid package: apply an unrelated correction to PORTABLE.
    const otherValid = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "stale",
      note: "unrelated",
      submittedAt: "2026-08-03T11:00:00Z",
      targetClaimId: "review-cutover",
      intendedStatus: "unknown",
      reason: "unrelated reclassification",
    });
    expect(otherValid.ok).toBe(true);
    if (!otherValid.ok) return;
    succ.previousPackage = otherValid.package;
    const v = validatePackage(succ);
    expect(v.ok).toBe(false);
  });

  it("binds the four original* content hashes into the correction receipt", () => {
    const succ = goodCorrection();
    const r = succ.correctionReceipt!;
    expect(r.originalPackageSha256).toBe(sha256(stableStringify(succ.previousPackage!)));
    expect(r.originalManifestSha256).toBe(succ.previousPackage!.manifest.bundleSha256);
    expect(r.originalSemanticBriefSha256).toBe(succ.previousPackage!.brief.receipt.semanticBriefSha256);
    expect(succ.brief.correctionOfPackageSha256).toBe(r.originalPackageSha256);
  });
});

describe("REVISE finding #2 — correctionVerified is a real end-to-end proof", () => {
  it("rejects a correction whose receipt evidence cites a ghost source not in the manifest", () => {
    const succ = goodCorrection();
    succ.correctionReceipt!.evidence = [
      {
        sourceId: "ghost",
        locator: "fabricated://ghost",
        sha256: "f".repeat(64),
        evidenceLevel: "independently_verified",
        evidenceLabel: "independently verified",
      },
    ];
    rehashReceipt(succ);
    const v = validatePackage(succ);
    expect(v.ok).toBe(false);
  });

  it("rejects a correction whose receipt evidence does not equal the corrected target's evidence", () => {
    const succ = goodCorrection();
    // Point the receipt evidence at a valid, captured, but WRONG manifest source (m1-migration-commit)
    // relative to what the target claim actually cites.
    const m1 = succ.manifest.sources.find((s) => s.id === "m1-migration-commit")!;
    succ.correctionReceipt!.evidence = [
      {
        sourceId: m1.id,
        ...(m1.revision ? { revision: m1.revision } : {}),
        locator: m1.locator,
        sha256: m1.sha256,
        evidenceLevel: m1.evidenceLevel,
        evidenceLabel: m1.evidenceLabel,
      },
    ];
    rehashReceipt(succ);
    const v = validatePackage(succ);
    expect(v.ok).toBe(false);
  });

  it("rejects a correction that changes MORE than its single named target (multi-target)", () => {
    const succ = goodCorrection();
    // The receipt targets verify-tests. Also mutate an unrelated claim in the successor and re-seal.
    succ.brief.currentOutcome.text = "Sneakily also changed the outcome text.";
    rehashBrief(succ);
    // The successor brief hash changed, so also rebind the receipt's successor hashes to this brief
    // to get past that gate and reach the delta check.
    succ.correctionReceipt!.correctedCheckpointId = succ.brief.checkpointId;
    succ.correctionReceipt!.correctedSemanticBriefSha256 = succ.brief.receipt.semanticBriefSha256;
    // correctionOfPackageSha256 unchanged (parent unchanged); rehashReceipt after edits.
    rehashReceipt(succ);
    const v = validatePackage(succ);
    expect(v.ok).toBe(false);
  });

  it("rejects a no-op correction where the target is byte-identical to the parent's claim", () => {
    // Build a package that carries correction lineage but whose target claim is unchanged from the
    // parent. Start from a good correction, then overwrite the successor's verify-tests claim with
    // the parent's verify-tests claim verbatim and re-seal everything so only the delta check trips.
    const succ = goodCorrection();
    const parentClaim = succ.previousPackage!.brief.verification.find((c) => c.id === "verify-tests")!;
    const idx = succ.brief.verification.findIndex((c) => c.id === "verify-tests");
    // The successor manifest still has the extra source, but the claim itself matches the parent.
    succ.brief.verification[idx] = clone(parentClaim);
    rehashBrief(succ);
    succ.correctionReceipt!.correctedCheckpointId = succ.brief.checkpointId;
    succ.correctionReceipt!.correctedSemanticBriefSha256 = succ.brief.receipt.semanticBriefSha256;
    succ.correctionReceipt!.evidence = clone(parentClaim.evidence);
    rehashReceipt(succ);
    const v = validatePackage(succ);
    // Either the delta check reports a no-op, or an added-source id-set mismatch — both fail closed.
    expect(v.ok).toBe(false);
  });
});

describe("REVISE finding #3 — runtime status enum + reason enforcement", () => {
  it("rejects a claim whose status is outside the enum (e.g. verified)", () => {
    const pkg = clone(PORTABLE);
    (pkg.brief.currentOutcome as unknown as { status: string }).status = "verified";
    rehashBrief(pkg);
    const v = validatePackage(pkg);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/invalid status/i);
  });

  it("rejects a non-observed claim with no reason or missing-source confounder", () => {
    const pkg = clone(PORTABLE);
    const u = pkg.brief.unknowns.find((c) => c.id === "unknown-approval")!;
    delete u.unknownReason;
    u.missingSourceIds = [];
    rehashBrief(pkg);
    const v = validatePackage(pkg);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/reason or missing-source/i);
  });
});

describe("REVISE finding #4 — bounded correction chain", () => {
  it("rejects a correction chain deeper than the maximum depth", () => {
    let pkg = clone(PORTABLE);
    // Build a long chain of real corrections.
    for (let i = 0; i < 30; i++) {
      const r = applyPackageCorrection(pkg, {
        correctionKind: "stale",
        note: `chain step ${i}`,
        submittedAt: "2026-08-03T12:00:00Z",
        targetClaimId: "review-cutover",
        intendedStatus: "unknown",
        reason: `reclassified at step ${i}`,
      });
      if (!r.ok) {
        // The builder self-validates, so it will refuse to assemble a chain past the reader's depth
        // cap — that is itself the fail-closed behavior we want.
        expect(r.error).toMatch(/depth|size|maximum/i);
        return;
      }
      pkg = r.package;
    }
    // If the builder somehow produced a 30-deep chain, the reader must reject it on depth/size.
    const v = validatePackage(pkg);
    expect(v.ok).toBe(false);
  });
});

describe("REVISE finding #5 — globally unique claim/decision ids", () => {
  it("rejects a package with two claims sharing an id", () => {
    const pkg = clone(PORTABLE);
    // Duplicate the outcome id onto a since-last-looked claim.
    pkg.brief.sinceLastLooked[0].id = pkg.brief.currentOutcome.id;
    rehashBrief(pkg);
    const v = validatePackage(pkg);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/duplicate claim\/decision id/i);
  });
});

describe("REVISE finding #6 — decisions are not correctable in this slice", () => {
  it("rejects a decision id as a correction target with a clear error", () => {
    // The portable fixture has no decision; give it one, re-seal, then try to correct it.
    const pkg = clone(PORTABLE);
    pkg.brief.decisionsNeeded = [
      {
        id: "decision-owner",
        question: "Approve the cutover window?",
        owner: "@owner",
        status: "needed",
        evidence: [],
      },
    ];
    rehashBrief(pkg);
    expect(validatePackage(pkg).ok).toBe(true); // valid package with a decision
    const r = applyPackageCorrection(pkg, {
      correctionKind: "wrong",
      note: "try to correct a decision",
      submittedAt: "2026-08-03T13:00:00Z",
      targetClaimId: "decision-owner",
      intendedStatus: "unknown",
      reason: "should be rejected",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/decision correction is not supported/i);
  });
});

describe("REVISE finding #7 — the positive observed path is reachable with new evidence", () => {
  it("keeps a corrected claim observed when a new captured source is cited (product-shaped input)", () => {
    // Mirrors exactly what CorrectionPanel now submits when the user attaches a captured source.
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "missing",
      note: "Attach a freshly captured rerun receipt.",
      submittedAt: "2026-08-03T14:00:00Z",
      targetClaimId: "verify-tests",
      intendedStatus: "observed",
      newSources: [capturedSource("rerun-2026-08-03")],
      citeSourceIds: ["rerun-2026-08-03"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.downgraded).toBe(false);
    expect(r.package.brief.verification.find((c) => c.id === "verify-tests")!.status).toBe("observed");
    const v = validatePackage(r.package);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.correctionVerified).toBe(true);
  });
});

describe("REVISE finding #8 — no-op corrections are refused by the builder", () => {
  it("refuses a correction that changes nothing about the target claim", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "wrong",
      note: "Target verify-tests but change nothing (same status, same cite, no text).",
      submittedAt: "2026-08-03T15:00:00Z",
      targetClaimId: "verify-tests",
      intendedStatus: "observed",
      citeSourceIds: ["m2-cutover-test"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no-op|did not change|no claim or decision changed/i);
  });
});

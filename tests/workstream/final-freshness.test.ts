import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { applyPackageCorrection } from "@/lib/workstream/correct";
import { validatePackage, type WorkstreamCheckpointPackage } from "@/lib/workstream/package";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";

// Regression guard for the final review finding on commit 94c10bc (PM msg 646d9ade):
//   HIGH — a single-claim correction could advance the WHOLE brief's freshness with zero new
//   evidence. `freshnessCursor` was caller-controlled in correct.ts, applied to the successor
//   manifest/coverage/brief, and the allowed-delta validator explicitly exempted it. Correcting
//   one claim to unknown, adding no sources, and setting freshnessCursor: "2099-..." returned
//   {ok:true, correctionVerified:true} while the UI would display "Fresh through: 2099-01-01",
//   overstating the currency of every untouched claim.
//
// Fix: a correction ALWAYS inherits the parent's freshness cursor. The builder rejects a
// caller-supplied cursor; the validator no longer exempts freshnessCursor from the allowed delta,
// so a forged successor cursor fails closed as a non-target brief field change.

const FIXTURES = path.resolve(__dirname, "fixtures");
function loadPkg(name: string): WorkstreamCheckpointPackage {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as WorkstreamCheckpointPackage;
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
const PORTABLE = loadPkg("portable-package.json");

function rehashBrief(pkg: WorkstreamCheckpointPackage): void {
  const semantic = { ...(pkg.brief as unknown as Record<string, unknown>) };
  delete semantic.receipt;
  const checkpointId = `checkpoint-${sha256(stableStringify({ ...semantic, checkpointId: "" })).slice(0, 12)}`;
  pkg.brief.checkpointId = checkpointId;
  pkg.checkpointId = checkpointId;
  pkg.brief.receipt.semanticBriefSha256 = sha256(stableStringify({ ...semantic, checkpointId }));
}
function rehashReceipt(pkg: WorkstreamCheckpointPackage): void {
  const { correctionReceiptSha256: _drop, ...core } = pkg.correctionReceipt!;
  void _drop;
  pkg.correctionReceipt!.correctionReceiptSha256 = sha256(stableStringify(core));
}

describe("final review — a correction cannot advance whole-brief freshness", () => {
  it("rejects a caller-supplied freshnessCursor at the builder (PM exact repro: zero new sources, 2099 cursor)", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "stale",
      note: "Reclassify review-cutover to unknown; no new evidence.",
      submittedAt: "2026-08-03T14:00:00Z",
      targetClaimId: "review-cutover",
      intendedStatus: "unknown",
      reason: "cutover freshness cannot be confirmed from covered sources",
      // The exploit input: advance the whole-brief cursor far into the future with no new evidence.
      freshnessCursor: "2099-01-01T00:00:00Z",
    } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/freshnessCursor may not be supplied/i);
  });

  it("inherits the parent freshness cursor verbatim on a legitimate correction", () => {
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "stale",
      note: "Reclassify review-cutover to unknown; no new evidence.",
      submittedAt: "2026-08-03T14:00:00Z",
      targetClaimId: "review-cutover",
      intendedStatus: "unknown",
      reason: "cutover freshness cannot be confirmed from covered sources",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The successor's freshness cursor is exactly the parent's — unchanged across the correction.
    expect(r.package.brief.freshnessCursor).toBe(PORTABLE.brief.freshnessCursor);
    expect(r.package.manifest.freshnessCursor).toBe(PORTABLE.manifest.freshnessCursor);
    expect(r.package.coverageReceipt.freshnessCursor).toBe(PORTABLE.coverageReceipt.freshnessCursor);
    const v = validatePackage(r.package);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.correctionVerified).toBe(true);
  });

  it("validator fails closed if a successor's brief freshnessCursor is forged past the parent's (defense in depth)", () => {
    // Build a legitimate successor, then tamper only the successor brief's freshness cursor and
    // re-hash the brief + rebind the receipt's successor hashes. Two independent guards now reject
    // this: step 3b (brief/manifest/coverage cursors must agree WITHIN a package) trips because we
    // moved only the brief cursor, and — were all three moved together — the allowed-delta check
    // (freshnessCursor is no longer exempt from briefResidue) rejects it as a non-target brief
    // field change. Either way the successor cursor can never exceed the parent's.
    const r = applyPackageCorrection(clone(PORTABLE), {
      correctionKind: "stale",
      note: "Reclassify review-cutover to unknown; no new evidence.",
      submittedAt: "2026-08-03T14:00:00Z",
      targetClaimId: "review-cutover",
      intendedStatus: "unknown",
      reason: "cutover freshness cannot be confirmed from covered sources",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const succ = clone(r.package);
    succ.brief.freshnessCursor = "2099-01-01T00:00:00Z";
    rehashBrief(succ);
    succ.correctionReceipt!.correctedCheckpointId = succ.brief.checkpointId;
    succ.correctionReceipt!.correctedSemanticBriefSha256 = succ.brief.receipt.semanticBriefSha256;
    rehashReceipt(succ);
    const v = validatePackage(succ);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/freshnessCursor disagrees|non-target brief field/i);
  });
});

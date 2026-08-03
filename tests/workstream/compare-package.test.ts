import path from "node:path";
import { describe, expect, it } from "vitest";

import { validatePackage, type WorkstreamCheckpointPackage } from "@/lib/workstream/package";
// The comparative engine + adapter live as engine .mjs modules (task #15 + #23). Imported by
// relative path from the repo root; vitest resolves .mjs natively.
import { loadComparativeFixtures } from "../../tools/comprehension/comparative/fixtures.mjs";
import { compareCapsules } from "../../tools/comprehension/comparative/compare.mjs";
import { comparisonToPackage } from "../../tools/comprehension/comparative/workstream-package.mjs";

// Task #23 acceptance floor (frozen handoff f3213fb3, point 6): the comparison→package adapter must
// mint a WorkstreamCheckpointPackage that round-trips losslessly through the Phase B reader
// (validatePackage), preserve BILATERAL evidence on every observed comparison claim, surface
// non-equivalence as not_comparable (never a forced-green observed), keep provider verification an
// explicit unknown, and fail closed on swapped/missing sides, false equivalence, dirty revisions,
// and any secret/private-map leak. The hosted fail-closed contract is pinned separately in
// local-mode.test.ts; the adapter itself is local-only and never touches the network.

const ROOT = path.resolve(__dirname, "../..");

async function loadCases() {
  const { cases } = await loadComparativeFixtures(ROOT);
  return cases;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe("comparison → WorkstreamCheckpointPackage adapter", () => {
  it("mints a package that round-trips losslessly through the Phase B reader for every frozen case", async () => {
    const cases = await loadCases();
    expect(cases.length).toBe(10);
    for (const c of cases) {
      const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
      const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;

      // Lossless round-trip: the reader accepts it, and re-validating the exact serialized bytes
      // still accepts it (no field the reader recomputes drifts).
      const result = validatePackage(pkg);
      expect(result.ok, `${c.id}: ${result.ok ? "" : result.error}`).toBe(true);
      const reparsed = validatePackage(JSON.parse(JSON.stringify(pkg)));
      expect(reparsed.ok).toBe(true);
      if (!result.ok) return;

      expect(result.workstreamId).toBe(`compare:${artifact.id}`);
      // This is a plain comparison, not a correction: no correction chain is claimed.
      expect(result.correctionVerified).toBeNull();
    }
  });

  it("keeps every observed comparison claim BILATERAL (evidence from both capsules)", async () => {
    const cases = await loadCases();
    for (const c of cases) {
      const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
      const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;
      const groups = [
        [pkg.brief.currentOutcome],
        pkg.brief.sinceLastLooked,
        pkg.brief.reviewFirst,
        pkg.brief.verification,
        pkg.brief.risks,
      ];
      for (const claim of groups.flat()) {
        if (claim.status !== "observed") continue;
        const providers = new Set(
          claim.evidence.map((link) => {
            // source id shape: cmp:<capsuleId>:<receiptId>
            const capsuleId = link.sourceId.split(":")[1];
            return capsuleId === left.id ? "left" : capsuleId === right.id ? "right" : "other";
          }),
        );
        expect(providers.has("left"), `${c.id} claim ${claim.id} missing left evidence`).toBe(true);
        expect(providers.has("right"), `${c.id} claim ${claim.id} missing right evidence`).toBe(true);
      }
    }
  });

  it("surfaces non-equivalent dimensions as not_comparable (amber), never a forced-green observed", async () => {
    const cases = await loadCases();
    for (const c of cases) {
      const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
      const nonEquivalent = (artifact.equivalence ?? []).filter((e: { status: string }) => e.status !== "equivalent");
      const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;
      // Every non-equivalent dimension is represented by a not_comparable review-first claim that
      // names it as a confounder.
      for (const eq of nonEquivalent) {
        const match = pkg.brief.reviewFirst.find((claim) => claim.id === `equiv-${eq.dimension}`);
        expect(match, `${c.id}: missing equiv claim for ${eq.dimension}`).toBeTruthy();
        expect(match!.status).toBe("not_comparable");
        expect(match!.confounders).toContain(eq.dimension);
        // A not_comparable claim must carry an explicit reason (reader enforces this too).
        expect(match!.unknownReason && match!.unknownReason.trim().length).toBeTruthy();
      }
      // When the engine declined the recommendation (confounders or unsupported), the outcome must
      // NOT be observed.
      const blocked = (artifact.confounders ?? []).length > 0 || artifact.recommendation?.supported === false;
      if (blocked) {
        expect(pkg.brief.currentOutcome.status).toBe("not_comparable");
      }
    }
  });

  it("always records provider verification as an explicit unknown (local run is never provider-verified)", async () => {
    const cases = await loadCases();
    for (const c of cases) {
      const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
      const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;
      const gap = pkg.brief.unknowns.find((u) => u.id === "unknown-provider-verification");
      expect(gap, `${c.id}: missing provider-verification unknown`).toBeTruthy();
      expect(gap!.status).toBe("unknown");
      expect(gap!.evidence.length).toBe(0);
      expect(gap!.unknownReason).toMatch(/not.*provider-verified|provider verification/i);
    }
  });

  it("sets the freshness cursor to the latest captured execution completion across both runs", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
    const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;
    const allCompletions = [left, right].flatMap((cap: { execution?: Array<{ completedAt?: string }> }) =>
      (cap.execution ?? []).map((e) => e.completedAt).filter(Boolean),
    ) as string[];
    const expectedMax = allCompletions.sort()[allCompletions.length - 1];
    expect(pkg.brief.freshnessCursor).toBe(expectedMax);
    // A future-dated cursor is not invented: it never exceeds the newest real receipt moment.
    expect(new Date(pkg.brief.freshnessCursor).getTime()).toBeLessThanOrEqual(
      new Date(expectedMax).getTime(),
    );
  });

  it("fails closed when the two capsules are SWAPPED relative to the artifact", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
    // Swapping left/right no longer matches artifact.capsules order → reject before minting.
    expect(() => comparisonToPackage(artifact, right, left)).toThrow(/do not match artifact\.capsules|capsuleHashes/i);
  });

  it("fails closed on a SELF-comparison (identical capsule ids collapse the bilateral invariant)", async () => {
    const cases = await loadCases();
    const c = cases[0];
    // Compare the left capsule to itself. If the adapter accepted equal ids, a single run's
    // evidence would satisfy the both-sides requirement and render as a fully-observed comparison.
    const { artifact, left } = compareCapsules(c.left, c.left, "self");
    expect(() => comparisonToPackage(artifact, left, left)).toThrow(/self-comparison|distinct ids/i);
  });

  it("fails closed when a side is MISSING", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left } = compareCapsules(c.left, c.right, c.id);
    // No right side at all, and a duplicated left standing in for the right, both fail closed.
    expect(() => comparisonToPackage(artifact, left, undefined as unknown as object)).toThrow();
    expect(() => comparisonToPackage(artifact, left, left)).toThrow(/do not match|capsuleHashes/i);
  });

  it("fails closed on FALSE equivalence (a capsule mutated after the artifact was hashed)", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
    // Tamper a capsule's content AFTER the artifact fixed its capsuleHashes. The adapter re-verifies
    // capsule ↔ artifact binding from content, so the forged (falsely-equivalent) side fails closed.
    const forged = clone(right);
    const metric = forged.receipts.find((r: { id: string }) => r.id === "receipt:metric");
    metric.content = metric.content.replace(/110/g, "5");
    expect(() => comparisonToPackage(artifact, left, forged)).toThrow();
  });

  it("fails closed on a DIRTY / non-reproducible capsule that has been made to look clean", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
    const dirty = clone(right);
    dirty.repository.dirty = true; // clean→dirty without the required diff evidence, and hash now stale
    expect(() => comparisonToPackage(artifact, left, dirty)).toThrow();
  });

  it("fails closed if a secret / private resource canary leaks into a receipt", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
    const leaky = clone(right);
    const rec = leaky.receipts.find((r: { id: string }) => r.id === "receipt:environment");
    rec.content = `${rec.content} PRIVATE_RESOURCE_CANARY`;
    // The capsule's own hash is now stale AND the canary would trip the secret scan — either way,
    // fail closed. (validateCapsule catches the hash first; the scan is defense in depth.)
    expect(() => comparisonToPackage(artifact, left, leaky)).toThrow();
  });

  it("resolves EVERY artifact evidence ref to exactly one manifest source (no dangling refs)", async () => {
    const cases = await loadCases();
    for (const c of cases) {
      const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
      const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;
      const sourceIds = new Set(pkg.manifest.sources.map((s) => s.id));
      // Every evidence link on every claim binds to a real manifest source.
      const allClaims = [
        pkg.brief.currentOutcome,
        ...pkg.brief.sinceLastLooked,
        ...pkg.brief.reviewFirst,
        ...pkg.brief.verification,
        ...pkg.brief.risks,
        ...pkg.brief.blockers,
        ...pkg.brief.unknowns,
      ];
      for (const claim of allClaims) {
        for (const link of claim.evidence) {
          expect(sourceIds.has(link.sourceId), `${c.id} claim ${claim.id} dangling ref ${link.sourceId}`).toBe(true);
        }
      }
      // rawSources correspond one-to-one with manifest sources (round-trip requirement).
      expect(pkg.rawSources.length).toBe(pkg.manifest.sources.length);
    }
  });

  it("fails closed if a claim's evidence is mutated after minting (reader catches relabeled evidence)", async () => {
    const cases = await loadCases();
    const c = cases[0];
    const { artifact, left, right } = compareCapsules(c.left, c.right, c.id);
    const pkg = comparisonToPackage(artifact, left, right) as WorkstreamCheckpointPackage;
    const tampered = clone(pkg);
    // Point an evidence hash at a different source's hash → relabeled evidence.
    const other = tampered.manifest.sources.find(
      (s) => s.sha256 !== tampered.brief.currentOutcome.evidence[0].sha256,
    )!;
    tampered.brief.currentOutcome.evidence[0].sha256 = other.sha256;
    const result = validatePackage(tampered);
    expect(result.ok).toBe(false);
  });
});

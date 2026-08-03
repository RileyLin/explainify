import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validatePackage, type WorkstreamCheckpointPackage } from "@/lib/workstream/package";

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
});

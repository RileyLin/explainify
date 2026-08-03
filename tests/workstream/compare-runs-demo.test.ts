import { describe, expect, it } from "vitest";

import { compareRunsDemoAction } from "@/app/workstream/actions";

// Task #23 founder-visible delivery: the Compare Runs honesty demo renders three red-team cases
// live through the SHIPPING engine. These tests assert the exact visible result a reader sees, so
// the demo is a real regression witness — if the engine ever regressed to a forced winner, the
// "after" text would change and these fail. The demo runs only bundled synthetic fixtures, so it is
// NOT local-gated and must succeed regardless of the local-mode flag.

describe("compareRunsDemoAction — the visible before/after honesty demo", () => {
  it("returns exactly the three red-team cases", async () => {
    const r = await compareRunsDemoAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cases.map((c) => c.id)).toEqual(["tie", "same-provider", "not-equivalent"]);
  });

  it("every case renders not_comparable with no supported winner (never green/observed)", async () => {
    const r = await compareRunsDemoAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const c of r.cases) {
      expect(c.status).toBe("not_comparable");
      expect(c.supported).toBe(false);
      // The "after" text must never assert a provider winner — the exact defect the demo exposes.
      expect(c.after).not.toMatch(/(aws|gcp) is supported|prefer (aws|gcp)/i);
    }
  });

  it("the tie case states the measures are tied and supports neither provider", async () => {
    const r = await compareRunsDemoAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tie = r.cases.find((c) => c.id === "tie")!;
    // "before" documents the old wrong result; "after" is the live honest result.
    expect(tie.before).toMatch(/aws is supported/i);
    expect(tie.after).toMatch(/tied/i);
    expect(tie.after).toMatch(/no provider is supported/i);
  });

  it("the same-provider case explains a cross-provider pair requires one aws and one gcp", async () => {
    const r = await compareRunsDemoAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const same = r.cases.find((c) => c.id === "same-provider")!;
    expect(same.after).toMatch(/exactly one aws and one gcp/i);
    expect(same.after).toMatch(/aws vs aws/i);
  });

  it("the non-equivalent case is blocked by the load_profile confounder", async () => {
    const r = await compareRunsDemoAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const neq = r.cases.find((c) => c.id === "not-equivalent")!;
    expect(neq.after).toMatch(/load_profile|non-equivalent/i);
  });
});

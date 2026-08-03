import { afterEach, describe, expect, it } from "vitest";

import { preflightAction, generateBriefAction, correctBriefAction } from "@/app/workstream/actions";
import { EXAMPLE_BUNDLE_JSON } from "@/app/workstream/example-bundle";
import { LOCAL_WORKSTREAMS_ENV } from "@/lib/workstream/local-mode";

// PM constraint 1 (task #22): the hosted server must fail closed — a bundle POST is
// rejected without processing. These tests exercise the real server actions in both
// modes so the guarantee is enforced at the surface a bundle actually reaches.
describe("workstream server actions — hosted mode fails closed", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  function hosted() {
    delete process.env[LOCAL_WORKSTREAMS_ENV];
  }

  it("preflight refuses a bundle in hosted mode", async () => {
    hosted();
    const r = await preflightAction(EXAMPLE_BUNDLE_JSON);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/local-first/i);
    // No coverage was computed — the bundle was never processed.
    expect(r.coverage).toBeUndefined();
  });

  it("generate refuses a bundle in hosted mode", async () => {
    hosted();
    const r = await generateBriefAction(EXAMPLE_BUNDLE_JSON);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/local-first/i);
    expect(r.brief).toBeUndefined();
  });

  it("correction refuses a bundle in hosted mode", async () => {
    hosted();
    const r = await correctBriefAction(EXAMPLE_BUNDLE_JSON, {
      correctionKind: "stale",
      note: "test",
      submittedAt: "2026-08-03T00:00:00Z",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/local-first/i);
    expect(r.corrected).toBeUndefined();
  });
});

describe("workstream server actions — local mode processes the bundle", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  it("preflight reports coverage and honest exclusions for the example bundle", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await preflightAction(EXAMPLE_BUNDLE_JSON);
    expect(r.ok).toBe(true);
    expect(r.workstreamId).toBe("explainify-phase2");
    expect(r.coverage?.requested).toBe(16);
    expect(r.coverage?.scanned).toBe(14);
    expect(r.coverage?.uncovered).toBe(2);
    expect(r.coverage?.fullyCovered).toBe(false);
    // The two uncaptured sources must be surfaced, not hidden.
    expect(r.exclusions?.map((e) => e.id).sort()).toEqual(
      ["t15-seeded-omission-loadprofile", "t17-owner-dm-thread"].sort(),
    );
  });

  it("generate produces the proven checkpoint with a passing secret scan", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await generateBriefAction(EXAMPLE_BUNDLE_JSON);
    expect(r.ok).toBe(true);
    expect(r.brief?.checkpointId).toBe("checkpoint-7a3c1d543879");
    expect(r.brief?.receipt.publication).toBe("local_only");
    expect(r.brief?.receipt.secretScan).toBe("pass");
    expect(r.brief?.currentOutcome.status).toBe("observed");
    expect(r.brief?.currentOutcome.evidence.length).toBeGreaterThan(0);
  });

  it("rejects invalid JSON with a clear error and no processing", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await preflightAction("{ not json ");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not valid JSON/i);
  });

  it("correction produces an immutable linked successor checkpoint", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await correctBriefAction(EXAMPLE_BUNDLE_JSON, {
      correctionKind: "stale",
      note: "The Preview-protection decision reads as stale; verify against the excluded owner DM.",
      submittedAt: "2026-08-03T00:00:00Z",
      originalClaimId: "decision-public-contact",
    });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.corrected?.checkpointId).not.toBe(r.original?.checkpointId);
    expect(r.corrected?.correctionOf).toBe(r.original?.checkpointId);
    expect(r.correctionReceipt?.correctionKind).toBe("stale");
  });
});

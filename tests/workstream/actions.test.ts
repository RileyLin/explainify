import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validatePackageAction } from "@/app/workstream/actions";
import { LOCAL_WORKSTREAMS_ENV } from "@/lib/workstream/local-mode";

const FIXTURES = path.resolve(__dirname, "fixtures");
const EXPLAINIFY_PACKAGE = readFileSync(path.join(FIXTURES, "explainify-package.json"), "utf8");
const PORTABLE_PACKAGE = readFileSync(path.join(FIXTURES, "portable-package.json"), "utf8");

// PM constraint 1 (task #22): the hosted server must fail closed — a checkpoint package is
// rejected without processing. These tests exercise the real server action in both modes so the
// guarantee is enforced at the surface a package actually reaches.
describe("workstream server action — hosted mode fails closed", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  it("refuses a package in hosted mode without validating it", async () => {
    delete process.env[LOCAL_WORKSTREAMS_ENV];
    const r = await validatePackageAction(EXPLAINIFY_PACKAGE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/local-first/i);
    // No coverage/pkg was computed — the package was never processed.
    expect((r as { coverage?: unknown }).coverage).toBeUndefined();
  });
});

describe("workstream server action — local mode validates the package", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  it("opens the real Explainify checkpoint with honest partial coverage", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await validatePackageAction(EXPLAINIFY_PACKAGE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workstreamId).toBe("explainify-phase2");
    expect(r.pkg.checkpointId).toBe("checkpoint-7a3c1d543879");
    expect(r.coverage.requested).toBe(16);
    expect(r.coverage.scanned).toBe(14);
    expect(r.coverage.uncovered).toBe(2);
    expect(r.coverage.fullyCovered).toBe(false);
    expect(r.exclusions.map((e) => e.id).sort()).toEqual(
      ["t15-seeded-omission-loadprofile", "t17-owner-dm-thread"].sort(),
    );
  });

  it("opens a structurally different portable checkpoint (no Explainify-specific ids)", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await validatePackageAction(PORTABLE_PACKAGE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workstreamId).toBe("acme-migration");
    expect(r.coverage.requested).toBe(3);
    expect(r.coverage.scanned).toBe(2);
    expect(r.coverage.excluded).toBe(1);
  });

  it("rejects invalid JSON with a clear error and no processing", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const r = await validatePackageAction("{ not json ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/i);
  });
});

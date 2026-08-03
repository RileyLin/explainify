import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compareRunsAction } from "@/app/workstream/actions";
import { validatePackage } from "@/lib/workstream/package";
import { LOCAL_WORKSTREAMS_ENV } from "@/lib/workstream/local-mode";
import { loadComparativeFixtures } from "../../tools/comprehension/comparative/fixtures.mjs";

// Task #23 checkpoint 2: the Compare Runs server action is the surface a private capsule actually
// reaches. It must fail closed on the hosted server (PM constraint 1, mirrored from /workstream),
// and in local mode it must produce a package that passes the SAME reader as an imported
// checkpoint — and refuse swapped / self-compared / tampered pairs.

const ROOT = path.resolve(__dirname, "../..");

async function capsules() {
  const { cases } = await loadComparativeFixtures(ROOT);
  return cases[0]; // C01: a fully-equivalent AWS/GCP pair
}
function j(v: unknown): string {
  return JSON.stringify(v);
}

describe("compareRunsAction — hosted mode fails closed", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  it("refuses to compare capsules in hosted mode without processing them", async () => {
    delete process.env[LOCAL_WORKSTREAMS_ENV];
    const c = await capsules();
    const r = await compareRunsAction(j(c.left), j(c.right), "which provider?");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/local-first/i);
  });
});

describe("compareRunsAction — local mode", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  it("compares two capsules into a package that passes the /workstream reader", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const c = await capsules();
    const r = await compareRunsAction(j(c.left), j(c.right), "which provider?");
    expect(r.ok, r.ok ? "" : (r as { error: string }).error).toBe(true);
    if (!r.ok) return;
    // The returned JSON re-validates through the exact same reader with no drift.
    const reread = validatePackage(JSON.parse(r.packageJson));
    expect(reread.ok).toBe(true);
    if (reread.ok) expect(reread.workstreamId).toMatch(/^compare:comparison-/);
    expect(r.result.ok).toBe(true);
  });

  it("fails closed on a self-comparison (same capsule on both sides)", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const c = await capsules();
    const r = await compareRunsAction(j(c.left), j(c.left), "self");
    expect(r.ok).toBe(false);
  });

  it("fails closed when a capsule is tampered (stale hash) before comparison", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const c = await capsules();
    const forged = JSON.parse(j(c.right));
    forged.receipts.find((x: { id: string }) => x.id === "receipt:metric").content = "tampered";
    const r = await compareRunsAction(j(c.left), j(forged), "which provider?");
    expect(r.ok).toBe(false);
  });

  it("rejects non-JSON input with a side-specific message", async () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    const c = await capsules();
    const r = await compareRunsAction("not json", j(c.right), "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/left capsule/i);
  });
});

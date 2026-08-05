import { describe, expect, it } from "vitest";
import { validatePackage } from "@/lib/workstream/package";
import { featureFixture, debuggingFixture } from "../../tools/session-synthesis/fixtures.mjs";
import { synthesizeSession, validateSessionBundle } from "../../tools/session-synthesis/session-synthesis.mjs";

describe("session-to-explain synthesis boundary", () => {
  for (const [name, fixture] of [["feature", featureFixture], ["debugging", debuggingFixture]] as const) {
    it(`mints a deterministic, portable ${name} explanation`, () => {
      const first = synthesizeSession(fixture());
      const second = synthesizeSession(fixture());
      expect(first.package.checkpointId).toBe(second.package.checkpointId);
      expect(first.package.sessionSha256).toBe(second.package.sessionSha256);
      expect(first.html).toBe(second.html);
      const validated = validatePackage(first.package);
      expect(validated.ok).toBe(true);
      expect(first.package.session.quotes.length).toBeGreaterThanOrEqual(2);
      expect(first.package.session.view.steps.length).toBeGreaterThan(0);
      expect(first.package.brief.receipt.publication).toBe("local_only");
    });
  }

  it("binds exact quotes and gives each selected view step evidence", () => {
    const bundle = featureFixture();
    const { package: pkg, html } = synthesizeSession(bundle);
    for (const quote of pkg.session.quotes) {
      const source = pkg.rawSources.find((item: { id: string }) => item.id === quote.sourceId);
      expect(source?.content).toBe(quote.text);
      expect(html).toContain(quote.sha256.slice(0, 16));
      expect(html).toContain(quote.locator);
    }
    expect(pkg.session.view.steps.every((step: { evidenceSourceIds: string[] }) => step.evidenceSourceIds.length > 0)).toBe(true);
  });

  it("answers the eight comprehension questions from the feature artifact", () => {
    const { package: pkg } = synthesizeSession(featureFixture());
    expect(pkg.brief.objective).toBeTruthy();
    expect(pkg.brief.currentOutcome.text).toContain("file change");
    expect(pkg.brief.sinceLastLooked.length).toBeGreaterThanOrEqual(2);
    expect(pkg.brief.reviewFirst[0].text).toContain("validation");
    expect(pkg.session.view.steps.length).toBeGreaterThanOrEqual(2);
    expect(pkg.brief.verification[0].text).toContain("8 tests passed");
    expect(pkg.brief.reviewFirst.length).toBeGreaterThan(0);
    expect(pkg.brief.unknowns.length).toBeGreaterThan(0);
  });

  it("fails closed on quote tamper and dangling objective", () => {
    const tampered = featureFixture();
    tampered.excerpts[0].text = "tampered";
    expect(() => validateSessionBundle(tampered)).toThrow(/sha256/);
    const dangling = featureFixture();
    dangling.objective.sourceId = "ghost";
    expect(() => validateSessionBundle(dangling)).toThrow(/does not resolve/);
  });

  it("excludes the secret canary from package and HTML", () => {
    const result = synthesizeSession(debuggingFixture());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE_CANARY");
    expect(serialized).not.toMatch(/AKIA[0-9A-Z]{16}/);
  });
});

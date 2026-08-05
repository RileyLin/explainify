import { describe, expect, it } from "vitest";
import { validatePackage } from "@/lib/workstream/package";
import { hashExcerpt, hashToolInput } from "../../tools/session/bundle-schema.mjs";
import { sha256, stableStringify } from "../../tools/comprehension/util.mjs";
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
      expect(hashExcerpt(quote)).toBe(quote.sha256);
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
    expect(() => validateSessionBundle(dangling)).toThrow(/dangling reference/);
  });

  it("uses the producer validator for nested shapes and resultless tool status", () => {
    const unknownField = featureFixture();
    (unknownField.request as typeof unknownField.request & { injected?: boolean }).injected = true;
    expect(() => validateSessionBundle(unknownField)).toThrow(/request\.injected: unknown field/);

    const resultless = featureFixture();
    const event = {
      id: "pending",
      toolName: "Bash",
      status: "unknown",
      inputSummary: "Run a command whose result was not captured.",
      outputSummary: "",
      inputLocator: "jsonl:tool-pending#input",
      inputSha256: "",
    };
    event.inputSha256 = hashToolInput(event);
    resultless.toolEvents.push(event);
    expect(validateSessionBundle(resultless)).toEqual(resultless);
    resultless.toolEvents.at(-1)!.status = "succeeded";
    expect(() => validateSessionBundle(resultless)).toThrow(/inputSha256.*hash mismatch/);
  });

  it("binds the session extension, quote sources, and view-step sources", () => {
    const { package: pkg } = synthesizeSession(featureFixture());

    const staleSession = structuredClone(pkg);
    staleSession.session.view.steps[0].detail = "FORGED ARCHITECTURE";
    expect(validatePackage(staleSession)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/sessionSha256/),
    });

    const forgedQuote = structuredClone(pkg);
    forgedQuote.session.quotes[0].text = "FORGED QUOTE";
    forgedQuote.sessionSha256 = sha256(stableStringify(forgedQuote.session));
    expect(validatePackage(forgedQuote)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/quote .*hash/),
    });

    const sourceMismatch = structuredClone(pkg);
    sourceMismatch.session.quotes[0].text = "FORGED QUOTE";
    sourceMismatch.session.quotes[0].sha256 = hashExcerpt(sourceMismatch.session.quotes[0]);
    sourceMismatch.sessionSha256 = sha256(stableStringify(sourceMismatch.session));
    expect(validatePackage(sourceMismatch)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/text does not match source/),
    });

    const relabeledQuote = structuredClone(pkg);
    relabeledQuote.session.quotes[0].locator = relabeledQuote.session.quotes[1].locator;
    relabeledQuote.session.quotes[0].sha256 = hashExcerpt(relabeledQuote.session.quotes[0]);
    relabeledQuote.sessionSha256 = sha256(stableStringify(relabeledQuote.session));
    expect(validatePackage(relabeledQuote)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/locator/),
    });

    const danglingStep = structuredClone(pkg);
    danglingStep.session.view.steps[0].evidenceSourceIds = ["ghost-source"];
    danglingStep.sessionSha256 = sha256(stableStringify(danglingStep.session));
    expect(validatePackage(danglingStep)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/absent or uncaptured/),
    });

    const unknownField = structuredClone(pkg) as typeof pkg & {
      session: typeof pkg.session & { injected?: boolean };
    };
    unknownField.session.injected = true;
    unknownField.sessionSha256 = sha256(stableStringify(unknownField.session));
    expect(validatePackage(unknownField)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unknown fields: injected/),
    });
  });

  it("fails closed when a valid re-hashed bundle contains a secret canary", () => {
    const canary = debuggingFixture();
    canary.excerpts[1].text = "PRIVATE_CANARY";
    canary.excerpts[1].sha256 = hashExcerpt(canary.excerpts[1]);
    expect(() => synthesizeSession(canary)).toThrow(/Secret scan failed/);
  });
});

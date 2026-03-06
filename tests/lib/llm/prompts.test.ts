import { describe, it, expect } from "vitest";
import { getSystemPrompt, type TemplateChoice } from "@/lib/llm/prompts";

describe("getSystemPrompt", () => {
  const templateTypes: TemplateChoice[] = [
    "auto",
    "flow-animator",
    "code-walkthrough",
    "concept-builder",
  ];

  it.each(templateTypes)("returns a non-empty prompt for '%s'", (template) => {
    const prompt = getSystemPrompt(template);
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("flow-animator prompt includes schema shape", () => {
    const prompt = getSystemPrompt("flow-animator");
    expect(prompt).toContain('"template": "flow-animator"');
    expect(prompt).toContain("nodes");
    expect(prompt).toContain("connections");
  });

  it("code-walkthrough prompt includes schema shape", () => {
    const prompt = getSystemPrompt("code-walkthrough");
    expect(prompt).toContain('"template": "code-walkthrough"');
    expect(prompt).toContain("blocks");
    expect(prompt).toContain("annotations");
    expect(prompt).toContain("startLine");
    expect(prompt).toContain("endLine");
  });

  it("concept-builder prompt includes schema shape", () => {
    const prompt = getSystemPrompt("concept-builder");
    expect(prompt).toContain('"template": "concept-builder"');
    expect(prompt).toContain("layers");
  });

  it("auto prompt includes all three template schemas", () => {
    const prompt = getSystemPrompt("auto");
    expect(prompt).toContain("flow-animator");
    expect(prompt).toContain("code-walkthrough");
    expect(prompt).toContain("concept-builder");
  });
});

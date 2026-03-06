import { describe, it, expect } from "vitest";
import { getSystemPrompt, type TemplateChoice } from "@/lib/llm/prompts";

describe("getSystemPrompt", () => {
  const templateTypes: TemplateChoice[] = [
    "auto",
    "flow-animator",
    "code-walkthrough",
    "concept-builder",
    "compare-contrast",
    "decision-tree",
    "timeline",
    "component-explorer",
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

  it("compare-contrast prompt includes schema shape", () => {
    const prompt = getSystemPrompt("compare-contrast");
    expect(prompt).toContain('"template": "compare-contrast"');
    expect(prompt).toContain("items");
    expect(prompt).toContain("dimensions");
    expect(prompt).toContain("comparison");
    expect(prompt).toContain("pros");
    expect(prompt).toContain("cons");
  });

  it("decision-tree prompt includes schema shape", () => {
    const prompt = getSystemPrompt("decision-tree");
    expect(prompt).toContain('"template": "decision-tree"');
    expect(prompt).toContain("rootId");
    expect(prompt).toContain("nodes");
    expect(prompt).toContain("edges");
    expect(prompt).toContain("isLeaf");
  });

  it("timeline prompt includes schema shape", () => {
    const prompt = getSystemPrompt("timeline");
    expect(prompt).toContain('"template": "timeline"');
    expect(prompt).toContain("events");
    expect(prompt).toContain("direction");
    expect(prompt).toContain("date");
    expect(prompt).toContain("period");
  });

  it("component-explorer prompt includes schema shape", () => {
    const prompt = getSystemPrompt("component-explorer");
    expect(prompt).toContain('"template": "component-explorer"');
    expect(prompt).toContain("components");
    expect(prompt).toContain("connections");
    expect(prompt).toContain("categories");
  });

  it("auto prompt includes all seven template schemas", () => {
    const prompt = getSystemPrompt("auto");
    expect(prompt).toContain("flow-animator");
    expect(prompt).toContain("code-walkthrough");
    expect(prompt).toContain("concept-builder");
    expect(prompt).toContain("compare-contrast");
    expect(prompt).toContain("decision-tree");
    expect(prompt).toContain("timeline");
    expect(prompt).toContain("component-explorer");
  });
});

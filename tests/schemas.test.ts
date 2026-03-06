import { describe, it, expect } from "vitest";
import {
  ExplainerDataSchema,
  FlowAnimatorDataSchema,
  CodeWalkthroughDataSchema,
  ConceptBuilderDataSchema,
} from "../src/lib/schemas/base";

// ── Sample valid data ───────────────────────────────────────────────
const validFlow = {
  template: "flow-animator" as const,
  meta: { title: "Test Flow", summary: "A test", difficulty: "beginner" as const, template: "flow-animator" as const },
  nodes: [
    { id: "a", label: "Start", description: "begin" },
    { id: "b", label: "End", description: "finish" },
  ],
  connections: [{ from: "a", to: "b", label: "next", animated: true }],
  stepOrder: ["a", "b"],
};

const validCode = {
  template: "code-walkthrough" as const,
  meta: { title: "Test Code", summary: "A code walkthrough", difficulty: "intermediate" as const, template: "code-walkthrough" as const },
  blocks: [{ id: "b1", language: "typescript", code: "const x = 1;" }],
  annotations: [{ id: "a1", blockId: "b1", startLine: 1, endLine: 1, label: "Variable", explanation: "Declares x" }],
  stepOrder: ["a1"],
};

const validConcept = {
  template: "concept-builder" as const,
  meta: { title: "Test Concept", summary: "Layered concept", difficulty: "advanced" as const, template: "concept-builder" as const },
  layers: [
    { id: "l1", title: "Base", description: "Foundation layer" },
    { id: "l2", title: "Middle", description: "Intermediate layer", icon: "layers" },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────
describe("FlowAnimatorDataSchema", () => {
  it("parses valid flow data", () => {
    const result = FlowAnimatorDataSchema.parse(validFlow);
    expect(result.template).toBe("flow-animator");
    expect(result.nodes).toHaveLength(2);
  });

  it("rejects empty nodes array", () => {
    expect(() =>
      FlowAnimatorDataSchema.parse({ ...validFlow, nodes: [] })
    ).toThrow();
  });

  it("rejects missing meta title", () => {
    expect(() =>
      FlowAnimatorDataSchema.parse({
        ...validFlow,
        meta: { ...validFlow.meta, title: "" },
      })
    ).toThrow();
  });

  it("accepts optional fields on nodes", () => {
    const withOptionals = {
      ...validFlow,
      nodes: [
        {
          id: "x",
          label: "X",
          description: "desc",
          icon: "zap",
          details: "More info",
          codeSnippet: "console.log('hi')",
          position: { x: 100, y: 200 },
        },
      ],
    };
    const result = FlowAnimatorDataSchema.parse(withOptionals);
    expect(result.nodes[0].icon).toBe("zap");
    expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
  });
});

describe("CodeWalkthroughDataSchema", () => {
  it("parses valid code walkthrough data", () => {
    const result = CodeWalkthroughDataSchema.parse(validCode);
    expect(result.template).toBe("code-walkthrough");
    expect(result.blocks).toHaveLength(1);
    expect(result.annotations).toHaveLength(1);
  });

  it("rejects empty stepOrder", () => {
    expect(() =>
      CodeWalkthroughDataSchema.parse({ ...validCode, stepOrder: [] })
    ).toThrow();
  });

  it("rejects negative line numbers", () => {
    expect(() =>
      CodeWalkthroughDataSchema.parse({
        ...validCode,
        annotations: [{ ...validCode.annotations[0], startLine: 0 }],
      })
    ).toThrow();
  });
});

describe("ConceptBuilderDataSchema", () => {
  it("parses valid concept builder data", () => {
    const result = ConceptBuilderDataSchema.parse(validConcept);
    expect(result.template).toBe("concept-builder");
    expect(result.layers).toHaveLength(2);
  });

  it("rejects empty layers", () => {
    expect(() =>
      ConceptBuilderDataSchema.parse({ ...validConcept, layers: [] })
    ).toThrow();
  });
});

describe("ExplainerDataSchema (discriminated union)", () => {
  it("parses flow data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validFlow);
    expect(result.template).toBe("flow-animator");
  });

  it("parses code data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validCode);
    expect(result.template).toBe("code-walkthrough");
  });

  it("parses concept data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validConcept);
    expect(result.template).toBe("concept-builder");
  });

  it("rejects unknown template type", () => {
    expect(() =>
      ExplainerDataSchema.parse({ ...validFlow, template: "nonexistent" })
    ).toThrow();
  });

  it("rejects data missing required fields for its template", () => {
    // Flow data missing nodes
    expect(() =>
      ExplainerDataSchema.parse({ template: "flow-animator", meta: validFlow.meta })
    ).toThrow();
  });
});

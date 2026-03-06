import { describe, it, expect } from "vitest";
import {
  ExplainerDataSchema,
  FlowAnimatorDataSchema,
  CodeWalkthroughDataSchema,
  ConceptBuilderDataSchema,
  CompareContrastDataSchema,
  DecisionTreeDataSchema,
  TimelineDataSchema,
  ComponentExplorerDataSchema,
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

const validCompare = {
  template: "compare-contrast" as const,
  meta: { title: "A vs B", summary: "Comparison", difficulty: "beginner" as const, template: "compare-contrast" as const },
  items: [
    { id: "a", name: "Option A", description: "First option", pros: ["Fast"], cons: ["Expensive"] },
    { id: "b", name: "Option B", description: "Second option", pros: ["Cheap"], cons: ["Slow"] },
  ],
  dimensions: [{ id: "d1", name: "Speed", description: "How fast" }],
  comparison: [{ dimensionId: "d1", ratings: [{ itemId: "a", value: "Very fast", score: 9 }, { itemId: "b", value: "Slow", score: 3 }] }],
};

const validDecision = {
  template: "decision-tree" as const,
  meta: { title: "Choose X", summary: "Decision guide", difficulty: "beginner" as const, template: "decision-tree" as const },
  rootId: "q1",
  nodes: [
    { id: "q1", question: "Need speed?", description: "Consider performance.", isLeaf: false },
    { id: "a1", answer: "Use Rust", description: "Fast systems language.", isLeaf: true },
    { id: "a2", answer: "Use Python", description: "Easy scripting.", isLeaf: true },
  ],
  edges: [
    { from: "q1", to: "a1", label: "Yes" },
    { from: "q1", to: "a2", label: "No" },
  ],
};

const validTimeline = {
  template: "timeline" as const,
  meta: { title: "JS History", summary: "Key events", difficulty: "beginner" as const, template: "timeline" as const },
  events: [
    { id: "e1", title: "JS Created", date: "1995", description: "Brendan Eich creates JavaScript." },
    { id: "e2", title: "Node.js", period: "Late 2000s", description: "JS on the server.", tags: ["runtime"] },
  ],
  direction: "vertical" as const,
};

const validExplorer = {
  template: "component-explorer" as const,
  meta: { title: "System Architecture", summary: "Components overview", difficulty: "intermediate" as const, template: "component-explorer" as const },
  components: [
    { id: "c1", name: "Frontend", description: "React app", category: "client" },
    { id: "c2", name: "API", description: "REST API", category: "server" },
  ],
  connections: [{ from: "c1", to: "c2", label: "HTTP", type: "data" as const }],
  categories: [{ id: "client", name: "Client", color: "#3b82f6" }, { id: "server", name: "Server" }],
};

// ── Flow Animator Tests ──────────────────────────────────────────
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

// ── Code Walkthrough Tests ──────────────────────────────────────
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

// ── Concept Builder Tests ───────────────────────────────────────
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

// ── Compare & Contrast Tests ────────────────────────────────────
describe("CompareContrastDataSchema", () => {
  it("parses valid compare data", () => {
    const result = CompareContrastDataSchema.parse(validCompare);
    expect(result.template).toBe("compare-contrast");
    expect(result.items).toHaveLength(2);
    expect(result.dimensions).toHaveLength(1);
    expect(result.comparison).toHaveLength(1);
  });

  it("rejects less than 2 items", () => {
    expect(() =>
      CompareContrastDataSchema.parse({
        ...validCompare,
        items: [validCompare.items[0]],
      })
    ).toThrow();
  });

  it("rejects more than 4 items", () => {
    expect(() =>
      CompareContrastDataSchema.parse({
        ...validCompare,
        items: [
          ...validCompare.items,
          { id: "c", name: "C", description: "Third", pros: ["X"], cons: ["Y"] },
          { id: "d", name: "D", description: "Fourth", pros: ["X"], cons: ["Y"] },
          { id: "e", name: "E", description: "Fifth", pros: ["X"], cons: ["Y"] },
        ],
      })
    ).toThrow();
  });

  it("requires at least one pro and one con per item", () => {
    expect(() =>
      CompareContrastDataSchema.parse({
        ...validCompare,
        items: [
          { id: "a", name: "A", description: "Desc", pros: [], cons: ["Bad"] },
          { id: "b", name: "B", description: "Desc", pros: ["Good"], cons: ["Bad"] },
        ],
      })
    ).toThrow();
  });

  it("accepts optional score on ratings", () => {
    const noScore = {
      ...validCompare,
      comparison: [{ dimensionId: "d1", ratings: [{ itemId: "a", value: "Fast" }, { itemId: "b", value: "Slow" }] }],
    };
    const result = CompareContrastDataSchema.parse(noScore);
    expect(result.comparison[0].ratings[0].score).toBeUndefined();
  });

  it("rejects score out of range", () => {
    expect(() =>
      CompareContrastDataSchema.parse({
        ...validCompare,
        comparison: [{ dimensionId: "d1", ratings: [{ itemId: "a", value: "X", score: 15 }] }],
      })
    ).toThrow();
  });
});

// ── Decision Tree Tests ─────────────────────────────────────────
describe("DecisionTreeDataSchema", () => {
  it("parses valid decision tree data", () => {
    const result = DecisionTreeDataSchema.parse(validDecision);
    expect(result.template).toBe("decision-tree");
    expect(result.rootId).toBe("q1");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it("rejects fewer than 2 nodes", () => {
    expect(() =>
      DecisionTreeDataSchema.parse({
        ...validDecision,
        nodes: [validDecision.nodes[0]],
      })
    ).toThrow();
  });

  it("rejects empty edges", () => {
    expect(() =>
      DecisionTreeDataSchema.parse({ ...validDecision, edges: [] })
    ).toThrow();
  });

  it("rejects empty rootId", () => {
    expect(() =>
      DecisionTreeDataSchema.parse({ ...validDecision, rootId: "" })
    ).toThrow();
  });

  it("accepts optional question and answer", () => {
    const result = DecisionTreeDataSchema.parse(validDecision);
    expect(result.nodes[0].question).toBe("Need speed?");
    expect(result.nodes[0].answer).toBeUndefined();
    expect(result.nodes[1].answer).toBe("Use Rust");
    expect(result.nodes[1].question).toBeUndefined();
  });
});

// ── Timeline Tests ──────────────────────────────────────────────
describe("TimelineDataSchema", () => {
  it("parses valid timeline data", () => {
    const result = TimelineDataSchema.parse(validTimeline);
    expect(result.template).toBe("timeline");
    expect(result.events).toHaveLength(2);
    expect(result.direction).toBe("vertical");
  });

  it("rejects empty events", () => {
    expect(() =>
      TimelineDataSchema.parse({ ...validTimeline, events: [] })
    ).toThrow();
  });

  it("rejects invalid direction", () => {
    expect(() =>
      TimelineDataSchema.parse({ ...validTimeline, direction: "diagonal" })
    ).toThrow();
  });

  it("accepts both date and period", () => {
    const withBoth = {
      ...validTimeline,
      events: [{ id: "e1", title: "Event", date: "2020", period: "Early 2020s", description: "Desc" }],
    };
    const result = TimelineDataSchema.parse(withBoth);
    expect(result.events[0].date).toBe("2020");
    expect(result.events[0].period).toBe("Early 2020s");
  });

  it("handles optional fields (details, icon, tags)", () => {
    const result = TimelineDataSchema.parse(validTimeline);
    expect(result.events[0].details).toBeUndefined();
    expect(result.events[0].icon).toBeUndefined();
    expect(result.events[0].tags).toBeUndefined();
  });
});

// ── Component Explorer Tests ────────────────────────────────────
describe("ComponentExplorerDataSchema", () => {
  it("parses valid explorer data", () => {
    const result = ComponentExplorerDataSchema.parse(validExplorer);
    expect(result.template).toBe("component-explorer");
    expect(result.components).toHaveLength(2);
    expect(result.connections).toHaveLength(1);
    expect(result.categories).toHaveLength(2);
  });

  it("rejects empty components", () => {
    expect(() =>
      ComponentExplorerDataSchema.parse({ ...validExplorer, components: [] })
    ).toThrow();
  });

  it("accepts empty connections", () => {
    const result = ComponentExplorerDataSchema.parse({ ...validExplorer, connections: [] });
    expect(result.connections).toHaveLength(0);
  });

  it("accepts missing categories", () => {
    const noCategories = { ...validExplorer };
    delete (noCategories as any).categories;
    const result = ComponentExplorerDataSchema.parse(noCategories);
    expect(result.categories).toBeUndefined();
  });

  it("validates connection type enum", () => {
    expect(() =>
      ComponentExplorerDataSchema.parse({
        ...validExplorer,
        connections: [{ from: "c1", to: "c2", type: "invalid" }],
      })
    ).toThrow();
  });

  it("accepts all valid connection types", () => {
    const result = ComponentExplorerDataSchema.parse({
      ...validExplorer,
      connections: [
        { from: "c1", to: "c2", type: "data" },
        { from: "c2", to: "c1", type: "control" },
        { from: "c1", to: "c2", type: "dependency" },
      ],
    });
    expect(result.connections).toHaveLength(3);
  });

  it("accepts optional position on components", () => {
    const withPos = {
      ...validExplorer,
      components: [
        { id: "c1", name: "Frontend", description: "React app", position: { x: 100, y: 200 } },
      ],
    };
    const result = ComponentExplorerDataSchema.parse(withPos);
    expect(result.components[0].position).toEqual({ x: 100, y: 200 });
  });
});

// ── Discriminated Union Tests ───────────────────────────────────
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

  it("parses compare data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validCompare);
    expect(result.template).toBe("compare-contrast");
  });

  it("parses decision data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validDecision);
    expect(result.template).toBe("decision-tree");
  });

  it("parses timeline data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validTimeline);
    expect(result.template).toBe("timeline");
  });

  it("parses explorer data via discriminated union", () => {
    const result = ExplainerDataSchema.parse(validExplorer);
    expect(result.template).toBe("component-explorer");
  });

  it("rejects unknown template type", () => {
    expect(() =>
      ExplainerDataSchema.parse({ ...validFlow, template: "nonexistent" })
    ).toThrow();
  });

  it("rejects data missing required fields for its template", () => {
    expect(() =>
      ExplainerDataSchema.parse({ template: "flow-animator", meta: validFlow.meta })
    ).toThrow();
  });
});

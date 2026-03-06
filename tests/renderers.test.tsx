import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { sampleFlowData, sampleCodeData, sampleConceptData } from "./sample-data";

// Mock ReactFlow since it requires browser layout APIs
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
  useReactFlow: () => ({ fitView: vi.fn(), setCenter: vi.fn() }),
}));

// Mock shiki
vi.mock("shiki", () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: (code: string) => `<pre><code>${code}</code></pre>`,
    getLoadedLanguages: () => ["typescript", "javascript"],
  }),
}));

// Import after mocks
import { FlowAnimator } from "../src/components/renderers/flow-animator";
import { CodeWalkthrough } from "../src/components/renderers/code-walkthrough";
import { ConceptBuilder } from "../src/components/renderers/concept-builder";

describe("FlowAnimator", () => {
  it("renders title and summary", () => {
    render(<FlowAnimator data={sampleFlowData} />);
    expect(screen.getByText("API Request Flow")).toBeInTheDocument();
    expect(screen.getByText("How a request flows through the system")).toBeInTheDocument();
  });

  it("renders step counter", () => {
    render(<FlowAnimator data={sampleFlowData} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});

describe("CodeWalkthrough", () => {
  it("renders title and summary", () => {
    render(<CodeWalkthrough data={sampleCodeData} />);
    expect(screen.getByText("React useState Hook")).toBeInTheDocument();
    expect(screen.getByText("Understanding state management in React")).toBeInTheDocument();
  });

  it("renders step counter", () => {
    render(<CodeWalkthrough data={sampleCodeData} />);
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });
});

describe("ConceptBuilder", () => {
  it("renders title and summary", () => {
    render(<ConceptBuilder data={sampleConceptData} />);
    expect(screen.getByText("Neural Networks")).toBeInTheDocument();
    expect(screen.getByText("From perceptron to deep learning")).toBeInTheDocument();
  });

  it("shows only first layer initially", () => {
    render(<ConceptBuilder data={sampleConceptData} />);
    expect(screen.getByText("Perceptron")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Layer")).not.toBeInTheDocument();
  });

  it("shows Add complexity button", () => {
    render(<ConceptBuilder data={sampleConceptData} />);
    expect(screen.getByText("Add complexity")).toBeInTheDocument();
  });
});

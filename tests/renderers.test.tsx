import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  sampleFlowData,
  sampleCodeData,
  sampleConceptData,
  sampleCompareData,
  sampleDecisionData,
  sampleTimelineData,
  sampleExplorerData,
} from "./sample-data";

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
import { CompareContrast } from "../src/components/renderers/compare-contrast";
import { DecisionTree } from "../src/components/renderers/decision-tree";
import { Timeline } from "../src/components/renderers/timeline";
import { ComponentExplorer } from "../src/components/renderers/component-explorer";

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

describe("CompareContrast", () => {
  it("renders title and summary", () => {
    render(<CompareContrast data={sampleCompareData} />);
    expect(screen.getByText("React vs Vue")).toBeInTheDocument();
    expect(screen.getByText("Comparing two popular frontend frameworks")).toBeInTheDocument();
  });

  it("renders item names", () => {
    render(<CompareContrast data={sampleCompareData} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
  });

  it("shows pros and cons", () => {
    render(<CompareContrast data={sampleCompareData} />);
    expect(screen.getByText("Huge ecosystem")).toBeInTheDocument();
    expect(screen.getByText("Steep learning curve")).toBeInTheDocument();
  });

  it("has tab switcher", () => {
    render(<CompareContrast data={sampleCompareData} />);
    expect(screen.getByText("Pros & Cons")).toBeInTheDocument();
    expect(screen.getByText("Comparison Matrix")).toBeInTheDocument();
  });
});

describe("DecisionTree", () => {
  it("renders title and summary", () => {
    render(<DecisionTree data={sampleDecisionData} />);
    expect(screen.getByText("Choose a Database")).toBeInTheDocument();
    expect(screen.getByText("A guide for picking the right database")).toBeInTheDocument();
  });

  it("shows root question", () => {
    render(<DecisionTree data={sampleDecisionData} />);
    expect(screen.getByText("What type of data?")).toBeInTheDocument();
  });

  it("shows edge labels as choices", () => {
    render(<DecisionTree data={sampleDecisionData} />);
    expect(screen.getByText("Structured")).toBeInTheDocument();
  });

  it("shows step counter", () => {
    render(<DecisionTree data={sampleDecisionData} />);
    expect(screen.getByText(/Step 1 of/)).toBeInTheDocument();
  });
});

describe("Timeline", () => {
  it("renders title and summary", () => {
    render(<Timeline data={sampleTimelineData} />);
    expect(screen.getByText("JavaScript History")).toBeInTheDocument();
    expect(screen.getByText("Key milestones in JS evolution")).toBeInTheDocument();
  });

  it("renders event titles", () => {
    render(<Timeline data={sampleTimelineData} />);
    expect(screen.getByText("JavaScript Created")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.getByText("ES6")).toBeInTheDocument();
  });

  it("shows event count", () => {
    render(<Timeline data={sampleTimelineData} />);
    expect(screen.getByText("3 events")).toBeInTheDocument();
  });

  it("renders tags as pills", () => {
    render(<Timeline data={sampleTimelineData} />);
    expect(screen.getByText("milestone")).toBeInTheDocument();
    expect(screen.getByText("runtime")).toBeInTheDocument();
  });
});

describe("ComponentExplorer", () => {
  it("renders title and summary", () => {
    render(<ComponentExplorer data={sampleExplorerData} />);
    expect(screen.getByText("Next.js Architecture")).toBeInTheDocument();
    expect(screen.getByText("Key components of a Next.js app")).toBeInTheDocument();
  });

  it("renders React Flow canvas", () => {
    render(<ComponentExplorer data={sampleExplorerData} />);
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
  });

  it("renders category badges", () => {
    render(<ComponentExplorer data={sampleExplorerData} />);
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
  });
});

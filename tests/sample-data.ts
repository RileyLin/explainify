import type { FlowAnimatorData } from "../src/lib/schemas/flow";
import type { CodeWalkthroughData } from "../src/lib/schemas/code";
import type { ConceptBuilderData } from "../src/lib/schemas/concept";
import type { CompareContrastData } from "../src/lib/schemas/compare";
import type { DecisionTreeData } from "../src/lib/schemas/decision";
import type { TimelineData } from "../src/lib/schemas/timeline";
import type { ComponentExplorerData } from "../src/lib/schemas/explorer";

export const sampleFlowData: FlowAnimatorData = {
  template: "flow-animator",
  meta: {
    title: "API Request Flow",
    summary: "How a request flows through the system",
    difficulty: "beginner",
    template: "flow-animator",
  },
  nodes: [
    { id: "client", label: "Client", description: "Sends HTTP request", icon: "monitor" },
    { id: "api", label: "API Gateway", description: "Routes and authenticates", icon: "shield" },
    { id: "service", label: "Service", description: "Processes business logic", icon: "cog" },
  ],
  connections: [
    { from: "client", to: "api", label: "HTTPS", animated: true },
    { from: "api", to: "service", label: "gRPC", animated: true },
  ],
  stepOrder: ["client", "api", "service"],
};

export const sampleCodeData: CodeWalkthroughData = {
  template: "code-walkthrough",
  meta: {
    title: "React useState Hook",
    summary: "Understanding state management in React",
    difficulty: "intermediate",
    template: "code-walkthrough",
  },
  blocks: [
    {
      id: "counter",
      language: "typescript",
      filename: "Counter.tsx",
      code: `import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}`,
    },
  ],
  annotations: [
    {
      id: "a1",
      blockId: "counter",
      startLine: 1,
      endLine: 1,
      label: "Import",
      explanation: "Import the useState hook from React.",
    },
    {
      id: "a2",
      blockId: "counter",
      startLine: 4,
      endLine: 4,
      label: "State Declaration",
      explanation: "Declare a state variable 'count' initialized to 0.",
    },
  ],
  stepOrder: ["a1", "a2"],
};

export const sampleConceptData: ConceptBuilderData = {
  template: "concept-builder",
  meta: {
    title: "Neural Networks",
    summary: "From perceptron to deep learning",
    difficulty: "advanced",
    template: "concept-builder",
  },
  layers: [
    { id: "l1", title: "Perceptron", description: "A single neuron that takes weighted inputs.", icon: "circle" },
    { id: "l2", title: "Hidden Layer", description: "Multiple neurons forming a layer.", icon: "layers" },
    { id: "l3", title: "Deep Network", description: "Many hidden layers stacked together.", icon: "brain" },
  ],
};

export const sampleCompareData: CompareContrastData = {
  template: "compare-contrast",
  meta: {
    title: "React vs Vue",
    summary: "Comparing two popular frontend frameworks",
    difficulty: "intermediate",
    template: "compare-contrast",
  },
  items: [
    {
      id: "react",
      name: "React",
      description: "A JavaScript library by Meta",
      pros: ["Huge ecosystem", "Strong job market"],
      cons: ["Steep learning curve", "Boilerplate heavy"],
    },
    {
      id: "vue",
      name: "Vue",
      description: "The progressive framework",
      pros: ["Easy to learn", "Great docs"],
      cons: ["Smaller ecosystem", "Fewer jobs"],
    },
  ],
  dimensions: [
    { id: "perf", name: "Performance", description: "Runtime speed and bundle size" },
    { id: "dx", name: "DX", description: "Developer experience" },
  ],
  comparison: [
    {
      dimensionId: "perf",
      ratings: [
        { itemId: "react", value: "Good", score: 7 },
        { itemId: "vue", value: "Very good", score: 8 },
      ],
    },
    {
      dimensionId: "dx",
      ratings: [
        { itemId: "react", value: "Powerful but complex", score: 7 },
        { itemId: "vue", value: "Intuitive", score: 9 },
      ],
    },
  ],
};

export const sampleDecisionData: DecisionTreeData = {
  template: "decision-tree",
  meta: {
    title: "Choose a Database",
    summary: "A guide for picking the right database",
    difficulty: "beginner",
    template: "decision-tree",
  },
  rootId: "start",
  nodes: [
    { id: "start", question: "What type of data?", description: "Consider your data model.", isLeaf: false },
    { id: "structured", question: "Need ACID?", description: "Structured data.", isLeaf: false },
    { id: "postgres", answer: "PostgreSQL", description: "Reliable RDBMS.", isLeaf: true },
    { id: "mysql", answer: "MySQL", description: "Fast reads.", isLeaf: true },
  ],
  edges: [
    { from: "start", to: "structured", label: "Structured" },
    { from: "structured", to: "postgres", label: "Yes" },
    { from: "structured", to: "mysql", label: "No" },
  ],
};

export const sampleTimelineData: TimelineData = {
  template: "timeline",
  meta: {
    title: "JavaScript History",
    summary: "Key milestones in JS evolution",
    difficulty: "beginner",
    template: "timeline",
  },
  events: [
    { id: "e1", title: "JavaScript Created", date: "1995", description: "Brendan Eich creates JS.", tags: ["milestone"] },
    { id: "e2", title: "Node.js", date: "2009", description: "JS on the server.", details: "Ryan Dahl released Node.js.", tags: ["runtime"] },
    { id: "e3", title: "ES6", date: "2015", description: "Massive language update.", tags: ["standard"] },
  ],
  direction: "vertical",
};

export const sampleExplorerData: ComponentExplorerData = {
  template: "component-explorer",
  meta: {
    title: "Next.js Architecture",
    summary: "Key components of a Next.js app",
    difficulty: "intermediate",
    template: "component-explorer",
  },
  components: [
    { id: "browser", name: "Browser", description: "Client rendering", category: "client" },
    { id: "router", name: "App Router", description: "File-based routing", category: "server" },
    { id: "db", name: "Database", description: "PostgreSQL", category: "data" },
  ],
  connections: [
    { from: "browser", to: "router", label: "Request", type: "data" },
    { from: "router", to: "db", label: "Query", type: "data" },
  ],
  categories: [
    { id: "client", name: "Client", color: "#3b82f6" },
    { id: "server", name: "Server", color: "#10b981" },
    { id: "data", name: "Data", color: "#8b5cf6" },
  ],
};

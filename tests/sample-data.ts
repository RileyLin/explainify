import type { FlowAnimatorData } from "../src/lib/schemas/flow";
import type { CodeWalkthroughData } from "../src/lib/schemas/code";
import type { ConceptBuilderData } from "../src/lib/schemas/concept";

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

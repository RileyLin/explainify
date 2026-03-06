"use client";

import type { ExplainerData } from "@/lib/schemas/base";
import {
  FlowAnimator,
  CodeWalkthrough,
  ConceptBuilder,
  CompareContrast,
  DecisionTree,
  TimelineRenderer,
  ComponentExplorer,
} from "@/components/renderers/renderer-registry";

interface ExplainerViewerProps {
  data: ExplainerData;
}

export function ExplainerViewer({ data }: ExplainerViewerProps) {
  switch (data.template) {
    case "flow-animator":
      return <FlowAnimator data={data} />;
    case "code-walkthrough":
      return <CodeWalkthrough data={data} />;
    case "concept-builder":
      return <ConceptBuilder data={data} />;
    case "compare-contrast":
      return <CompareContrast data={data} />;
    case "decision-tree":
      return <DecisionTree data={data} />;
    case "timeline":
      return <TimelineRenderer data={data} />;
    case "component-explorer":
      return <ComponentExplorer data={data} />;
    default:
      return (
        <div className="text-center py-12 text-muted-foreground">
          Unknown template type
        </div>
      );
  }
}

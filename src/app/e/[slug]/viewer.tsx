"use client";

import React from "react";
import type { ExplainerData } from "@/lib/schemas/base";
import type { FlowAnimatorData } from "@/lib/schemas/flow";
import {
  FlowAnimator,
  MoleculeRenderer,
  CodeWalkthrough,
  ConceptBuilder,
  CompareContrast,
  DecisionTree,
  TimelineRenderer,
  ComponentExplorer,
} from "@/components/renderers/renderer-registry";

interface ExplainerViewerProps {
  data: ExplainerData;
  diagramRef?: React.RefObject<HTMLDivElement | null>;
}

export function ExplainerViewer({ data, diagramRef }: ExplainerViewerProps) {
  let content: React.ReactNode;
  switch (data.template) {
    case "flow-animator":
      content = <FlowAnimator data={data} />;
      break;
    case "molecule":
      // MoleculeData has the same shape as FlowAnimatorData — safe cast
      content = <MoleculeRenderer data={data as unknown as FlowAnimatorData} />;
      break;
    case "code-walkthrough":
      content = <CodeWalkthrough data={data} />;
      break;
    case "concept-builder":
      content = <ConceptBuilder data={data} />;
      break;
    case "compare-contrast":
      content = <CompareContrast data={data} />;
      break;
    case "decision-tree":
      content = <DecisionTree data={data} />;
      break;
    case "timeline":
      content = <TimelineRenderer data={data} />;
      break;
    case "component-explorer":
      content = <ComponentExplorer data={data} />;
      break;
    default:
      content = (
        <div className="text-center py-12 text-muted-foreground">
          Unknown template type
        </div>
      );
  }
  return <div ref={diagramRef}>{content}</div>;
}

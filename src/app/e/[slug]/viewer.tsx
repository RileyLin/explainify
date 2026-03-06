"use client";

import type { ExplainerData } from "@/lib/schemas/base";
import {
  FlowAnimator,
  CodeWalkthrough,
  ConceptBuilder,
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
    default:
      return (
        <div className="text-center py-12 text-muted-foreground">
          Unknown template type
        </div>
      );
  }
}

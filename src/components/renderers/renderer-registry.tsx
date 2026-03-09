import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { FlowAnimatorData } from "@/lib/schemas/flow";
import type { CodeWalkthroughData } from "@/lib/schemas/code";
import type { ConceptBuilderData } from "@/lib/schemas/concept";
import type { CompareContrastData } from "@/lib/schemas/compare";
import type { DecisionTreeData } from "@/lib/schemas/decision";
import type { TimelineData } from "@/lib/schemas/timeline";
import type { ComponentExplorerData } from "@/lib/schemas/explorer";

const loading = () => <div className="animate-pulse h-96 bg-muted rounded-lg" />;

export const FlowAnimator = dynamic<{ data: FlowAnimatorData }>(
  () => import("./flow-animator").then((m) => m.FlowAnimator),
  { ssr: false, loading }
);

export const MoleculeRenderer = dynamic<{ data: FlowAnimatorData }>(
  () => import("./molecule").then((m) => m.MoleculeRenderer),
  { ssr: false, loading }
);

export const CodeWalkthrough = dynamic<{ data: CodeWalkthroughData }>(
  () => import("./code-walkthrough").then((m) => m.CodeWalkthrough),
  { ssr: false, loading }
);

export const ConceptBuilder = dynamic<{ data: ConceptBuilderData }>(
  () => import("./concept-builder").then((m) => m.ConceptBuilder),
  { ssr: false, loading }
);

export const CompareContrast = dynamic<{ data: CompareContrastData }>(
  () => import("./compare-contrast").then((m) => m.CompareContrast),
  { ssr: false, loading }
);

export const DecisionTree = dynamic<{ data: DecisionTreeData }>(
  () => import("./decision-tree").then((m) => m.DecisionTree),
  { ssr: false, loading }
);

export const TimelineRenderer = dynamic<{ data: TimelineData }>(
  () => import("./timeline").then((m) => m.Timeline),
  { ssr: false, loading }
);

export const ComponentExplorer = dynamic<{ data: ComponentExplorerData }>(
  () => import("./component-explorer").then((m) => m.ComponentExplorer),
  { ssr: false, loading }
);

export type TemplateType =
  | "flow-animator"
  | "molecule"
  | "code-walkthrough"
  | "concept-builder"
  | "compare-contrast"
  | "decision-tree"
  | "timeline"
  | "component-explorer";

export const rendererMap: Record<TemplateType, ComponentType<{ data: any }>> = {
  "flow-animator": FlowAnimator as ComponentType<{ data: any }>,
  "molecule": MoleculeRenderer as ComponentType<{ data: any }>,
  "code-walkthrough": CodeWalkthrough as ComponentType<{ data: any }>,
  "concept-builder": ConceptBuilder as ComponentType<{ data: any }>,
  "compare-contrast": CompareContrast as ComponentType<{ data: any }>,
  "decision-tree": DecisionTree as ComponentType<{ data: any }>,
  "timeline": TimelineRenderer as ComponentType<{ data: any }>,
  "component-explorer": ComponentExplorer as ComponentType<{ data: any }>,
};

export function getRenderer(template: TemplateType): ComponentType<{ data: any }> {
  return rendererMap[template];
}

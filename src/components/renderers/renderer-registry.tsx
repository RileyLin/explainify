import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { FlowAnimatorData, MoleculeData } from "@/lib/schemas/flow";
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

export const MoleculeRenderer = dynamic<{ data: MoleculeData }>(
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

interface RendererDataMap {
  "flow-animator": FlowAnimatorData;
  molecule: MoleculeData;
  "code-walkthrough": CodeWalkthroughData;
  "concept-builder": ConceptBuilderData;
  "compare-contrast": CompareContrastData;
  "decision-tree": DecisionTreeData;
  timeline: TimelineData;
  "component-explorer": ComponentExplorerData;
}

export type TemplateType = keyof RendererDataMap;
type RendererMap = {
  [Template in TemplateType]: ComponentType<{ data: RendererDataMap[Template] }>;
};

export const rendererMap: RendererMap = {
  "flow-animator": FlowAnimator,
  molecule: MoleculeRenderer,
  "code-walkthrough": CodeWalkthrough,
  "concept-builder": ConceptBuilder,
  "compare-contrast": CompareContrast,
  "decision-tree": DecisionTree,
  timeline: TimelineRenderer,
  "component-explorer": ComponentExplorer,
};

export function getRenderer<Template extends TemplateType>(
  template: Template,
): RendererMap[Template] {
  return rendererMap[template];
}

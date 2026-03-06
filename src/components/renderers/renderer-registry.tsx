import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { FlowAnimatorData } from "@/lib/schemas/flow";
import type { CodeWalkthroughData } from "@/lib/schemas/code";
import type { ConceptBuilderData } from "@/lib/schemas/concept";

export const FlowAnimator = dynamic<{ data: FlowAnimatorData }>(
  () => import("./flow-animator").then((m) => m.FlowAnimator),
  { ssr: false, loading: () => <div className="animate-pulse h-96 bg-muted rounded-lg" /> }
);

export const CodeWalkthrough = dynamic<{ data: CodeWalkthroughData }>(
  () => import("./code-walkthrough").then((m) => m.CodeWalkthrough),
  { ssr: false, loading: () => <div className="animate-pulse h-96 bg-muted rounded-lg" /> }
);

export const ConceptBuilder = dynamic<{ data: ConceptBuilderData }>(
  () => import("./concept-builder").then((m) => m.ConceptBuilder),
  { ssr: false, loading: () => <div className="animate-pulse h-96 bg-muted rounded-lg" /> }
);

export type TemplateType = "flow-animator" | "code-walkthrough" | "concept-builder";

export const rendererMap: Record<TemplateType, ComponentType<{ data: any }>> = {
  "flow-animator": FlowAnimator as ComponentType<{ data: any }>,
  "code-walkthrough": CodeWalkthrough as ComponentType<{ data: any }>,
  "concept-builder": ConceptBuilder as ComponentType<{ data: any }>,
};

export function getRenderer(template: TemplateType): ComponentType<{ data: any }> {
  return rendererMap[template];
}

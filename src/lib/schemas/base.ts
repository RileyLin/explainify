import { z } from "zod";
import { FlowAnimatorDataSchema } from "./flow";
import { CodeWalkthroughDataSchema } from "./code";
import { ConceptBuilderDataSchema } from "./concept";
import { CompareContrastDataSchema } from "./compare";
import { DecisionTreeDataSchema } from "./decision";
import { TimelineDataSchema } from "./timeline";
import { ComponentExplorerDataSchema } from "./explorer";

export const ExplainerMetaSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  template: z.enum([
    "flow-animator",
    "code-walkthrough",
    "concept-builder",
    "compare-contrast",
    "decision-tree",
    "timeline",
    "component-explorer",
  ]),
});

export type ExplainerMeta = z.infer<typeof ExplainerMetaSchema>;

export const ExplainerDataSchema = z.discriminatedUnion("template", [
  FlowAnimatorDataSchema,
  CodeWalkthroughDataSchema,
  ConceptBuilderDataSchema,
  CompareContrastDataSchema,
  DecisionTreeDataSchema,
  TimelineDataSchema,
  ComponentExplorerDataSchema,
]);

export type ExplainerData = z.infer<typeof ExplainerDataSchema>;

// Re-export everything
export { FlowAnimatorDataSchema, type FlowAnimatorData } from "./flow";
export { FlowNodeSchema, FlowConnectionSchema, type FlowNode, type FlowConnection } from "./flow";
export { CodeWalkthroughDataSchema, type CodeWalkthroughData } from "./code";
export { CodeBlockSchema, CodeAnnotationSchema, type CodeBlock, type CodeAnnotation } from "./code";
export { ConceptBuilderDataSchema, type ConceptBuilderData } from "./concept";
export { ConceptLayerSchema, type ConceptLayer } from "./concept";
export { CompareContrastDataSchema, type CompareContrastData } from "./compare";
export { CompareItemSchema, CompareDimensionSchema, CompareRatingSchema, ComparisonRowSchema } from "./compare";
export type { CompareItem, CompareDimension, CompareRating, ComparisonRow } from "./compare";
export { DecisionTreeDataSchema, type DecisionTreeData } from "./decision";
export { DecisionNodeSchema, DecisionEdgeSchema, type DecisionNode, type DecisionEdge } from "./decision";
export { TimelineDataSchema, type TimelineData } from "./timeline";
export { TimelineEventSchema, type TimelineEvent } from "./timeline";
export { ComponentExplorerDataSchema, type ComponentExplorerData } from "./explorer";
export { ExplorerComponentSchema, ExplorerConnectionSchema, ExplorerCategorySchema } from "./explorer";
export type { ExplorerComponent, ExplorerConnection, ExplorerCategory } from "./explorer";

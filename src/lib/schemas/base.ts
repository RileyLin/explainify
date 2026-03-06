import { z } from "zod";
import { FlowAnimatorDataSchema } from "./flow";
import { CodeWalkthroughDataSchema } from "./code";
import { ConceptBuilderDataSchema } from "./concept";

export const ExplainerMetaSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  template: z.enum(["flow-animator", "code-walkthrough", "concept-builder"]),
});

export type ExplainerMeta = z.infer<typeof ExplainerMetaSchema>;

export const ExplainerDataSchema = z.discriminatedUnion("template", [
  FlowAnimatorDataSchema,
  CodeWalkthroughDataSchema,
  ConceptBuilderDataSchema,
]);

export type ExplainerData = z.infer<typeof ExplainerDataSchema>;

// Re-export everything
export { FlowAnimatorDataSchema, type FlowAnimatorData } from "./flow";
export { FlowNodeSchema, FlowConnectionSchema, type FlowNode, type FlowConnection } from "./flow";
export { CodeWalkthroughDataSchema, type CodeWalkthroughData } from "./code";
export { CodeBlockSchema, CodeAnnotationSchema, type CodeBlock, type CodeAnnotation } from "./code";
export { ConceptBuilderDataSchema, type ConceptBuilderData } from "./concept";
export { ConceptLayerSchema, type ConceptLayer } from "./concept";

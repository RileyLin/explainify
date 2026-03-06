import { z } from "zod";

export const FlowNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  icon: z.string().optional(),
  details: z.string().optional(),
  codeSnippet: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowConnectionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  animated: z.boolean().optional(),
});

export type FlowConnection = z.infer<typeof FlowConnectionSchema>;

export const FlowAnimatorDataSchema = z.object({
  template: z.literal("flow-animator"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("flow-animator"),
  }),
  nodes: z.array(FlowNodeSchema).min(1),
  connections: z.array(FlowConnectionSchema),
  stepOrder: z.array(z.string()).optional(),
});

export type FlowAnimatorData = z.infer<typeof FlowAnimatorDataSchema>;

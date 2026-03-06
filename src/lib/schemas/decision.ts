import { z } from "zod";

export const DecisionNodeSchema = z.object({
  id: z.string().min(1),
  question: z.string().optional(),
  answer: z.string().optional(),
  description: z.string().min(1),
  icon: z.string().optional(),
  isLeaf: z.boolean(),
});

export type DecisionNode = z.infer<typeof DecisionNodeSchema>;

export const DecisionEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1),
});

export type DecisionEdge = z.infer<typeof DecisionEdgeSchema>;

export const DecisionTreeDataSchema = z.object({
  template: z.literal("decision-tree"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("decision-tree"),
  }),
  rootId: z.string().min(1),
  nodes: z.array(DecisionNodeSchema).min(2),
  edges: z.array(DecisionEdgeSchema).min(1),
});

export type DecisionTreeData = z.infer<typeof DecisionTreeDataSchema>;

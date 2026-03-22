import { z } from "zod";

export const FlowNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  icon: z.string().optional(),
  details: z.string().optional(),
  codeSnippet: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  illustrationSvg: z.string().optional(),
});

export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowConnectionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  animated: z.boolean().optional(),
});

export type FlowConnection = z.infer<typeof FlowConnectionSchema>;

/**
 * renderHint tells the renderer which layout engine to use:
 * - "sequential" → clean numbered path, forced LR, no back-arrows (best for request flows, auth sequences, step-by-step processes)
 * - "graph"      → free-form Dagre network (best for architecture/component diagrams)
 * - "hierarchy"  → top-down tree (best for org charts, inheritance, folder structure)
 */
export const RenderHintSchema = z.enum(["sequential", "graph", "hierarchy"]);
export type RenderHint = z.infer<typeof RenderHintSchema>;

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
  renderHint: RenderHintSchema.optional(),
});

export type FlowAnimatorData = z.infer<typeof FlowAnimatorDataSchema>;

// Molecule renderer reuses the same node/connection schema, different template literal
export const MoleculeDataSchema = z.object({
  template: z.literal("molecule"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.string(), // lenient — gets patched post-LLM
  }),
  nodes: z.array(FlowNodeSchema).min(1),
  connections: z.array(FlowConnectionSchema),
  stepOrder: z.array(z.string()).optional(),
});

export type MoleculeData = z.infer<typeof MoleculeDataSchema>;

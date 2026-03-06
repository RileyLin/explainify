import { z } from "zod";

export const ExplorerComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  details: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export type ExplorerComponent = z.infer<typeof ExplorerComponentSchema>;

export const ExplorerConnectionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(["data", "control", "dependency"]).optional(),
});

export type ExplorerConnection = z.infer<typeof ExplorerConnectionSchema>;

export const ExplorerCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
});

export type ExplorerCategory = z.infer<typeof ExplorerCategorySchema>;

export const ComponentExplorerDataSchema = z.object({
  template: z.literal("component-explorer"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("component-explorer"),
  }),
  components: z.array(ExplorerComponentSchema).min(1),
  connections: z.array(ExplorerConnectionSchema),
  categories: z.array(ExplorerCategorySchema).optional(),
});

export type ComponentExplorerData = z.infer<typeof ComponentExplorerDataSchema>;

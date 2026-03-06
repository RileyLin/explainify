import { z } from "zod";

export const ConceptLayerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  visualLabel: z.string().optional(),
  details: z.string().optional(),
  icon: z.string().optional(),
});

export type ConceptLayer = z.infer<typeof ConceptLayerSchema>;

export const ConceptBuilderDataSchema = z.object({
  template: z.literal("concept-builder"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("concept-builder"),
  }),
  layers: z.array(ConceptLayerSchema).min(1),
});

export type ConceptBuilderData = z.infer<typeof ConceptBuilderDataSchema>;

import { z } from "zod";

export const CompareItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().optional(),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  illustrationSvg: z.string().optional(),
});

export type CompareItem = z.infer<typeof CompareItemSchema>;

export const CompareDimensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

export type CompareDimension = z.infer<typeof CompareDimensionSchema>;

export const CompareRatingSchema = z.object({
  itemId: z.string().min(1),
  value: z.string().min(1),
  score: z.number().min(0).max(10).optional(),
});

export type CompareRating = z.infer<typeof CompareRatingSchema>;

export const ComparisonRowSchema = z.object({
  dimensionId: z.string().min(1),
  ratings: z.array(CompareRatingSchema).min(1),
});

export type ComparisonRow = z.infer<typeof ComparisonRowSchema>;

export const CompareContrastDataSchema = z.object({
  template: z.literal("compare-contrast"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("compare-contrast"),
  }),
  items: z.array(CompareItemSchema).min(2).max(4),
  dimensions: z.array(CompareDimensionSchema).min(1),
  comparison: z.array(ComparisonRowSchema).min(1),
});

export type CompareContrastData = z.infer<typeof CompareContrastDataSchema>;

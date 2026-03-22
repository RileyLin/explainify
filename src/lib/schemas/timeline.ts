import { z } from "zod";

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string().optional(),
  period: z.string().optional(),
  description: z.string().min(1),
  details: z.string().optional(),
  icon: z.string().optional(),
  tags: z.array(z.string()).optional(),
  illustrationSvg: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const TimelineDataSchema = z.object({
  template: z.literal("timeline"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("timeline"),
  }),
  events: z.array(TimelineEventSchema).min(1),
  direction: z.enum(["horizontal", "vertical"]),
});

export type TimelineData = z.infer<typeof TimelineDataSchema>;

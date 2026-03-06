import { z } from "zod";

export const CodeBlockSchema = z.object({
  id: z.string().min(1),
  language: z.string().min(1),
  code: z.string().min(1),
  filename: z.string().optional(),
});

export type CodeBlock = z.infer<typeof CodeBlockSchema>;

export const CodeAnnotationSchema = z.object({
  id: z.string().min(1),
  blockId: z.string().min(1),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  label: z.string().min(1),
  explanation: z.string().min(1),
});

export type CodeAnnotation = z.infer<typeof CodeAnnotationSchema>;

export const CodeWalkthroughDataSchema = z.object({
  template: z.literal("code-walkthrough"),
  meta: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    template: z.literal("code-walkthrough"),
  }),
  blocks: z.array(CodeBlockSchema).min(1),
  annotations: z.array(CodeAnnotationSchema).min(1),
  stepOrder: z.array(z.string()).min(1),
});

export type CodeWalkthroughData = z.infer<typeof CodeWalkthroughDataSchema>;

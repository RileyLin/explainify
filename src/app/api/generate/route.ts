import { NextRequest, NextResponse } from "next/server";
import { analyzeContent, AnalysisError } from "@/lib/llm/analyzer";
import type { TemplateChoice } from "@/lib/llm/prompts";

const VALID_TEMPLATES = ["auto", "flow-animator", "code-walkthrough", "concept-builder"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, template } = body as {
      content?: string;
      template?: string;
    };

    // Validate input
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Content is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (content.length > 100_000) {
      return NextResponse.json(
        { error: "Content exceeds maximum length of 100,000 characters" },
        { status: 400 },
      );
    }

    const templateChoice: TemplateChoice =
      template && VALID_TEMPLATES.includes(template as TemplateChoice)
        ? (template as TemplateChoice)
        : "auto";

    const result = await analyzeContent(content, templateChoice);

    return NextResponse.json({
      data: result.data,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (error) {
    if (error instanceof AnalysisError) {
      const status =
        error.code === "INVALID_INPUT"
          ? 400
          : error.code === "LLM_ERROR"
            ? 502
            : 500;

      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status },
      );
    }

    console.error("Unexpected error in /api/generate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

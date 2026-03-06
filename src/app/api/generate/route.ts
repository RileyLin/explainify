import { NextRequest, NextResponse } from "next/server";
import { analyzeContent, AnalysisError } from "@/lib/llm/analyzer";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";
import type { TemplateChoice } from "@/lib/llm/prompts";

const VALID_TEMPLATES = [
  "auto",
  "flow-animator",
  "code-walkthrough",
  "concept-builder",
  "compare-contrast",
  "decision-tree",
  "timeline",
  "component-explorer",
] as const;

const FREE_TIER_LIMIT = 5; // generations per month

/**
 * Check and increment usage for authenticated users.
 * Returns null if allowed, or an error message if rate-limited.
 */
async function checkUsage(userId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const month = new Date().toISOString().slice(0, 7); // '2026-03'

  // Get current usage
  const { data: usage } = await supabase
    .from("usage")
    .select("generations")
    .eq("user_id", userId)
    .eq("month", month)
    .single();

  const currentCount = usage?.generations || 0;

  if (currentCount >= FREE_TIER_LIMIT) {
    return `You've reached the free tier limit of ${FREE_TIER_LIMIT} generations this month. Upgrade to Pro for unlimited access.`;
  }

  // Upsert the usage count
  await supabase
    .from("usage")
    .upsert(
      {
        user_id: userId,
        month,
        generations: currentCount + 1,
      },
      { onConflict: "user_id,month" }
    );

  return null;
}

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

    // Check usage for authenticated users
    const session = await auth();
    if (session?.user?.id) {
      const usageError = await checkUsage(session.user.id);
      if (usageError) {
        return NextResponse.json(
          { error: usageError, code: "RATE_LIMITED" },
          { status: 429 },
        );
      }
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

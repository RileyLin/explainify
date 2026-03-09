import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { analyzeContent, AnalysisError } from "@/lib/llm/analyzer";
import { getServiceClient } from "@/lib/db";
import type { TemplateChoice } from "@/lib/llm/prompts";

const VALID_TEMPLATES = [
  "auto",
  "flow-animator",
  "molecule",
  "code-walkthrough",
  "concept-builder",
  "compare-contrast",
  "decision-tree",
  "timeline",
  "component-explorer",
] as const;

const FREE_TIER_LIMIT = 5;

function generateSlug(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function checkApiUsage(userId: string): Promise<string | null> {
  try {
    const supabase = getServiceClient();
    const { data: user } = await supabase
      .from("users")
      .select("plan")
      .eq("id", userId)
      .single();

    if (user?.plan === "pro") {
      return null; // Pro users: unlimited
    }

    const month = new Date().toISOString().slice(0, 7);
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

    await supabase
      .from("usage")
      .upsert(
        { user_id: userId, month, generations: currentCount + 1 },
        { onConflict: "user_id,month" }
      );

    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Extract and validate API key
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>" },
      { status: 401 }
    );
  }

  const rawKey = authHeader.slice(7);
  const keyData = await validateApiKey(rawKey);
  if (!keyData) {
    return NextResponse.json(
      { error: "Invalid or revoked API key" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { content, template, title } = body as {
      content?: string;
      template?: string;
      title?: string;
    };

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (content.length > 100_000) {
      return NextResponse.json(
        { error: "content exceeds maximum length of 100,000 characters" },
        { status: 400 }
      );
    }

    // Check usage rate limit
    const usageError = await checkApiUsage(keyData.userId);
    if (usageError) {
      return NextResponse.json(
        { error: usageError, code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const templateChoice: TemplateChoice =
      template && VALID_TEMPLATES.includes(template as TemplateChoice)
        ? (template as TemplateChoice)
        : "auto";

    const result = await analyzeContent(content, templateChoice);

    // Force template field when user explicitly requested a specific template
    // (LLM always outputs the base template name in JSON, e.g. "flow-animator" even for molecule)
    const finalTemplate = templateChoice !== "auto" ? templateChoice : result.data.template;
    if (result.data.template !== finalTemplate) {
      (result.data as Record<string, unknown>).template = finalTemplate;
      // Also patch meta.template — Zod discriminated union requires both to match
      const meta = (result.data as Record<string, unknown>).meta as Record<string, unknown>;
      if (meta) meta.template = finalTemplate;
    }

    // Save to DB as public
    const supabase = getServiceClient();
    const slug = generateSlug();

    // Check if user is pro for watermark
    const { data: user } = await supabase
      .from("users")
      .select("plan")
      .eq("id", keyData.userId)
      .single();
    const isProUser = user?.plan === "pro";

    const insertData: Record<string, unknown> = {
      slug,
      title: title || result.data.meta.title,
      summary: result.data.meta.summary,
      template: finalTemplate,
      data: result.data as unknown as Record<string, unknown>,
      source_content: content,
      is_public: true,
      user_id: keyData.userId,
      show_watermark: !isProUser,
    };

    const { error: insertError } = await supabase.from("explainers").insert(insertData);
    if (insertError) {
      // Retry with different slug on collision
      if (insertError.code === "23505") {
        const retrySlug = generateSlug(10);
        await supabase.from("explainers").insert({ ...insertData, slug: retrySlug });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://explainify.driftworks.dev";
        return NextResponse.json({
          url: `${appUrl}/e/${retrySlug}`,
          slug: retrySlug,
          data: result.data,
          png_url: `${appUrl}/api/export/${retrySlug}/png`,
        });
      }
      throw new Error("Failed to save explainer");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://explainify.driftworks.dev";
    return NextResponse.json({
      url: `${appUrl}/e/${slug}`,
      slug,
      data: result.data,
      png_url: `${appUrl}/api/export/${slug}/png`,
    });
  } catch (error) {
    if (error instanceof AnalysisError) {
      const status =
        error.code === "INVALID_INPUT" ? 400
        : error.code === "LLM_ERROR" ? 502
        : 500;
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status }
      );
    }
    console.error("Unexpected error in /api/v1/explain:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

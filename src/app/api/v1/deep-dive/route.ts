import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db";
import { invokeClaudeJSON, extractJSON } from "@/lib/llm/client";
import { ExplainerDataSchema, type ExplainerData } from "@/lib/schemas/base";
import { getDeepDiveSystemPrompt, buildDeepDiveUserMessage } from "@/lib/llm/deep-dive-prompt";
import { AnalysisError } from "@/lib/llm/analyzer";
import { generateNodeImages } from "@/lib/image-gen";
import { extractImageRequests } from "@/lib/image-gen/extract-requests";

// ── In-memory rate limiter (IP-based, 10 requests/hour) ──────────────────────
interface RateEntry {
  count: number;
  resetAt: number; // epoch ms
}

const rateLimitMap = new Map<string, RateEntry>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    // Fresh window
    const resetAt = now + RATE_WINDOW_MS;
    rateLimitMap.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT - entry.count, resetAt: entry.resetAt };
}

// Periodic cleanup: purge expired entries every ~100 requests
let cleanupCounter = 0;
function maybeCleanup() {
  cleanupCounter++;
  if (cleanupCounter % 100 !== 0) return;
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}

// ── Slug generation (same as /api/v1/explain) ─────────────────────────────────
function generateSlug(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// ── Fire-and-forget image generation ─────────────────────────────────────────
/**
 * Generates images for all nodes and stores the URL map in the DB.
 * Best-effort — never throws or blocks the response.
 */
async function fireAndForgetImages(data: ExplainerData, slug: string, parentTitle?: string): Promise<void> {
  try {
    const requests = extractImageRequests(data, parentTitle);
    if (requests.length === 0) return;

    const result = await generateNodeImages(requests, slug);

    const imageUrlMap: Record<string, string> = {};
    for (const [nodeId, imgResult] of Object.entries(result.images)) {
      imageUrlMap[nodeId] = imgResult.imageUrl;
    }

    if (Object.keys(imageUrlMap).length === 0) return;

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("explainers")
      .update({ image_url: imageUrlMap })
      .eq("slug", slug);

    if (error) {
      console.error(`[image-gen] Failed to store image URLs for ${slug}:`, error.message);
    } else if (Object.keys(result.errors).length > 0) {
      console.warn(`[image-gen] Partial failures for ${slug}:`, result.errors);
    }
  } catch (err) {
    console.error(`[image-gen] Unexpected error for ${slug}:`, err);
  }
}

// ── Deep Dive Generation ──────────────────────────────────────────────────────
async function generateDeepDive(params: {
  sourceContent: string;
  nodeTitle: string;
  nodeDescription: string;
  parentTitle: string;
}): Promise<ExplainerData> {
  const systemPrompt = getDeepDiveSystemPrompt({
    nodeTitle: params.nodeTitle,
    nodeDescription: params.nodeDescription,
    parentTitle: params.parentTitle,
  });

  const userMessage = buildDeepDiveUserMessage({
    sourceContent: params.sourceContent,
    nodeTitle: params.nodeTitle,
    nodeDescription: params.nodeDescription,
  });

  // First attempt
  let firstError: unknown;
  try {
    const response = await invokeClaudeJSON({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 8192,
      temperature: 0.4, // slightly higher than normal for more creative deep dives
    });

    const jsonStr = extractJSON(response.content);
    const parsed = JSON.parse(jsonStr);
    const validated = ExplainerDataSchema.parse(parsed);
    return validated as ExplainerData;
  } catch (err) {
    firstError = err;
    // If it's an API/network error, bail immediately
    if (err instanceof AnalysisError) throw err;
    if (err instanceof Error && (err.name?.includes("Bedrock") || err.name?.includes("API"))) {
      throw new AnalysisError(`LLM API error: ${err.message}`, "LLM_ERROR", err.message);
    }
  }

  // Retry once
  const errorDetails = firstError instanceof Error ? firstError.message : String(firstError);
  try {
    const retryResponse = await invokeClaudeJSON({
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "I'll generate the JSON now." },
        {
          role: "user",
          content: `Your previous output had a validation error: ${errorDetails}\n\nPlease output ONLY valid JSON matching the exact schema. Fix the issues and try again.`,
        },
      ],
      maxTokens: 8192,
      temperature: 0.2,
    });

    const jsonStr = extractJSON(retryResponse.content);
    const parsed = JSON.parse(jsonStr);
    const validated = ExplainerDataSchema.parse(parsed);
    return validated as ExplainerData;
  } catch (retryError) {
    const retryDetails = retryError instanceof Error ? retryError.message : String(retryError);
    throw new AnalysisError(
      "Failed to generate valid deep dive after retry",
      "RETRY_EXHAUSTED",
      `First: ${errorDetails}\nRetry: ${retryDetails}`,
    );
  }
}

// ── POST /api/v1/deep-dive ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // IP-based rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  maybeCleanup();
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. You can generate up to 10 deep dives per hour.",
        code: "RATE_LIMITED",
        resetAt: new Date(rate.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((rate.resetAt - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": RATE_LIMIT.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(rate.resetAt).toISOString(),
        },
      },
    );
  }

  try {
    const body = await request.json();
    const { slug, nodeId, nodeTitle, nodeDescription } = body as {
      slug?: string;
      nodeId?: string;
      nodeTitle?: string;
      nodeDescription?: string;
      template?: string;
    };

    // Validate required fields
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    if (!nodeId || typeof nodeId !== "string") {
      return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
    }
    if (!nodeTitle || typeof nodeTitle !== "string" || !nodeTitle.trim()) {
      return NextResponse.json({ error: "nodeTitle is required" }, { status: 400 });
    }
    if (!nodeDescription || typeof nodeDescription !== "string") {
      return NextResponse.json({ error: "nodeDescription is required" }, { status: 400 });
    }

    // Fetch parent explainer
    const supabase = getServiceClient();
    const { data: parent, error: fetchError } = await supabase
      .from("explainers")
      .select("slug, title, source_content, is_public")
      .eq("slug", slug)
      .single();

    if (fetchError || !parent) {
      return NextResponse.json({ error: "Parent explainer not found" }, { status: 404 });
    }

    if (!parent.source_content) {
      return NextResponse.json(
        { error: "Parent explainer has no source content — cannot deep dive" },
        { status: 422 },
      );
    }

    // Generate the deep dive
    const data = await generateDeepDive({
      sourceContent: parent.source_content,
      nodeTitle: nodeTitle.trim(),
      nodeDescription: nodeDescription.trim(),
      parentTitle: parent.title,
    });

    // Save to DB
    const newSlug = generateSlug();
    const insertData: Record<string, unknown> = {
      slug: newSlug,
      title: data.meta.title,
      summary: data.meta.summary,
      template: data.template,
      data: data as unknown as Record<string, unknown>,
      source_content: parent.source_content, // propagate so grand-children can deep-dive too
      is_public: true,
      user_id: null,
      parent_slug: slug,
      source_node_id: nodeId,
      show_watermark: false, // deep dives are free/ungated
    };

    const { error: insertError } = await supabase.from("explainers").insert(insertData);
    if (insertError) {
      // Retry on slug collision
      if (insertError.code === "23505") {
        const retrySlug = generateSlug(10);
        await supabase.from("explainers").insert({ ...insertData, slug: retrySlug });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vizbrief.driftworks.dev";

        // Fire-and-forget for retry slug path
        if (process.env.ENABLE_IMAGE_GEN === "true") {
          void fireAndForgetImages(data, retrySlug, parent.title);
        }

        return NextResponse.json({
          url: `${appUrl}/e/${retrySlug}`,
          slug: retrySlug,
          data,
          parentSlug: slug,
        });
      }
      throw new Error(`Failed to save deep dive: ${insertError.message}`);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vizbrief.driftworks.dev";

    // Fire-and-forget: generate node images asynchronously (does not block response)
    if (process.env.ENABLE_IMAGE_GEN === "true") {
      void fireAndForgetImages(data, newSlug, parent.title);
    }

    return NextResponse.json(
      {
        url: `${appUrl}/e/${newSlug}`,
        slug: newSlug,
        data,
        parentSlug: slug,
      },
      {
        headers: {
          "X-RateLimit-Limit": RATE_LIMIT.toString(),
          "X-RateLimit-Remaining": rate.remaining.toString(),
        },
      },
    );
  } catch (error) {
    if (error instanceof AnalysisError) {
      const status =
        error.code === "INVALID_INPUT" ? 400
        : error.code === "LLM_ERROR" ? 502
        : 500;
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status },
      );
    }
    console.error("Unexpected error in /api/v1/deep-dive:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { analyzeContent, AnalysisError } from "@/lib/llm/analyzer";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";
import type { TemplateChoice } from "@/lib/llm/prompts";
import { enrichWithSvgIllustrations, type SvgEnrichmentInput } from "@/lib/llm/svg-enrichment";

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

const FREE_TIER_LIMIT = 5; // generations per month

/**
 * Check and increment usage for authenticated users.
 * Pro users bypass the limit. Returns null if allowed, or an error message if rate-limited.
 */
async function checkUsage(userId: string): Promise<string | null> {
  try {
    const supabase = getServiceClient();

  // Check if user is on Pro plan
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", userId)
    .single();

  if (user?.plan === "pro") {
    // Pro users — still track usage but no limit
    const month = new Date().toISOString().slice(0, 7);
    const { data: usage } = await supabase
      .from("usage")
      .select("generations")
      .eq("user_id", userId)
      .eq("month", month)
      .single();

    const currentCount = usage?.generations || 0;
    await supabase
      .from("usage")
      .upsert(
        { user_id: userId, month, generations: currentCount + 1 },
        { onConflict: "user_id,month" },
      );
    return null;
  }

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
  } catch {
    // Supabase not configured — skip usage tracking
    return null;
  }
}

/**
 * Extract nodes from any template type for SVG illustration enrichment.
 *
 * Each template stores its "nodes" under a different key:
 *   Timeline         → data.events
 *   Flow Animator    → data.nodes
 *   Molecule         → data.nodes
 *   Concept Builder  → data.layers
 *   Compare Contrast → data.items
 *   Component Exp.   → data.components
 *   Decision Tree    → data.nodes
 *   Code Walkthrough → no good per-node illustrations (skip)
 */
function extractNodesForSvg(data: Record<string, unknown>): SvgEnrichmentInput["nodes"] {
  type RawNode = { id?: unknown; title?: unknown; label?: unknown; name?: unknown; description?: unknown; tags?: unknown };

  function toNode(raw: RawNode): SvgEnrichmentInput["nodes"][number] | null {
    const id = typeof raw.id === "string" ? raw.id : null;
    // title can come from different field names across templates
    const title =
      typeof raw.title === "string" ? raw.title
      : typeof raw.label === "string" ? raw.label
      : typeof raw.name === "string" ? raw.name
      : null;
    const description = typeof raw.description === "string" ? raw.description : "";
    const tags = Array.isArray(raw.tags)
      ? (raw.tags as unknown[]).filter((t): t is string => typeof t === "string")
      : undefined;

    if (!id || !title) return null;
    return { id, title, description, tags };
  }

  // Pick the right array based on template type
  const candidates: unknown[] =
    Array.isArray(data.events) ? (data.events as unknown[])
    : Array.isArray(data.nodes) ? (data.nodes as unknown[])
    : Array.isArray(data.layers) ? (data.layers as unknown[])
    : Array.isArray(data.items) ? (data.items as unknown[])
    : Array.isArray(data.components) ? (data.components as unknown[])
    : [];

  return candidates
    .map((c) => toNode(c as RawNode))
    .filter((n): n is SvgEnrichmentInput["nodes"][number] => n !== null);
}

/**
 * Merge generated SVG strings back into the explainer data in-place.
 * Mutates the data object directly (safe — it's a fresh object from the LLM).
 */
function mergeSvgIllustrations(
  data: Record<string, unknown>,
  illustrations: Record<string, string>,
): void {
  if (Object.keys(illustrations).length === 0) return;

  type WithSvg = { id?: string; illustrationSvg?: string };

  function injectInto(arr: unknown[]): void {
    for (const item of arr) {
      const node = item as WithSvg;
      if (node.id && illustrations[node.id]) {
        node.illustrationSvg = illustrations[node.id];
      }
    }
  }

  if (Array.isArray(data.events)) injectInto(data.events as unknown[]);
  else if (Array.isArray(data.nodes)) injectInto(data.nodes as unknown[]);
  else if (Array.isArray(data.layers)) injectInto(data.layers as unknown[]);
  else if (Array.isArray(data.items)) injectInto(data.items as unknown[]);
  else if (Array.isArray(data.components)) injectInto(data.components as unknown[]);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, template, model } = body as {
      content?: string;
      template?: string;
      model?: string;
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

    // Check usage for authenticated users (skip if auth is not configured)
    try {
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
    } catch {
      // Auth not configured — skip usage tracking
    }

    const templateChoice: TemplateChoice =
      template && VALID_TEMPLATES.includes(template as TemplateChoice)
        ? (template as TemplateChoice)
        : "auto";

    const result = await analyzeContent(content, templateChoice, model);

    // Force template field when user explicitly requested a specific template
    const finalTemplate = templateChoice !== "auto" ? templateChoice : result.data.template;
    if (result.data.template !== finalTemplate) {
      (result.data as Record<string, unknown>).template = finalTemplate;
      const meta = (result.data as Record<string, unknown>).meta as Record<string, unknown>;
      if (meta) meta.template = finalTemplate;
    }

    // --- SVG Enrichment (best-effort, non-blocking) ---
    // Extract nodes from the generated explainer, generate SVG illustrations,
    // and merge them back. If anything fails we still return the explainer.
    try {
      const svgNodes = extractNodesForSvg(result.data as Record<string, unknown>);
      if (svgNodes.length > 0) {
        const { illustrations } = await enrichWithSvgIllustrations({ nodes: svgNodes });
        mergeSvgIllustrations(result.data as Record<string, unknown>, illustrations);
      }
    } catch (svgError) {
      // Never block the main response — log and move on
      console.warn("[generate] SVG enrichment failed (non-fatal):", svgError);
    }

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

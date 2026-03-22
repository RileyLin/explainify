/**
 * SVG Enrichment — generates unique inline SVG illustrations for each explainer node.
 *
 * Uses GPT-4o-mini in a single batched call (one call for all nodes, not one per node).
 * This is best-effort: failures always fall back to static TopicIllustration silently.
 *
 * Cost: ~$0.0003 per typical 6-node explainer (negligible vs main generation).
 */

export interface SvgEnrichmentInput {
  nodes: Array<{
    id: string;
    title: string;
    description: string;
    tags?: string[];
  }>;
}

export interface SvgEnrichmentResult {
  illustrations: Record<string, string>; // nodeId → SVG string
}

const SVG_SYSTEM_PROMPT = `Generate minimal SVG illustrations for educational content nodes. Output a JSON object mapping node IDs to SVG strings. Each SVG: viewBox='0 0 160 90', transparent background, colors ONLY from: #6366f1 (indigo), #818cf8 (light indigo), #a5b4fc (pale indigo), rgba(99,102,241,0.1-0.3) for fills. Style: geometric, minimal, editorial — like Linear.app empty states. Max 12 SVG elements per illustration. No text elements. Strokes 1.5-2px. Output ONLY valid JSON.`;

/**
 * Enriches a list of nodes with LLM-generated SVG illustrations.
 *
 * Returns an empty illustrations map if:
 * - OPENAI_API_KEY is not set
 * - ENABLE_SVG_ENRICHMENT is not "true"
 * - The API call fails for any reason
 * - JSON parsing of the response fails
 */
export async function enrichWithSvgIllustrations(
  input: SvgEnrichmentInput,
): Promise<SvgEnrichmentResult> {
  const empty: SvgEnrichmentResult = { illustrations: {} };

  // Feature flag — skip if not enabled
  if (process.env.ENABLE_SVG_ENRICHMENT !== "true") {
    return empty;
  }

  // No nodes to illustrate
  if (!input.nodes.length) {
    return empty;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Graceful degradation — no key configured
    return empty;
  }

  try {
    const userPrompt = buildUserPrompt(input.nodes);
    const maxTokens = 300 * input.nodes.length;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SVG_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn(
        `[svg-enrichment] OpenAI API error: ${response.status} ${response.statusText}`,
      );
      return empty;
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("[svg-enrichment] Empty response from OpenAI");
      return empty;
    }

    // Parse the JSON map of nodeId → SVG string
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      console.warn("[svg-enrichment] Failed to parse JSON response:", content.slice(0, 200));
      return empty;
    }

    // Validate each value is a non-empty string; drop malformed entries silently
    const illustrations: Record<string, string> = {};
    for (const [nodeId, svg] of Object.entries(parsed)) {
      if (typeof svg === "string" && svg.trim().length > 0) {
        illustrations[nodeId] = svg.trim();
      }
    }

    return { illustrations };
  } catch (err) {
    console.warn("[svg-enrichment] Unexpected error, falling back to static:", err);
    return empty;
  }
}

function buildUserPrompt(
  nodes: SvgEnrichmentInput["nodes"],
): string {
  const lines = nodes.map((node) => {
    const tagsPart = node.tags?.length
      ? ` | tags: ${node.tags.join(", ")}`
      : "";
    return `- id: "${node.id}" | title: "${node.title}" | description: "${node.description}"${tagsPart}`;
  });

  return (
    `Generate unique SVG illustrations for each of these ${nodes.length} educational content nodes.\n` +
    `Return a JSON object where each key is the node id and each value is a complete SVG string.\n\n` +
    lines.join("\n")
  );
}

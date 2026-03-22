/**
 * Gemini image generation client.
 * Uses gemini-2.0-flash-exp-image-generation via REST API.
 * Returns PNG buffers matching VizBrief's dark brand aesthetic.
 */

import type { ImageGenRequest } from "./types";

const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent";

/** Shared brand suffix appended to every prompt */
const BRAND_SUFFIX =
  "editorial illustration style, dark background compatible, indigo and blue tones, minimal, geometric";

/** Build a style-specific prompt from the request */
function buildPrompt(req: ImageGenRequest): string {
  const { title, description, style, tags, parentTitle, depthLevel } = req;

  const tagLine = tags && tags.length > 0 ? ` Tags: ${tags.join(", ")}.` : "";
  const contextLine = parentTitle
    ? ` Part of: "${parentTitle}"${depthLevel !== undefined ? ` (depth ${depthLevel})` : ""}.`
    : "";

  switch (style) {
    case "scene": {
      return (
        `A conceptual scene illustrating "${title}". ${description}.${tagLine}${contextLine} ` +
        `Dark navy/charcoal background. Glowing indigo (#6366f1) and blue (#3b82f6) highlights. ` +
        `Clean linework, soft glow effects, futuristic technical aesthetic. ` +
        BRAND_SUFFIX
      );
    }

    case "abstract": {
      return (
        `An abstract geometric representation of "${title}". ${description}.${tagLine}${contextLine} ` +
        `Interconnected shapes, flowing lines, node-edge metaphor. ` +
        `Deep navy background, indigo and cyan (#06b6d4) color palette. ` +
        `No text. Pure form and composition. ` +
        BRAND_SUFFIX
      );
    }

    case "hero": {
      return (
        `A bold hero illustration for "${title}". ${description}.${tagLine}${contextLine} ` +
        `Strong focal point, high contrast. Dark charcoal background with vibrant indigo (#6366f1) ` +
        `and electric blue (#3b82f6) accents. Centered composition, cinematic quality. ` +
        `No warm colors, no amber, no orange. ` +
        BRAND_SUFFIX
      );
    }

    case "background": {
      return (
        `A very subtle, low contrast background texture for "${title}". ${description}.${tagLine}${contextLine} ` +
        `Suitable as background behind text — extremely muted, barely visible pattern. ` +
        `Dark navy (#0f172a) base. Faint indigo/blue geometric mesh or grid lines. ` +
        `No strong focal point, no bright highlights. Flat, understated, non-distracting. ` +
        `Very subtle, low contrast, suitable as background behind text. ` +
        BRAND_SUFFIX
      );
    }
  }
}

/** Gemini REST API response shape (partial) */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string; // base64
        };
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Generate a single image via Gemini.
 * Returns a PNG Buffer.
 * Throws on API error or missing image data.
 */
export async function generateImage(
  req: ImageGenRequest,
  signal?: AbortSignal,
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const prompt = buildPrompt(req);
  const url = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      // Gemini image gen doesn't support temperature etc. for image-only outputs
    },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Gemini API error ${response.status}: ${errorText || response.statusText}`,
    );
  }

  const json = (await response.json()) as GeminiResponse;

  if (json.error) {
    throw new Error(
      `Gemini API error ${json.error.code ?? "unknown"}: ${json.error.message ?? json.error.status}`,
    );
  }

  // Find the inline image part
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

  if (!imagePart?.inlineData?.data) {
    throw new Error(
      "Gemini response did not contain an image. " +
        (parts.find((p) => p.text)?.text ?? "No additional information."),
    );
  }

  const base64 = imagePart.inlineData.data;
  return Buffer.from(base64, "base64");
}

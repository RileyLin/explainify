/**
 * Main entry point for the image generation pipeline.
 * Orchestrates parallel Gemini generation + Supabase Storage upload.
 *
 * All generation is best-effort — one failure never kills the batch.
 * If ENABLE_IMAGE_GEN !== "true" or GEMINI_API_KEY is missing, returns empty results silently.
 */

import { generateImage } from "./gemini";
import { uploadImage } from "./storage";
import type { ImageGenRequest, ImageGenResult, BatchImageGenResult } from "./types";

export type { ImageGenRequest, ImageGenResult, BatchImageGenResult } from "./types";

/** Per-image generation timeout in milliseconds */
const IMAGE_GEN_TIMEOUT_MS = 15_000;

/**
 * Generate images for a batch of node requests and upload them to Supabase Storage.
 *
 * @param requests     - List of image generation requests (one per node/item)
 * @param explainerSlug - Slug of the parent explainer (used for storage path)
 * @returns BatchImageGenResult with successful images and per-node errors
 */
export async function generateNodeImages(
  requests: ImageGenRequest[],
  explainerSlug: string,
): Promise<BatchImageGenResult> {
  const empty: BatchImageGenResult = { images: {}, errors: {} };

  // Feature flag guard — return silently if disabled
  if (process.env.ENABLE_IMAGE_GEN !== "true") {
    return empty;
  }

  if (!process.env.GEMINI_API_KEY) {
    return empty;
  }

  if (requests.length === 0) {
    return empty;
  }

  /** Generate + upload a single image, with a 15-second per-request timeout */
  async function processOne(req: ImageGenRequest): Promise<ImageGenResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);

    try {
      const buffer = await generateImage(req, controller.signal);
      const imageUrl = await uploadImage(buffer, explainerSlug, req.nodeId);

      // Gemini returns 1024×1024 by default for this model
      return {
        nodeId: req.nodeId,
        imageUrl,
        width: 1024,
        height: 1024,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Run all requests in parallel; one failure doesn't kill the batch
  const settled = await Promise.allSettled(requests.map((req) => processOne(req)));

  const result: BatchImageGenResult = { images: {}, errors: {} };

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const req = requests[i];

    if (outcome.status === "fulfilled") {
      result.images[req.nodeId] = outcome.value;
    } else {
      const reason = outcome.reason as unknown;
      result.errors[req.nodeId] =
        reason instanceof Error ? reason.message : String(reason);
    }
  }

  return result;
}

/**
 * Shared types for Gemini image generation across all renderers.
 * All agents should import from this file.
 */

/** Request to generate an image for a single node/item */
export interface ImageGenRequest {
  nodeId: string;
  title: string;
  description: string;
  tags?: string[];
  style: "scene" | "abstract" | "hero" | "background";
  parentTitle?: string;
  depthLevel?: number;
}

/** Result from generating a single image */
export interface ImageGenResult {
  nodeId: string;
  imageUrl: string;
  width: number;
  height: number;
}

/** Batch result — some may fail gracefully */
export interface BatchImageGenResult {
  images: Record<string, ImageGenResult>;
  errors: Record<string, string>;
}

export type GenerateImages = (
  requests: ImageGenRequest[],
  explainerSlug: string,
) => Promise<BatchImageGenResult>;

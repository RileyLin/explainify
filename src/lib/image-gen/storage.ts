/**
 * Supabase Storage upload for generated explainer images.
 * Uploads PNG buffers to the `explainer-images` bucket and returns public CDN URLs.
 */

import { getServiceClient } from "@/lib/db";

const BUCKET = "explainer-images";

/**
 * Upload a PNG buffer to Supabase Storage.
 *
 * @param buffer   - Raw PNG data
 * @param explainerSlug - Slug of the explainer (used as folder)
 * @param nodeId   - Node identifier (used as filename, without extension)
 * @returns Public CDN URL for the uploaded image
 */
export async function uploadImage(
  buffer: Buffer,
  explainerSlug: string,
  nodeId: string,
): Promise<string> {
  const supabase = getServiceClient();
  const path = `${explainerSlug}/${nodeId}.png`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "image/png",
    upsert: true, // overwrite if re-generating
    cacheControl: "31536000", // 1 year — images are immutable per slug/nodeId pair
  });

  if (error) {
    throw new Error(`Failed to upload image to Supabase Storage (${path}): ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  if (!data.publicUrl) {
    throw new Error(
      `Supabase Storage did not return a public URL for ${path}. ` +
        `Ensure the '${BUCKET}' bucket is set to public.`,
    );
  }

  return data.publicUrl;
}

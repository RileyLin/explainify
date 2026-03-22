-- Migration 005: Add image_url JSONB column to explainers
-- Stores a JSON map of nodeId → imageUrl for the entire explainer.
-- A single JSONB column rather than per-node rows keeps the schema flat.
-- Image generation is best-effort: NULL means no images have been generated yet.

ALTER TABLE explainers ADD COLUMN IF NOT EXISTS image_url JSONB;

-- Optional: partial index for rows that have images (speeds up queries that filter for image presence)
CREATE INDEX IF NOT EXISTS idx_explainers_image_url ON explainers USING GIN (image_url)
  WHERE image_url IS NOT NULL;

COMMENT ON COLUMN explainers.image_url IS
  'JSON map of nodeId → imageUrl for AI-generated node images. NULL when not yet generated. '
  'Example: {"node-1": "https://...supabase.co/storage/v1/object/public/explainer-images/slug/node-1.png"}';

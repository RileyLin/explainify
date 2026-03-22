-- Migration 004: Deep Dive Support
-- Adds parent_slug and source_node_id columns to support fractal deep dive navigation.
-- parent_slug: references the parent explainer's slug (for breadcrumb navigation)
-- source_node_id: which node on the parent was clicked to generate this deep dive

ALTER TABLE explainers ADD COLUMN IF NOT EXISTS parent_slug TEXT;
ALTER TABLE explainers ADD COLUMN IF NOT EXISTS source_node_id TEXT;

-- Index for efficient parent chain lookups (breadcrumbs, child listing)
CREATE INDEX IF NOT EXISTS idx_explainers_parent ON explainers(parent_slug) WHERE parent_slug IS NOT NULL;

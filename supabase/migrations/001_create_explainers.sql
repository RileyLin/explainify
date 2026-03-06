-- Explainify: Published explainers table
CREATE TABLE IF NOT EXISTS explainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  template TEXT NOT NULL,
  data JSONB NOT NULL,
  source_content TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  views INT DEFAULT 0,
  is_public BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_explainers_slug ON explainers(slug);
CREATE INDEX IF NOT EXISTS idx_explainers_created ON explainers(created_at DESC);

-- Enable RLS but allow public reads for published explainers
ALTER TABLE explainers ENABLE ROW LEVEL SECURITY;

-- Anyone can read public explainers
CREATE POLICY "Public explainers are viewable by everyone"
  ON explainers FOR SELECT
  USING (is_public = true);

-- Service role can do everything (used by API routes)
CREATE POLICY "Service role can manage all explainers"
  ON explainers FOR ALL
  USING (true)
  WITH CHECK (true);

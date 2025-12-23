-- Allow posts to reference external content (Bluesky CID/URI)
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS external_metadata JSONB;

-- Index for efficient lookups of external content
CREATE INDEX IF NOT EXISTS idx_posts_external_id ON public.posts(external_id) WHERE external_id IS NOT NULL;

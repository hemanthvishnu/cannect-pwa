-- Add columns for repost functionality
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS repost_of_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_repost BOOLEAN DEFAULT FALSE;

-- Create index for efficient repost lookups
CREATE INDEX IF NOT EXISTS idx_posts_repost_of_id ON public.posts(repost_of_id) WHERE repost_of_id IS NOT NULL;

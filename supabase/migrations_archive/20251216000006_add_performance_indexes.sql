-- Add performance indexes for common query patterns

-- Index for federated post lookups (Shadow Reposts)
CREATE INDEX IF NOT EXISTS idx_posts_external_id ON public.posts (external_id) WHERE external_id IS NOT NULL;

-- Index for thread/reply queries
CREATE INDEX IF NOT EXISTS idx_posts_reply_to_id ON public.posts (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- Composite index for user's posts timeline
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts (user_id, created_at DESC);

-- Index for likes lookup by user (for is_liked checks)
CREATE INDEX IF NOT EXISTS idx_likes_user_post ON public.likes (user_id, post_id);

-- Index for following/follower queries
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

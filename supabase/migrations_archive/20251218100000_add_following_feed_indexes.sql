-- Add optimized composite indexes for Following Feed performance
-- These indexes help when a user follows 1000+ people

-- Composite index for follows lookup (follower_id, following_id together)
-- This optimizes the query: SELECT following_id FROM follows WHERE follower_id = ?
CREATE INDEX IF NOT EXISTS idx_follows_follower_following 
ON public.follows (follower_id, following_id);

-- Composite index for posts feed queries
-- Optimizes: SELECT * FROM posts WHERE user_id IN (...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_posts_user_id_created_at 
ON public.posts (user_id, created_at DESC) 
WHERE is_reply = false;

-- Index for notifications feed (user's notifications ordered by time)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
ON public.notifications (user_id, created_at DESC);

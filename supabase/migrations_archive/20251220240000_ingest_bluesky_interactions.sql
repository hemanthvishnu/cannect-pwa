-- =============================================================================
-- PHASE 4: INGEST BLUESKY INTERACTIONS
-- =============================================================================
-- Enables Cannect to receive and display interactions from Bluesky users
-- on federated Cannect content. Uses Jetstream polling for near-realtime updates.
-- =============================================================================

-- 1. Cursor table to track last processed Jetstream event
CREATE TABLE IF NOT EXISTS jetstream_cursor (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cursor_time_us BIGINT NOT NULL,
  events_processed BIGINT DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize cursor with current time (microseconds)
INSERT INTO jetstream_cursor (cursor_time_us)
VALUES ((EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE jetstream_cursor IS 'Tracks position in Bluesky Jetstream for polling';
COMMENT ON COLUMN jetstream_cursor.cursor_time_us IS 'Last processed event timestamp in microseconds';

-- 2. Table to track external (Bluesky) interactions on Cannect content
CREATE TABLE IF NOT EXISTS federated_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was interacted with
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Who did it (external Bluesky actor)
  actor_did TEXT NOT NULL,
  
  -- Type of interaction
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'like', 'repost', 'reply', 'quote', 'follow'
  )),
  
  -- AT Protocol reference (unique identifier)
  at_uri TEXT UNIQUE NOT NULL,
  
  -- Additional data for replies/quotes
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE federated_interactions IS 'Stores interactions from Bluesky users on Cannect content';

-- Indexes for federated_interactions
CREATE INDEX IF NOT EXISTS idx_federated_interactions_post 
ON federated_interactions(post_id) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_federated_interactions_target_user 
ON federated_interactions(target_user_id) WHERE target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_federated_interactions_actor 
ON federated_interactions(actor_did);

CREATE INDEX IF NOT EXISTS idx_federated_interactions_type 
ON federated_interactions(interaction_type);

CREATE INDEX IF NOT EXISTS idx_federated_interactions_created
ON federated_interactions(created_at DESC);

-- RLS for federated_interactions
ALTER TABLE federated_interactions ENABLE ROW LEVEL SECURITY;

-- Anyone can read federated interactions
CREATE POLICY "Public can read federated interactions"
ON federated_interactions FOR SELECT
USING (true);

-- Only service role can insert/update/delete
CREATE POLICY "Service role manages federated interactions"
ON federated_interactions FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- 3. Add external actor columns to notifications table
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS actor_did TEXT,
ADD COLUMN IF NOT EXISTS actor_handle TEXT,
ADD COLUMN IF NOT EXISTS actor_display_name TEXT,
ADD COLUMN IF NOT EXISTS actor_avatar TEXT,
ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN notifications.actor_did IS 'DID of external Bluesky actor';
COMMENT ON COLUMN notifications.actor_handle IS 'Handle of external Bluesky actor';
COMMENT ON COLUMN notifications.is_external IS 'Whether notification is from external Bluesky user';

-- Index for external notifications
CREATE INDEX IF NOT EXISTS idx_notifications_external 
ON notifications(user_id, created_at DESC) WHERE is_external = TRUE;

-- 4. RPC functions for atomic count updates

-- Increment likes
CREATE OR REPLACE FUNCTION increment_post_likes(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET likes_count = likes_count + 1 
  WHERE id = target_post_id;
END;
$$;

-- Decrement likes
CREATE OR REPLACE FUNCTION decrement_post_likes(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET likes_count = GREATEST(0, likes_count - 1) 
  WHERE id = target_post_id;
END;
$$;

-- Increment reposts
CREATE OR REPLACE FUNCTION increment_post_reposts(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET reposts_count = reposts_count + 1 
  WHERE id = target_post_id;
END;
$$;

-- Decrement reposts
CREATE OR REPLACE FUNCTION decrement_post_reposts(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET reposts_count = GREATEST(0, reposts_count - 1) 
  WHERE id = target_post_id;
END;
$$;

-- Increment replies
CREATE OR REPLACE FUNCTION increment_post_replies(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET replies_count = replies_count + 1 
  WHERE id = target_post_id;
END;
$$;

-- Decrement replies
CREATE OR REPLACE FUNCTION decrement_post_replies(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET replies_count = GREATEST(0, replies_count - 1) 
  WHERE id = target_post_id;
END;
$$;

-- Increment quotes
CREATE OR REPLACE FUNCTION increment_post_quotes(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET quotes_count = quotes_count + 1 
  WHERE id = target_post_id;
END;
$$;

-- Decrement quotes
CREATE OR REPLACE FUNCTION decrement_post_quotes(target_post_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts 
  SET quotes_count = GREATEST(0, quotes_count - 1) 
  WHERE id = target_post_id;
END;
$$;

-- Increment followers (for external follows)
CREATE OR REPLACE FUNCTION increment_profile_followers(target_profile_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles 
  SET followers_count = followers_count + 1 
  WHERE id = target_profile_id;
END;
$$;

-- Decrement followers
CREATE OR REPLACE FUNCTION decrement_profile_followers(target_profile_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles 
  SET followers_count = GREATEST(0, followers_count - 1) 
  WHERE id = target_profile_id;
END;
$$;

-- 5. Cache table for Bluesky profiles (avoid repeated API calls)
CREATE TABLE IF NOT EXISTS bluesky_profile_cache (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  avatar TEXT,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE bluesky_profile_cache IS 'Caches Bluesky profile data to reduce API calls';

-- Index for cache expiry cleanup
CREATE INDEX IF NOT EXISTS idx_bluesky_profile_cache_expiry 
ON bluesky_profile_cache(cached_at);

-- RLS for cache table
ALTER TABLE bluesky_profile_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read bluesky profile cache"
ON bluesky_profile_cache FOR SELECT
USING (true);

CREATE POLICY "Service role manages bluesky profile cache"
ON bluesky_profile_cache FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- 6. Add quotes_count column to posts if not exists
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS quotes_count INTEGER DEFAULT 0;

-- =============================================================================
-- DONE: Phase 4 Database Setup
-- =============================================================================

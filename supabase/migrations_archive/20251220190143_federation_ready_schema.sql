-- ============================================================================
-- CANNECT FEDERATION-READY DATABASE SCHEMA
-- ============================================================================
-- 
-- This schema is designed to:
-- 1. Work standalone with Supabase Auth (current functionality)
-- 2. Support future AT Protocol / Bluesky federation
-- 3. Use Bluesky's threading model for compatibility
--
-- Key additions for federation:
-- - DID fields for decentralized identity
-- - AT-URI and CID fields for content addressing
-- - thread_root + thread_parent (Bluesky threading model)
-- - Separate records for likes/reposts (AT Protocol pattern)
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP EVERYTHING (DESTRUCTIVE - removes all data!)
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_post_likes ON likes;
DROP TRIGGER IF EXISTS trigger_update_follow_counts ON follows;
DROP TRIGGER IF EXISTS trigger_update_profile_posts ON posts;
DROP TRIGGER IF EXISTS trigger_create_like_notification ON likes;
DROP TRIGGER IF EXISTS trigger_create_follow_notification ON follows;
DROP TRIGGER IF EXISTS trigger_update_comments_count_insert ON posts;
DROP TRIGGER IF EXISTS trigger_update_comments_count_delete ON posts;
DROP TRIGGER IF EXISTS trigger_update_reposts_count_insert ON reposts;
DROP TRIGGER IF EXISTS trigger_update_reposts_count_delete ON reposts;
DROP TRIGGER IF EXISTS trigger_create_comment_notification ON posts;
DROP TRIGGER IF EXISTS trigger_create_repost_notification ON reposts;
DROP TRIGGER IF EXISTS trigger_notify_push ON notifications;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop functions
DROP FUNCTION IF EXISTS update_post_likes_count() CASCADE;
DROP FUNCTION IF EXISTS update_follow_counts() CASCADE;
DROP FUNCTION IF EXISTS update_profile_posts_count() CASCADE;
DROP FUNCTION IF EXISTS create_like_notification() CASCADE;
DROP FUNCTION IF EXISTS create_follow_notification() CASCADE;
DROP FUNCTION IF EXISTS update_parent_comments_count() CASCADE;
DROP FUNCTION IF EXISTS create_comment_notification() CASCADE;
DROP FUNCTION IF EXISTS update_post_reposts_count() CASCADE;
DROP FUNCTION IF EXISTS create_repost_notification() CASCADE;
DROP FUNCTION IF EXISTS notify_push_notification() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS reposts CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================================
-- STEP 2: ENABLE EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ============================================================================
-- STEP 3: CREATE TABLES
-- ============================================================================

-- =============================================================================
-- PROFILES TABLE
-- =============================================================================
-- Maps Supabase Auth users to AT Protocol identity
-- 
-- Federation flow:
-- 1. User signs up → gets UUID from Supabase Auth
-- 2. User links Bluesky → we store their DID
-- 3. Or user creates Cannect DID → we become their PDS
-- =============================================================================
CREATE TABLE profiles (
  -- Primary identity (Supabase Auth)
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Human-readable identity
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  
  -- Media
  avatar_url TEXT,
  avatar_cid TEXT,           -- IPFS/AT CID for avatar (federation)
  banner_url TEXT,           -- Bluesky calls it "banner", we had "cover"
  banner_cid TEXT,           -- IPFS/AT CID for banner
  
  -- AT Protocol identity (for federation)
  did TEXT UNIQUE,           -- did:plc:xxx or did:web:xxx
  handle TEXT UNIQUE,        -- user.bsky.social or user.cannect.app
  pds_url TEXT,              -- Personal Data Server URL (if federated)
  
  -- External links
  website TEXT,
  
  -- Counts (denormalized for performance)
  followers_count INTEGER DEFAULT 0 NOT NULL,
  following_count INTEGER DEFAULT 0 NOT NULL,
  posts_count INTEGER DEFAULT 0 NOT NULL,
  
  -- Status
  is_verified BOOLEAN DEFAULT FALSE NOT NULL,
  
  -- Push notifications
  expo_push_token TEXT,
  web_push_subscription JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL  -- AT Protocol uses this
);

-- Comments
COMMENT ON COLUMN profiles.did IS 'Decentralized Identifier (AT Protocol)';
COMMENT ON COLUMN profiles.handle IS 'AT Protocol handle (e.g., user.bsky.social)';
COMMENT ON COLUMN profiles.pds_url IS 'Personal Data Server URL for federated users';
COMMENT ON COLUMN profiles.avatar_cid IS 'Content-addressed hash for avatar (IPFS/AT)';
COMMENT ON COLUMN profiles.indexed_at IS 'When this record was last indexed (AT Protocol pattern)';

-- =============================================================================
-- POSTS TABLE
-- =============================================================================
-- Uses Bluesky's threading model:
-- - thread_root: The original post that started the thread
-- - thread_parent: The immediate parent being replied to
-- 
-- This is superior to single reply_to_id because:
-- 1. Can jump to thread root in O(1)
-- 2. Matches AT Protocol exactly for federation
-- 3. Better for thread UI (Post Ribbon)
-- =============================================================================
CREATE TABLE posts (
  -- Primary identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- AT Protocol identity (for federation)
  at_uri TEXT UNIQUE,        -- at://did:plc:xxx/app.bsky.feed.post/rkey
  at_cid TEXT,               -- Content hash (immutable)
  
  -- Content
  content TEXT NOT NULL DEFAULT '',
  
  -- Media (local URLs)
  media_urls TEXT[],
  video_url TEXT,
  video_thumbnail_url TEXT,
  
  -- Media (content-addressed for federation)
  media_cids TEXT[],         -- CIDs for images
  video_cid TEXT,            -- CID for video
  
  -- Threading (Bluesky model)
  thread_root_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  thread_parent_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  thread_depth INTEGER DEFAULT 0 NOT NULL,  -- 0 = root post, 1+ = replies
  
  -- AT Protocol thread references (for federated content)
  thread_root_uri TEXT,      -- at:// URI of root post
  thread_parent_uri TEXT,    -- at:// URI of parent post
  
  -- Embed/Quote (Bluesky model)
  -- In AT Protocol, quotes are "embeds" with type record
  embed_type TEXT CHECK (embed_type IN ('none', 'images', 'video', 'record', 'record_with_media', 'external')),
  embed_record_uri TEXT,     -- AT URI of quoted post
  embed_record_cid TEXT,     -- CID of quoted post at time of quoting
  embed_external_uri TEXT,   -- External link preview URL
  embed_external_title TEXT,
  embed_external_description TEXT,
  embed_external_thumb TEXT,
  
  -- Legacy columns (for backward compatibility, will migrate away)
  is_reply BOOLEAN GENERATED ALWAYS AS (thread_parent_id IS NOT NULL) STORED,
  reply_to_id UUID,          -- Deprecated: use thread_parent_id
  is_repost BOOLEAN DEFAULT FALSE,  -- Deprecated: reposts are separate table
  repost_of_id UUID,         -- Deprecated: reposts are separate table
  type TEXT DEFAULT 'post' CHECK (type IN ('post', 'reply', 'quote')),
  
  -- Federated content cache
  external_id TEXT,          -- Legacy: external platform post ID
  external_source TEXT,      -- Legacy: source platform
  external_metadata JSONB,   -- Legacy: cached external data
  
  -- Counts (denormalized for performance)
  likes_count INTEGER DEFAULT 0 NOT NULL,
  replies_count INTEGER DEFAULT 0 NOT NULL,  -- Renamed from comments_count
  reposts_count INTEGER DEFAULT 0 NOT NULL,
  quotes_count INTEGER DEFAULT 0 NOT NULL,   -- New: separate from reposts
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Languages (Bluesky supports this)
  langs TEXT[]               -- e.g., ['en', 'ja']
);

-- Update type based on structure
CREATE OR REPLACE FUNCTION set_post_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.embed_record_uri IS NOT NULL OR NEW.embed_type = 'record' OR NEW.embed_type = 'record_with_media' THEN
    NEW.type := 'quote';
  ELSIF NEW.thread_parent_id IS NOT NULL THEN
    NEW.type := 'reply';
  ELSE
    NEW.type := 'post';
  END IF;
  
  -- Calculate thread depth
  IF NEW.thread_parent_id IS NOT NULL THEN
    SELECT COALESCE(thread_depth, 0) + 1 INTO NEW.thread_depth
    FROM posts WHERE id = NEW.thread_parent_id;
  END IF;
  
  -- Set thread_root if this is a reply
  IF NEW.thread_parent_id IS NOT NULL AND NEW.thread_root_id IS NULL THEN
    SELECT COALESCE(thread_root_id, id) INTO NEW.thread_root_id
    FROM posts WHERE id = NEW.thread_parent_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_post_type
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_post_type();

COMMENT ON COLUMN posts.at_uri IS 'AT Protocol URI (at://did/collection/rkey)';
COMMENT ON COLUMN posts.at_cid IS 'Content hash for immutability verification';
COMMENT ON COLUMN posts.thread_root_id IS 'Root post of this thread (Bluesky model)';
COMMENT ON COLUMN posts.thread_parent_id IS 'Direct parent being replied to (Bluesky model)';
COMMENT ON COLUMN posts.embed_type IS 'Type of embedded content (Bluesky model)';

-- =============================================================================
-- LIKES TABLE
-- =============================================================================
-- In AT Protocol, likes are separate records with their own URI
-- =============================================================================
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who liked
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- What was liked (local reference)
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  
  -- AT Protocol fields
  at_uri TEXT UNIQUE,        -- at://did/app.bsky.feed.like/rkey
  subject_uri TEXT,          -- AT URI of the liked post
  subject_cid TEXT,          -- CID of post at time of like (immutability)
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_id, post_id)
);

COMMENT ON COLUMN likes.subject_uri IS 'AT URI of the liked post (for federation)';
COMMENT ON COLUMN likes.subject_cid IS 'CID of post when liked (proves what was liked)';

-- =============================================================================
-- REPOSTS TABLE (NEW - Bluesky model)
-- =============================================================================
-- In AT Protocol, reposts are separate records, not post types
-- This is cleaner than having is_repost/repost_of_id on posts
-- =============================================================================
CREATE TABLE reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who reposted
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- What was reposted (local reference)
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  
  -- AT Protocol fields
  at_uri TEXT UNIQUE,        -- at://did/app.bsky.feed.repost/rkey
  subject_uri TEXT,          -- AT URI of the reposted post
  subject_cid TEXT,          -- CID of post at time of repost
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_id, post_id)
);

COMMENT ON TABLE reposts IS 'Reposts as separate records (AT Protocol model)';

-- =============================================================================
-- FOLLOWS TABLE
-- =============================================================================
-- In AT Protocol, follows are records pointing to DIDs
-- =============================================================================
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Local references
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- AT Protocol fields
  at_uri TEXT UNIQUE,        -- at://did/app.bsky.graph.follow/rkey
  subject_did TEXT,          -- DID of the followed user
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- =============================================================================
-- NOTIFICATIONS TABLE
-- =============================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Notification reason (matches Bluesky notification reasons)
  reason TEXT NOT NULL CHECK (reason IN (
    'like',           -- Someone liked your post
    'repost',         -- Someone reposted your post
    'follow',         -- Someone followed you
    'mention',        -- Someone mentioned you
    'reply',          -- Someone replied to your post
    'quote',          -- Someone quoted your post
    'starterpack-joined'  -- Bluesky specific, we might not use
  )),
  
  -- Reference to the relevant post (if applicable)
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  
  -- AT Protocol fields
  subject_uri TEXT,          -- AT URI of the subject (post, like, etc)
  
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Rename 'type' to 'reason' for AT Protocol compatibility
-- (The app code will need updating too)

-- ============================================================================
-- STEP 4: CREATE INDEXES
-- ============================================================================

-- Profiles
CREATE INDEX idx_profiles_did ON profiles(did) WHERE did IS NOT NULL;
CREATE INDEX idx_profiles_handle ON profiles(handle) WHERE handle IS NOT NULL;
CREATE INDEX idx_profiles_push_token ON profiles(expo_push_token) WHERE expo_push_token IS NOT NULL;

-- Posts
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_indexed_at ON posts(indexed_at DESC);
CREATE INDEX idx_posts_at_uri ON posts(at_uri) WHERE at_uri IS NOT NULL;
CREATE INDEX idx_posts_thread_root ON posts(thread_root_id) WHERE thread_root_id IS NOT NULL;
CREATE INDEX idx_posts_thread_parent ON posts(thread_parent_id) WHERE thread_parent_id IS NOT NULL;
CREATE INDEX idx_posts_feed ON posts(user_id, created_at DESC) WHERE thread_parent_id IS NULL;
CREATE INDEX idx_posts_has_media ON posts(user_id, created_at DESC) WHERE media_urls IS NOT NULL OR video_url IS NOT NULL;

-- Likes
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_likes_at_uri ON likes(at_uri) WHERE at_uri IS NOT NULL;

-- Reposts
CREATE INDEX idx_reposts_post_id ON reposts(post_id);
CREATE INDEX idx_reposts_user_id ON reposts(user_id);
CREATE INDEX idx_reposts_at_uri ON reposts(at_uri) WHERE at_uri IS NOT NULL;
CREATE INDEX idx_reposts_created_at ON reposts(created_at DESC);

-- Follows
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_follows_at_uri ON follows(at_uri) WHERE at_uri IS NOT NULL;

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;

-- ============================================================================
-- STEP 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 6: CREATE RLS POLICIES
-- ============================================================================

-- PROFILES
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- POSTS
CREATE POLICY "Posts are viewable by everyone" ON posts FOR SELECT USING (true);
CREATE POLICY "Users can create own posts" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON posts FOR DELETE USING (auth.uid() = user_id);

-- LIKES
CREATE POLICY "Likes are viewable by everyone" ON likes FOR SELECT USING (true);
CREATE POLICY "Users can like posts" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike posts" ON likes FOR DELETE USING (auth.uid() = user_id);

-- REPOSTS
CREATE POLICY "Reposts are viewable by everyone" ON reposts FOR SELECT USING (true);
CREATE POLICY "Users can repost" ON reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unrepost" ON reposts FOR DELETE USING (auth.uid() = user_id);

-- FOLLOWS
CREATE POLICY "Follows are viewable by everyone" ON follows FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow others" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- NOTIFICATIONS
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

-- ============================================================================
-- STEP 7: CREATE TRIGGER FUNCTIONS
-- ============================================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Update likes count
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update reposts count (from reposts table, not posts)
CREATE OR REPLACE FUNCTION update_post_reposts_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update replies count (on parent post)
CREATE OR REPLACE FUNCTION update_parent_replies_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.thread_parent_id IS NOT NULL THEN
      UPDATE posts SET replies_count = replies_count + 1 WHERE id = NEW.thread_parent_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.thread_parent_id IS NOT NULL THEN
      UPDATE posts SET replies_count = GREATEST(0, replies_count - 1) WHERE id = OLD.thread_parent_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Update quotes count (on quoted post)
CREATE OR REPLACE FUNCTION update_post_quotes_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  quoted_post_id UUID;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.type = 'quote' THEN
    -- Find the local post ID from embed_record_uri or by other means
    -- For now, we'll need to pass this explicitly or look it up
    -- This is a simplified version
    IF NEW.embed_record_uri IS NOT NULL THEN
      SELECT id INTO quoted_post_id FROM posts WHERE at_uri = NEW.embed_record_uri;
      IF quoted_post_id IS NOT NULL THEN
        UPDATE posts SET quotes_count = quotes_count + 1 WHERE id = quoted_post_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.type = 'quote' THEN
    IF OLD.embed_record_uri IS NOT NULL THEN
      SELECT id INTO quoted_post_id FROM posts WHERE at_uri = OLD.embed_record_uri;
      IF quoted_post_id IS NOT NULL THEN
        UPDATE posts SET quotes_count = GREATEST(0, quotes_count - 1) WHERE id = quoted_post_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Update follow counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Update posts count
CREATE OR REPLACE FUNCTION update_profile_posts_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.thread_parent_id IS NULL THEN  -- Only count root posts
      UPDATE profiles SET posts_count = posts_count + 1 WHERE id = NEW.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.thread_parent_id IS NULL THEN
      UPDATE profiles SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.user_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Create like notification
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, reason, post_id)
    VALUES (post_author_id, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create repost notification
CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, reason, post_id)
    VALUES (post_author_id, NEW.user_id, 'repost', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create reply notification
CREATE OR REPLACE FUNCTION create_reply_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  parent_author_id UUID;
BEGIN
  IF NEW.thread_parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_author_id FROM posts WHERE id = NEW.thread_parent_id;
    IF parent_author_id IS NOT NULL AND parent_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, actor_id, reason, post_id)
      VALUES (parent_author_id, NEW.user_id, 'reply', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create quote notification
CREATE OR REPLACE FUNCTION create_quote_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  quoted_author_id UUID;
  quoted_post_id UUID;
BEGIN
  IF NEW.type = 'quote' AND NEW.embed_record_uri IS NOT NULL THEN
    SELECT id, user_id INTO quoted_post_id, quoted_author_id 
    FROM posts WHERE at_uri = NEW.embed_record_uri;
    
    IF quoted_author_id IS NOT NULL AND quoted_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, actor_id, reason, post_id)
      VALUES (quoted_author_id, NEW.user_id, 'quote', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create follow notification
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, reason)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;

-- Push notification via Edge Function
CREATE OR REPLACE FUNCTION notify_push_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  actor_name TEXT;
  actor_username TEXT;
  notification_title TEXT;
  notification_body TEXT;
  notification_data JSONB;
  edge_function_url TEXT := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/send-push-notification';
BEGIN
  SELECT COALESCE(display_name, username, 'Someone'), username
  INTO actor_name, actor_username
  FROM profiles WHERE id = NEW.actor_id;

  CASE NEW.reason
    WHEN 'like' THEN
      notification_title := '❤️ New Like';
      notification_body := actor_name || ' liked your post';
    WHEN 'reply' THEN
      notification_title := '💬 New Reply';
      notification_body := actor_name || ' replied to your post';
    WHEN 'follow' THEN
      notification_title := '👤 New Follower';
      notification_body := actor_name || ' started following you';
    WHEN 'repost' THEN
      notification_title := '🔄 New Repost';
      notification_body := actor_name || ' reposted your post';
    WHEN 'quote' THEN
      notification_title := '💬 New Quote';
      notification_body := actor_name || ' quoted your post';
    WHEN 'mention' THEN
      notification_title := '📢 New Mention';
      notification_body := actor_name || ' mentioned you';
    ELSE
      RETURN NEW;
  END CASE;

  notification_data := jsonb_build_object(
    'type', NEW.reason,
    'postId', NEW.post_id,
    'actorId', NEW.actor_id,
    'actorUsername', actor_username,
    'notificationId', NEW.id
  );

  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', notification_title,
      'body', notification_body,
      'data', notification_data
    )::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Push notification error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 8: CREATE TRIGGERS
-- ============================================================================

-- Auth trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Count triggers
CREATE TRIGGER trigger_update_post_likes
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

CREATE TRIGGER trigger_update_reposts_count
  AFTER INSERT OR DELETE ON reposts
  FOR EACH ROW EXECUTE FUNCTION update_post_reposts_count();

CREATE TRIGGER trigger_update_replies_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_parent_replies_count();

CREATE TRIGGER trigger_update_quotes_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_quotes_count();

CREATE TRIGGER trigger_update_follow_counts
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

CREATE TRIGGER trigger_update_profile_posts
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_profile_posts_count();

-- Notification triggers
CREATE TRIGGER trigger_create_like_notification
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION create_like_notification();

CREATE TRIGGER trigger_create_repost_notification
  AFTER INSERT ON reposts
  FOR EACH ROW EXECUTE FUNCTION create_repost_notification();

CREATE TRIGGER trigger_create_reply_notification
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.thread_parent_id IS NOT NULL)
  EXECUTE FUNCTION create_reply_notification();

CREATE TRIGGER trigger_create_quote_notification
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.type = 'quote')
  EXECUTE FUNCTION create_quote_notification();

CREATE TRIGGER trigger_create_follow_notification
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION create_follow_notification();

CREATE TRIGGER trigger_notify_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_notification();

-- ============================================================================
-- DONE! Federation-Ready Schema
-- ============================================================================
-- 
-- Key differences from before:
-- 
-- 1. THREADING: Uses thread_root_id + thread_parent_id (Bluesky model)
--    - Better for Post Ribbon UI
--    - Direct compatibility with AT Protocol
--    
-- 2. REPOSTS: Separate `reposts` table instead of post.is_repost
--    - Matches AT Protocol record model
--    - Cleaner data model
--    
-- 3. AT PROTOCOL FIELDS: Ready for federation
--    - profiles.did, profiles.handle
--    - posts.at_uri, posts.at_cid
--    - Embed fields for quote posts
--    
-- 4. NOTIFICATION REASONS: Uses 'reason' instead of 'type'
--    - Matches Bluesky notification API
--    - Added 'quote' and 'reply' as separate reasons
--
-- ============================================================================
-- 
-- APP CODE CHANGES NEEDED:
-- 
-- 1. Posts: Use thread_parent_id instead of reply_to_id
-- 2. Reposts: Insert into `reposts` table instead of posts
-- 3. Notifications: Use 'reason' column instead of 'type'
-- 4. Rename comments_count → replies_count
-- 
-- ============================================================================

-- ============================================================================
-- COMPLETE AT PROTOCOL SUPPORT
-- Adds starter packs, feed generators, and labeler support
-- ============================================================================

-- ============================================================================
-- 1. STARTER PACKS (app.bsky.graph.starterpack)
-- Onboarding bundles that help new users find people to follow
-- ============================================================================

CREATE TABLE IF NOT EXISTS starter_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at_uri TEXT UNIQUE,
  rkey TEXT,
  
  -- Starter pack content
  name TEXT NOT NULL,
  description TEXT,
  
  -- The list of users in this starter pack (references a list)
  list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
  
  -- Feeds included in the starter pack
  feed_uris TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE starter_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Starter packs viewable by everyone" ON starter_packs FOR SELECT USING (true);
CREATE POLICY "Users can create own starter packs" ON starter_packs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own starter packs" ON starter_packs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own starter packs" ON starter_packs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_starter_packs_user ON starter_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_starter_packs_list ON starter_packs(list_id);

-- ============================================================================
-- 2. FEED GENERATORS (app.bsky.feed.generator)
-- Custom algorithm definitions for feed generation
-- ============================================================================

CREATE TABLE IF NOT EXISTS feed_generators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at_uri TEXT UNIQUE,
  rkey TEXT,
  did TEXT NOT NULL, -- DID of the feed generator service
  
  -- Feed metadata
  display_name TEXT NOT NULL,
  description TEXT,
  description_facets JSONB, -- Rich text facets for description
  
  -- Feed branding
  avatar_cid TEXT,
  avatar_url TEXT,
  
  -- Feed preferences
  accepts_interactions BOOLEAN DEFAULT FALSE, -- Can receive likes
  labels JSONB, -- Self-labels
  
  -- Stats (denormalized for performance)
  like_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE feed_generators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feed generators viewable by everyone" ON feed_generators FOR SELECT USING (true);
CREATE POLICY "Users can create own feed generators" ON feed_generators FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feed generators" ON feed_generators FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own feed generators" ON feed_generators FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feed_generators_user ON feed_generators(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_generators_did ON feed_generators(did);

-- ============================================================================
-- 3. FEED LIKES (separate from post likes)
-- Users can like feed generators
-- ============================================================================

CREATE TABLE IF NOT EXISTS feed_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feed_generator_id UUID NOT NULL REFERENCES feed_generators(id) ON DELETE CASCADE,
  at_uri TEXT UNIQUE,
  rkey TEXT,
  subject_uri TEXT, -- AT URI of the liked feed
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, feed_generator_id)
);

ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feed likes viewable by everyone" ON feed_likes FOR SELECT USING (true);
CREATE POLICY "Users can like feeds" ON feed_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike feeds" ON feed_likes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feed_likes_user ON feed_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_likes_feed ON feed_likes(feed_generator_id);

-- Trigger to update feed like count
CREATE OR REPLACE FUNCTION update_feed_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feed_generators SET like_count = like_count + 1 WHERE id = NEW.feed_generator_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE feed_generators SET like_count = like_count - 1 WHERE id = OLD.feed_generator_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_feed_like_count ON feed_likes;
CREATE TRIGGER trigger_update_feed_like_count
AFTER INSERT OR DELETE ON feed_likes
FOR EACH ROW EXECUTE FUNCTION update_feed_like_count();

-- ============================================================================
-- 4. SAVED FEEDS (user's pinned/saved feed generators)
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feed_uri TEXT NOT NULL, -- AT URI of the feed generator
  feed_generator_id UUID REFERENCES feed_generators(id) ON DELETE CASCADE,
  is_pinned BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, feed_uri)
);

ALTER TABLE saved_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own saved feeds" ON saved_feeds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can save feeds" ON saved_feeds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update saved feeds" ON saved_feeds FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can unsave feeds" ON saved_feeds FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_feeds_user ON saved_feeds(user_id);

-- ============================================================================
-- 5. LABELER SERVICES (app.bsky.labeler.service)
-- Moderation/labeling service definitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS labeler_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at_uri TEXT UNIQUE,
  rkey TEXT,
  did TEXT UNIQUE NOT NULL, -- DID of the labeler service
  
  -- Labeler metadata
  policies JSONB, -- Label value definitions
  labels JSONB, -- Self-labels on the labeler itself
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE labeler_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Labeler services viewable by everyone" ON labeler_services FOR SELECT USING (true);
CREATE POLICY "Users can create own labeler services" ON labeler_services FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own labeler services" ON labeler_services FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own labeler services" ON labeler_services FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_labeler_services_did ON labeler_services(did);

-- ============================================================================
-- 6. APPLIED LABELS (labels applied to content by labelers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS applied_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source labeler
  labeler_did TEXT NOT NULL, -- DID of the labeler that applied this
  
  -- Target (what is being labeled)
  subject_uri TEXT, -- AT URI of post/profile being labeled
  subject_cid TEXT, -- CID at time of labeling (for posts)
  subject_did TEXT, -- DID of account being labeled (for account labels)
  
  -- Label details
  val TEXT NOT NULL, -- Label value (e.g., 'porn', 'spam', 'impersonation')
  neg BOOLEAN DEFAULT FALSE, -- Negation (removes a previous label)
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ, -- Optional expiration
  
  -- Signature for verification
  sig BYTEA -- Labeler signature
);

ALTER TABLE applied_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Labels viewable by everyone" ON applied_labels FOR SELECT USING (true);
-- Only labeler services can insert labels (would be enforced at app level)

CREATE INDEX IF NOT EXISTS idx_labels_subject_uri ON applied_labels(subject_uri);
CREATE INDEX IF NOT EXISTS idx_labels_subject_did ON applied_labels(subject_did);
CREATE INDEX IF NOT EXISTS idx_labels_labeler ON applied_labels(labeler_did);
CREATE INDEX IF NOT EXISTS idx_labels_val ON applied_labels(val);

-- ============================================================================
-- 7. SUBSCRIBED LABELERS (which labelers a user subscribes to)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscribed_labelers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  labeler_did TEXT NOT NULL,
  labeler_service_id UUID REFERENCES labeler_services(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, labeler_did)
);

ALTER TABLE subscribed_labelers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscribed labelers" ON subscribed_labelers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can subscribe to labelers" ON subscribed_labelers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsubscribe from labelers" ON subscribed_labelers FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscribed_labelers_user ON subscribed_labelers(user_id);

-- ============================================================================
-- 8. CONTENT HIDING PREFERENCES
-- User preferences for how to handle labeled content
-- ============================================================================

CREATE TABLE IF NOT EXISTS label_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  labeler_did TEXT, -- NULL means global preference
  label_val TEXT NOT NULL, -- The label value this preference applies to
  visibility TEXT NOT NULL CHECK (visibility IN ('ignore', 'warn', 'hide')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, labeler_did, label_val)
);

ALTER TABLE label_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own label preferences" ON label_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can set label preferences" ON label_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update label preferences" ON label_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete label preferences" ON label_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_label_preferences_user ON label_preferences(user_id);

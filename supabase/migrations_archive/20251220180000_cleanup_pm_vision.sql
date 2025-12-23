-- ============================================================================
-- CLEANUP: Remove PM Vision tables/columns that were added and rolled back
-- ============================================================================

-- 1. DROP EXTRA TABLES
DROP TABLE IF EXISTS pds_accounts CASCADE;
DROP TABLE IF EXISTS federation_queue CASCADE;
DROP TABLE IF EXISTS federated_likes CASCADE;

-- 2. REMOVE EXTRA COLUMNS FROM posts TABLE
ALTER TABLE posts DROP COLUMN IF EXISTS thread_root_id;
ALTER TABLE posts DROP COLUMN IF EXISTS thread_parent_id;
ALTER TABLE posts DROP COLUMN IF EXISTS thread_depth;
ALTER TABLE posts DROP COLUMN IF EXISTS quote_post_id;
ALTER TABLE posts DROP COLUMN IF EXISTS ghostwriter_enabled;
ALTER TABLE posts DROP COLUMN IF EXISTS ghostwriter_status;
ALTER TABLE posts DROP COLUMN IF EXISTS ghostwriter_synced_at;
ALTER TABLE posts DROP COLUMN IF EXISTS at_uri;
ALTER TABLE posts DROP COLUMN IF EXISTS at_cid;
ALTER TABLE posts DROP COLUMN IF EXISTS broadcast_to_bluesky;

-- 3. REMOVE EXTRA COLUMNS FROM profiles TABLE
ALTER TABLE profiles DROP COLUMN IF EXISTS pds_did;
ALTER TABLE profiles DROP COLUMN IF EXISTS pds_handle;
ALTER TABLE profiles DROP COLUMN IF EXISTS bluesky_did;
ALTER TABLE profiles DROP COLUMN IF EXISTS bluesky_handle;

-- 4. DROP GHOSTWRITER FUNCTIONS/TRIGGERS
DROP TRIGGER IF EXISTS on_post_ghostwriter ON posts;
DROP FUNCTION IF EXISTS queue_ghostwriter_sync();
DROP FUNCTION IF EXISTS process_ghostwriter_queue();

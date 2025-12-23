-- =============================================================================
-- External Follows: Allow following Bluesky users without Cannect accounts
-- =============================================================================
-- This migration makes following_id nullable so users can follow external
-- Bluesky users directly via their DID (subject_did).
-- =============================================================================

-- Step 1: Drop the existing NOT NULL constraint on following_id
ALTER TABLE follows ALTER COLUMN following_id DROP NOT NULL;

-- Step 2: Add check constraint to ensure either following_id OR subject_did is set
ALTER TABLE follows ADD CONSTRAINT follows_must_have_target 
  CHECK (following_id IS NOT NULL OR subject_did IS NOT NULL);

-- Step 3: Add subject_handle for display purposes (external users)
ALTER TABLE follows ADD COLUMN IF NOT EXISTS subject_handle TEXT;

-- Step 4: Add subject_display_name for display purposes
ALTER TABLE follows ADD COLUMN IF NOT EXISTS subject_display_name TEXT;

-- Step 5: Add subject_avatar for display purposes
ALTER TABLE follows ADD COLUMN IF NOT EXISTS subject_avatar TEXT;

-- Step 6: Create index on subject_did for efficient lookups
CREATE INDEX IF NOT EXISTS idx_follows_subject_did ON follows(subject_did) WHERE subject_did IS NOT NULL;

-- Step 7: Add rkey column if not exists (for federation)
ALTER TABLE follows ADD COLUMN IF NOT EXISTS rkey TEXT;

-- Step 8: Drop unique constraint on (follower_id, following_id) since following_id can be null
-- and create a new partial unique constraint
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_follower_id_following_id_key;

-- Unique: Can only follow a local user once
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_local_unique 
  ON follows(follower_id, following_id) 
  WHERE following_id IS NOT NULL;

-- Unique: Can only follow an external DID once
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_external_unique 
  ON follows(follower_id, subject_did) 
  WHERE following_id IS NULL AND subject_did IS NOT NULL;

-- Step 9: Update RLS policies to handle external follows
DROP POLICY IF EXISTS "Users can follow others" ON follows;
DROP POLICY IF EXISTS "Users can view follows" ON follows;
DROP POLICY IF EXISTS "Users can unfollow others" ON follows;

-- Anyone can view follows (for follower/following lists)
CREATE POLICY "Anyone can view follows" ON follows 
  FOR SELECT USING (true);

-- Users can create follows (both local and external)
CREATE POLICY "Users can follow others" ON follows 
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can delete their own follows
CREATE POLICY "Users can unfollow others" ON follows 
  FOR DELETE USING (auth.uid() = follower_id);

-- =============================================================================
-- Update queue_follow_for_federation to handle external follows
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_follow_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  v_follower_did TEXT;
  v_following_did TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
  v_record_data JSONB;
BEGIN
  -- Get follower's DID
  SELECT did INTO v_follower_did FROM profiles WHERE id = NEW.follower_id;
  
  -- Skip if follower isn't federated
  IF v_follower_did IS NULL THEN
    RAISE NOTICE 'Skipping follow federation - follower % has no DID', NEW.follower_id;
    RETURN NEW;
  END IF;
  
  -- Get following's DID: prefer subject_did, fallback to profile lookup
  v_following_did := NEW.subject_did;
  IF v_following_did IS NULL AND NEW.following_id IS NOT NULL THEN
    SELECT did INTO v_following_did FROM profiles WHERE id = NEW.following_id;
  END IF;
  
  -- Skip if no DID available for target
  IF v_following_did IS NULL THEN
    RAISE NOTICE 'Skipping follow federation - no DID for target';
    RETURN NEW;
  END IF;
  
  -- Generate rkey
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    v_rkey := REPLACE(REPLACE(REPLACE(encode(gen_random_bytes(10), 'base64'), '/', '_'), '+', '-'), '=', '');
  END IF;
  
  v_at_uri := 'at://' || v_follower_did || '/app.bsky.graph.follow/' || v_rkey;
  
  -- Update follow record with AT fields
  UPDATE follows SET
    rkey = v_rkey,
    at_uri = v_at_uri,
    subject_did = v_following_did
  WHERE id = NEW.id;
  
  -- Build AT Protocol record
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.graph.follow',
    'subject', v_following_did,
    'createdAt', to_char(COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    'follow', NEW.id, v_follower_did, 'app.bsky.graph.follow', v_rkey, v_at_uri, v_record_data, 'create', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET 
    record_data = EXCLUDED.record_data, 
    status = 'pending', 
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued follow for federation: %', v_at_uri;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON COLUMN follows.following_id IS 'Local Cannect user ID (NULL for external Bluesky follows)';
COMMENT ON COLUMN follows.subject_did IS 'AT Protocol DID of the followed user (required for external follows)';
COMMENT ON COLUMN follows.subject_handle IS 'Bluesky handle for display (external follows only)';
COMMENT ON COLUMN follows.subject_display_name IS 'Display name for external follows';
COMMENT ON COLUMN follows.subject_avatar IS 'Avatar URL for external follows';

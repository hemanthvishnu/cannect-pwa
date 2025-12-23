-- =============================================================================
-- Phase 2: Post Federation Migration
-- =============================================================================
-- Enhances federation_queue for post sync and adds auto-queue trigger
-- =============================================================================

-- Add missing columns to federation_queue
ALTER TABLE federation_queue
ADD COLUMN IF NOT EXISTS user_did TEXT,
ADD COLUMN IF NOT EXISTS collection TEXT,
ADD COLUMN IF NOT EXISTS rkey TEXT,
ADD COLUMN IF NOT EXISTS record_data JSONB;

-- Add unique constraint for deduplication
ALTER TABLE federation_queue
DROP CONSTRAINT IF EXISTS unique_pending_record;

ALTER TABLE federation_queue
ADD CONSTRAINT unique_pending_record 
UNIQUE (record_type, record_id, operation);

-- Update check constraint to include 'reply'
ALTER TABLE federation_queue
DROP CONSTRAINT IF EXISTS federation_queue_record_type_check;

ALTER TABLE federation_queue
ADD CONSTRAINT federation_queue_record_type_check 
CHECK (record_type IN ('post', 'like', 'repost', 'follow', 'block', 'profile', 'reply'));

-- Add indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_federation_queue_pending_created 
ON federation_queue(status, created_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_federation_queue_user_did 
ON federation_queue(user_did);

-- =============================================================================
-- Function to queue posts for federation
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_post_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_user_handle TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
  v_record_data JSONB;
  v_parent_uri TEXT;
  v_parent_cid TEXT;
  v_root_uri TEXT;
  v_root_cid TEXT;
BEGIN
  -- Get user's DID and handle from their profile
  SELECT did, handle INTO v_user_did, v_user_handle
  FROM profiles WHERE id = NEW.user_id;
  
  -- Skip if user isn't federated yet (no DID)
  IF v_user_did IS NULL THEN
    RAISE NOTICE 'Skipping federation for post % - user has no DID', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Use existing rkey or generate a new one
  -- Using base64 encoding for URL-safe rkey
  v_rkey := COALESCE(NEW.rkey, REPLACE(REPLACE(encode(gen_random_bytes(10), 'base64'), '/', '_'), '+', '-'));
  v_rkey := REPLACE(v_rkey, '=', ''); -- Remove padding
  
  -- Build AT URI
  v_at_uri := 'at://' || v_user_did || '/app.bsky.feed.post/' || v_rkey;
  
  -- Update the post with AT Protocol fields
  UPDATE posts SET
    rkey = v_rkey,
    at_uri = v_at_uri
  WHERE id = NEW.id AND (rkey IS NULL OR at_uri IS NULL);
  
  -- Build the base AT Protocol record
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.feed.post',
    'text', COALESCE(NEW.content, ''),
    'createdAt', to_char(COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'langs', COALESCE(NEW.langs, ARRAY['en'])
  );
  
  -- Add facets if present
  IF NEW.facets IS NOT NULL THEN
    v_record_data := v_record_data || jsonb_build_object('facets', NEW.facets);
  END IF;
  
  -- Add reply reference if this is a reply
  IF NEW.thread_parent_id IS NOT NULL THEN
    -- Get parent's AT URI and CID
    SELECT at_uri, at_cid INTO v_parent_uri, v_parent_cid
    FROM posts WHERE id = NEW.thread_parent_id;
    
    -- Get root's AT URI and CID (or use parent as root)
    SELECT at_uri, at_cid INTO v_root_uri, v_root_cid
    FROM posts WHERE id = COALESCE(NEW.thread_root_id, NEW.thread_parent_id);
    
    -- Only add reply reference if we have the parent's AT info
    IF v_parent_uri IS NOT NULL AND v_parent_cid IS NOT NULL THEN
      v_record_data := v_record_data || jsonb_build_object(
        'reply', jsonb_build_object(
          'root', jsonb_build_object(
            'uri', COALESCE(v_root_uri, v_parent_uri), 
            'cid', COALESCE(v_root_cid, v_parent_cid)
          ),
          'parent', jsonb_build_object(
            'uri', v_parent_uri, 
            'cid', v_parent_cid
          )
        )
      );
    END IF;
  END IF;
  
  -- Add to federation queue
  INSERT INTO federation_queue (
    record_type,
    record_id,
    user_did,
    collection,
    rkey,
    at_uri,
    record_data,
    operation,
    status
  ) VALUES (
    CASE WHEN NEW.is_reply THEN 'reply' ELSE 'post' END,
    NEW.id,
    v_user_did,
    'app.bsky.feed.post',
    v_rkey,
    v_at_uri,
    v_record_data,
    'create',
    'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET
    record_data = EXCLUDED.record_data,
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued post % for federation: %', NEW.id, v_at_uri;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_post_federation ON posts;

-- Create trigger to auto-queue posts for federation
CREATE TRIGGER trigger_queue_post_federation
AFTER INSERT ON posts
FOR EACH ROW
EXECUTE FUNCTION queue_post_for_federation();

-- =============================================================================
-- Function to queue post deletions for federation
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_post_deletion_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
BEGIN
  -- Skip if post wasn't federated (no AT URI)
  IF OLD.at_uri IS NULL THEN
    RETURN OLD;
  END IF;
  
  -- Get user's DID
  SELECT did INTO v_user_did
  FROM profiles WHERE id = OLD.user_id;
  
  IF v_user_did IS NULL THEN
    RETURN OLD;
  END IF;
  
  -- Add deletion to federation queue
  INSERT INTO federation_queue (
    record_type,
    record_id,
    user_did,
    collection,
    rkey,
    at_uri,
    record_data,
    operation,
    status
  ) VALUES (
    CASE WHEN OLD.is_reply THEN 'reply' ELSE 'post' END,
    OLD.id,
    v_user_did,
    'app.bsky.feed.post',
    OLD.rkey,
    OLD.at_uri,
    NULL,
    'delete',
    'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RETURN OLD;
END;
$$;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_post_deletion_federation ON posts;

-- Create trigger to auto-queue post deletions
CREATE TRIGGER trigger_queue_post_deletion_federation
BEFORE DELETE ON posts
FOR EACH ROW
EXECUTE FUNCTION queue_post_deletion_for_federation();

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON COLUMN federation_queue.user_did IS 'DID of the user who owns this record';
COMMENT ON COLUMN federation_queue.collection IS 'AT Protocol collection (e.g., app.bsky.feed.post)';
COMMENT ON COLUMN federation_queue.rkey IS 'Record key within the collection';
COMMENT ON COLUMN federation_queue.record_data IS 'Full AT Protocol record to sync';
COMMENT ON FUNCTION queue_post_for_federation() IS 'Auto-queues new posts for AT Protocol federation';
COMMENT ON FUNCTION queue_post_deletion_for_federation() IS 'Auto-queues post deletions for AT Protocol federation';

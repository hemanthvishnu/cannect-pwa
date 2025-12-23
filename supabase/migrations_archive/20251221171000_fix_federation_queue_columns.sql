-- Fix repost and like federation triggers to use correct column names
-- The federation_queue table has 'user_did' not 'did'

-- =============================================================================
-- Fix queue_repost_for_federation - correct column names
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_repost_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_post_at_uri TEXT;
  v_post_at_cid TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
  v_record_data JSONB;
BEGIN
  -- Get user's DID
  SELECT did INTO v_user_did FROM profiles WHERE id = NEW.user_id;
  
  IF v_user_did IS NULL THEN
    RAISE NOTICE 'Skipping repost federation - user % has no DID', NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Get post's AT URI and CID from the repost record first
  v_post_at_uri := NEW.subject_uri;
  v_post_at_cid := NEW.subject_cid;
  
  -- Always lookup from posts table if either is missing
  IF v_post_at_uri IS NULL OR v_post_at_cid IS NULL THEN
    SELECT posts.at_uri, posts.at_cid 
    INTO v_post_at_uri, v_post_at_cid
    FROM posts WHERE id = NEW.post_id;
  END IF;
  
  -- Skip if post isn't federated (no AT URI)
  IF v_post_at_uri IS NULL THEN
    RAISE NOTICE 'Skipping repost federation - post % has no AT URI', NEW.post_id;
    RETURN NEW;
  END IF;
  
  -- Skip if post doesn't have CID yet (not synced to PDS)
  IF v_post_at_cid IS NULL THEN
    RAISE NOTICE 'Skipping repost federation - post % has no CID yet', NEW.post_id;
    RETURN NEW;
  END IF;
  
  -- Generate rkey using valid TID format
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    v_rkey := generate_tid();
  END IF;
  
  -- Build AT URI
  v_at_uri := 'at://' || v_user_did || '/app.bsky.feed.repost/' || v_rkey;
  
  -- Update the repost record
  UPDATE reposts SET
    rkey = v_rkey,
    at_uri = v_at_uri,
    subject_uri = v_post_at_uri,
    subject_cid = v_post_at_cid
  WHERE id = NEW.id;
  
  -- Build AT Protocol record
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.feed.repost',
    'subject', jsonb_build_object(
      'uri', v_post_at_uri,
      'cid', v_post_at_cid
    ),
    'createdAt', to_char(COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  
  -- Queue for federation with CORRECT column names
  INSERT INTO federation_queue (
    operation,
    record_type,
    record_id,
    collection,
    rkey,
    user_did,
    at_uri,
    record_data,
    status,
    created_at
  ) VALUES (
    'create',
    'repost',
    NEW.id,
    'app.bsky.feed.repost',
    v_rkey,
    v_user_did,
    v_at_uri,
    v_record_data,
    'pending',
    NOW()
  );
  
  RAISE NOTICE 'Queued repost federation: rkey=%, did=%', v_rkey, v_user_did;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in queue_repost_for_federation: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix queue_like_for_federation - correct column names
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_like_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_post_at_uri TEXT;
  v_post_at_cid TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
  v_record_data JSONB;
BEGIN
  -- Get user's DID
  SELECT did INTO v_user_did FROM profiles WHERE id = NEW.user_id;
  
  IF v_user_did IS NULL THEN
    RAISE NOTICE 'Skipping like federation - user % has no DID', NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Get post's AT URI and CID
  v_post_at_uri := NEW.subject_uri;
  v_post_at_cid := NEW.subject_cid;
  
  IF v_post_at_uri IS NULL OR v_post_at_cid IS NULL THEN
    SELECT posts.at_uri, posts.at_cid 
    INTO v_post_at_uri, v_post_at_cid
    FROM posts WHERE id = NEW.post_id;
  END IF;
  
  IF v_post_at_uri IS NULL THEN
    RAISE NOTICE 'Skipping like federation - post % has no AT URI', NEW.post_id;
    RETURN NEW;
  END IF;
  
  IF v_post_at_cid IS NULL THEN
    RAISE NOTICE 'Skipping like federation - post % has no CID yet', NEW.post_id;
    RETURN NEW;
  END IF;
  
  -- Generate rkey using valid TID format
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    v_rkey := generate_tid();
  END IF;
  
  -- Build AT URI
  v_at_uri := 'at://' || v_user_did || '/app.bsky.feed.like/' || v_rkey;
  
  -- Update the like record
  UPDATE likes SET
    rkey = v_rkey,
    at_uri = v_at_uri,
    subject_uri = v_post_at_uri,
    subject_cid = v_post_at_cid
  WHERE id = NEW.id;
  
  -- Build AT Protocol record
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.feed.like',
    'subject', jsonb_build_object(
      'uri', v_post_at_uri,
      'cid', v_post_at_cid
    ),
    'createdAt', to_char(COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  
  -- Queue for federation with CORRECT column names
  INSERT INTO federation_queue (
    operation,
    record_type,
    record_id,
    collection,
    rkey,
    user_did,
    at_uri,
    record_data,
    status,
    created_at
  ) VALUES (
    'create',
    'like',
    NEW.id,
    'app.bsky.feed.like',
    v_rkey,
    v_user_did,
    v_at_uri,
    v_record_data,
    'pending',
    NOW()
  );
  
  RAISE NOTICE 'Queued like federation: rkey=%, did=%', v_rkey, v_user_did;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in queue_like_for_federation: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Also fix the unrepost function
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_unrepost_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
BEGIN
  RAISE NOTICE 'queue_unrepost_for_federation: Trigger fired for repost id=%', OLD.id;
  
  v_rkey := OLD.rkey;
  v_at_uri := OLD.at_uri;
  
  RAISE NOTICE 'queue_unrepost_for_federation: rkey=%, at_uri=%', v_rkey, v_at_uri;
  
  IF v_rkey IS NULL OR v_at_uri IS NULL THEN
    RAISE NOTICE 'queue_unrepost_for_federation: Skipping - not federated (rkey or at_uri is null)';
    RETURN OLD;
  END IF;
  
  SELECT did INTO v_user_did FROM profiles WHERE id = OLD.user_id;
  RAISE NOTICE 'queue_unrepost_for_federation: user_did=%', v_user_did;
  
  IF v_user_did IS NULL THEN
    RAISE NOTICE 'queue_unrepost_for_federation: Skipping - user has no DID';
    RETURN OLD;
  END IF;
  
  -- Insert with CORRECT column names
  INSERT INTO federation_queue (
    operation,
    record_type,
    record_id,
    collection,
    rkey,
    user_did,
    at_uri,
    status,
    created_at
  ) VALUES (
    'delete',
    'repost',
    OLD.id,
    'app.bsky.feed.repost',
    v_rkey,
    v_user_did,
    v_at_uri,
    'pending',
    NOW()
  );
  
  RAISE NOTICE 'queue_unrepost_for_federation: Successfully queued delete for rkey=%', v_rkey;
  
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_unrepost_for_federation: Error - %', SQLERRM;
  RETURN OLD;
END;
$$;

-- =============================================================================
-- And the unlike function
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_unlike_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
BEGIN
  v_rkey := OLD.rkey;
  v_at_uri := OLD.at_uri;
  
  IF v_rkey IS NULL OR v_at_uri IS NULL THEN
    RETURN OLD;
  END IF;
  
  SELECT did INTO v_user_did FROM profiles WHERE id = OLD.user_id;
  
  IF v_user_did IS NULL THEN
    RETURN OLD;
  END IF;
  
  -- Insert with CORRECT column names
  INSERT INTO federation_queue (
    operation,
    record_type,
    record_id,
    collection,
    rkey,
    user_did,
    at_uri,
    status,
    created_at
  ) VALUES (
    'delete',
    'like',
    OLD.id,
    'app.bsky.feed.like',
    v_rkey,
    v_user_did,
    v_at_uri,
    'pending',
    NOW()
  );
  
  RAISE NOTICE 'Queued unlike federation: rkey=%, did=%', v_rkey, v_user_did;
  
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in queue_unlike_for_federation: %', SQLERRM;
  RETURN OLD;
END;
$$;

-- =============================================================================
-- Manually fix the orphaned repost
-- =============================================================================
DO $$
DECLARE
  v_repost_id UUID := '13377637-675c-4737-89d3-664fb5da074f';
  v_user_did TEXT;
  v_post_at_uri TEXT;
  v_post_at_cid TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
  v_record_data JSONB;
  v_created_at TIMESTAMPTZ;
BEGIN
  -- Check if repost still exists (might have been unreposted)
  IF NOT EXISTS (SELECT 1 FROM reposts WHERE id = v_repost_id) THEN
    RAISE NOTICE 'Repost % no longer exists, skipping', v_repost_id;
    RETURN;
  END IF;

  -- Get all the data we need
  SELECT 
    p.did,
    posts.at_uri,
    posts.at_cid,
    r.created_at
  INTO 
    v_user_did,
    v_post_at_uri,
    v_post_at_cid,
    v_created_at
  FROM reposts r
  JOIN profiles p ON r.user_id = p.id
  JOIN posts ON r.post_id = posts.id
  WHERE r.id = v_repost_id;
  
  RAISE NOTICE 'User DID: %', v_user_did;
  RAISE NOTICE 'Post AT URI: %', v_post_at_uri;
  RAISE NOTICE 'Post AT CID: %', v_post_at_cid;
  
  -- Generate a valid TID rkey
  v_rkey := generate_tid();
  RAISE NOTICE 'Generated rkey: %', v_rkey;
  
  -- Build AT URI
  v_at_uri := 'at://' || v_user_did || '/app.bsky.feed.repost/' || v_rkey;
  RAISE NOTICE 'AT URI: %', v_at_uri;
  
  -- Update the repost record
  UPDATE reposts SET
    rkey = v_rkey,
    at_uri = v_at_uri,
    subject_uri = v_post_at_uri,
    subject_cid = v_post_at_cid
  WHERE id = v_repost_id;
  
  RAISE NOTICE 'Updated repost record';
  
  -- Build AT Protocol record
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.feed.repost',
    'subject', jsonb_build_object(
      'uri', v_post_at_uri,
      'cid', v_post_at_cid
    ),
    'createdAt', to_char(v_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  
  -- Queue for federation with CORRECT column names
  INSERT INTO federation_queue (
    operation,
    record_type,
    record_id,
    collection,
    rkey,
    user_did,
    at_uri,
    record_data,
    status,
    created_at
  ) VALUES (
    'create',
    'repost',
    v_repost_id,
    'app.bsky.feed.repost',
    v_rkey,
    v_user_did,
    v_at_uri,
    v_record_data,
    'pending',
    NOW()
  );
  
  RAISE NOTICE 'Queued repost for federation with rkey: %', v_rkey;
END;
$$;

-- Delete the failed migration record
DELETE FROM supabase_migrations.schema_migrations 
WHERE name = '20251221170000_fix_orphaned_repost_hello_bluesky.sql';

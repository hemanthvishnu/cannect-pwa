-- Fix repost rkey generation to use valid TID format
-- The old base64 method generated invalid rkeys like "HXUEH9NJfd1WOQ"
-- TID format requires 13 characters using base32-sortable alphabet

-- =============================================================================
-- Update queue_repost_for_federation to use generate_tid()
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
    -- Use generate_tid() for valid AT Protocol TID format (13 chars, base32-sortable)
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
  
  -- Queue for federation
  INSERT INTO federation_queue (
    operation,
    collection,
    rkey,
    did,
    record_data,
    status,
    created_at
  ) VALUES (
    'create',
    'app.bsky.feed.repost',
    v_rkey,
    v_user_did,
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

COMMENT ON FUNCTION queue_repost_for_federation() IS 
  'Auto-queues new reposts for AT Protocol federation using valid TID-format rkeys';


-- =============================================================================
-- Also fix queue_like_for_federation to use generate_tid()
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
  
  -- Skip if user isn't federated
  IF v_user_did IS NULL THEN
    RAISE NOTICE 'Skipping like federation - user % has no DID', NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Get post's AT URI and CID from the like record first
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
    RAISE NOTICE 'Skipping like federation - post % has no AT URI', NEW.post_id;
    RETURN NEW;
  END IF;
  
  -- Skip if post doesn't have CID yet (not synced to PDS)
  IF v_post_at_cid IS NULL THEN
    RAISE NOTICE 'Skipping like federation - post % has no CID yet', NEW.post_id;
    RETURN NEW;
  END IF;
  
  -- Generate rkey using valid TID format
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    -- Use generate_tid() for valid AT Protocol TID format (13 chars, base32-sortable)
    v_rkey := generate_tid();
  END IF;
  
  -- Build AT URI for the like
  v_at_uri := 'at://' || v_user_did || '/app.bsky.feed.like/' || v_rkey;
  
  -- Update the like record with AT fields
  UPDATE likes SET
    rkey = v_rkey,
    at_uri = v_at_uri,
    subject_uri = v_post_at_uri,
    subject_cid = v_post_at_cid
  WHERE id = NEW.id;
  
  -- Build the AT Protocol record
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.feed.like',
    'subject', jsonb_build_object(
      'uri', v_post_at_uri,
      'cid', v_post_at_cid
    ),
    'createdAt', to_char(COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  
  -- Queue for federation
  INSERT INTO federation_queue (
    operation,
    collection,
    rkey,
    did,
    record_data,
    status,
    created_at
  ) VALUES (
    'create',
    'app.bsky.feed.like',
    v_rkey,
    v_user_did,
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

COMMENT ON FUNCTION queue_like_for_federation() IS 
  'Auto-queues new likes for AT Protocol federation using valid TID-format rkeys';

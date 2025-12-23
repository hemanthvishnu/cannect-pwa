-- =============================================================================
-- Comprehensive Fix: All federation functions search_path + CID lookup
-- =============================================================================
-- This migration fixes:
-- 1. All functions need search_path = public, extensions (for pgcrypto)
-- 2. Repost function needs same CID lookup fix as like
-- 3. Ensure pgcrypto extension exists
-- =============================================================================

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =============================================================================
-- Fix queue_post_for_federation - add extensions to search_path
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_post_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
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
    SELECT at_uri, at_cid INTO v_parent_uri, v_parent_cid
    FROM posts WHERE id = NEW.thread_parent_id;
    
    IF NEW.thread_root_id IS NOT NULL AND NEW.thread_root_id != NEW.thread_parent_id THEN
      SELECT at_uri, at_cid INTO v_root_uri, v_root_cid
      FROM posts WHERE id = NEW.thread_root_id;
    ELSE
      v_root_uri := v_parent_uri;
      v_root_cid := v_parent_cid;
    END IF;
    
    IF v_parent_uri IS NOT NULL AND v_parent_cid IS NOT NULL THEN
      v_record_data := v_record_data || jsonb_build_object(
        'reply', jsonb_build_object(
          'parent', jsonb_build_object('uri', v_parent_uri, 'cid', v_parent_cid),
          'root', jsonb_build_object('uri', COALESCE(v_root_uri, v_parent_uri), 'cid', COALESCE(v_root_cid, v_parent_cid))
        )
      );
    END IF;
  END IF;
  
  -- Add embed for media if present
  IF NEW.media_urls IS NOT NULL AND array_length(NEW.media_urls, 1) > 0 THEN
    v_record_data := v_record_data || jsonb_build_object(
      'embed', jsonb_build_object(
        '$type', 'app.bsky.embed.images',
        'images', (
          SELECT jsonb_agg(jsonb_build_object(
            'image', jsonb_build_object('$type', 'blob', 'ref', jsonb_build_object('$link', url), 'mimeType', 'image/jpeg', 'size', 0),
            'alt', ''
          ))
          FROM unnest(NEW.media_urls) AS url
        )
      )
    );
  END IF;
  
  -- Insert into federation queue
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    CASE WHEN NEW.thread_parent_id IS NOT NULL THEN 'reply' ELSE 'post' END,
    NEW.id, v_user_did, 'app.bsky.feed.post', v_rkey, v_at_uri, v_record_data, 'create', 'pending'
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

-- =============================================================================
-- Fix queue_post_deletion_for_federation
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_post_deletion_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
BEGIN
  -- Only queue if the post was federated (has AT URI)
  IF OLD.at_uri IS NOT NULL THEN
    INSERT INTO federation_queue (
      record_type, record_id, user_did, collection, rkey, at_uri, operation, status
    )
    SELECT 
      CASE WHEN OLD.thread_parent_id IS NOT NULL THEN 'reply' ELSE 'post' END,
      OLD.id,
      p.did,
      'app.bsky.feed.post',
      OLD.rkey,
      OLD.at_uri,
      'delete',
      'pending'
    FROM profiles p WHERE p.id = OLD.user_id AND p.did IS NOT NULL
    ON CONFLICT (record_type, record_id, operation) 
    DO UPDATE SET status = 'pending', attempts = 0, last_error = NULL, created_at = NOW();
    
    RAISE NOTICE 'Queued post deletion for federation: %', OLD.at_uri;
  END IF;
  
  RETURN OLD;
END;
$$;

-- =============================================================================
-- Fix queue_like_for_federation - search_path + CID lookup
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
  
  -- Generate rkey if not set
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    v_rkey := REPLACE(REPLACE(REPLACE(encode(gen_random_bytes(10), 'base64'), '/', '_'), '+', '-'), '=', '');
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
  
  -- Add to federation queue
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    'like', NEW.id, v_user_did, 'app.bsky.feed.like', v_rkey, v_at_uri, v_record_data, 'create', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET
    record_data = EXCLUDED.record_data,
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued like % for federation: %', NEW.id, v_at_uri;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix queue_unlike_for_federation
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_unlike_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.at_uri IS NOT NULL THEN
    INSERT INTO federation_queue (
      record_type, record_id, user_did, collection, rkey, at_uri, operation, status
    )
    SELECT 'like', OLD.id, p.did, 'app.bsky.feed.like', OLD.rkey, OLD.at_uri, 'delete', 'pending'
    FROM profiles p WHERE p.id = OLD.user_id AND p.did IS NOT NULL
    ON CONFLICT (record_type, record_id, operation) 
    DO UPDATE SET status = 'pending', attempts = 0, last_error = NULL, created_at = NOW();
    
    RAISE NOTICE 'Queued unlike for federation: %', OLD.at_uri;
  END IF;
  RETURN OLD;
END;
$$;

-- =============================================================================
-- Fix queue_repost_for_federation - search_path + CID lookup
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
  
  -- Generate rkey
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    v_rkey := REPLACE(REPLACE(REPLACE(encode(gen_random_bytes(10), 'base64'), '/', '_'), '+', '-'), '=', '');
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
  
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    'repost', NEW.id, v_user_did, 'app.bsky.feed.repost', v_rkey, v_at_uri, v_record_data, 'create', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET
    record_data = EXCLUDED.record_data,
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued repost % for federation: %', NEW.id, v_at_uri;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix queue_unrepost_for_federation
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_unrepost_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.at_uri IS NOT NULL THEN
    INSERT INTO federation_queue (
      record_type, record_id, user_did, collection, rkey, at_uri, operation, status
    )
    SELECT 'repost', OLD.id, p.did, 'app.bsky.feed.repost', OLD.rkey, OLD.at_uri, 'delete', 'pending'
    FROM profiles p WHERE p.id = OLD.user_id AND p.did IS NOT NULL
    ON CONFLICT (record_type, record_id, operation) 
    DO UPDATE SET status = 'pending', attempts = 0, last_error = NULL, created_at = NOW();
    
    RAISE NOTICE 'Queued unrepost for federation: %', OLD.at_uri;
  END IF;
  RETURN OLD;
END;
$$;

-- =============================================================================
-- Fix queue_follow_for_federation
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
  
  -- Get following's DID (could be from subject_did or profile lookup)
  v_following_did := NEW.subject_did;
  IF v_following_did IS NULL THEN
    SELECT did INTO v_following_did FROM profiles WHERE id = NEW.following_id;
  END IF;
  
  -- Skip if following user has no DID (local-only user)
  IF v_following_did IS NULL THEN
    RAISE NOTICE 'Skipping follow federation - following user % has no DID', NEW.following_id;
    RETURN NEW;
  END IF;
  
  -- Generate rkey
  v_rkey := NEW.rkey;
  IF v_rkey IS NULL THEN
    v_rkey := REPLACE(REPLACE(REPLACE(encode(gen_random_bytes(10), 'base64'), '/', '_'), '+', '-'), '=', '');
  END IF;
  
  v_at_uri := 'at://' || v_follower_did || '/app.bsky.graph.follow/' || v_rkey;
  
  -- Update follow record
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
  
  RAISE NOTICE 'Queued follow % for federation: %', NEW.id, v_at_uri;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Fix queue_unfollow_for_federation
-- =============================================================================
CREATE OR REPLACE FUNCTION queue_unfollow_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.at_uri IS NOT NULL THEN
    INSERT INTO federation_queue (
      record_type, record_id, user_did, collection, rkey, at_uri, operation, status
    )
    SELECT 'follow', OLD.id, p.did, 'app.bsky.graph.follow', OLD.rkey, OLD.at_uri, 'delete', 'pending'
    FROM profiles p WHERE p.id = OLD.follower_id AND p.did IS NOT NULL
    ON CONFLICT (record_type, record_id, operation) 
    DO UPDATE SET status = 'pending', attempts = 0, last_error = NULL, created_at = NOW();
    
    RAISE NOTICE 'Queued unfollow for federation: %', OLD.at_uri;
  END IF;
  RETURN OLD;
END;
$$;

-- =============================================================================
-- Update any existing reposts/likes that have subject_uri but missing subject_cid
-- =============================================================================
UPDATE likes 
SET subject_cid = (SELECT at_cid FROM posts WHERE id = likes.post_id)
WHERE subject_cid IS NULL AND post_id IS NOT NULL;

UPDATE reposts 
SET subject_cid = (SELECT at_cid FROM posts WHERE id = reposts.post_id)
WHERE subject_cid IS NULL AND post_id IS NOT NULL;

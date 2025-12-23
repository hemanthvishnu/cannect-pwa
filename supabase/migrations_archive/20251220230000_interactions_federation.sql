-- =============================================================================
-- Phase 3: Interactions Federation Migration
-- =============================================================================
-- Adds federation triggers for likes, reposts, and follows
-- These triggers auto-queue interactions for sync to Bluesky via AT Protocol
-- =============================================================================

-- =============================================================================
-- LIKES FEDERATION
-- =============================================================================

-- Index for AT URI lookups on likes
CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_at_uri 
ON likes(at_uri) WHERE at_uri IS NOT NULL;

-- Function to queue likes for federation
CREATE OR REPLACE FUNCTION queue_like_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
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
  
  -- Get post's AT URI and CID (either from column or lookup)
  v_post_at_uri := NEW.subject_uri;
  v_post_at_cid := NEW.subject_cid;
  
  IF v_post_at_uri IS NULL THEN
    SELECT posts.at_uri, posts.at_cid 
    INTO v_post_at_uri, v_post_at_cid
    FROM posts WHERE id = NEW.post_id;
  END IF;
  
  -- Skip if post isn't federated (no AT URI)
  IF v_post_at_uri IS NULL THEN
    RAISE NOTICE 'Skipping like federation - post % has no AT URI', NEW.post_id;
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

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_like_federation ON likes;

-- Trigger for new likes
CREATE TRIGGER trigger_queue_like_federation
AFTER INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION queue_like_for_federation();

-- Function to queue like deletions (unlikes)
CREATE OR REPLACE FUNCTION queue_unlike_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
BEGIN
  -- Get user's DID
  SELECT did INTO v_user_did FROM profiles WHERE id = OLD.user_id;
  
  -- Skip if not federated or no AT URI
  IF v_user_did IS NULL OR OLD.at_uri IS NULL THEN
    RETURN OLD;
  END IF;
  
  -- Add deletion to federation queue
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    'like', OLD.id, v_user_did, 'app.bsky.feed.like', OLD.rkey, OLD.at_uri, NULL, 'delete', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET 
    status = 'pending', 
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued unlike % for federation', OLD.id;
  RETURN OLD;
END;
$$;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_unlike_federation ON likes;

-- Trigger for unlike (delete)
CREATE TRIGGER trigger_queue_unlike_federation
BEFORE DELETE ON likes
FOR EACH ROW
EXECUTE FUNCTION queue_unlike_for_federation();


-- =============================================================================
-- REPOSTS FEDERATION
-- =============================================================================

-- Index for AT URI lookups on reposts
CREATE UNIQUE INDEX IF NOT EXISTS idx_reposts_at_uri 
ON reposts(at_uri) WHERE at_uri IS NOT NULL;

-- Function to queue reposts for federation
CREATE OR REPLACE FUNCTION queue_repost_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
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
  
  -- Get post's AT URI and CID
  v_post_at_uri := NEW.subject_uri;
  v_post_at_cid := NEW.subject_cid;
  
  IF v_post_at_uri IS NULL THEN
    SELECT posts.at_uri, posts.at_cid 
    INTO v_post_at_uri, v_post_at_cid
    FROM posts WHERE id = NEW.post_id;
  END IF;
  
  IF v_post_at_uri IS NULL THEN
    RAISE NOTICE 'Skipping repost federation - post % has no AT URI', NEW.post_id;
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
  
  -- Add to federation queue
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

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_repost_federation ON reposts;

-- Trigger for new reposts
CREATE TRIGGER trigger_queue_repost_federation
AFTER INSERT ON reposts
FOR EACH ROW
EXECUTE FUNCTION queue_repost_for_federation();

-- Function to queue unrepost
CREATE OR REPLACE FUNCTION queue_unrepost_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
BEGIN
  SELECT did INTO v_user_did FROM profiles WHERE id = OLD.user_id;
  
  IF v_user_did IS NULL OR OLD.at_uri IS NULL THEN
    RETURN OLD;
  END IF;
  
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    'repost', OLD.id, v_user_did, 'app.bsky.feed.repost', OLD.rkey, OLD.at_uri, NULL, 'delete', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET 
    status = 'pending', 
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued unrepost % for federation', OLD.id;
  RETURN OLD;
END;
$$;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_unrepost_federation ON reposts;

-- Trigger for unrepost
CREATE TRIGGER trigger_queue_unrepost_federation
BEFORE DELETE ON reposts
FOR EACH ROW
EXECUTE FUNCTION queue_unrepost_for_federation();


-- =============================================================================
-- FOLLOWS FEDERATION
-- =============================================================================

-- Index for AT URI lookups on follows
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_at_uri 
ON follows(at_uri) WHERE at_uri IS NOT NULL;

-- Function to queue follows for federation
CREATE OR REPLACE FUNCTION queue_follow_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
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

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_follow_federation ON follows;

-- Trigger for new follows
CREATE TRIGGER trigger_queue_follow_federation
AFTER INSERT ON follows
FOR EACH ROW
EXECUTE FUNCTION queue_follow_for_federation();

-- Function to queue unfollow
CREATE OR REPLACE FUNCTION queue_unfollow_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
LANGUAGE plpgsql AS $$
DECLARE
  v_follower_did TEXT;
BEGIN
  SELECT did INTO v_follower_did FROM profiles WHERE id = OLD.follower_id;
  
  IF v_follower_did IS NULL OR OLD.at_uri IS NULL THEN
    RETURN OLD;
  END IF;
  
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
  ) VALUES (
    'follow', OLD.id, v_follower_did, 'app.bsky.graph.follow', OLD.rkey, OLD.at_uri, NULL, 'delete', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET 
    status = 'pending', 
    attempts = 0,
    last_error = NULL,
    created_at = NOW();
  
  RAISE NOTICE 'Queued unfollow % for federation', OLD.id;
  RETURN OLD;
END;
$$;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trigger_queue_unfollow_federation ON follows;

-- Trigger for unfollow
CREATE TRIGGER trigger_queue_unfollow_federation
BEFORE DELETE ON follows
FOR EACH ROW
EXECUTE FUNCTION queue_unfollow_for_federation();


-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON FUNCTION queue_like_for_federation() IS 'Auto-queues new likes for AT Protocol federation';
COMMENT ON FUNCTION queue_unlike_for_federation() IS 'Auto-queues like deletions for AT Protocol federation';
COMMENT ON FUNCTION queue_repost_for_federation() IS 'Auto-queues new reposts for AT Protocol federation';
COMMENT ON FUNCTION queue_unrepost_for_federation() IS 'Auto-queues repost deletions for AT Protocol federation';
COMMENT ON FUNCTION queue_follow_for_federation() IS 'Auto-queues new follows for AT Protocol federation';
COMMENT ON FUNCTION queue_unfollow_for_federation() IS 'Auto-queues follow deletions for AT Protocol federation';

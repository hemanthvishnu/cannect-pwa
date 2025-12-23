-- =============================================================================
-- Fix: Always lookup CID when null (even if subject_uri is provided)
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

-- Fix the existing like record
UPDATE likes 
SET subject_cid = (SELECT at_cid FROM posts WHERE id = likes.post_id)
WHERE subject_cid IS NULL AND post_id IS NOT NULL;

-- Re-queue any likes that failed due to missing CID
UPDATE federation_queue fq
SET 
  record_data = jsonb_set(
    fq.record_data, 
    '{subject,cid}', 
    to_jsonb((SELECT at_cid FROM posts p JOIN likes l ON l.post_id = p.id WHERE l.id = fq.record_id))
  ),
  status = 'pending',
  attempts = 0,
  last_error = NULL
WHERE fq.record_type = 'like' 
  AND fq.status = 'pending'
  AND fq.last_error LIKE '%cid must be a string%';

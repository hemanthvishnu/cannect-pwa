-- Fix existing quote post with invalid rkey
-- The rkey '18Gwf3L3Ob_-zw' is not valid TID format (contains _ and -)
-- We need to queue a delete for the old record and create with a new valid rkey

DO $$
DECLARE
  v_post_id UUID;
  v_user_did TEXT;
  v_old_rkey TEXT := '18Gwf3L3Ob_-zw';
  v_old_at_uri TEXT;
  v_new_rkey TEXT;
  v_new_at_uri TEXT;
  v_record_data JSONB;
  v_quoted_uri TEXT;
  v_quoted_cid TEXT;
BEGIN
  -- Find the post with the invalid rkey
  SELECT p.id, pr.did INTO v_post_id, v_user_did
  FROM posts p
  JOIN profiles pr ON p.user_id = pr.id
  WHERE p.rkey = v_old_rkey;
  
  IF v_post_id IS NULL THEN
    RAISE NOTICE 'Post with rkey % not found, skipping', v_old_rkey;
    RETURN;
  END IF;
  
  v_old_at_uri := 'at://' || v_user_did || '/app.bsky.feed.post/' || v_old_rkey;
  
  -- Generate new valid TID rkey
  v_new_rkey := generate_tid();
  v_new_at_uri := 'at://' || v_user_did || '/app.bsky.feed.post/' || v_new_rkey;
  
  RAISE NOTICE 'Fixing quote post:';
  RAISE NOTICE '  Old rkey: % (invalid)', v_old_rkey;
  RAISE NOTICE '  New rkey: % (valid TID)', v_new_rkey;
  RAISE NOTICE '  Old URI: %', v_old_at_uri;
  RAISE NOTICE '  New URI: %', v_new_at_uri;
  
  -- Clear any existing queue entries for this post
  DELETE FROM federation_queue 
  WHERE record_type = 'post' AND record_id = v_post_id;
  
  RAISE NOTICE 'Cleared existing queue entries';
  
  -- Queue delete for the old record on PDS
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, 
    record_data, operation, status
  ) VALUES (
    'post', v_post_id, v_user_did, 'app.bsky.feed.post', v_old_rkey, v_old_at_uri,
    '{}'::jsonb, 'delete', 'pending'
  );
  
  RAISE NOTICE 'Queued delete for old record';
  
  -- Get the quoted post info for the embed
  SELECT p.at_uri, p.at_cid INTO v_quoted_uri, v_quoted_cid
  FROM posts p
  JOIN posts quote ON quote.repost_of_id = p.id
  WHERE quote.id = v_post_id;
  
  -- Build the new record data with embed
  SELECT jsonb_build_object(
    '$type', 'app.bsky.feed.post',
    'text', COALESCE(p.content, ''),
    'createdAt', to_char(COALESCE(p.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'langs', COALESCE(p.langs, ARRAY['en']),
    'embed', jsonb_build_object(
      '$type', 'app.bsky.embed.record',
      'record', jsonb_build_object(
        'uri', v_quoted_uri,
        'cid', v_quoted_cid
      )
    )
  ) INTO v_record_data
  FROM posts p
  WHERE p.id = v_post_id;
  
  -- Update the post with new rkey and at_uri
  UPDATE posts SET
    rkey = v_new_rkey,
    at_uri = v_new_at_uri,
    at_cid = NULL  -- Will be set when PDS confirms creation
  WHERE id = v_post_id;
  
  -- Queue create for the new record
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, 
    record_data, operation, status
  ) VALUES (
    'post', v_post_id, v_user_did, 'app.bsky.feed.post', v_new_rkey, v_new_at_uri,
    v_record_data, 'create', 'pending'
  );
  
  RAISE NOTICE 'Queued create for new record with data: %', v_record_data;
  RAISE NOTICE 'Quote post fix complete!';
END;
$$;

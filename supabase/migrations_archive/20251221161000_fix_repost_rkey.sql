-- Fix existing repost with invalid rkey
-- The rkey 'HXUEH9NJfd1WOQ' is not valid TID format (contains uppercase letters)
-- We need to queue a delete for the old record and create with a new valid rkey

DO $$
DECLARE
  v_repost_id UUID;
  v_subject_uri TEXT;
  v_subject_cid TEXT;
  v_created_at TIMESTAMPTZ;
  v_user_did TEXT;
  v_old_rkey TEXT := 'HXUEH9NJfd1WOQ';
  v_old_at_uri TEXT;
  v_new_rkey TEXT;
  v_new_at_uri TEXT;
  v_record_data JSONB;
BEGIN
  -- Find the repost with the invalid rkey
  SELECT r.id, r.subject_uri, r.subject_cid, r.created_at, pr.did 
  INTO v_repost_id, v_subject_uri, v_subject_cid, v_created_at, v_user_did
  FROM reposts r
  JOIN profiles pr ON r.user_id = pr.id
  WHERE r.rkey = v_old_rkey;
  
  IF v_repost_id IS NULL THEN
    RAISE NOTICE 'Repost with rkey % not found, skipping', v_old_rkey;
    RETURN;
  END IF;
  
  v_old_at_uri := 'at://' || v_user_did || '/app.bsky.feed.repost/' || v_old_rkey;
  
  -- Generate new valid TID rkey
  v_new_rkey := generate_tid();
  v_new_at_uri := 'at://' || v_user_did || '/app.bsky.feed.repost/' || v_new_rkey;
  
  RAISE NOTICE 'Fixing repost:';
  RAISE NOTICE '  Old rkey: % (invalid)', v_old_rkey;
  RAISE NOTICE '  New rkey: % (valid TID)', v_new_rkey;
  RAISE NOTICE '  Old URI: %', v_old_at_uri;
  RAISE NOTICE '  New URI: %', v_new_at_uri;
  
  -- Clear any existing queue entries for this repost
  DELETE FROM federation_queue 
  WHERE record_type = 'repost' AND record_id = v_repost_id;
  
  RAISE NOTICE 'Cleared existing queue entries';
  
  -- Queue delete for the old record on PDS
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, 
    record_data, operation, status
  ) VALUES (
    'repost', v_repost_id, v_user_did, 'app.bsky.feed.repost', v_old_rkey, v_old_at_uri,
    '{}'::jsonb, 'delete', 'pending'
  );
  
  RAISE NOTICE 'Queued delete for old record';
  
  -- Build the new record data
  v_record_data := jsonb_build_object(
    '$type', 'app.bsky.feed.repost',
    'subject', jsonb_build_object(
      'uri', v_subject_uri,
      'cid', v_subject_cid
    ),
    'createdAt', to_char(COALESCE(v_created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  
  -- Update the repost with new rkey and at_uri
  UPDATE reposts SET
    rkey = v_new_rkey,
    at_uri = v_new_at_uri
  WHERE id = v_repost_id;
  
  -- Queue create for the new record
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, 
    record_data, operation, status
  ) VALUES (
    'repost', v_repost_id, v_user_did, 'app.bsky.feed.repost', v_new_rkey, v_new_at_uri,
    v_record_data, 'create', 'pending'
  );
  
  RAISE NOTICE 'Queued create for new record with data: %', v_record_data;
  RAISE NOTICE 'Repost fix complete!';
END;
$$;

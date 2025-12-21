-- Enhanced queue_unrepost_for_federation with better debugging
CREATE OR REPLACE FUNCTION queue_unrepost_for_federation()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public, extensions
LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_insert_count INTEGER;
BEGIN
  RAISE NOTICE '[queue_unrepost_for_federation] Trigger fired for repost id=%', OLD.id;
  RAISE NOTICE '[queue_unrepost_for_federation] OLD.at_uri=%', OLD.at_uri;
  RAISE NOTICE '[queue_unrepost_for_federation] OLD.rkey=%', OLD.rkey;
  RAISE NOTICE '[queue_unrepost_for_federation] OLD.user_id=%', OLD.user_id;
  
  IF OLD.at_uri IS NULL THEN
    RAISE NOTICE '[queue_unrepost_for_federation] Skipping - at_uri is NULL';
    RETURN OLD;
  END IF;
  
  -- Get user DID
  SELECT did INTO v_user_did FROM profiles WHERE id = OLD.user_id;
  RAISE NOTICE '[queue_unrepost_for_federation] User DID=%', v_user_did;
  
  IF v_user_did IS NULL THEN
    RAISE NOTICE '[queue_unrepost_for_federation] Skipping - user has no DID';
    RETURN OLD;
  END IF;
  
  -- Insert into queue
  INSERT INTO federation_queue (
    record_type, record_id, user_did, collection, rkey, at_uri, operation, status
  ) VALUES (
    'repost', OLD.id, v_user_did, 'app.bsky.feed.repost', OLD.rkey, OLD.at_uri, 'delete', 'pending'
  )
  ON CONFLICT (record_type, record_id, operation) 
  DO UPDATE SET status = 'pending', attempts = 0, last_error = NULL, created_at = NOW();
  
  GET DIAGNOSTICS v_insert_count = ROW_COUNT;
  RAISE NOTICE '[queue_unrepost_for_federation] Inserted/updated % rows in federation_queue', v_insert_count;
  RAISE NOTICE '[queue_unrepost_for_federation] SUCCESS - Queued delete for %', OLD.at_uri;
  
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[queue_unrepost_for_federation] ERROR: % %', SQLERRM, SQLSTATE;
  -- Don't fail the delete, just log the error
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION queue_unrepost_for_federation() IS 'Enhanced with detailed logging for debugging federation queue issues';

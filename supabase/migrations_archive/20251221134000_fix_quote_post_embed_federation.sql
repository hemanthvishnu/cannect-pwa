-- Fix queue_post_for_federation to include embed for quote posts
-- Quote posts need an embed.record field pointing to the quoted post

CREATE OR REPLACE FUNCTION queue_post_for_federation()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  v_user_did TEXT;
  v_rkey TEXT;
  v_at_uri TEXT;
  v_record_data JSONB;
  v_parent_uri TEXT;
  v_parent_cid TEXT;
  v_root_uri TEXT;
  v_root_cid TEXT;
  v_quoted_uri TEXT;
  v_quoted_cid TEXT;
BEGIN
  -- Skip if user doesn't have a DID (not federated)
  SELECT did INTO v_user_did FROM profiles WHERE id = NEW.user_id;
  IF v_user_did IS NULL THEN
    RAISE NOTICE 'Skipping post federation: user % has no DID', NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Generate rkey using TID format
  v_rkey := generate_tid();
  
  -- Build the AT URI
  v_at_uri := 'at://' || v_user_did || '/app.bsky.feed.post/' || v_rkey;
  
  -- Update the post with AT Protocol fields BEFORE building record
  UPDATE posts SET 
    at_uri = v_at_uri, 
    rkey = v_rkey
  WHERE id = NEW.id;
  
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
  
  -- Add embed for quote posts (when repost_of_id is set with content)
  IF NEW.repost_of_id IS NOT NULL AND NEW.content IS NOT NULL AND NEW.content != '' THEN
    -- Get the quoted post's AT URI and CID
    SELECT at_uri, at_cid INTO v_quoted_uri, v_quoted_cid
    FROM posts WHERE id = NEW.repost_of_id;
    
    -- Only add embed if quoted post has AT info
    IF v_quoted_uri IS NOT NULL AND v_quoted_cid IS NOT NULL THEN
      v_record_data := v_record_data || jsonb_build_object(
        'embed', jsonb_build_object(
          '$type', 'app.bsky.embed.record',
          'record', jsonb_build_object(
            'uri', v_quoted_uri,
            'cid', v_quoted_cid
          )
        )
      );
      
      -- Also update the post's embed fields
      UPDATE posts SET 
        embed_type = 'record',
        embed_record_uri = v_quoted_uri,
        embed_record_cid = v_quoted_cid
      WHERE id = NEW.id;
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
    CASE 
      WHEN NEW.is_reply THEN 'reply' 
      ELSE 'post' 
    END,
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

-- Now let's update the existing quote post to have the embed on the PDS
-- We need to re-queue it with the correct embed data
DO $$
DECLARE
  v_quote_post RECORD;
  v_quoted_uri TEXT;
  v_quoted_cid TEXT;
  v_user_did TEXT;
  v_record_data JSONB;
BEGIN
  -- Get the existing quote post
  SELECT * INTO v_quote_post FROM posts WHERE type = 'quote' AND repost_of_id IS NOT NULL LIMIT 1;
  
  IF v_quote_post IS NOT NULL THEN
    -- Get quoted post's AT info
    SELECT at_uri, at_cid INTO v_quoted_uri, v_quoted_cid
    FROM posts WHERE id = v_quote_post.repost_of_id;
    
    -- Get user DID
    SELECT did INTO v_user_did FROM profiles WHERE id = v_quote_post.user_id;
    
    IF v_quoted_uri IS NOT NULL AND v_quoted_cid IS NOT NULL AND v_user_did IS NOT NULL THEN
      -- Build the record with embed
      v_record_data := jsonb_build_object(
        '$type', 'app.bsky.feed.post',
        'text', v_quote_post.content,
        'createdAt', to_char(v_quote_post.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'langs', ARRAY['en'],
        'embed', jsonb_build_object(
          '$type', 'app.bsky.embed.record',
          'record', jsonb_build_object(
            'uri', v_quoted_uri,
            'cid', v_quoted_cid
          )
        )
      );
      
      -- Update the post's embed fields
      UPDATE posts SET 
        embed_type = 'record',
        embed_record_uri = v_quoted_uri,
        embed_record_cid = v_quoted_cid
      WHERE id = v_quote_post.id;
      
      -- Re-queue for federation (update operation to refresh on PDS)
      INSERT INTO federation_queue (
        record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
      ) VALUES (
        'quote', v_quote_post.id, v_user_did, 'app.bsky.feed.post', v_quote_post.rkey, v_quote_post.at_uri, v_record_data, 'update', 'pending'
      )
      ON CONFLICT (record_type, record_id, operation) 
      DO UPDATE SET record_data = EXCLUDED.record_data, status = 'pending', attempts = 0;
      
      RAISE NOTICE 'Re-queued quote post % with embed', v_quote_post.id;
    END IF;
  END IF;
END $$;

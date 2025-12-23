-- Fix set_post_type trigger to properly handle quote posts with repost_of_id
-- The issue: When inserting a quote post with repost_of_id, the trigger was
-- overriding type='quote' with type='post' because it only checked embed_record_uri

CREATE OR REPLACE FUNCTION set_post_type()
RETURNS TRIGGER AS $$
BEGIN
  -- Check for quote posts: either embed_record_uri OR repost_of_id (and content)
  IF NEW.embed_record_uri IS NOT NULL 
     OR NEW.embed_type = 'record' 
     OR NEW.embed_type = 'record_with_media'
     OR (NEW.repost_of_id IS NOT NULL AND NEW.content IS NOT NULL AND NEW.content != '') THEN
    NEW.type := 'quote';
  ELSIF NEW.thread_parent_id IS NOT NULL THEN
    NEW.type := 'reply';
  ELSIF NEW.type IS NULL OR NEW.type = '' THEN
    -- Only default to 'post' if not already set
    NEW.type := 'post';
  END IF;
  
  -- Calculate thread depth
  IF NEW.thread_parent_id IS NOT NULL THEN
    SELECT COALESCE(thread_depth, 0) + 1 INTO NEW.thread_depth
    FROM posts WHERE id = NEW.thread_parent_id;
  END IF;
  
  -- Set thread_root if this is a reply
  IF NEW.thread_parent_id IS NOT NULL AND NEW.thread_root_id IS NULL THEN
    SELECT COALESCE(thread_root_id, id) INTO NEW.thread_root_id
    FROM posts WHERE id = NEW.thread_parent_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also fix the existing quote post that was created with wrong type
UPDATE posts 
SET type = 'quote' 
WHERE repost_of_id IS NOT NULL 
  AND content IS NOT NULL 
  AND content != '' 
  AND type = 'post';

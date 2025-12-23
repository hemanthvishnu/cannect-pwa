-- Add repost notification trigger
-- When someone reposts your post, you get notified

CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  original_author_id UUID;
BEGIN
  -- Only for reposts of internal posts (not federated/external)
  IF NEW.type = 'repost' AND NEW.repost_of_id IS NOT NULL THEN
    -- Get the author of the original post
    SELECT user_id INTO original_author_id FROM posts WHERE id = NEW.repost_of_id;
    
    -- Don't notify if reposting your own post
    IF original_author_id IS NOT NULL AND original_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, actor_id, type, post_id)
      VALUES (original_author_id, NEW.user_id, 'repost', NEW.repost_of_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_create_repost_notification ON posts;

-- Create the trigger
CREATE TRIGGER trigger_create_repost_notification
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.type = 'repost' AND NEW.repost_of_id IS NOT NULL)
  EXECUTE FUNCTION create_repost_notification();

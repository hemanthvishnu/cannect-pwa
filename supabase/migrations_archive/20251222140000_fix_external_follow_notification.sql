-- Migration: Fix follow notification for external follows
-- When following an external Bluesky user (following_id IS NULL), skip notification creation
-- since there's no local user to notify

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS trigger_create_follow_notification ON follows;

-- Update the function to handle external follows
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  -- Only create notification if following a local user (following_id is NOT NULL)
  -- External Bluesky users don't have a local user_id to notify
  IF NEW.following_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, actor_id, reason)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_create_follow_notification
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION create_follow_notification();

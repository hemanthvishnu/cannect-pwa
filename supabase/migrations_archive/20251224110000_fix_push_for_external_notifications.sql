-- Migration: Fix push notification trigger for external notifications
-- Updates to use 'reason' column and handle is_external=true notifications

CREATE OR REPLACE FUNCTION notify_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  actor_username TEXT;
  notification_title TEXT;
  notification_body TEXT;
  notification_data JSONB;
  edge_function_url TEXT := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/send-push-notification';
BEGIN
  -- Get the actor's display name and username
  -- For external notifications, use the external actor fields
  IF NEW.is_external = TRUE THEN
    actor_name := COALESCE(NEW.actor_display_name, NEW.actor_handle, 'Someone on Bluesky');
    actor_username := NEW.actor_handle;
  ELSE
    SELECT 
      COALESCE(display_name, username, 'Someone'),
      username
    INTO actor_name, actor_username
    FROM profiles
    WHERE id = NEW.actor_id;
  END IF;

  -- Build notification content based on reason (with emojis for consistency)
  CASE NEW.reason
    WHEN 'like' THEN
      notification_title := '❤️ New Like';
      notification_body := actor_name || ' liked your post';
      notification_data := jsonb_build_object(
        'type', 'like',
        'postId', NEW.post_id,
        'notificationId', NEW.id,
        'isExternal', COALESCE(NEW.is_external, false)
      );
    WHEN 'reply' THEN
      notification_title := '💬 New Reply';
      notification_body := actor_name || ' replied to your post';
      notification_data := jsonb_build_object(
        'type', 'reply',
        'postId', NEW.post_id,
        'notificationId', NEW.id,
        'isExternal', COALESCE(NEW.is_external, false)
      );
    WHEN 'follow' THEN
      notification_title := '👤 New Follower';
      notification_body := actor_name || ' started following you';
      notification_data := jsonb_build_object(
        'type', 'follow',
        'actorId', NEW.actor_id,
        'actorDid', NEW.actor_did,
        'actorUsername', actor_username,
        'notificationId', NEW.id,
        'isExternal', COALESCE(NEW.is_external, false)
      );
    WHEN 'repost' THEN
      notification_title := '🔄 New Repost';
      notification_body := actor_name || ' reposted your post';
      notification_data := jsonb_build_object(
        'type', 'repost',
        'postId', NEW.post_id,
        'notificationId', NEW.id,
        'isExternal', COALESCE(NEW.is_external, false)
      );
    WHEN 'quote' THEN
      notification_title := '💬 New Quote';
      notification_body := actor_name || ' quoted your post';
      notification_data := jsonb_build_object(
        'type', 'quote',
        'postId', NEW.post_id,
        'notificationId', NEW.id,
        'isExternal', COALESCE(NEW.is_external, false)
      );
    WHEN 'mention' THEN
      notification_title := '📣 New Mention';
      notification_body := actor_name || ' mentioned you';
      notification_data := jsonb_build_object(
        'type', 'mention',
        'postId', NEW.post_id,
        'notificationId', NEW.id,
        'isExternal', COALESCE(NEW.is_external, false)
      );
    ELSE
      -- Unknown type, skip push notification
      RETURN NEW;
  END CASE;

  -- Queue the push notification via pg_net (async HTTP call)
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bGpuY2FkeWxjdHNya3F0YXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYxNTczNCwiZXhwIjoyMDgxMTkxNzM0fQ.ntsH14p65qNGhSU7miYiOLo3hrqsIvRdFxgizHNPmL0'
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', notification_title,
      'body', notification_body,
      'data', notification_data
    )::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the trigger
    RAISE WARNING 'Push notification error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure trigger exists on notifications table
DROP TRIGGER IF EXISTS trigger_notify_push ON notifications;
CREATE TRIGGER trigger_notify_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_notification();

COMMENT ON FUNCTION notify_push_notification() IS 
  'Sends push notification via Edge Function when a notification is created - supports both internal and external (Bluesky) actors';

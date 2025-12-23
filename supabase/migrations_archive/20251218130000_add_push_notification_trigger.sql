-- Migration: Update notification triggers to send push notifications
-- This creates a helper function and updates existing triggers

-- Create a helper function to invoke the edge function for push notifications
CREATE OR REPLACE FUNCTION notify_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  notification_title TEXT;
  notification_body TEXT;
  notification_data JSONB;
BEGIN
  -- Get the actor's display name
  SELECT COALESCE(display_name, username, 'Someone') INTO actor_name
  FROM profiles
  WHERE id = NEW.actor_id;

  -- Build notification content based on type
  CASE NEW.type
    WHEN 'like' THEN
      notification_title := 'New Like';
      notification_body := actor_name || ' liked your post';
      notification_data := jsonb_build_object(
        'type', 'like',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    WHEN 'comment' THEN
      notification_title := 'New Comment';
      notification_body := actor_name || ' commented on your post';
      notification_data := jsonb_build_object(
        'type', 'comment',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    WHEN 'follow' THEN
      notification_title := 'New Follower';
      notification_body := actor_name || ' started following you';
      notification_data := jsonb_build_object(
        'type', 'follow',
        'actorId', NEW.actor_id,
        'notificationId', NEW.id
      );
    WHEN 'repost' THEN
      notification_title := 'New Repost';
      notification_body := actor_name || ' reposted your post';
      notification_data := jsonb_build_object(
        'type', 'repost',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    ELSE
      -- Unknown type, skip push notification
      RETURN NEW;
  END CASE;

  -- Queue the push notification via pg_net (async HTTP call)
  -- This requires the pg_net extension to be enabled
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
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

-- Create trigger to send push notifications when a new notification is created
DROP TRIGGER IF EXISTS trigger_send_push_notification ON notifications;

CREATE TRIGGER trigger_send_push_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_notification();

-- Add comment
COMMENT ON FUNCTION notify_push_notification() IS 'Sends push notification via Edge Function when a notification is created';

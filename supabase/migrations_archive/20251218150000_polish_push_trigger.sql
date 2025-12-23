-- Migration: Polish push notification trigger
-- Adds actorUsername for follow navigation and emojis for consistency

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
  SELECT 
    COALESCE(display_name, username, 'Someone'),
    username
  INTO actor_name, actor_username
  FROM profiles
  WHERE id = NEW.actor_id;

  -- Build notification content based on type (with emojis for consistency)
  CASE NEW.type
    WHEN 'like' THEN
      notification_title := '❤️ New Like';
      notification_body := actor_name || ' liked your post';
      notification_data := jsonb_build_object(
        'type', 'like',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    WHEN 'comment' THEN
      notification_title := '💬 New Comment';
      notification_body := actor_name || ' commented on your post';
      notification_data := jsonb_build_object(
        'type', 'comment',
        'postId', NEW.post_id,
        'notificationId', NEW.id
      );
    WHEN 'follow' THEN
      notification_title := '👤 New Follower';
      notification_body := actor_name || ' started following you';
      notification_data := jsonb_build_object(
        'type', 'follow',
        'actorId', NEW.actor_id,
        'actorUsername', actor_username,
        'notificationId', NEW.id
      );
    WHEN 'repost' THEN
      notification_title := '🔄 New Repost';
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
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bGpuY2FkeWxjdHNya3F0YXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI3MjQxMDIsImV4cCI6MjA0ODMwMDEwMn0.g0FmI5-hS2oQ3eeGCcbgdOmCBiWW5piEuMx89EIFQ2s'
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

-- Comment
COMMENT ON FUNCTION notify_push_notification() IS 'Sends push notification via Edge Function when a notification is created - with emojis and actorUsername';

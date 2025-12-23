-- Migration: Fix push notification trigger to use direct URL
-- Updates the notify_push_notification function with hardcoded Edge Function URL

CREATE OR REPLACE FUNCTION notify_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  notification_title TEXT;
  notification_body TEXT;
  notification_data JSONB;
  edge_function_url TEXT := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/send-push-notification';
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
  -- The Edge Function uses service_role internally, so we use anon key for the call
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

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

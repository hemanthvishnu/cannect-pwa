-- Allow notifications from external actors (without Cannect profile)
-- These are Bluesky users who interact with Cannect content

-- Make actor_id nullable for external notifications
ALTER TABLE notifications
ALTER COLUMN actor_id DROP NOT NULL;

-- Add constraint: either actor_id OR is_external must be true
ALTER TABLE notifications
ADD CONSTRAINT chk_notification_actor
CHECK (
  actor_id IS NOT NULL  -- Internal notification with known actor
  OR is_external = TRUE -- External notification (actor_did stores the DID)
);

COMMENT ON CONSTRAINT chk_notification_actor ON notifications IS 
  'Notifications must have either an internal actor_id or be external';

-- Add index for deduplication of external notifications
CREATE INDEX IF NOT EXISTS idx_notifications_external_dedup
ON notifications(user_id, reason, actor_did, post_id)
WHERE is_external = TRUE;

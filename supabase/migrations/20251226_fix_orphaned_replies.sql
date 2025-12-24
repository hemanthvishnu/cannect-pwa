-- Migration: Fix orphaned replies by linking thread_parent_id from AT URIs
-- Date: 2024-12-24
-- Purpose: Existing replies have thread_parent_uri but thread_parent_id is NULL
--          This causes them to not appear in thread queries

-- Update replies that have AT URIs but missing local IDs
UPDATE posts p
SET 
  thread_parent_id = parent.id,
  thread_root_id = COALESCE(
    (SELECT id FROM posts WHERE at_uri = p.thread_root_uri),
    parent.id
  ),
  thread_depth = COALESCE(parent.thread_depth, 0) + 1
FROM posts parent
WHERE 
  p.thread_parent_uri IS NOT NULL 
  AND p.thread_parent_id IS NULL 
  AND parent.at_uri = p.thread_parent_uri;

-- After linking replies, update parent posts' replies_count
-- The trigger only fires on INSERT, so we need to manually recalculate
UPDATE posts parent
SET replies_count = (
  SELECT COUNT(*) 
  FROM posts reply 
  WHERE reply.thread_parent_id = parent.id
)
WHERE parent.id IN (
  SELECT DISTINCT thread_parent_id 
  FROM posts 
  WHERE thread_parent_id IS NOT NULL
);

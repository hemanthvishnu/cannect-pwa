-- Fix: Run triggers as Admin (SECURITY DEFINER) to prevent 403 errors
-- when updating other users' post counters

-- Drop existing triggers and function with CASCADE
DROP TRIGGER IF EXISTS trigger_update_post_likes ON likes;
DROP TRIGGER IF EXISTS update_likes_count_trigger ON likes;
DROP FUNCTION IF EXISTS update_post_likes_count() CASCADE;

-- Create the function with SECURITY DEFINER
-- This allows the function to run with elevated privileges
CREATE OR REPLACE FUNCTION update_post_likes_count() 
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END; 
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_likes_count_trigger
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION update_post_likes_count();

-- Also add repost columns if they don't exist (safety check)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of_id UUID REFERENCES posts(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_repost BOOLEAN DEFAULT FALSE;

-- Add index for repost lookups
CREATE INDEX IF NOT EXISTS idx_posts_repost_of_id ON posts(repost_of_id) WHERE repost_of_id IS NOT NULL;

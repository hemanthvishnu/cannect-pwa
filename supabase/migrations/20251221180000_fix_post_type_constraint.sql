-- Fix posts.type check constraint to include 'reply'
-- The original constraint only allowed ('post', 'repost', 'quote')
-- But the set_post_type trigger sets type = 'reply' for replies

-- Drop the old constraint
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_type_check;

-- Add the updated constraint with 'reply'
ALTER TABLE posts ADD CONSTRAINT posts_type_check 
  CHECK (type IN ('post', 'reply', 'quote', 'repost'));

-- Verify with a comment
COMMENT ON COLUMN posts.type IS 'Post type: post (standalone), reply (threaded reply), quote (quote post), repost (simple repost)';

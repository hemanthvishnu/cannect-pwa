-- Add type column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'post' CHECK (type IN ('post', 'repost', 'quote'));

-- Update existing reposts to have type 'repost'
UPDATE posts SET type = 'repost' WHERE is_repost = true;

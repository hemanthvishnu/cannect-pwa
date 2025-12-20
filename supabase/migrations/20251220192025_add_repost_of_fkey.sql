-- Add foreign key for repost_of_id to enable PostgREST joins
-- This allows queries like: quoted_post:repost_of_id(...)

-- Add the foreign key constraint (if column exists)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'repost_of_id'
  ) THEN
    -- Drop existing constraint if any
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_repost_of_id_fkey;
    
    -- Add proper foreign key
    ALTER TABLE posts 
      ADD CONSTRAINT posts_repost_of_id_fkey 
      FOREIGN KEY (repost_of_id) REFERENCES posts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Also add foreign key for reply_to_id if it exists (for backwards compatibility)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'reply_to_id'
  ) THEN
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_reply_to_id_fkey;
    
    ALTER TABLE posts 
      ADD CONSTRAINT posts_reply_to_id_fkey 
      FOREIGN KEY (reply_to_id) REFERENCES posts(id) ON DELETE SET NULL;
  END IF;
END $$;

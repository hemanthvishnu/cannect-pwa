-- Add video URL column for Cloudflare Stream
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add thumbnail URL for video previews
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT;

-- Index for media queries (Profile Media tab)
CREATE INDEX IF NOT EXISTS idx_posts_has_media 
ON posts(user_id, created_at DESC) 
WHERE media_urls IS NOT NULL OR video_url IS NOT NULL;

-- Comments
COMMENT ON COLUMN posts.video_url IS 'Cloudflare Stream HLS playback URL';
COMMENT ON COLUMN posts.video_thumbnail_url IS 'Cloudflare Stream auto-generated thumbnail';

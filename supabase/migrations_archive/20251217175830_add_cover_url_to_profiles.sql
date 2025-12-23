-- Add cover image URL to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.cover_url IS 'URL to the user profile cover/banner image';
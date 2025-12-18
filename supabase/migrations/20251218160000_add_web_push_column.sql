-- Add web push subscription column to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS web_push_subscription JSONB;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_web_push 
ON profiles(id) 
WHERE web_push_subscription IS NOT NULL;

-- Comment
COMMENT ON COLUMN profiles.web_push_subscription IS 'Web Push API subscription object (endpoint, keys)';

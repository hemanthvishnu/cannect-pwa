-- Add push token column to profiles for push notifications
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Index for faster lookups when sending notifications
CREATE INDEX IF NOT EXISTS idx_profiles_push_token 
ON profiles(expo_push_token) 
WHERE expo_push_token IS NOT NULL;

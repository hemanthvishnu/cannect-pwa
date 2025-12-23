-- =============================================================================
-- UNIFIED PROFILES: Allow external Bluesky users in profiles table
-- =============================================================================
-- This migration enables storing external Bluesky users directly in the 
-- profiles table, allowing unified foreign keys and simpler queries.
-- =============================================================================

-- Step 1: Add is_local column to distinguish Cannect users from external
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_local BOOLEAN DEFAULT TRUE NOT NULL;

-- Step 2: Make id not reference auth.users (we'll manage this ourselves)
-- First, drop the foreign key constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Step 3: Add auth_user_id column for local users (replaces the id->auth.users relationship)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 4: Backfill auth_user_id for existing local users
UPDATE profiles SET auth_user_id = id WHERE is_local = TRUE AND auth_user_id IS NULL;

-- Step 5: Add last_synced_at for external profile caching
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Step 6: Make username nullable for external users (they use handle instead)
ALTER TABLE profiles ALTER COLUMN username DROP NOT NULL;

-- Step 7: Add unique constraint on did (if not exists)
-- This is the universal identifier for all users
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_did_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_did_key UNIQUE (did);
  END IF;
END $$;

-- Step 8: Create index on handle for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);
CREATE INDEX IF NOT EXISTS idx_profiles_is_local ON profiles(is_local);

-- Step 9: Create function to upsert external profiles
CREATE OR REPLACE FUNCTION upsert_external_profile(
  p_did TEXT,
  p_handle TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_followers_count INTEGER DEFAULT 0,
  p_following_count INTEGER DEFAULT 0,
  p_posts_count INTEGER DEFAULT 0,
  p_pds_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Try to find existing profile by DID
  SELECT id INTO v_profile_id FROM profiles WHERE did = p_did;
  
  IF v_profile_id IS NOT NULL THEN
    -- Update existing profile
    UPDATE profiles SET
      handle = COALESCE(p_handle, handle),
      display_name = COALESCE(p_display_name, display_name),
      avatar_url = COALESCE(p_avatar_url, avatar_url),
      bio = COALESCE(p_bio, bio),
      followers_count = COALESCE(p_followers_count, followers_count),
      following_count = COALESCE(p_following_count, following_count),
      posts_count = COALESCE(p_posts_count, posts_count),
      pds_url = COALESCE(p_pds_url, pds_url),
      last_synced_at = NOW(),
      updated_at = NOW()
    WHERE id = v_profile_id;
  ELSE
    -- Create new external profile with generated UUID
    v_profile_id := gen_random_uuid();
    
    INSERT INTO profiles (
      id,
      did,
      handle,
      username,
      display_name,
      avatar_url,
      bio,
      followers_count,
      following_count,
      posts_count,
      pds_url,
      is_local,
      last_synced_at,
      created_at,
      updated_at
    ) VALUES (
      v_profile_id,
      p_did,
      p_handle,
      NULL, -- External users don't have a Cannect username
      p_display_name,
      p_avatar_url,
      p_bio,
      p_followers_count,
      p_following_count,
      p_posts_count,
      p_pds_url,
      FALSE, -- is_local = false for external users
      NOW(),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN v_profile_id;
END;
$$;

COMMENT ON FUNCTION upsert_external_profile IS 'Creates or updates an external Bluesky user profile, returning the profile UUID';

-- Step 10: Update RLS policies to allow reading external profiles
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
CREATE POLICY "Anyone can view profiles" ON profiles
  FOR SELECT USING (true);

-- Only allow auth system to update local profiles, and system to update external
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (
    -- Local users can update their own profile
    (is_local = TRUE AND auth.uid() = auth_user_id)
    OR
    -- System can update external profiles (via service role)
    (is_local = FALSE AND current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
  );

-- Step 11: Migrate existing external follows to use profile IDs
-- First, create profiles for external users that are currently in follows
INSERT INTO profiles (id, did, handle, display_name, avatar_url, is_local, last_synced_at, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  subject_did,
  subject_handle,
  subject_display_name,
  subject_avatar,
  FALSE,
  NOW(),
  NOW(),
  NOW()
FROM follows
WHERE following_id IS NULL AND subject_did IS NOT NULL
ON CONFLICT (did) DO NOTHING;

-- Step 12: Update follows to point to the new profile IDs
UPDATE follows f
SET following_id = p.id
FROM profiles p
WHERE f.following_id IS NULL 
  AND f.subject_did IS NOT NULL 
  AND p.did = f.subject_did;

-- Step 13: Now we can add NOT NULL constraint back to following_id
-- But first check if there are any remaining NULLs
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM follows WHERE following_id IS NULL;
  IF null_count = 0 THEN
    -- Safe to add NOT NULL constraint
    ALTER TABLE follows ALTER COLUMN following_id SET NOT NULL;
    RAISE NOTICE 'Successfully added NOT NULL constraint to following_id';
  ELSE
    RAISE WARNING 'Cannot add NOT NULL constraint: % follows still have NULL following_id', null_count;
  END IF;
END $$;

-- Step 14: Clean up the subject_* columns from follows (optional, keep for now for safety)
-- We'll remove these in a future migration after verifying everything works
COMMENT ON COLUMN follows.subject_did IS 'DEPRECATED: Use profiles.did via following_id instead';
COMMENT ON COLUMN follows.subject_handle IS 'DEPRECATED: Use profiles.handle via following_id instead';

-- Step 15: Create helper view for unified profile lookups
CREATE OR REPLACE VIEW unified_profiles AS
SELECT 
  id,
  COALESCE(handle, username) AS handle,
  COALESCE(username, handle) AS username,
  display_name,
  bio,
  avatar_url,
  banner_url,
  did,
  pds_url,
  is_local,
  is_verified,
  followers_count,
  following_count,
  posts_count,
  created_at,
  last_synced_at
FROM profiles;

COMMENT ON VIEW unified_profiles IS 'Unified view of local and external profiles with normalized handle/username';

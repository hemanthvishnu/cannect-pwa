-- =============================================================================
-- Fix External Follows: Ensure following_id can be NULL
-- =============================================================================
-- The previous migration may have failed to drop NOT NULL due to foreign key.
-- This migration ensures the column is properly nullable.
-- =============================================================================

-- Drop the foreign key constraint first, then recreate it allowing NULL
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_following_id_fkey;

-- Make following_id nullable (should already be from previous migration)
ALTER TABLE follows ALTER COLUMN following_id DROP NOT NULL;

-- Recreate foreign key that allows NULL
ALTER TABLE follows ADD CONSTRAINT follows_following_id_fkey 
  FOREIGN KEY (following_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Ensure check constraint exists
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_must_have_target;
ALTER TABLE follows ADD CONSTRAINT follows_must_have_target 
  CHECK (following_id IS NOT NULL OR subject_did IS NOT NULL);

-- Drop the old unique constraint that doesn't work with NULL
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_follower_id_following_id_key;

-- Drop and recreate unique indexes
DROP INDEX IF EXISTS idx_follows_local_unique;
DROP INDEX IF EXISTS idx_follows_external_unique;

-- Unique: Can only follow a local user once (when following_id is not null)
CREATE UNIQUE INDEX idx_follows_local_unique 
  ON follows(follower_id, following_id) 
  WHERE following_id IS NOT NULL;

-- Unique: Can only follow an external DID once (when following_id is null)
CREATE UNIQUE INDEX idx_follows_external_unique 
  ON follows(follower_id, subject_did) 
  WHERE following_id IS NULL AND subject_did IS NOT NULL;

-- Also drop the CHECK constraint that prevents follower_id = following_id since following_id can be NULL now
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_check;

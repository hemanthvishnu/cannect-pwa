-- =============================================================================
-- PDS Integration Migration
-- =============================================================================
-- Adds columns and tables needed for real PDS integration with cannect.space
-- Uses did:plc identifiers registered with plc.directory
-- =============================================================================

-- Add PDS-specific fields to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pds_registered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pds_registered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recovery_key TEXT;

-- Update comments
COMMENT ON COLUMN profiles.did IS 'did:plc identifier registered with plc.directory';
COMMENT ON COLUMN profiles.handle IS 'AT Protocol handle (username.cannect.space)';
COMMENT ON COLUMN profiles.pds_url IS 'Always https://cannect.space for Cannect users';
COMMENT ON COLUMN profiles.pds_registered IS 'Whether user account exists on PDS';
COMMENT ON COLUMN profiles.pds_registered_at IS 'When the PDS account was created';
COMMENT ON COLUMN profiles.recovery_key IS 'Recovery key for PDS account';

-- Create index for finding unregistered users (for backfill)
CREATE INDEX IF NOT EXISTS idx_profiles_pds_registered 
ON profiles(pds_registered) WHERE pds_registered = FALSE OR pds_registered IS NULL;

-- Create index for finding registered users
CREATE INDEX IF NOT EXISTS idx_profiles_pds_registered_true
ON profiles(pds_registered) WHERE pds_registered = TRUE;

-- =============================================================================
-- PDS Sessions Table - Store access tokens for federation
-- =============================================================================
CREATE TABLE IF NOT EXISTS pds_sessions (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_jwt TEXT NOT NULL,
  refresh_jwt TEXT NOT NULL,
  did TEXT,
  handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

COMMENT ON TABLE pds_sessions IS 'Stores PDS session tokens for AT Protocol federation';
COMMENT ON COLUMN pds_sessions.access_jwt IS 'Short-lived access token for PDS API calls';
COMMENT ON COLUMN pds_sessions.refresh_jwt IS 'Long-lived refresh token to get new access tokens';

-- RLS: Users can only access their own tokens
ALTER TABLE pds_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own PDS session" 
ON pds_sessions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own PDS session" 
ON pds_sessions FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own PDS session" 
ON pds_sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own PDS session" 
ON pds_sessions FOR DELETE 
USING (auth.uid() = user_id);

-- Service role can manage all sessions (for edge functions)
CREATE POLICY "Service role can manage PDS sessions"
ON pds_sessions FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pds_sessions_updated ON pds_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_pds_sessions_did ON pds_sessions(did);

-- =============================================================================
-- Federation Queue Table - Track pending sync operations
-- =============================================================================
CREATE TABLE IF NOT EXISTS federation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type TEXT NOT NULL CHECK (record_type IN ('post', 'like', 'repost', 'follow', 'block', 'profile')),
  record_id UUID NOT NULL,
  at_uri TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ
);

COMMENT ON TABLE federation_queue IS 'Queue for pending AT Protocol sync operations';

CREATE INDEX IF NOT EXISTS idx_federation_queue_status ON federation_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_federation_queue_record ON federation_queue(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_federation_queue_created ON federation_queue(created_at);

-- RLS for federation queue (service role only)
ALTER TABLE federation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage federation queue"
ON federation_queue FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- Function to update pds_sessions updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_pds_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pds_sessions_updated_at ON pds_sessions;
CREATE TRIGGER trigger_pds_sessions_updated_at
  BEFORE UPDATE ON pds_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_pds_session_updated_at();

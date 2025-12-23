-- =============================================================================
-- Federation Cron Job Setup
-- =============================================================================
-- Schedules automatic federation sync every 30 seconds using pg_cron
-- Requires pg_cron extension to be enabled in Supabase Dashboard
-- =============================================================================

-- Enable pg_net for HTTP calls (should already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule federation worker to run every 30 seconds
-- Note: pg_cron minimum interval is 1 minute for standard cron syntax
-- Using a workaround with two jobs offset by 30 seconds isn't possible,
-- so we'll run every minute which is still fast enough for good UX

SELECT cron.schedule(
  'federation-sync-worker',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/federation-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bGpuY2FkeWxjdHNya3F0YXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM4NjE0NjAsImV4cCI6MjA0OTQzNzQ2MH0.hJwrPIwhnFGG_eCnNdMVu8Fz9CYZJL2AHT_lSNdD3xs'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Also schedule a cleanup job to remove old synced items (keep queue clean)
SELECT cron.schedule(
  'federation-queue-cleanup',
  '0 * * * *',  -- Every hour
  $$
  DELETE FROM federation_queue 
  WHERE status = 'synced' 
  AND synced_at < NOW() - INTERVAL '24 hours';
  $$
);

-- Log that cron jobs were set up
DO $$
BEGIN
  RAISE NOTICE 'Federation cron jobs scheduled:';
  RAISE NOTICE '  - federation-sync-worker: runs every minute';
  RAISE NOTICE '  - federation-queue-cleanup: runs every hour';
END $$;

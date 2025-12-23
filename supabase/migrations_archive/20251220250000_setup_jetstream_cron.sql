-- ============================================================================
-- Phase 4: Set up pg_cron to poll Jetstream every 30 seconds
-- ============================================================================
-- This migration sets up a cron job that calls the jetstream-poll edge function
-- to ingest Bluesky interactions on Cannect content.
-- ============================================================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- CRON JOB: Poll Jetstream every 30 seconds
-- ============================================================================
-- Note: pg_cron's minimum interval is 1 minute, so we use a workaround:
-- We schedule two jobs offset by 30 seconds using pg_sleep in one of them

-- Job 1: Runs at the start of each minute
SELECT cron.schedule(
  'jetstream-poll-a',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://tpigxbdtoqpfxspkknay.supabase.co/functions/v1/jetstream-poll',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job 2: Runs 30 seconds into each minute
SELECT cron.schedule(
  'jetstream-poll-b',
  '* * * * *', -- Every minute
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://tpigxbdtoqpfxspkknay.supabase.co/functions/v1/jetstream-poll',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- ALTERNATIVE: Single job if 1-minute interval is acceptable
-- ============================================================================
-- If you prefer simpler setup with 1-minute polling:
-- 
-- SELECT cron.unschedule('jetstream-poll-a');
-- SELECT cron.unschedule('jetstream-poll-b');
-- 
-- SELECT cron.schedule(
--   'jetstream-poll',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://tpigxbdtoqpfxspkknay.supabase.co/functions/v1/jetstream-poll',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- ============================================================================
-- VIEW SCHEDULED JOBS
-- ============================================================================
-- To see all scheduled jobs: SELECT * FROM cron.job;
-- To see job run history: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- ============================================================================
-- CLEANUP (for rollback)
-- ============================================================================
-- To remove jobs:
-- SELECT cron.unschedule('jetstream-poll-a');
-- SELECT cron.unschedule('jetstream-poll-b');

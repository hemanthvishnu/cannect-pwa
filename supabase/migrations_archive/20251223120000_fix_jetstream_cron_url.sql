-- =============================================================================
-- Fix: Update jetstream-poll cron jobs to use correct Supabase project URL
-- =============================================================================

-- Remove the old cron jobs with wrong URL
SELECT cron.unschedule('jetstream-poll-a');
SELECT cron.unschedule('jetstream-poll-b');

-- Recreate with correct project URL and service role key
-- Job 1: Runs at the start of each minute
SELECT cron.schedule(
  'jetstream-poll-a',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/jetstream-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bGpuY2FkeWxjdHNya3F0YXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYxNTczNCwiZXhwIjoyMDgxMTkxNzM0fQ.ntsH14p65qNGhSU7miYiOLo3hrqsIvRdFxgizHNPmL0'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job 2: Runs 30 seconds into each minute
SELECT cron.schedule(
  'jetstream-poll-b',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/jetstream-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bGpuY2FkeWxjdHNya3F0YXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYxNTczNCwiZXhwIjoyMDgxMTkxNzM0fQ.ntsH14p65qNGhSU7miYiOLo3hrqsIvRdFxgizHNPmL0'
    ),
    body := '{}'::jsonb
  );
  $$
);

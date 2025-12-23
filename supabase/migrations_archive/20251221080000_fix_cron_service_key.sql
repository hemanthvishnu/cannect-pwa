-- =============================================================================
-- Fix: Update cron job to use service role key instead of anon key
-- =============================================================================

-- Remove the old cron job
SELECT cron.unschedule('federation-sync-worker');

-- Recreate with service role key
SELECT cron.schedule(
  'federation-sync-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://luljncadylctsrkqtatk.supabase.co/functions/v1/federation-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bGpuY2FkeWxjdHNya3F0YXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYxNTczNCwiZXhwIjoyMDgxMTkxNzM0fQ.ntsH14p65qNGhSU7miYiOLo3hrqsIvRdFxgizHNPmL0'
    ),
    body := '{}'::jsonb
  );
  $$
);

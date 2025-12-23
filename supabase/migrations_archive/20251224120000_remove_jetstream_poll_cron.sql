-- ============================================================================
-- REMOVE JETSTREAM-POLL CRON JOBS
-- ============================================================================
-- 
-- Reason: We now use a WebSocket consumer on the VPS (PM2 + consumer.js)
-- which provides real-time event processing. The SSE-based edge function 
-- polling is redundant and less efficient.
--
-- The VPS consumer at /opt/jetstream/consumer.js handles all Jetstream events
-- and calls the process-jetstream-event edge function directly.
-- ============================================================================

-- Unschedule both cron jobs (they run every 30 seconds alternating)
SELECT cron.unschedule('jetstream-poll-a');
SELECT cron.unschedule('jetstream-poll-b');

-- Note: The jetstream-poll edge function still exists but is no longer invoked.
-- It can be deleted from the supabase/functions folder.

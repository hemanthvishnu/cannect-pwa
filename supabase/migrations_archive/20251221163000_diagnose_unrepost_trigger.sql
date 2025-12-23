-- Diagnostic: Check triggers on reposts table
-- This will output the trigger status

DO $$
DECLARE
  trigger_rec RECORD;
  trigger_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== Triggers on reposts table ===';
  
  FOR trigger_rec IN 
    SELECT tgname, tgenabled, 
           CASE tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
           CASE tgtype & 28 
             WHEN 4 THEN 'INSERT'
             WHEN 8 THEN 'DELETE' 
             WHEN 16 THEN 'UPDATE'
             WHEN 20 THEN 'INSERT OR UPDATE'
             WHEN 12 THEN 'INSERT OR DELETE'
             WHEN 24 THEN 'UPDATE OR DELETE'
             WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
           END as event,
           p.proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relname = 'reposts' AND NOT t.tgisinternal
  LOOP
    trigger_count := trigger_count + 1;
    RAISE NOTICE 'Trigger: % | Enabled: % | Timing: % | Event: % | Function: %',
      trigger_rec.tgname,
      trigger_rec.tgenabled,
      trigger_rec.timing,
      trigger_rec.event,
      trigger_rec.function_name;
  END LOOP;
  
  IF trigger_count = 0 THEN
    RAISE NOTICE 'No triggers found on reposts table!';
  ELSE
    RAISE NOTICE 'Total triggers: %', trigger_count;
  END IF;
END;
$$;

-- Also check if the function exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'queue_unrepost_for_federation') THEN
    RAISE NOTICE 'Function queue_unrepost_for_federation EXISTS';
  ELSE
    RAISE NOTICE 'Function queue_unrepost_for_federation DOES NOT EXIST!';
  END IF;
END;
$$;

-- Investigate RLS policies on reposts table
-- And check if SECURITY DEFINER is properly set on the trigger function

DO $$
DECLARE
  policy_rec RECORD;
  policy_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== RLS Policies on reposts table ===';
  
  FOR policy_rec IN 
    SELECT polname, polcmd, polroles, polqual::text, polwithcheck::text
    FROM pg_policy
    WHERE polrelid = 'reposts'::regclass
  LOOP
    policy_count := policy_count + 1;
    RAISE NOTICE 'Policy: % | Command: % | Roles: %',
      policy_rec.polname,
      CASE policy_rec.polcmd 
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
      END,
      policy_rec.polroles;
    IF policy_rec.polqual IS NOT NULL THEN
      RAISE NOTICE '  USING: %', policy_rec.polqual;
    END IF;
  END LOOP;
  
  IF policy_count = 0 THEN
    RAISE NOTICE 'No RLS policies found on reposts table';
  ELSE
    RAISE NOTICE 'Total policies: %', policy_count;
  END IF;
  
  -- Check if RLS is enabled
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'reposts' AND relrowsecurity = true) THEN
    RAISE NOTICE 'RLS is ENABLED on reposts table';
  ELSE
    RAISE NOTICE 'RLS is DISABLED on reposts table';
  END IF;
END;
$$;

-- Check function definition
DO $$
DECLARE
  func_def TEXT;
  func_security TEXT;
BEGIN
  SELECT prosrc, 
         CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END
  INTO func_def, func_security
  FROM pg_proc 
  WHERE proname = 'queue_unrepost_for_federation';
  
  IF func_def IS NOT NULL THEN
    RAISE NOTICE 'Function queue_unrepost_for_federation:';
    RAISE NOTICE '  Security: %', func_security;
    -- Just show first 200 chars of function body
    RAISE NOTICE '  Body (first 200 chars): %', substring(func_def from 1 for 200);
  END IF;
END;
$$;

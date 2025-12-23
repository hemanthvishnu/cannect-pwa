-- Add generate_tid() function for AT Protocol compliant record keys
-- TID format: 13 character base32-sortable string encoding timestamp + random clock

-- Base32 sortable alphabet: 234567abcdefghijklmnopqrstuvwxyz
-- This is different from standard base32 and is sorted lexicographically

CREATE OR REPLACE FUNCTION generate_tid()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  -- Base32 sortable alphabet (32 chars)
  b32_chars TEXT := '234567abcdefghijklmnopqrstuvwxyz';
  -- Get microseconds since Unix epoch
  timestamp_us BIGINT := EXTRACT(EPOCH FROM clock_timestamp()) * 1000000;
  -- Random clock ID (10 bits)
  clock_id INTEGER := floor(random() * 1024)::INTEGER;
  -- Combined value: 53 bits timestamp + 10 bits clock = 63 bits, left-padded to 65 bits for TID
  combined BIGINT;
  result TEXT := '';
  i INTEGER;
BEGIN
  -- TID uses 53 bits of timestamp (microseconds since epoch) + 10 bits of clock ID
  -- This gives us ~285 years of unique timestamps from 1970
  combined := (timestamp_us << 10) | clock_id;
  
  -- Encode as 13 base32-sortable characters (65 bits / 5 bits per char = 13 chars)
  FOR i IN 1..13 LOOP
    result := substr(b32_chars, (combined & 31)::INTEGER + 1, 1) || result;
    combined := combined >> 5;
  END LOOP;
  
  RETURN result;
END;
$$;

-- Test the function
DO $$
DECLARE
  test_tid TEXT;
BEGIN
  test_tid := generate_tid();
  RAISE NOTICE 'Generated TID: % (length: %)', test_tid, length(test_tid);
  
  -- Validate format
  IF length(test_tid) != 13 THEN
    RAISE EXCEPTION 'TID must be exactly 13 characters, got %', length(test_tid);
  END IF;
  
  IF test_tid !~ '^[234567abcdefghijklmnopqrstuvwxyz]+$' THEN
    RAISE EXCEPTION 'TID contains invalid characters: %', test_tid;
  END IF;
  
  RAISE NOTICE 'TID validation passed!';
END;
$$;

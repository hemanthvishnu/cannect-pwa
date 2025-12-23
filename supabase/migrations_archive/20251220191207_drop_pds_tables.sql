-- Drop PDS tables for clean app
-- These were for future AT Protocol federation but not needed now

-- Drop the view first (depends on the table)
DROP VIEW IF EXISTS view_pds_identity;

-- Drop the function
DROP FUNCTION IF EXISTS get_my_pds_handle();

-- Drop the table
DROP TABLE IF EXISTS user_pds_creds;

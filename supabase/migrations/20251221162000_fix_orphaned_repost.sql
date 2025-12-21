-- Manually queue the orphaned repost for deletion
-- The repost was deleted from Supabase but the PDS still has it

INSERT INTO federation_queue (
  record_type, record_id, user_did, collection, rkey, at_uri, 
  record_data, operation, status
) VALUES (
  'repost', 
  gen_random_uuid(), -- Use a new UUID since the original record is gone
  'did:plc:zccnnuz7vbtqcptq6ituk74k', 
  'app.bsky.feed.repost', 
  '3maj4ucrlb5rb', 
  'at://did:plc:zccnnuz7vbtqcptq6ituk74k/app.bsky.feed.repost/3maj4ucrlb5rb',
  '{}'::jsonb, 
  'delete', 
  'pending'
)
ON CONFLICT (record_type, record_id, operation) DO NOTHING;

-- Log what we did
DO $$
BEGIN
  RAISE NOTICE 'Queued delete for orphaned repost at://did:plc:zccnnuz7vbtqcptq6ituk74k/app.bsky.feed.repost/3maj4ucrlb5rb';
END;
$$;

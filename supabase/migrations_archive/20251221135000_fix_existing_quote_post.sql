-- Manually fix the existing quote post's embed fields and re-queue

-- Update the quote post with embed info
UPDATE posts SET 
  embed_type = 'record',
  embed_record_uri = 'at://did:plc:zccnnuz7vbtqcptq6ituk74k/app.bsky.feed.post/3maii5h2lv2mv',
  embed_record_cid = 'bafyreihaojlk3645zn2tyyxybcop6gvkzomuviah7loth2kmvindtjp2sa'
WHERE id = 'c47406ad-a1c7-4064-a004-7836f3aa8cf3';

-- Re-queue the quote post with correct embed data (use 'post' as record_type since quote posts are still posts)
INSERT INTO federation_queue (
  record_type, record_id, user_did, collection, rkey, at_uri, record_data, operation, status
) 
SELECT 
  'post',
  p.id,
  pr.did,
  'app.bsky.feed.post',
  p.rkey,
  p.at_uri,
  jsonb_build_object(
    '$type', 'app.bsky.feed.post',
    'text', p.content,
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'langs', ARRAY['en'],
    'embed', jsonb_build_object(
      '$type', 'app.bsky.embed.record',
      'record', jsonb_build_object(
        'uri', 'at://did:plc:zccnnuz7vbtqcptq6ituk74k/app.bsky.feed.post/3maii5h2lv2mv',
        'cid', 'bafyreihaojlk3645zn2tyyxybcop6gvkzomuviah7loth2kmvindtjp2sa'
      )
    )
  ),
  'update',
  'pending'
FROM posts p
JOIN profiles pr ON p.user_id = pr.id
WHERE p.id = 'c47406ad-a1c7-4064-a004-7836f3aa8cf3'
ON CONFLICT (record_type, record_id, operation) 
DO UPDATE SET 
  record_data = EXCLUDED.record_data, 
  status = 'pending', 
  attempts = 0,
  last_error = NULL,
  created_at = NOW();

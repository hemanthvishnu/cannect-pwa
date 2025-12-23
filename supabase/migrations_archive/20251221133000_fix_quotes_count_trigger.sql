-- Fix update_post_quotes_count trigger to handle repost_of_id (not just embed_record_uri)
-- This trigger should increment quotes_count on the original post when a quote is created

CREATE OR REPLACE FUNCTION update_post_quotes_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  quoted_post_id UUID;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.type = 'quote' THEN
    -- Check repost_of_id first (our internal quote posts)
    IF NEW.repost_of_id IS NOT NULL THEN
      UPDATE posts SET quotes_count = quotes_count + 1 WHERE id = NEW.repost_of_id;
    -- Then check embed_record_uri (Bluesky federated quotes)
    ELSIF NEW.embed_record_uri IS NOT NULL THEN
      SELECT id INTO quoted_post_id FROM posts WHERE at_uri = NEW.embed_record_uri;
      IF quoted_post_id IS NOT NULL THEN
        UPDATE posts SET quotes_count = quotes_count + 1 WHERE id = quoted_post_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.type = 'quote' THEN
    -- Check repost_of_id first
    IF OLD.repost_of_id IS NOT NULL THEN
      UPDATE posts SET quotes_count = GREATEST(0, quotes_count - 1) WHERE id = OLD.repost_of_id;
    -- Then check embed_record_uri
    ELSIF OLD.embed_record_uri IS NOT NULL THEN
      SELECT id INTO quoted_post_id FROM posts WHERE at_uri = OLD.embed_record_uri;
      IF quoted_post_id IS NOT NULL THEN
        UPDATE posts SET quotes_count = GREATEST(0, quotes_count - 1) WHERE id = quoted_post_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Fix the existing quote post - increment quotes_count on the original
UPDATE posts 
SET quotes_count = (
  SELECT COUNT(*) FROM posts WHERE repost_of_id = 'bfd264de-ab2e-4f91-a7ec-df5400ebf569' AND type = 'quote'
)
WHERE id = 'bfd264de-ab2e-4f91-a7ec-df5400ebf569';

-- Actually, let's do a more general fix for all posts
-- Recalculate quotes_count for all posts that have been quoted
UPDATE posts p
SET quotes_count = (
  SELECT COUNT(*) 
  FROM posts q 
  WHERE q.repost_of_id = p.id AND q.type = 'quote'
)
WHERE EXISTS (
  SELECT 1 FROM posts q WHERE q.repost_of_id = p.id AND q.type = 'quote'
);

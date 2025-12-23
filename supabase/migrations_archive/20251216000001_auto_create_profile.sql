-- Auto-create profile when user signs up
-- This trigger runs server-side, bypassing RLS and race conditions

-- 1. Create a function that runs when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://ui-avatars.com/api/?name=User&background=10B981&color=fff')
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate profile errors
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing trigger if it exists (for idempotent migrations)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Create the trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

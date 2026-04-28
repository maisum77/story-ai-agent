-- ============================================================================
-- SUPABASE DATABASE SETUP - IDEMPOTENT SCRIPT
-- ============================================================================
-- This script can be run multiple times without errors.
-- All operations use IF NOT EXISTS or DROP IF EXISTS for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLES
-- ============================================================================

-- Drop and recreate user_usage table (fully idempotent)
DROP TABLE IF EXISTS public.user_usage CASCADE;

CREATE TABLE public.user_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  quota_limit INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Add comments for documentation
COMMENT ON TABLE public.user_usage IS 'Tracks user generation quota and usage statistics';
COMMENT ON COLUMN public.user_usage.user_id IS 'Unique identifier linked to Supabase auth user';
COMMENT ON COLUMN public.user_usage.usage_count IS 'Current number of stories generated in this period';
COMMENT ON COLUMN public.user_usage.quota_limit IS 'Maximum stories allowed (default: 2)';
COMMENT ON COLUMN public.user_usage.created_at IS 'When the quota record was created';
COMMENT ON COLUMN public.user_usage.updated_at IS 'When the quota was last updated';

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_usage_user_id ON public.user_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_user_usage_created_at ON public.user_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_user_usage_updated_at ON public.user_usage(updated_at);

-- ============================================================================
-- 3. CREATE RPC FUNCTIONS
-- ============================================================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.consume_user_generation(UUID, INT);
DROP FUNCTION IF EXISTS public.increment_user_usage(UUID);

-- Create consume_user_generation function
-- Atomically checks if a user has remaining quota
CREATE FUNCTION public.consume_user_generation(
  user_uuid UUID,
  max_uses INT DEFAULT 2
)
RETURNS TABLE(allowed BOOLEAN, remaining INT) AS $$
DECLARE
  current_count INT;
BEGIN
  -- Ensure user_usage row exists (upsert)
  INSERT INTO public.user_usage (user_id, usage_count, quota_limit)
  VALUES (user_uuid, 0, max_uses)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current usage count
  SELECT usage_count INTO current_count
  FROM public.user_usage
  WHERE user_id = user_uuid;

  -- Return quota status
  RETURN QUERY
  SELECT 
    (COALESCE(current_count, 0) < max_uses) AS allowed,
    (max_uses - LEAST(COALESCE(current_count, 0) + 1, max_uses)) AS remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create increment_user_usage function
-- Increments the usage counter after successful generation
CREATE FUNCTION public.increment_user_usage(user_uuid UUID)
RETURNS TABLE(success BOOLEAN, new_count INT) AS $$
BEGIN
  UPDATE public.user_usage
  SET usage_count = usage_count + 1,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = user_uuid;
  
  RETURN QUERY
  SELECT 
    true AS success,
    usage_count AS new_count
  FROM public.user_usage
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. GRANT FUNCTION PERMISSIONS
-- ============================================================================

-- Only authenticated users can call these functions
REVOKE EXECUTE ON FUNCTION public.consume_user_generation(UUID, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.consume_user_generation(UUID, INT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_user_usage(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.increment_user_usage(UUID) TO authenticated;

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. CREATE RLS POLICIES (Idempotent)
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own usage" ON public.user_usage;
DROP POLICY IF EXISTS "Users can update their own usage" ON public.user_usage;
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.user_usage;

-- Policy 1: Users can SELECT their own row
CREATE POLICY "Users can view their own usage"
  ON public.user_usage
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Policy 2: Users can UPDATE their own row
CREATE POLICY "Users can update their own usage"
  ON public.user_usage
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Policy 3: Users can INSERT their own row
CREATE POLICY "Users can insert their own usage"
  ON public.user_usage
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================================
-- 7. GRANT TABLE PERMISSIONS
-- ============================================================================

-- Grant basic permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.user_usage TO authenticated;

-- ============================================================================
-- END OF SETUP SCRIPT
-- ============================================================================
-- This script is fully idempotent and can be executed multiple times
-- without causing errors. All tables, functions, and policies use
-- CREATE IF NOT EXISTS or DROP IF EXISTS patterns.

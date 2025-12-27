-- MIGRATION: Create server_name_mappings table
-- DATE: 2025-12-24
-- PURPOSE: Map server names (simplified mode) to user UUIDs (full mode)
--
-- In simplified mode, servers are identified by names (e.g., "Ahmed", "Marie")
-- This table maps those names to actual user UUIDs for backend operations
--
-- Example:
--   bar_id: "abc-123"
--   server_name: "Ahmed"
--   user_id: "user-uuid-456"  (the actual server account)

BEGIN;

-- =====================================================
-- STEP 1: Create server_name_mappings table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.server_name_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  bar_id UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Mapping data
  server_name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_bar_server_name UNIQUE(bar_id, server_name),
  CONSTRAINT server_name_not_empty CHECK(server_name != '')
);

COMMENT ON TABLE public.server_name_mappings IS 'Maps server names (used in simplified mode) to actual user UUIDs.';
COMMENT ON COLUMN public.server_name_mappings.bar_id IS 'The bar where this mapping applies.';
COMMENT ON COLUMN public.server_name_mappings.user_id IS 'The UUID of the server account (user in full mode).';
COMMENT ON COLUMN public.server_name_mappings.server_name IS 'The server name as displayed in simplified mode (e.g., "Ahmed").';

-- =====================================================
-- STEP 2: Create indexes for performance
-- =====================================================

-- Index for looking up user_id by bar_id and server_name
CREATE INDEX IF NOT EXISTS idx_server_mappings_lookup
ON public.server_name_mappings(bar_id, server_name);

COMMENT ON INDEX idx_server_mappings_lookup IS 'Improves performance of queries resolving server_name to user_id.';

-- Index for looking up all mappings for a bar
CREATE INDEX IF NOT EXISTS idx_server_mappings_bar_id
ON public.server_name_mappings(bar_id);

COMMENT ON INDEX idx_server_mappings_bar_id IS 'Improves performance of queries fetching all mappings for a bar.';

-- Index for looking up all mappings for a user
CREATE INDEX IF NOT EXISTS idx_server_mappings_user_id
ON public.server_name_mappings(user_id);

COMMENT ON INDEX idx_server_mappings_user_id IS 'Improves performance of queries finding which bars have a user as server.';

-- =====================================================
-- STEP 3: Enable RLS
-- =====================================================
ALTER TABLE public.server_name_mappings ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Managers can manage server mappings" ON public.server_name_mappings;
DROP POLICY IF EXISTS "Bar members can read server mappings" ON public.server_name_mappings;

-- Policy: Everyone can READ mappings for their bar (needed for sale creation)
CREATE POLICY "Bar members can read server mappings"
ON public.server_name_mappings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = server_name_mappings.bar_id
    AND bm.is_active = true
  )
);

-- Policy: Bar members can INSERT mappings for their bar (simplified mode setup)
CREATE POLICY "Managers can manage server mappings"
ON public.server_name_mappings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = server_name_mappings.bar_id
    AND bm.is_active = true
  )
);

CREATE POLICY "Managers can update server mappings"
ON public.server_name_mappings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = server_name_mappings.bar_id
    AND bm.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = server_name_mappings.bar_id
    AND bm.is_active = true
  )
);

CREATE POLICY "Managers can delete server mappings"
ON public.server_name_mappings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = server_name_mappings.bar_id
    AND bm.is_active = true
  )
);

COMMIT;

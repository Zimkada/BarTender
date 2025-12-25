-- MIGRATION: Grant permissions to authenticated users on server_name_mappings
-- DATE: 2025-12-24
-- PURPOSE: Allow authenticated users to access server_name_mappings table
--
-- Problem: Table had no permissions for authenticated users, only postgres
-- Solution: Grant SELECT, INSERT, UPDATE, DELETE to authenticated role
--

BEGIN;

-- =====================================================
-- STEP 1: Grant SELECT permission to authenticated users
-- =====================================================
GRANT SELECT ON public.server_name_mappings TO authenticated;

-- =====================================================
-- STEP 2: Grant INSERT permission to authenticated users
-- =====================================================
GRANT INSERT ON public.server_name_mappings TO authenticated;

-- =====================================================
-- STEP 3: Grant UPDATE permission to authenticated users
-- =====================================================
GRANT UPDATE ON public.server_name_mappings TO authenticated;

-- =====================================================
-- STEP 4: Grant DELETE permission to authenticated users
-- =====================================================
GRANT DELETE ON public.server_name_mappings TO authenticated;

-- =====================================================
-- STEP 5: Grant permission to use sequences (for auto-increment IDs)
-- =====================================================
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;

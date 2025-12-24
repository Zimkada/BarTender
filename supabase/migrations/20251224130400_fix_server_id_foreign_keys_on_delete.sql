-- MIGRATION: Fix ON DELETE behavior for server_id foreign keys
-- DATE: 2025-12-24
-- PURPOSE: BUG #4 Fix - Ensure server_id can be NULL when user deleted
--
-- Problem: Original migrations used implicit ON DELETE RESTRICT
-- Result: Cannot delete user if they have associated sales/consignments/returns
--
-- Solution: Explicitly add ON DELETE SET NULL to all server_id FK
-- This allows safe deletion of user accounts while preserving sale records

BEGIN;

-- Drop existing foreign keys (if they were created with RESTRICT)
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_server_id_fkey;

ALTER TABLE public.consignments
  DROP CONSTRAINT IF EXISTS consignments_server_id_fkey;

ALTER TABLE public.returns
  DROP CONSTRAINT IF EXISTS returns_server_id_fkey;

-- Recreate with proper ON DELETE SET NULL behavior
ALTER TABLE public.sales
  ADD CONSTRAINT sales_server_id_fkey
  FOREIGN KEY (server_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.consignments
  ADD CONSTRAINT consignments_server_id_fkey
  FOREIGN KEY (server_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.returns
  ADD CONSTRAINT returns_server_id_fkey
  FOREIGN KEY (server_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Note: If tables don't have the FK yet, the ADD CONSTRAINT will create it
-- If they already have it with proper ON DELETE SET NULL, this is idempotent

COMMIT;

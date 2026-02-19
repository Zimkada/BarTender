-- =====================================================
-- MIGRATION: Create consignment_status ENUM type
-- Date: 2026-02-18
-- Purpose: Define the consignment_status type used by consignment RPCs
-- =====================================================

BEGIN;

-- Create the consignment_status enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consignment_status') THEN
        CREATE TYPE public.consignment_status AS ENUM ('active', 'claimed', 'forfeited', 'expired');
    END IF;
END
$$;

COMMIT;

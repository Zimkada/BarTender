-- =====================================================
-- MIGRATION: Add missing timestamp columns to consignments
-- Date: 2026-02-18
-- Purpose: Add forfeited_at, claimed_at columns for consignment lifecycle
-- =====================================================

BEGIN;

-- Add updated_at column if it doesn't exist
ALTER TABLE public.consignments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add forfeited_at column if it doesn't exist
ALTER TABLE public.consignments
ADD COLUMN IF NOT EXISTS forfeited_at TIMESTAMPTZ DEFAULT NULL;

-- Add claimed_at column if it doesn't exist
ALTER TABLE public.consignments
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL;

-- Add a check to ensure status is valid (if not already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'consignments'
        AND constraint_name = 'consignment_status_check'
    ) THEN
        ALTER TABLE public.consignments
        ADD CONSTRAINT consignment_status_check
        CHECK (status IN ('active', 'claimed', 'forfeited', 'expired'));
    END IF;
END $$;

COMMIT;

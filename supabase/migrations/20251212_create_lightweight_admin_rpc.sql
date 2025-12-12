-- Migration: Create lightweight RPC for admin dropdowns
-- Purpose: Replace heavy getPaginatedBars calls with lightweight dropdown data
-- Date: 2025-12-12

-- Create RPC function to get unique bars for dropdowns
CREATE OR REPLACE FUNCTION get_unique_bars()
RETURNS TABLE (
    id UUID,
    name TEXT,
    is_active BOOLEAN
)
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.name,
        b.is_active
    FROM bars b
    ORDER BY b.name ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_unique_bars() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_unique_bars() IS 'Lightweight RPC to fetch bar list for admin dropdowns. Returns only id, name, and is_active fields.';

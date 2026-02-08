-- Cleanup function for old heartbeat data
-- This function removes heartbeat records older than a specified number of days
-- Recommended to run periodically via cron job or manually from SuperAdmin dashboard

CREATE OR REPLACE FUNCTION public.cleanup_old_heartbeats(
    days_to_keep INTEGER DEFAULT 30
)
RETURNS TABLE (
    deleted_count INTEGER,
    oldest_remaining_heartbeat TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_oldest_heartbeat TIMESTAMPTZ;
BEGIN
    -- SECURITY: Only super_admins can cleanup heartbeat data
    IF NOT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    ) AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Access denied: super_admin role required';
    END IF;

    -- Validate input
    IF days_to_keep < 1 THEN
        RAISE EXCEPTION 'days_to_keep must be at least 1';
    END IF;

    -- Delete old heartbeat records
    WITH deleted AS (
        DELETE FROM public.bar_device_status
        WHERE last_heartbeat_at < now() - (days_to_keep || ' days')::interval
        RETURNING *
    )
    SELECT COUNT(*)::INTEGER INTO v_deleted_count FROM deleted;

    -- Get the oldest remaining heartbeat
    SELECT MIN(last_heartbeat_at) INTO v_oldest_heartbeat
    FROM public.bar_device_status;

    -- Return results
    RETURN QUERY SELECT v_deleted_count, v_oldest_heartbeat;
END;
$$;

-- Grant execute permission to authenticated users (will be restricted by SECURITY DEFINER check)
GRANT EXECUTE ON FUNCTION public.cleanup_old_heartbeats(INTEGER) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION public.cleanup_old_heartbeats(INTEGER) IS
'Deletes heartbeat records older than specified days. Only accessible to super_admins. Default: 30 days. Usage: SELECT * FROM cleanup_old_heartbeats(30);';

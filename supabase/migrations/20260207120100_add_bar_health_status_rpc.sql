-- RPC to get bar health status for SuperAdmin dashboard
CREATE OR REPLACE FUNCTION public.get_bar_health_status()
RETURNS TABLE (
    bar_id UUID,
    bar_name TEXT,
    device_id TEXT,
    app_version TEXT,
    last_heartbeat_at TIMESTAMPTZ,
    unsynced_count INTEGER,
    battery_level INTEGER,
    status TEXT, -- 'online', 'warning', 'offline'
    minutes_since_heartbeat NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- SECURITY: Only super_admins can access this dashboard
    IF NOT EXISTS (
        SELECT 1 FROM public.bar_members
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    ) AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Access denied: super_admin role required';
    END IF;

    RETURN QUERY
    WITH device_status AS (
        -- Get the most recent heartbeat for each bar across all devices
        SELECT DISTINCT ON (bds.bar_id)
            bds.bar_id,
            bds.device_id,
            bds.app_version,
            bds.last_heartbeat_at,
            bds.unsynced_count,
            bds.battery_level
        FROM public.bar_device_status bds
        WHERE bds.last_heartbeat_at IS NOT NULL
        ORDER BY bds.bar_id, bds.last_heartbeat_at DESC NULLS LAST
    )
    SELECT 
        b.id AS bar_id,
        b.name AS bar_name,
        ds.device_id,
        ds.app_version,
        ds.last_heartbeat_at,
        COALESCE(ds.unsynced_count, 0) AS unsynced_count,
        ds.battery_level,
        CASE
            WHEN ds.last_heartbeat_at IS NULL THEN 'offline'
            WHEN ds.last_heartbeat_at > now() - interval '15 minutes' THEN 'online'
            WHEN ds.last_heartbeat_at > now() - interval '60 minutes' THEN 'warning'
            ELSE 'offline'
        END AS status,
        CASE
            WHEN ds.last_heartbeat_at IS NULL THEN NULL
            ELSE ROUND(EXTRACT(EPOCH FROM (now() - ds.last_heartbeat_at)) / 60, 2)
        END AS minutes_since_heartbeat
    FROM public.bars b
    LEFT JOIN device_status ds ON b.id = ds.bar_id
    WHERE b.is_active = true -- Only monitor active commercial bars
    ORDER BY 
        CASE 
            WHEN ds.last_heartbeat_at IS NULL THEN 3 -- Offline (Bottom or Top depending on pref)
            WHEN ds.last_heartbeat_at > now() - interval '15 minutes' THEN 1 -- Online
            ELSE 2 -- Warning
        END,
        b.name;
END;
$$;

-- Create table for tracking device status (Heartbeat)
CREATE TABLE IF NOT EXISTS public.bar_device_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL, -- Unique identifier for the device (e.g., from localStorage)
    app_version TEXT,
    battery_level INTEGER,
    unsynced_count INTEGER DEFAULT 0,
    last_heartbeat_at TIMESTAMPTZ DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Ensure one entry per device per bar
    UNIQUE(bar_id, device_id),

    -- Validation constraints
    CONSTRAINT battery_level_valid CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),
    CONSTRAINT device_id_not_empty CHECK (device_id IS NOT NULL AND length(trim(device_id)) > 0),
    CONSTRAINT unsynced_count_positive CHECK (unsynced_count >= 0)
);

-- Enable RLS
ALTER TABLE public.bar_device_status ENABLE ROW LEVEL SECURITY;

-- Policies

-- Allow users to insert heartbeat ONLY for bars they have access to
CREATE POLICY "Users insert heartbeat for accessible bars" ON public.bar_device_status
    FOR INSERT WITH CHECK (
        -- Allow service role
        auth.role() = 'service_role' OR
        -- Or user must have access to this bar via bar_users table
        EXISTS (
            SELECT 1 FROM public.bar_members
            WHERE bar_members.bar_id = bar_device_status.bar_id
            AND bar_members.user_id = auth.uid()
            AND bar_members.is_active = true
        )
    );

-- Only super_admins can view all heartbeats
CREATE POLICY "Super admins view all heartbeats" ON public.bar_device_status
    FOR SELECT USING (
        auth.role() = 'service_role' OR
        EXISTS (
            SELECT 1 FROM public.bar_members
            WHERE bar_members.user_id = auth.uid()
            AND bar_members.role = 'super_admin'
            AND bar_members.is_active = true
        )
    );

-- Users can only update heartbeat for their own bars
CREATE POLICY "Users update heartbeat for accessible bars" ON public.bar_device_status
    FOR UPDATE USING (
        auth.role() = 'service_role' OR
        EXISTS (
            SELECT 1 FROM public.bar_members
            WHERE bar_members.bar_id = bar_device_status.bar_id
            AND bar_members.user_id = auth.uid()
            AND bar_members.is_active = true
        )
    );

-- RPC to log heartbeat efficiently (Upsert)
CREATE OR REPLACE FUNCTION public.log_heartbeat(
    p_bar_id UUID,
    p_device_id TEXT,
    p_app_version TEXT,
    p_unsynced_count INTEGER,
    p_battery_level INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.bar_device_status (
        bar_id, 
        device_id, 
        app_version, 
        unsynced_count, 
        battery_level, 
        last_heartbeat_at,
        ip_address,
        user_agent
    )
    VALUES (
        p_bar_id,
        p_device_id,
        p_app_version,
        p_unsynced_count,
        p_battery_level,
        now(),
        COALESCE(inet_client_addr()::text, 'unknown'),
        COALESCE(
            (current_setting('request.headers', true)::json->>'user-agent'),
            'unknown'
        )
    )
    ON CONFLICT (bar_id, device_id) 
    DO UPDATE SET
        last_heartbeat_at = now(),
        app_version = EXCLUDED.app_version,
        unsynced_count = EXCLUDED.unsynced_count,
        battery_level = EXCLUDED.battery_level,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent;
END;
$$;

-- Performance indexes
-- Composite index for efficient lookups by bar and most recent heartbeat
CREATE INDEX IF NOT EXISTS idx_bar_device_status_bar_heartbeat
    ON public.bar_device_status(bar_id, last_heartbeat_at DESC);

-- Index for efficient time-based queries (most recent first)
CREATE INDEX IF NOT EXISTS idx_bar_device_status_recent_heartbeat
    ON public.bar_device_status(last_heartbeat_at DESC);

-- Index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_bar_device_status_device
    ON public.bar_device_status(device_id);

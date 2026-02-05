-- =====================================================
-- Migration: Mettre à jour create_ticket RPC avec table_number et customer_name
-- Date: 2026-02-05
-- Description: Ajoute les paramètres p_table_number et p_customer_name au RPC
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_ticket(
    p_bar_id       UUID,
    p_created_by   UUID,
    p_notes        TEXT    DEFAULT NULL,
    p_server_id    UUID    DEFAULT NULL,
    p_closing_hour INTEGER DEFAULT 6,
    p_table_number INTEGER DEFAULT NULL,  -- NOUVEAU
    p_customer_name TEXT   DEFAULT NULL   -- NOUVEAU
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public.tickets;
    v_next_number INTEGER;
    v_cutoff_timestamp TIMESTAMP;
    v_lock_key BIGINT;
    v_closing_interval INTERVAL;
BEGIN
    SET LOCAL row_security = off;

    IF p_bar_id IS NULL OR p_created_by IS NULL THEN
        RAISE EXCEPTION 'bar_id et created_by sont requis';
    END IF;

    -- A. Calculate Closing Interval & Business Cutoff
    v_closing_interval := (p_closing_hour || ' hours')::INTERVAL;
    
    -- "Business Day" logic:
    -- If CurrentTime < ClosingTime (e.g. 03:00 < 06:00), we are in "Yesterday's" business day.
    -- Cutoff = (Now - ClosingTime) truncated to Day + ClosingTime.
    v_cutoff_timestamp := date_trunc('day', CURRENT_TIMESTAMP - v_closing_interval) + v_closing_interval;

    -- B. Acquire Advisory Lock for this Bar to prevent duplicate numbers
    -- Key derived from UUID prefix to keep it lightweight but distinct per bar
    v_lock_key := ('x' || substr(p_bar_id::text, 1, 8))::bit(32)::int;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- C. Calculate next ticket number for this Bar + Business Period
    SELECT COALESCE(MAX(ticket_number), 0) + 1
    INTO v_next_number
    FROM public.tickets
    WHERE bar_id = p_bar_id
      AND created_at >= v_cutoff_timestamp;

    -- D. Insert avec les nouveaux champs table_number et customer_name
    INSERT INTO public.tickets (
        bar_id, created_by, server_id, notes, ticket_number, status,
        table_number, customer_name  -- NOUVEAU
    )
    VALUES (
        p_bar_id, p_created_by, p_server_id, p_notes, v_next_number, 'open',
        p_table_number, p_customer_name  -- NOUVEAU
    )
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
END;
$$;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ RPC create_ticket mis à jour avec table_number et customer_name';
END $$;

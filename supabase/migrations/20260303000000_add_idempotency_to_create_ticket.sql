-- =====================================================
-- Migration: Ajouter idempotency_key à create_ticket RPC
-- Date: 2026-03-03
-- Description:
--   1. Ajoute la colonne idempotency_key (TEXT UNIQUE) à la table tickets
--   2. Met à jour le RPC create_ticket avec le paramètre p_idempotency_key
--      → Retourne le ticket existant si la clé est déjà connue (protection doublon)
--   Contexte: SyncManager envoyait déjà p_idempotency_key mais la fonction
--   ne le déclarait pas → erreur "unknown parameter" lors de la sync offline.
-- =====================================================

-- 1. Ajouter la colonne sur la table
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Index unique sparse : seules les lignes non-NULL sont indexées
CREATE UNIQUE INDEX IF NOT EXISTS tickets_idempotency_key_idx
  ON public.tickets (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Recréer le RPC create_ticket avec le nouveau paramètre
CREATE OR REPLACE FUNCTION public.create_ticket(
    p_bar_id          UUID,
    p_created_by      UUID,
    p_notes           TEXT    DEFAULT NULL,
    p_server_id       UUID    DEFAULT NULL,
    p_closing_hour    INTEGER DEFAULT 6,
    p_table_number    INTEGER DEFAULT NULL,
    p_customer_name   TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL  -- NOUVEAU : protection contre les doublons
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket            public.tickets;
    v_next_number       INTEGER;
    v_cutoff_timestamp  TIMESTAMP;
    v_lock_key          BIGINT;
    v_closing_interval  INTERVAL;
BEGIN
    SET LOCAL row_security = off;

    IF p_bar_id IS NULL OR p_created_by IS NULL THEN
        RAISE EXCEPTION 'bar_id et created_by sont requis';
    END IF;

    -- ⭐ Idempotency check : si on a déjà créé ce ticket, le retourner directement
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN v_ticket;
        END IF;
    END IF;

    -- A. Calculate Closing Interval & Business Cutoff
    v_closing_interval := (p_closing_hour || ' hours')::INTERVAL;

    -- "Business Day" logic:
    -- If CurrentTime < ClosingTime (e.g. 03:00 < 06:00), we are in "Yesterday's" business day.
    v_cutoff_timestamp := date_trunc('day', CURRENT_TIMESTAMP - v_closing_interval) + v_closing_interval;

    -- B. Acquire Advisory Lock for this Bar to prevent duplicate numbers
    v_lock_key := ('x' || substr(p_bar_id::text, 1, 8))::bit(32)::int;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- C. Calculate next ticket number for this Bar + Business Period
    SELECT COALESCE(MAX(ticket_number), 0) + 1
    INTO v_next_number
    FROM public.tickets
    WHERE bar_id = p_bar_id
      AND created_at >= v_cutoff_timestamp;

    -- D. Insert avec idempotency_key
    INSERT INTO public.tickets (
        bar_id, created_by, server_id, notes, ticket_number, status,
        table_number, customer_name, idempotency_key
    )
    VALUES (
        p_bar_id, p_created_by, p_server_id, p_notes, v_next_number, 'open',
        p_table_number, p_customer_name, p_idempotency_key
    )
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
END;
$$;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ create_ticket mis à jour : colonne idempotency_key + protection doublon online/offline';
END $$;

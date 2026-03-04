-- =====================================================
-- Migration: Ajouter idempotency_key à create_ticket RPC
-- Date: 2026-03-03
-- Description:
--   1. Ajoute la colonne idempotency_key (TEXT) à la table tickets
--   2. Index composite UNIQUE scopé par bar_id (isolation multi-tenant)
--      → Un même UUID ne peut pas créer de doublon dans le même bar
--      → Deux bars différents peuvent théoriquement avoir la même clé (improbable)
--   3. Met à jour le RPC create_ticket avec le paramètre p_idempotency_key
--      → Le check idempotency est effectué APRÈS le verrou (évite race condition)
--      → Retourne le ticket existant si la clé est déjà connue (protection doublon)
--   Contexte: SyncManager envoyait déjà p_idempotency_key mais la fonction
--   ne le déclarait pas → erreur "unknown parameter" lors de la sync offline.
-- =====================================================

-- 1. Ajouter la colonne sur la table
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Index unique composite (bar_id, idempotency_key) — isolation multi-tenant
-- Sparse : seules les lignes non-NULL sont indexées
DROP INDEX IF EXISTS tickets_idempotency_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_bar_idempotency_key_idx
  ON public.tickets (bar_id, idempotency_key)
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

    -- 🛡️ Auth guard : membership check + cohérence p_created_by
    -- Bypass pour service_role (SyncManager, migrations, tests)
    IF auth.role() <> 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.bar_members
            WHERE user_id = auth.uid()
              AND bar_id = p_bar_id
              AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Access denied: not an active member of this bar';
        END IF;

        IF auth.uid() IS DISTINCT FROM p_created_by THEN
            RAISE EXCEPTION 'Access denied: p_created_by must match authenticated user';
        END IF;
    END IF;

    -- A. Calculate Closing Interval & Business Cutoff
    v_closing_interval := (p_closing_hour || ' hours')::INTERVAL;

    -- "Business Day" logic:
    -- If CurrentTime < ClosingTime (e.g. 03:00 < 06:00), we are in "Yesterday's" business day.
    v_cutoff_timestamp := date_trunc('day', CURRENT_TIMESTAMP - v_closing_interval) + v_closing_interval;

    -- B. Acquire Advisory Lock FIRST — empêche les créations concurrentes pour ce bar
    -- Le lock doit être acquis AVANT le check idempotency pour éviter la race condition :
    -- Sans le lock, deux threads pourraient passer le check en même temps et tous deux insérer.
    v_lock_key := ('x' || substr(p_bar_id::text, 1, 8))::bit(32)::int;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- C. ⭐ Idempotency check APRÈS le verrou — scopé par bar_id (isolation multi-tenant)
    -- Un UUID identique dans un bar différent est ignoré correctement.
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE bar_id = p_bar_id
          AND idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN v_ticket;
        END IF;
    END IF;

    -- D. Calculate next ticket number for this Bar + Business Period
    SELECT COALESCE(MAX(ticket_number), 0) + 1
    INTO v_next_number
    FROM public.tickets
    WHERE bar_id = p_bar_id
      AND created_at >= v_cutoff_timestamp;

    -- E. Insert avec idempotency_key
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
  RAISE NOTICE '✅ create_ticket mis à jour : index composite (bar_id, idempotency_key) + check après verrou + auth guard';
END $$;

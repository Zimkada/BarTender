-- =====================================================
-- MIGRATION: Tickets V2 (Consolidated) - Payment Methods, Numbers & Constraints
-- =====================================================
-- DATE: 2026-02-04
--
-- OBJECTIFS:
-- 1. Ajouter `ticket_number` (séquentiel par jour comptable) et `payment_method` aux tickets.
-- 2. Mettre à jour les contraintes CHECK pour autoriser 'ticket' comme méthode de paiement (Sales & Tickets).
-- 3. Mettre à jour les RPCs `create_ticket` (gestion locks & heure clôture dynamique) et `pay_ticket`.
-- 4. Backfill des numéros de tickets existants pour éviter les NULL.

BEGIN;

-- -----------------------------------------------------
-- 1. MODIFICATION DE LA TABLE `tickets`
-- -----------------------------------------------------

-- A. Ajouter la colonne `ticket_number` (Nullable d'abord pour le backfill)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'ticket_number') THEN
        ALTER TABLE public.tickets ADD COLUMN ticket_number INTEGER;
    END IF;
END $$;

-- B. Ajouter la colonne `payment_method`
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'payment_method') THEN
        ALTER TABLE public.tickets ADD COLUMN payment_method TEXT;
    END IF;
END $$;

-- -----------------------------------------------------
-- 2. UPDATE CHECK CONSTRAINTS (Sales & Tickets)
-- -----------------------------------------------------
-- On doit autoriser 'ticket' dans la liste des méthodes de paiement pour `sales` et `tickets`.

-- A. Update SALES constraint
DO $$
BEGIN
    -- Drop old constraint if exists (safe best-effort)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_method_check') THEN
        ALTER TABLE public.sales DROP CONSTRAINT sales_payment_method_check;
    END IF;
END $$;

ALTER TABLE public.sales
ADD CONSTRAINT sales_payment_method_check 
CHECK (payment_method IN ('cash', 'mobile_money', 'card', 'credit', 'ticket'));

-- B. Update TICKETS constraint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_payment_method_check') THEN
        ALTER TABLE public.tickets DROP CONSTRAINT tickets_payment_method_check;
    END IF;
END $$;

ALTER TABLE public.tickets
ADD CONSTRAINT tickets_payment_method_check 
CHECK (payment_method IN ('cash', 'mobile_money', 'card', 'credit', 'ticket'));


-- -----------------------------------------------------
-- 3. BACKFILL NUMÉROS DE TICKETS EXISTANTS
-- -----------------------------------------------------
-- On attribue arbitrairement des numéros séquentiels aux tickets passés pour respecter NOT NULL.
-- Logic: Row_number() partitionné par bar et date de création.
WITH numbered_tickets AS (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY bar_id, created_at::date ORDER BY created_at ASC) as rn
    FROM public.tickets
    WHERE ticket_number IS NULL
)
UPDATE public.tickets
SET ticket_number = numbered_tickets.rn
FROM numbered_tickets
WHERE public.tickets.id = numbered_tickets.id;

-- Maintenant on peut mettre NOT NULL (sauf si table vide, safe)
ALTER TABLE public.tickets ALTER COLUMN ticket_number SET NOT NULL;


-- -----------------------------------------------------
-- 4. RPC: create_ticket (Avec Locks & Closing Hour)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_ticket(
    p_bar_id       UUID,
    p_created_by   UUID,
    p_notes        TEXT    DEFAULT NULL,
    p_server_id    UUID    DEFAULT NULL,
    p_closing_hour INTEGER DEFAULT 6
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

    -- D. Insert
    INSERT INTO public.tickets (bar_id, created_by, server_id, notes, ticket_number, status)
    VALUES (p_bar_id, p_created_by, p_server_id, p_notes, v_next_number, 'open')
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
END;
$$;


-- -----------------------------------------------------
-- 5. RPC: pay_ticket (Avec Payment Method)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_ticket(
    p_ticket_id      UUID,
    p_paid_by        UUID,
    p_payment_method TEXT
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public.tickets;
BEGIN
    SET LOCAL row_security = off;

    IF p_ticket_id IS NULL OR p_paid_by IS NULL OR p_payment_method IS NULL THEN
        RAISE EXCEPTION 'ticket_id, paid_by et payment_method sont requis';
    END IF;

    -- Lock the row to prevent concurrent modifications
    SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;

    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'Ticket % non trouvé', p_ticket_id;
    END IF;

    IF v_ticket.status <> 'open' THEN
        RAISE EXCEPTION 'Ticket % n''est pas ouvert (statut actuel: %)', p_ticket_id, v_ticket.status;
    END IF;

    UPDATE public.tickets
    SET status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        paid_by = p_paid_by,
        payment_method = p_payment_method
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
END;
$$;

COMMIT;

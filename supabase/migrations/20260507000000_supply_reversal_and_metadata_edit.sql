-- Migration: supply reversal (annulation symétrique) + édition cosmétique
--
-- Permet au promoteur d'annuler un approvisionnement erroné en créant une
-- ligne miroir négative (audit trail intact, conforme SYSCOHADA), et
-- d'éditer les champs purement informatifs (supplier_name, supplier_phone,
-- notes) sans impact sur le stock ni la comptabilité.
--
-- Mécanique :
--  * Une "annulation" = nouvelle ligne supplies avec quantity = -X,
--    total_cost = -X * unit_cost, reversal_of_id pointant vers l'original.
--  * Le trigger CUMP existant (update_product_current_average_cost)
--    recalcule automatiquement via SUM(unit_cost * quantity) / SUM(quantity)
--    -> la ligne négative s'annule mathématiquement avec l'originale.
--  * La vue expenses_summary_mat somme total_cost -> la ligne négative
--    déduit automatiquement la dépense de la compta.
--  * L'original n'est jamais supprimé : reversed_at/reversed_by stampés.
--
-- Garde-fous :
--  * Permission promoteur uniquement (super_admin / impersonating tolérés).
--  * Bloque si bar_products.stock < supply.quantity (ventes intermédiaires).
--  * Bloque si supply déjà reversed.
--  * Bloque si supply est elle-même un reverse (pas de double reverse).

-- =====================================================
-- 1. COLONNES — traçabilité du reverse
-- =====================================================

ALTER TABLE public.supplies
    ADD COLUMN IF NOT EXISTS reversal_of_id UUID
        REFERENCES public.supplies(id) ON DELETE SET NULL;

ALTER TABLE public.supplies
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE public.supplies
    ADD COLUMN IF NOT EXISTS reversed_by UUID
        REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_supplies_reversal_of
    ON public.supplies (reversal_of_id)
    WHERE reversal_of_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplies_reversed_at
    ON public.supplies (reversed_at)
    WHERE reversed_at IS NOT NULL;

COMMENT ON COLUMN public.supplies.reversal_of_id IS
    'Si non null, cette ligne annule la ligne pointée (quantity et total_cost négatifs)';
COMMENT ON COLUMN public.supplies.reversed_at IS
    'Timestamp d''annulation de cette ligne (set sur l''originale lors d''un reverse)';
COMMENT ON COLUMN public.supplies.reversed_by IS
    'Utilisateur ayant déclenché l''annulation';

-- =====================================================
-- 1b. CONTRAINTES — autoriser les valeurs négatives pour les reversals
-- =====================================================
-- Les lignes de reverse ont quantity < 0 et total_cost < 0.
-- Les CHECK issus du schéma initial (quantity > 0, total_cost >= 0) bloquent
-- ces insertions. On les remplace par des contraintes contextuelles.

-- quantity : positif pour les lignes normales, négatif pour les reversals
ALTER TABLE public.supplies
    DROP CONSTRAINT IF EXISTS supplies_quantity_check;

ALTER TABLE public.supplies
    ADD CONSTRAINT supplies_quantity_check CHECK (
        (reversal_of_id IS NULL     AND quantity > 0)
        OR
        (reversal_of_id IS NOT NULL AND quantity < 0)
    );

-- total_cost : >= 0 pour les lignes normales, <= 0 pour les reversals
ALTER TABLE public.supplies
    DROP CONSTRAINT IF EXISTS supplies_total_cost_check;

ALTER TABLE public.supplies
    ADD CONSTRAINT supplies_total_cost_check CHECK (
        (reversal_of_id IS NULL     AND total_cost >= 0)
        OR
        (reversal_of_id IS NOT NULL AND total_cost <= 0)
    );

-- =====================================================
-- 1c. INDEX UNIQUE — exclure les reversals de la contrainte d'unicité
-- =====================================================
-- La contrainte UNIQUE (bar_id, product_id, supplied_at) bloque deux reversals
-- du même produit dans la même seconde. Les reversals n'ont pas besoin de cette
-- garantie d'unicité (ils sont déjà protégés par reversed_at sur l'original).

ALTER TABLE public.supplies
    DROP CONSTRAINT IF EXISTS unique_bar_product_supply_date;

DROP INDEX IF EXISTS public.unique_bar_product_supply_date;

CREATE UNIQUE INDEX IF NOT EXISTS unique_bar_product_supply_date
    ON public.supplies (bar_id, product_id, supplied_at)
    WHERE reversal_of_id IS NULL;

-- =====================================================
-- 2. RPC : reverse_supply (annulation symétrique)
-- =====================================================
-- Retour : { success, reverse_supply_id, original_id, quantity_reversed, unit_cost }

CREATE OR REPLACE FUNCTION public.reverse_supply(
    p_supply_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_original          public.supplies%ROWTYPE;
    v_current_stock     INTEGER;
    v_reverse_id        UUID;
    v_user_id           UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- 1. Verrou sur l'approvisionnement original
    SELECT * INTO v_original
    FROM public.supplies
    WHERE id = p_supply_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supply % not found', p_supply_id;
    END IF;

    -- 2. Garde-fous métier
    IF v_original.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reverse a reversal entry';
    END IF;

    IF v_original.reversed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Supply already reversed at %', v_original.reversed_at;
    END IF;

    -- 3. Permission : promoteur uniquement (+ super_admin / impersonation)
    IF NOT (
        get_user_role(v_original.bar_id) = 'promoteur'
        OR is_super_admin()
        OR is_impersonating()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only promoteur can reverse supplies';
    END IF;

    -- 4. Vérifier stock disponible (ventes/consignations intermédiaires)
    SELECT stock INTO v_current_stock
    FROM public.bar_products
    WHERE id = v_original.product_id AND bar_id = v_original.bar_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in bar %', v_original.product_id, v_original.bar_id;
    END IF;

    IF v_current_stock < v_original.quantity THEN
        RAISE EXCEPTION 'Cannot reverse supply: current stock (%) is lower than supply quantity (%) — sales already consumed this stock',
            v_current_stock, v_original.quantity;
    END IF;

    -- 5. Insérer la ligne miroir (quantity et total_cost négatifs)
    INSERT INTO public.supplies (
        bar_id,
        product_id,
        quantity,
        unit_cost,
        total_cost,
        supplier_name,
        supplier_phone,
        notes,
        supplied_at,
        supplied_by,
        reversal_of_id
    )
    VALUES (
        v_original.bar_id,
        v_original.product_id,
        -v_original.quantity,
        v_original.unit_cost,
        -v_original.total_cost,
        v_original.supplier_name,
        v_original.supplier_phone,
        'Annulation de l''approvisionnement ' || v_original.id::text,
        NOW(),
        v_user_id,
        v_original.id
    )
    RETURNING id INTO v_reverse_id;

    -- 6. Marquer l'original comme reversed
    UPDATE public.supplies
    SET reversed_at = NOW(),
        reversed_by = v_user_id
    WHERE id = v_original.id;

    -- 7. Décrémenter le stock du produit
    --    (Le trigger CUMP s'occupe de current_average_cost et last_unit_cost)
    UPDATE public.bar_products
    SET stock = stock - v_original.quantity,
        updated_at = NOW()
    WHERE id = v_original.product_id;

    RETURN jsonb_build_object(
        'success',            TRUE,
        'reverse_supply_id',  v_reverse_id,
        'original_id',        v_original.id,
        'quantity_reversed',  v_original.quantity,
        'unit_cost',          v_original.unit_cost
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'reverse_supply: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_supply(UUID) TO authenticated;

COMMENT ON FUNCTION public.reverse_supply(UUID) IS
    'Annule un approvisionnement en créant une ligne miroir négative. Promoteur uniquement. Bloque si stock insuffisant.';

-- =====================================================
-- 3. RPC : update_supply_metadata (édition cosmétique)
-- =====================================================
-- Mise à jour des champs informatifs uniquement. Pas d'impact stock/CUMP/compta.
-- Permission : promoteur uniquement.

CREATE OR REPLACE FUNCTION public.update_supply_metadata(
    p_supply_id      UUID,
    p_supplier_name  TEXT DEFAULT NULL,
    p_supplier_phone TEXT DEFAULT NULL,
    p_notes          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_supply  public.supplies%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_supply
    FROM public.supplies
    WHERE id = p_supply_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supply % not found', p_supply_id;
    END IF;

    -- Refus d'édition sur les lignes de reverse (toujours auto-générées)
    IF v_supply.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot edit a reversal entry';
    END IF;

    -- Refus d'édition sur les lignes déjà annulées (audit gelé)
    IF v_supply.reversed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot edit a reversed supply';
    END IF;

    -- Permission : promoteur uniquement
    IF NOT (
        get_user_role(v_supply.bar_id) = 'promoteur'
        OR is_super_admin()
        OR is_impersonating()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only promoteur can edit supplies';
    END IF;

    UPDATE public.supplies
    SET
        supplier_name  = COALESCE(p_supplier_name,  supplier_name),
        supplier_phone = COALESCE(p_supplier_phone, supplier_phone),
        notes          = COALESCE(p_notes,          notes)
    WHERE id = p_supply_id;

    RETURN jsonb_build_object(
        'success',   TRUE,
        'supply_id', p_supply_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'update_supply_metadata: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_supply_metadata(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_supply_metadata(UUID, TEXT, TEXT, TEXT) IS
    'Édite les champs cosmétiques (supplier_name, supplier_phone, notes) d''un approvisionnement. Promoteur uniquement. Pas d''impact stock/CUMP.';

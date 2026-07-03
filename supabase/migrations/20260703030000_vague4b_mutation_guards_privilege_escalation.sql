-- =====================================================
-- MIGRATION: Vague 4b — Guards d'appartenance/rôle sur les RPC de mutation
-- Date: 2026-07-03
-- Suite de: 20260703020000_vague4a_close_anon_execute_breach.sql
--
-- CONTEXTE (audit externe 2026-07-03, confirmé par pg_proc + pg_policies en
-- prod) : 9 RPC SECURITY DEFINER de mutation sont exposées à `authenticated`
-- (PAS anon — vérifié, execute_grantees = {authenticated, postgres} pour les
-- 9) mais SANS AUCUN guard de rôle ni d'appartenance au bar. Comme ces RPC
-- bypassent le RLS (owner postgres), elles permettent une ESCALADE DE
-- PRIVILÈGE : un serveur authentifié peut faire, via la RPC, ce que la RLS
-- de la table cible interdit à son rôle en écriture directe.
--
-- Ce n'est PAS un problème d'accès anonyme (traité en 4a) mais un problème
-- de rôle. Chaque guard ci-dessous REPLIQUE EXACTEMENT la policy RLS de la
-- table que la RPC modifie (pas une politique inventée) :
--   - bar_products/supplies  : "Managers can update/create ..." → promoteur,
--     gerant, super_admin (confirmé par pg_policies + RBAC applicatif
--     canManageInventory=true pour gerant/promoteur, false pour serveur).
--   - consignments           : "Managers can create/update consignments" →
--     promoteur, gerant, super_admin.
--   - sales (validate)       : "Managers can validate sales" → gerant,
--     promoteur, super_admin (RBAC canCancelSales=false pour gerant/serveur,
--     mais la validation est une policy SÉPARÉE de l'annulation — gerant
--     valide, seul promoteur annule une vente déjà validée, cf. 4a).
--   - sales (reject)         : double policy RLS — gérant/promoteur/admin
--     rejettent n'importe quelle vente pending ; UN SERVEUR NE PEUT
--     rejeter QUE SA PROPRE vente pending de moins de 10 minutes
--     ("Servers can cancel own recent pending sales"). Le guard réplique
--     cette double condition (pas un simple "gerant/promoteur uniquement",
--     ce qui casserait le flux serveur légitime existant).
--
-- ANTI-RÉGRESSION :
--   - Toutes les signatures et types de retour sont repris À L'IDENTIQUE de
--     l'état prod certifié par pré-vol (pg_get_function_identity_arguments +
--     pg_get_function_result), donc CREATE OR REPLACE remplace proprement
--     sans créer de surcharge (cf. incident reject_sale du 03/07/2026).
--   - Les paramètres p_validated_by / p_rejected_by / p_rejector_id /
--     p_claimed_by / p_created_by(consignment) restent dans la signature
--     (pour ne rien casser côté TS) mais l'attribution réelle utilise
--     auth.uid() quand disponible (anti-spoofing), avec fallback sur le
--     paramètre pour les appels service_role (SyncManager) où auth.uid()
--     est NULL.
--   - decrement_stock / increment_stock : AUCUN appelant TS (vérifié par
--     grep exhaustif du repo). ProductService.updateStock/incrementStock/
--     decrementStock (products.service.ts:442-492) sont du code mort qui
--     appelle ces RPC — supprimées dans le même mouvement (voir section 8).
--     decrement_stock/increment_stock ont par ailleurs un défaut structurel
--     indépendant de la sécurité (pas de FOR UPDATE, écriture non atomique) :
--     plutôt que les corriger pour une paire de fonctions sans appelant, on
--     retire leur exécution (REVOKE ALL FROM PUBLIC, authenticated — aucun
--     GRANT de remplacement). La définition SQL reste en base (DROP non
--     demandé ici, réversible sans risque) mais plus personne ne peut plus
--     les exécuter, y compris via un appel RPC direct.
--
-- PRÉ-VOL (déjà exécuté et certifié le 2026-07-03) :
--   - 9/9 fonctions : nb=1 (aucune surcharge)
--   - 9/9 fonctions : execute_grantees = {authenticated, postgres} (pas de
--     anon — confirme que ce lot est un problème d'escalade, pas d'accès
--     anonyme)
--   - Signatures et return_type confirmés identiques à ceux utilisés
--     ci-dessous (cf. échange précédent, résultats bruts pg_proc)
-- =====================================================

-- =====================================================
-- 1. decrement_stock / increment_stock — RETRAIT DU SERVICE PUBLIC
--    (code mort, aucun appelant TS, pas de guard, pattern non sûr)
-- =====================================================
REVOKE ALL ON FUNCTION public.decrement_stock(uuid, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.increment_stock(uuid, integer) FROM PUBLIC, authenticated;

-- =====================================================
-- 2. create_supply_and_update_product — guard promoteur/gerant
--    (réplique "Managers can create supplies" sur la table supplies).
--    bar_id déjà un paramètre validé par appartenance produit (ligne 37 du
--    corps original : WHERE id = p_product_id AND bar_id = p_bar_id) — on
--    ajoute le guard rôle AVANT cette vérification.
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_supply_and_update_product(
  p_bar_id UUID,
  p_product_id UUID,
  p_quantity INT,
  p_lot_price NUMERIC,
  p_lot_size INT,
  p_supplier TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  new_supply RECORD;
  product_current_stock INT;
  product_current_cost NUMERIC;
  new_unit_cost NUMERIC;
  new_average_cost NUMERIC;
  new_total_stock INT;
  v_actor UUID;
BEGIN
  v_actor := auth.uid();

  -- 🛡️ Auth guard : promoteur/gerant du bar cible, réplique la policy RLS
  -- "Managers can create supplies". service_role bypass (sync/tests).
  IF auth.role() <> 'service_role' THEN
    IF NOT (
      get_user_role(p_bar_id) = ANY (ARRAY['promoteur', 'gerant'])
      OR is_super_admin()
    ) THEN
      RAISE EXCEPTION 'Access denied: only promoteur/gerant can record a supply';
    END IF;
  END IF;

  -- 1. Get current product state (scopé bar_id, comme l'original)
  SELECT
    stock,
    current_average_cost
  INTO
    product_current_stock,
    product_current_cost
  FROM public.bar_products
  WHERE id = p_product_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found in bar %', p_product_id, p_bar_id;
  END IF;

  -- 2. Calculate new unit cost for this supply
  IF p_lot_size <= 0 THEN
    RAISE EXCEPTION 'Lot size must be greater than 0';
  END IF;
  new_unit_cost := p_lot_price / p_lot_size;

  -- 3. Calculate the new Weighted Average Cost (CUMP)
  new_total_stock := product_current_stock + p_quantity;

  IF new_total_stock <= 0 THEN
    new_average_cost := product_current_cost;
  ELSE
    new_average_cost := (
      (product_current_stock::numeric * product_current_cost) + (p_quantity::numeric * new_unit_cost)
    ) / new_total_stock::numeric;
  END IF;

  -- 4. Insert the new supply record — supplied_by = auth.uid() (anti-spoofing)
  INSERT INTO public.supplies (bar_id, product_id, quantity, unit_cost, total_cost, supplier_name, supplied_at, supplied_by)
  VALUES (
    p_bar_id,
    p_product_id,
    p_quantity,
    new_unit_cost,
    (p_quantity * new_unit_cost),
    p_supplier,
    NOW(),
    COALESCE(v_actor, p_created_by)
  )
  RETURNING * INTO new_supply;

  -- 5. Update the product with new stock and new CUMP (verrouillé par le FOR UPDATE ci-dessus)
  UPDATE public.bar_products
  SET
    stock = new_total_stock,
    current_average_cost = new_average_cost,
    updated_at = NOW()
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'supply', to_jsonb(new_supply)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'RPC Error in create_supply_and_update_product: %', SQLERRM;
END;
$$;

-- =====================================================
-- 3. validate_sale — guard gerant/promoteur/super_admin
--    (réplique "Managers can validate sales" sur sales)
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_sale(
    p_sale_id UUID,
    p_validated_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_bar_id UUID;
    v_status TEXT;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_current_stock INT;
    v_product_name TEXT;
    v_actor UUID;
BEGIN
    v_actor := auth.uid();

    -- 1. Lock the sale row and check status
    SELECT bar_id, status INTO v_bar_id, v_status
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    -- 🛡️ Auth guard : bar_id dérivé de la vente. Réplique "Managers can
    -- validate sales" (gerant/promoteur/super_admin). service_role bypass.
    IF auth.role() <> 'service_role' THEN
        IF NOT (
            get_user_role(v_bar_id) = ANY (ARRAY['gerant', 'promoteur'])
            OR is_super_admin()
        ) THEN
            RAISE EXCEPTION 'Access denied: only gerant/promoteur can validate a sale';
        END IF;
    END IF;

    IF v_status != 'pending' THEN
        RAISE EXCEPTION 'Only pending sales can be validated (Current status: %)', v_status;
    END IF;

    -- 2. Vérifier ET verrouiller le stock de chaque produit AVANT de décrémenter
    FOR v_item IN SELECT * FROM jsonb_array_elements((SELECT items FROM sales WHERE id = p_sale_id))
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT stock, display_name INTO v_current_stock, v_product_name
        FROM bar_products
        WHERE id = v_product_id AND bar_id = v_bar_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'STOCK_ERROR:Produit % introuvable dans le bar %', v_product_id, v_bar_id;
        END IF;

        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'STOCK_ERROR:Stock insuffisant pour "%" (disponible: %, demandé: %)',
                COALESCE(v_product_name, v_product_id::TEXT), v_current_stock, v_quantity;
        END IF;

        UPDATE bar_products
        SET stock = stock - v_quantity
        WHERE id = v_product_id AND bar_id = v_bar_id;
    END LOOP;

    -- 3. Update sale status — attribution = auth.uid() (anti-spoofing)
    UPDATE sales
    SET
        status = 'validated',
        validated_by = COALESCE(v_actor, p_validated_by),
        validated_at = NOW()
    WHERE id = p_sale_id;
END;
$$;

-- =====================================================
-- 4. reject_sale — guard double : gerant/promoteur/admin (n'importe quelle
--    vente pending) OU serveur mais UNIQUEMENT sa propre vente pending de
--    moins de 10 minutes (réplique la policy RLS "Servers can cancel own
--    recent pending sales" — pour ne PAS régresser ce flux serveur légitime)
-- =====================================================
CREATE OR REPLACE FUNCTION public.reject_sale(
    p_sale_id UUID,
    p_rejected_by UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_bar_id UUID;
    v_status TEXT;
    v_sold_by UUID;
    v_created_at TIMESTAMPTZ;
    v_current_notes TEXT;
    v_actor UUID;
    v_caller_role TEXT;
BEGIN
    v_actor := auth.uid();

    -- 1. Lock and check (comportement original préservé à l'identique :
    --    reject_sale ne touche JAMAIS au stock — seul validate_sale
    --    décrémente, donc une vente 'pending' n'a rien à restaurer ; une
    --    vente 'validated' doit passer par cancel_sale, pas ici)
    SELECT bar_id, status, sold_by, created_at, notes
    INTO v_bar_id, v_status, v_sold_by, v_created_at, v_current_notes
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    -- 🛡️ Auth guard : bar_id dérivé de la vente. Réplique la double policy
    -- RLS : manager (toute vente pending) OU serveur (sa propre vente
    -- pending < 10 min). service_role bypass.
    IF auth.role() <> 'service_role' THEN
        v_caller_role := get_user_role(v_bar_id);

        IF NOT (
            v_caller_role = ANY (ARRAY['gerant', 'promoteur'])
            OR is_super_admin()
            OR (
                v_caller_role = 'serveur'
                AND v_sold_by = auth.uid()
                AND v_status = 'pending'
                AND v_created_at > (NOW() - INTERVAL '10 minutes')
            )
        ) THEN
            RAISE EXCEPTION 'Access denied: cannot reject this sale';
        END IF;
    END IF;

    -- 2. Security Check: Prevent changing status if already validated
    -- A validated sale must go through the "Cancel" flow (identique original)
    IF v_status = 'validated' THEN
        RAISE EXCEPTION 'Impossible de rejeter une vente déjà validée. Veuillez utiliser le flux d''annulation sécurisé.';
    END IF;

    -- 3. Update status and conditionally append notes — attribution =
    --    auth.uid() (anti-spoofing). Logique de notes identique à l'original.
    IF p_note IS NOT NULL THEN
        UPDATE sales
        SET
            status = 'rejected',
            rejected_by = COALESCE(v_actor, p_rejected_by),
            rejected_at = NOW(),
            notes = CASE
                        WHEN v_current_notes IS NULL OR v_current_notes = '' THEN p_note
                        ELSE v_current_notes || E'\n' || p_note
                    END
        WHERE id = p_sale_id;
    ELSE
        UPDATE sales
        SET
            status = 'rejected',
            rejected_by = COALESCE(v_actor, p_rejected_by),
            rejected_at = NOW()
        WHERE id = p_sale_id;
    END IF;
END;
$$;

-- =====================================================
-- 5. reject_multiple_sales — corps INCHANGÉ (signature de retour identique
--    à l'original : TABLE(success_count int, failure_count int) — un
--    CREATE OR REPLACE qui change le type de retour échoue avec 42P13
--    "cannot change return type", donc pas touché ici). Elle délègue déjà à
--    reject_sale, qui porte désormais le guard : la protection s'applique
--    par transitivité pour CHAQUE vente du batch, sans modification requise.
--    Finding F7 ("avale les exceptions sans détail") volontairement HORS
--    PÉRIMÈTRE de 4b : changer le type de retour nécessite un DROP explicite
--    (donc un risque de casser l'appelant TS pendant la fenêtre du DROP) à
--    traiter séparément, pas mêlé à un correctif de sécurité en prod.
-- =====================================================

-- =====================================================
-- 6. claim_consignment — guard promoteur/gerant (PAS "tout membre").
--    Le RBAC applicatif (types/index.ts) donne canClaimConsignment=true à
--    promoteur/gerant UNIQUEMENT, false au serveur — même distribution que
--    canCreateConsignment. La réclamation n'est donc PAS un geste de caisse
--    universel (contrairement à pay_ticket) : elle est réservée aux managers.
--    Le guard réplique donc "Managers can update consignments" (l'UPDATE de
--    statut active→claimed relève de cette policy). bar_id dérivé de la ligne.
-- =====================================================
CREATE OR REPLACE FUNCTION public.claim_consignment(
    p_consignment_id UUID,
    p_claimed_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_consignment consignments;
    v_product_id UUID;
    v_bar_id UUID;
    v_quantity INT;
    v_actor UUID;
BEGIN
    v_actor := auth.uid();

    SELECT *
    INTO v_consignment
    FROM consignments
    WHERE id = p_consignment_id;

    IF v_consignment IS NULL THEN
        RAISE EXCEPTION 'Consignment % not found', p_consignment_id;
    END IF;

    -- 🛡️ Auth guard : promoteur/gerant du bar de la consignation (RBAC
    -- canClaimConsignment réservé aux managers). bar_id dérivé de la ligne.
    -- service_role bypass.
    IF auth.role() <> 'service_role' THEN
        IF NOT (
            get_user_role(v_consignment.bar_id) = ANY (ARRAY['promoteur', 'gerant'])
            OR is_super_admin()
        ) THEN
            RAISE EXCEPTION 'Access denied: only promoteur/gerant can claim a consignment';
        END IF;
    END IF;

    IF v_consignment.status != 'active' THEN
        RAISE EXCEPTION 'Invalid transition: consignment must be active, got %', v_consignment.status;
    END IF;

    v_product_id := v_consignment.product_id;
    v_bar_id := v_consignment.bar_id;
    v_quantity := v_consignment.quantity;

    UPDATE consignments
    SET
        status = 'claimed'::consignment_status,
        claimed_at = CURRENT_TIMESTAMP,
        claimed_by = COALESCE(v_actor, p_claimed_by),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_consignment_id
    RETURNING * INTO v_consignment;

    UPDATE public.bar_products
    SET
        stock = stock - v_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_product_id
      AND bar_id = v_bar_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in bar %', v_product_id, v_bar_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'consignment_id', v_consignment.id,
        'status', v_consignment.status,
        'claimed_at', v_consignment.claimed_at,
        'stock_decremented', true
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 7. create_consignment / forfeit_consignment — guard promoteur/gerant
--    (réplique "Managers can create/update consignments"). bar_id est déjà
--    un paramètre de create_consignment (pas dérivable autrement, la ligne
--    n'existe pas encore) ; forfeit_consignment dérive bar_id de la ligne.
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_consignment(
    p_bar_id UUID,
    p_sale_id UUID,
    p_product_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_created_by UUID,
    p_product_volume TEXT DEFAULT NULL,
    p_total_amount NUMERIC DEFAULT 0,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_expiration_days INT DEFAULT 7,
    p_original_seller UUID DEFAULT NULL,
    p_server_id UUID DEFAULT NULL,
    p_business_date DATE DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_consignment consignments;
    v_expires_at TIMESTAMPTZ;
    v_actor UUID;
BEGIN
    v_actor := auth.uid();

    IF p_bar_id IS NULL OR p_product_id IS NULL OR p_quantity IS NULL THEN
        RAISE EXCEPTION 'bar_id, product_id, and quantity are required';
    END IF;

    -- 🛡️ Auth guard : promoteur/gerant du bar cible, réplique "Managers can
    -- create consignments". service_role bypass.
    IF auth.role() <> 'service_role' THEN
        IF NOT (
            get_user_role(p_bar_id) = ANY (ARRAY['promoteur', 'gerant'])
            OR is_super_admin()
        ) THEN
            RAISE EXCEPTION 'Access denied: only promoteur/gerant can create a consignment';
        END IF;
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'quantity must be greater than 0';
    END IF;

    v_expires_at := COALESCE(
        p_expires_at,
        NOW() + (p_expiration_days || ' days')::INTERVAL
    );

    INSERT INTO public.consignments (
        bar_id, sale_id, product_id, product_name, product_volume,
        quantity, total_amount, status,
        created_by, created_at, expires_at,
        customer_name, customer_phone, notes,
        original_seller, server_id, business_date
    ) VALUES (
        p_bar_id, p_sale_id, p_product_id, p_product_name, p_product_volume,
        p_quantity, p_total_amount, 'active'::consignment_status,
        COALESCE(v_actor, p_created_by), CURRENT_TIMESTAMP, v_expires_at,
        p_customer_name, p_customer_phone, p_notes,
        p_original_seller, p_server_id, COALESCE(p_business_date, CURRENT_DATE)
    )
    RETURNING * INTO v_consignment;

    UPDATE public.bar_products
    SET
        stock = stock + p_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_product_id
      AND bar_id = p_bar_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in bar %', p_product_id, p_bar_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'consignment_id', v_consignment.id,
        'status', v_consignment.status,
        'quantity', v_consignment.quantity,
        'stock_incremented', true
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.forfeit_consignment(
    p_consignment_id UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_consignment consignments;
BEGIN
    SELECT *
    INTO v_consignment
    FROM consignments
    WHERE id = p_consignment_id;

    IF v_consignment IS NULL THEN
        RAISE EXCEPTION 'Consignment % not found', p_consignment_id;
    END IF;

    -- 🛡️ Auth guard : promoteur/gerant du bar de la consignation, réplique
    -- "Managers can update consignments". bar_id dérivé de la ligne.
    IF auth.role() <> 'service_role' THEN
        IF NOT (
            get_user_role(v_consignment.bar_id) = ANY (ARRAY['promoteur', 'gerant'])
            OR is_super_admin()
        ) THEN
            RAISE EXCEPTION 'Access denied: only promoteur/gerant can forfeit a consignment';
        END IF;
    END IF;

    IF v_consignment.status NOT IN ('active', 'claimed') THEN
        RAISE EXCEPTION 'Invalid transition: consignment must be active or claimed, got %', v_consignment.status;
    END IF;

    UPDATE consignments
    SET
        status = 'forfeited'::consignment_status,
        forfeited_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_consignment_id
    RETURNING * INTO v_consignment;

    RETURN jsonb_build_object(
        'success', true,
        'consignment_id', v_consignment.id,
        'status', v_consignment.status,
        'forfeited_at', v_consignment.forfeited_at
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- POST-VOL (à exécuter après, résultats à certifier) :
--   -- (a) Toutes les fonctions RECRÉÉES (reject_multiple_sales exclue :
--   --     non touchée dans cette migration, corps et retour inchangés)
--   --     gardent nb=1 (pas de surcharge créée) :
--   SELECT proname, COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname IN (
--     'create_supply_and_update_product','validate_sale','reject_sale',
--     'claim_consignment','create_consignment','forfeit_consignment')
--   GROUP BY proname;
--
--   -- (b) decrement_stock/increment_stock ne sont plus exécutables (authenticated retiré) :
--   SELECT proname, COALESCE((SELECT array_agg(DISTINCT acl.grantee::regrole::text)
--     FROM aclexplode(proacl) acl WHERE acl.privilege_type='EXECUTE'), ARRAY['aucun'])
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname IN ('decrement_stock','increment_stock');
--   -- Attendu : plus de "authenticated" dans la liste.
--
--   -- (c) Smoke-test via l'UI (SQL Editor a auth.uid()=NULL → guards lèvent
--   -- "Access denied", attendu) :
--   --   1. Gérant valide une vente pending → succès.
--   --   2. Serveur rejette SA PROPRE vente pending de <10 min → succès.
--   --   3. Serveur tente de rejeter la vente d'un AUTRE serveur → refusé.
--   --   4. Gérant enregistre un approvisionnement → succès, CUMP correct.
--   --   5. Serveur tente d'enregistrer un approvisionnement → refusé.
--   --   6. Gérant/promoteur réclame une consignation → succès.
--   --   7. Serveur tente de réclamer/créer/forfeit une consignation → refusé.
-- =====================================================

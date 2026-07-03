-- =====================================================
-- MIGRATION: Vague 4c — CUMP source de vérité unique + restauration last_unit_cost
-- Date: 2026-07-03
-- Suite de: 20260703030000_vague4b_mutation_guards_privilege_escalation.sql
--
-- CONTEXTE (diagnostic exécuté en prod le 2026-07-03) :
--   Deux méthodes de calcul CUMP coexistent (finding F3 de l'audit) :
--     - INCRÉMENTALE : create_supply_and_update_product recalcule le CUMP
--       sur le STOCK RESTANT réel à chaque appro. C'est la valeur STOCKÉE
--       dans bar_products.current_average_cost. → CORRECTE (conforme CUMP
--       SYSCOHADA : (stock*CUMP + qté*coût) / (stock+qté)).
--     - HISTORIQUE : le trigger update_product_current_average_cost recalcule
--       Σ(coût*qté_achetée)/Σ(qté_achetée) sur TOUT l'historique d'achats,
--       en ignorant la consommation par les ventes. → FAUSSE dès qu'il y a
--       eu des ventes entre deux appros.
--
--   DIAGNOSTIC CHIFFRÉ (131 produits) :
--     - 63 produits (49%) : écart nul (un seul appro / pas de vente entre appros)
--     - 38 (30%) : écart négligeable (<5 CFA, arrondis)
--     - 16 (12%) : écart modéré (5-50 CFA)
--     - 14 (11%) : écart FORT (>50 CFA) — ex. Vin Baron Ramero 1150 vs 2300,
--       Awooyo Bénin 433 vs 1083. Ces produits VERRAIENT LEUR CUMP DOUBLER
--       si le trigger refire (DELETE/UPDATE de supply, ou INSERT de ligne
--       miroir lors d'un reverse).
--
--   POINT CLÉ : les valeurs STOCKÉES sont JUSTES. Le danger n'est PAS que les
--   données soient fausses, c'est que le trigger REMPLACE la bonne valeur
--   incrémentale par la mauvaise valeur historique au prochain mouvement de
--   supply. → AUCUNE reprise de données CUMP nécessaire ; il faut EMPÊCHER le
--   trigger de recalculer le CUMP.
--
--   En pratique le déclenchement est aujourd'hui quasi-impossible via l'app :
--     - Aucun DELETE de supply côté client (grep exhaustif : 0 appelant).
--     - Les UPDATE passent par update_supply_metadata qui ne touche NI
--       unit_cost NI quantity → la clause WHEN du trigger UPDATE ne matche pas.
--     - Seul reverse_supply (INSERT ligne miroir) refire le trigger — 2 cas
--       historiques en base.
--   F3 est donc un risque LATENT (pas un bug actif), mais reverse_supply sera
--   réutilisé → on le ferme proprement.
--
--   RÉGRESSION last_unit_cost : la migration 20260509 (fix division par zéro)
--   a supprimé la mise à jour de last_unit_cost du trigger. last_unit_cost est
--   documenté "UX-only, NOT for accounting" MAIS il alimente 2 CALCULS
--   AFFICHÉS pour les bars réglés costDisplayMethod='last_cost' (2 bars sur 10
--   d'après le diagnostic) :
--     - la marge produit (InventoryList.tsx : (price - displayCost)/price)
--     - la valorisation d'inventaire (InventoryStats.tsx : Σ stock*displayCost)
--   Donc pour ces 2 bars, last_unit_cost figé fausse marge et valorisation
--   AFFICHÉES (la compta SYSCOHADA, elle, utilise toujours le CUMP). On le
--   restaure + backfill.
--
-- STRATÉGIE (décidée avec l'équipe) :
--   1. Le trigger ne recalcule PLUS JAMAIS current_average_cost. Il ne met à
--      jour QUE last_unit_cost (retour au rôle de cache d'affichage). Le CUMP
--      devient la responsabilité EXCLUSIVE des RPC incrémentales → source de
--      vérité unique (résout F3, et F2 par voie de conséquence : un coût
--      annulé ne peut plus s'incruster via un recalcul historique).
--   2. reverse_supply recalcule lui-même le CUMP incrémental (symétrique de
--      l'ajout : retire la contribution de l'appro annulé du stock courant),
--      puisqu'il ne peut plus déléguer au trigger.
--   3. Backfill last_unit_cost depuis le dernier VRAI appro (hors lignes
--      miroir) — sans risque, ne touche pas le CUMP.
--
-- ANTI-RÉGRESSION :
--   - Le CUMP stocké n'est PAS modifié par cette migration (aucun UPDATE de
--     current_average_cost sur les données existantes). Post-vol le vérifie.
--   - create_supply_and_update_product a déjà FOR UPDATE (ajouté en 4b) → F4
--     réglé, la méthode incrémentale reste la seule à écrire le CUMP.
--   - reverse_supply : corps repris à l'identique de la prod, seule la gestion
--     CUMP est ajoutée (l'ancien code comptait sur le trigger). Garde-fous
--     métier (permission promoteur, blocage si déjà reversé / stock consommé)
--     inchangés.
--
-- PRÉ-VOL (à exécuter AVANT — signatures + surcharges) :
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--          pg_get_function_result(p.oid) AS ret
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public'
--     AND p.proname IN ('update_product_current_average_cost','reverse_supply');
--   SELECT p.proname, COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public'
--     AND p.proname IN ('update_product_current_average_cost','reverse_supply')
--   GROUP BY p.proname;   -- attendu nb=1 pour les deux
-- =====================================================

-- =====================================================
-- 1. TRIGGER : ne gère plus QUE last_unit_cost (plus de recalcul CUMP)
--    Le CUMP est désormais écrit uniquement par les RPC incrémentales.
--    On garde last_unit_cost = coût du dernier VRAI appro (hors miroir).
-- =====================================================
CREATE OR REPLACE FUNCTION update_product_current_average_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_product_id UUID;
BEGIN
    v_product_id := COALESCE(NEW.product_id, OLD.product_id);

    -- ⭐ NE PLUS TOUCHER current_average_cost : la valeur incrémentale posée
    -- par les RPC (create_supply_and_update_product, reverse_supply) est la
    -- seule source de vérité. Recalculer une moyenne historique ici
    -- écraserait la bonne valeur par une valeur fausse (ignore les ventes).
    --
    -- On met à jour uniquement last_unit_cost (cache d'affichage) : coût
    -- unitaire du dernier approvisionnement RÉEL (on exclut les lignes miroir
    -- de reverse, dont le unit_cost est celui de l'original mais la quantity
    -- négative — on veut le dernier vrai achat).
    UPDATE bar_products
    SET last_unit_cost = COALESCE(
        (
            SELECT sup.unit_cost
            FROM supplies sup
            WHERE sup.product_id = v_product_id
              AND sup.reversal_of_id IS NULL
            ORDER BY sup.supplied_at DESC, sup.created_at DESC
            LIMIT 1
        ),
        last_unit_cost,   -- si plus aucun appro, garde la dernière valeur connue
        0
    )
    WHERE id = v_product_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION update_product_current_average_cost() IS
    'Met à jour UNIQUEMENT bar_products.last_unit_cost (cache d''affichage = coût du dernier appro réel, hors lignes miroir de reverse). Ne recalcule PLUS le CUMP : current_average_cost est désormais la responsabilité exclusive des RPC incrémentales (source de vérité unique). Déclenché par INSERT/UPDATE/DELETE sur supplies.';

-- Note : les 3 triggers (INSERT/UPDATE/DELETE) restent branchés tels quels et
-- appellent cette fonction. Leur effet est désormais borné à last_unit_cost.

-- =====================================================
-- 2. reverse_supply : recalcule lui-même le CUMP incrémental
--    (il ne peut plus déléguer au trigger, qui ne touche plus le CUMP).
--    Corps repris à l'identique de la prod ; seul l'UPDATE final change.
-- =====================================================
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
    v_current_cump      NUMERIC;
    v_new_stock         INTEGER;
    v_new_cump          NUMERIC;
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

    -- 2. Garde-fous métier (inchangés)
    IF v_original.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reverse a reversal entry';
    END IF;

    IF v_original.reversed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Supply already reversed at %', v_original.reversed_at;
    END IF;

    -- 3. Permission : promoteur uniquement (+ super_admin / impersonation) (inchangé)
    IF NOT (
        get_user_role(v_original.bar_id) = 'promoteur'
        OR is_super_admin()
        OR is_impersonating()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only promoteur can reverse supplies';
    END IF;

    -- 4. Verrouiller le produit, lire stock ET CUMP courant
    SELECT stock, current_average_cost
    INTO v_current_stock, v_current_cump
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

    -- 5. Insérer la ligne miroir (quantity et total_cost négatifs) (inchangé)
    INSERT INTO public.supplies (
        bar_id, product_id, quantity, unit_cost, total_cost,
        supplier_name, supplier_phone, notes, supplied_at, supplied_by, reversal_of_id
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

    -- 6. Marquer l'original comme reversed (inchangé)
    UPDATE public.supplies
    SET reversed_at = NOW(),
        reversed_by = v_user_id
    WHERE id = v_original.id;

    -- 7. ⭐ Recalcul CUMP INCRÉMENTAL (symétrique de l'ajout d'appro) :
    --    on retire la contribution de l'appro annulé du stock courant.
    --      nouveau_stock = stock - quantité_annulée
    --      nouveau_CUMP  = (stock*CUMP - quantité*coût_appro) / nouveau_stock
    --    Si nouveau_stock <= 0 : on conserve le CUMP courant (indéfini sur
    --    stock nul, comme le fait create_supply_and_update_product).
    v_new_stock := v_current_stock - v_original.quantity;

    IF v_new_stock <= 0 THEN
        v_new_cump := v_current_cump;
    ELSE
        v_new_cump := (
            (v_current_stock::numeric * v_current_cump)
            - (v_original.quantity::numeric * v_original.unit_cost)
        ) / v_new_stock::numeric;

        -- Garde-fou : un CUMP ne peut pas être négatif (protège contre une
        -- incohérence de données historiques). Si le calcul donne < 0, on
        -- conserve le CUMP courant plutôt que d'écrire une valeur absurde.
        IF v_new_cump < 0 THEN
            v_new_cump := v_current_cump;
        END IF;
    END IF;

    UPDATE public.bar_products
    SET stock = v_new_stock,
        current_average_cost = v_new_cump,
        updated_at = NOW()
    WHERE id = v_original.product_id;

    -- Note : le trigger va se déclencher sur l'INSERT de la ligne miroir et
    -- mettre à jour last_unit_cost (cache) — il ne touche PLUS le CUMP, donc
    -- il n'écrasera pas la valeur incrémentale qu'on vient de poser ci-dessus.

    RETURN jsonb_build_object(
        'success',            TRUE,
        'reverse_supply_id',  v_reverse_id,
        'original_id',        v_original.id,
        'quantity_reversed',  v_original.quantity,
        'unit_cost',          v_original.unit_cost,
        'new_cump',           v_new_cump
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'reverse_supply: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.reverse_supply(UUID) IS
    'Annule un approvisionnement (ligne miroir négative). Promoteur uniquement. Bloque si stock insuffisant. Recalcule le CUMP de façon incrémentale (retire la contribution de l''appro annulé) — ne dépend plus du trigger pour le CUMP.';

-- =====================================================
-- 3. BACKFILL last_unit_cost depuis le dernier VRAI appro (hors lignes miroir)
--    Corrige le champ figé/à 0 par la régression 20260509, pour tous les
--    produits. Sans risque : ne touche PAS current_average_cost.
-- =====================================================
UPDATE bar_products bp
SET last_unit_cost = COALESCE(
    (
        SELECT sup.unit_cost
        FROM supplies sup
        WHERE sup.product_id = bp.id
          AND sup.reversal_of_id IS NULL
        ORDER BY sup.supplied_at DESC, sup.created_at DESC
        LIMIT 1
    ),
    bp.last_unit_cost,   -- si aucun appro, garde l'existant (ex. saisie manuelle)
    0
)
WHERE EXISTS (
    SELECT 1 FROM supplies s
    WHERE s.product_id = bp.id AND s.reversal_of_id IS NULL
);

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- POST-VOL (à exécuter après — résultats à certifier) :
--   -- (a) Le CUMP stocké n'a PAS bougé (aucune valeur current_average_cost
--   --     modifiée par cette migration) : relancer D3ter et comparer la
--   --     distribution des écarts — elle doit être IDENTIQUE à avant
--   --     (63 exact / 38 négligeable / 16 modéré / 14 fort). Si un produit a
--   --     changé de catégorie, c'est une régression → investiguer.
--
--   -- (b) last_unit_cost est désormais rempli pour les produits avec appro :
--   SELECT COUNT(*) FILTER (WHERE last_unit_cost > 0) AS avec_last_cost,
--          COUNT(*) FILTER (WHERE last_unit_cost = 0 OR last_unit_cost IS NULL) AS sans,
--          COUNT(*) AS total
--   FROM bar_products
--   WHERE EXISTS (SELECT 1 FROM supplies s WHERE s.product_id = bar_products.id
--                 AND s.reversal_of_id IS NULL);
--   -- Attendu : avec_last_cost ≈ total (les "sans" ne devraient rester que
--   -- pour d'éventuels produits dont le seul appro a unit_cost=0).
--
--   -- (c) nb=1 sur les 2 fonctions recréées (pas de surcharge) :
--   SELECT proname, COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public'
--     AND proname IN ('update_product_current_average_cost','reverse_supply')
--   GROUP BY proname;
--
--   -- (d) Smoke-test via l'app :
--   --   1. Enregistrer un appro → CUMP recalculé incrémental (RPC), correct.
--   --   2. Vérifier qu'un bar en costDisplayMethod='last_cost' affiche à
--   --      nouveau une marge/valorisation cohérente (last_unit_cost rempli).
--   --   3. (si possible sur un produit de test) reverse_supply → stock ET
--   --      CUMP reviennent à l'état d'avant l'appro annulé.
-- =====================================================

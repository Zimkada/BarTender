-- =====================================================
-- MIGRATION: Vague 4a — Fermer la brèche EXECUTE anon sur les RPC de mutation
-- Date: 2026-07-03
-- Suite de: 20260703010000_drop_admin_as_get_bar_sales_cursor_overload.sql
--
-- INCIDENT (audit externe 2026-07-03, confirmé par pg_proc.proacl en prod) :
--   cancel_sale, create_ticket et pay_ticket ont proacl = NULL. En
--   PostgreSQL, une fonction sans ACL explicite hérite de l'ACL par défaut,
--   qui accorde EXECUTE à PUBLIC — donc au rôle anon (non authentifié).
--   pg_default_acl est vide → aucun REVOKE FROM PUBLIC systémique n'existe,
--   donc chaque CREATE OR REPLACE qui ne re-pose pas de GRANT retombe sur
--   PUBLIC. C'est exactement ce qui s'est produit lors des recréations
--   successives de ces 3 fonctions (dont les purges des 2026-06-23/07-03).
--
-- SURFACE D'EXPLOITATION (confirmée par lecture des corps + pg_policies) :
--   * cancel_sale : AUCUN guard. Restaure le stock (WHERE id = product_id,
--     sans bar_id) et passe la vente à 'cancelled'. Appelable par anon sur
--     n'importe quel sale_id de n'importe quel bar. Aucun filet RLS car la
--     RPC est SECURITY DEFINER (bypass RLS). → vecteur le plus grave.
--   * pay_ticket : AUCUN guard. Marque le ticket 'paid' (WHERE id, sans
--     bar_id) ET propage payment_method vers sales. Appelable par anon.
--   * create_ticket : possède DÉJÀ un guard membre inline (EXISTS sur
--     bar_members + auth.uid() = p_created_by). Un appel anon échoue déjà
--     (auth.uid() NULL → EXISTS faux → EXCEPTION). Ici on se contente donc
--     de RÉTABLIR le GRANT propre (retirer PUBLIC), pas de toucher au corps.
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. Ajoute le guard manquant à cancel_sale et pay_ticket :
--        - bar_id dérivé de la LIGNE CIBLÉE (jamais d'un paramètre client) ;
--        - contrôle rôle répliquant la policy RLS de la table concernée ;
--        - remplace p_cancelled_by / p_paid_by par auth.uid() (anti-spoofing
--          d'attribution) tout en gardant la signature (params ignorés pour
--          ne PAS créer de surcharge ni casser les appelants TS existants).
--   2. REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated, service_role
--      sur les 3 fonctions (ferme l'accès anon).
--
-- VOLONTAIREMENT EXCLU DE CETTE MIGRATION : le verrou systémique
--   ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC.
--   Raison : certaines fonctions helper DOIVENT rester exécutables par anon
--   (ex : is_super_admin() est explicitement GRANT à anon, migration
--   20260112000003) car des policies RLS s'évaluent avant authentification.
--   Un REVOKE PUBLIC systémique appliqué sans audit exhaustif de CHAQUE
--   fonction risquerait de casser ces helpers lors d'une future recréation.
--   La fermeture de brèche ci-dessous (REVOKE/GRANT ciblés) est suffisante et
--   sans risque. Le verrou systémique sera traité séparément, après
--   inventaire complet des fonctions devant rester anon (fin de Vague 4).
--
-- HORS PÉRIMÈTRE (traité dans 4b) : le durcissement des autres RPC de
--   mutation sans guard (validate_sale, reject_sale, decrement_stock, etc.)
--   qui, elles, ne sont PAS exposées à anon (proacl = authenticated) et sont
--   donc un problème d'escalade de privilège, pas d'accès non authentifié.
--
-- PRÉ-VOL (à exécuter AVANT, résultats à revoir) :
--   -- (a) Confirmer proacl NULL sur les 3 cibles :
--   --   SELECT proname, proacl FROM pg_proc p
--   --   JOIN pg_namespace n ON n.oid = p.pronamespace
--   --   WHERE n.nspname='public'
--   --     AND proname IN ('cancel_sale','create_ticket','pay_ticket');
--   -- (b) Confirmer les signatures exactes (identity args) pour les GRANT :
--   --   SELECT proname, pg_get_function_identity_arguments(oid)
--   --   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   --   WHERE n.nspname='public'
--   --     AND proname IN ('cancel_sale','create_ticket','pay_ticket');
--   -- Attendu :
--   --   cancel_sale(p_sale_id uuid, p_cancelled_by uuid, p_reason text)
--   --   pay_ticket(p_ticket_id uuid, p_paid_by uuid, p_payment_method text)
--   --   create_ticket(p_bar_id uuid, p_created_by uuid, p_notes text,
--   --     p_server_id uuid, p_closing_hour integer, p_table_number integer,
--   --     p_customer_name text, p_idempotency_key text)
-- =====================================================

-- =====================================================
-- 1. cancel_sale — ajout du guard (rôle promoteur/super_admin, comme la
--    policy RLS "Promoteurs can cancel validated sales" sur sales).
--    Signature INCHANGÉE pour ne pas créer de surcharge ; p_cancelled_by
--    est ignoré au profit de auth.uid().
-- =====================================================
CREATE OR REPLACE FUNCTION public.cancel_sale(
    p_sale_id UUID,
    p_cancelled_by UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_sale RECORD;
    v_item JSONB;
    v_actor UUID;
BEGIN
    v_actor := auth.uid();

    -- 1. Lock the sale record and check status
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vente introuvable');
    END IF;

    -- 🛡️ Auth guard : bar_id dérivé de la vente (v_sale.bar_id), pas d'un
    -- paramètre client. Réplique la policy RLS : seuls promoteur/super_admin
    -- annulent une vente validée. service_role bypass (SyncManager/tests).
    IF auth.role() <> 'service_role' THEN
        IF NOT (
            get_user_role(v_sale.bar_id) = 'promoteur'
            OR is_super_admin()
        ) THEN
            -- Retour métier homogène (pas d'exception brute) : l'appelant
            -- lit { success, message } et l'affiche proprement dans l'UI.
            RETURN jsonb_build_object('success', false, 'message', 'Accès refusé : seul le promoteur peut annuler une vente.');
        END IF;
    END IF;

    IF v_sale.status != 'validated' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seules les ventes validées peuvent être annulées via ce flux');
    END IF;

    -- 2. Security Check: Block if there are active returns or consignments
    IF EXISTS (
        SELECT 1 FROM returns
        WHERE sale_id = p_sale_id
        AND status != 'rejected'
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Impossible d''annuler cette vente car elle contient des retours produits actifs.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM consignments
        WHERE sale_id = p_sale_id
        AND status IN ('active', 'claimed')
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Impossible d''annuler cette vente car elle contient des consignations actives.');
    END IF;

    -- 3. Restore Stock (scopé bar_id de la vente)
    FOR v_item IN SELECT jsonb_array_elements(items) FROM sales WHERE id = p_sale_id LOOP
        UPDATE bar_products
        SET stock = stock + (v_item->>'quantity')::INTEGER
        WHERE id = (v_item->>'product_id')::UUID
          AND bar_id = v_sale.bar_id;
    END LOOP;

    -- 4. Update Status — attribution = auth.uid() (anti-spoofing)
    UPDATE sales
    SET
        status = 'cancelled',
        cancelled_by = COALESCE(v_actor, p_cancelled_by),
        cancelled_at = NOW(),
        cancel_reason = p_reason
    WHERE id = p_sale_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- =====================================================
-- 2. pay_ticket — ajout du guard (membre actif du bar du ticket).
--    Payer un ticket est une opération de caisse : tout membre actif
--    (serveur inclus) est légitime, comme pour create_ticket. bar_id dérivé
--    du ticket. Signature INCHANGÉE ; p_paid_by remplacé par auth.uid().
-- =====================================================
CREATE OR REPLACE FUNCTION public.pay_ticket(
    p_ticket_id      UUID,
    p_paid_by        UUID,
    p_payment_method TEXT
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_ticket public.tickets;
    v_actor  UUID;
BEGIN
    SET LOCAL row_security = off;

    v_actor := auth.uid();

    IF p_ticket_id IS NULL OR p_payment_method IS NULL THEN
        RAISE EXCEPTION 'ticket_id et payment_method sont requis';
    END IF;

    -- Lock the row to prevent concurrent modifications
    SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;

    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'Ticket % non trouvé', p_ticket_id;
    END IF;

    -- 🛡️ Auth guard : membre actif du bar du ticket (bar_id dérivé du
    -- ticket, jamais d'un paramètre client). service_role bypass.
    IF auth.role() <> 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.bar_members
            WHERE user_id = auth.uid()
              AND bar_id = v_ticket.bar_id
              AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Access denied: not an active member of this bar';
        END IF;
    END IF;

    IF v_ticket.status <> 'open' THEN
        RAISE EXCEPTION 'Ticket % n''est pas ouvert (statut actuel: %)', p_ticket_id, v_ticket.status;
    END IF;

    -- 1. Update Ticket — attribution = auth.uid() (anti-spoofing)
    UPDATE public.tickets
    SET status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        paid_by = COALESCE(v_actor, p_paid_by),
        payment_method = p_payment_method
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    -- 2. Update Related Sales (PROPAGATION) — scopé au ticket
    UPDATE public.sales
    SET payment_method = p_payment_method,
        updated_at = CURRENT_TIMESTAMP
    WHERE ticket_id = p_ticket_id
      AND payment_method = 'ticket';

    RETURN v_ticket;
END;
$$;

-- =====================================================
-- 3. REVOKE PUBLIC + GRANT explicite sur les 3 fonctions
--    (create_ticket : corps inchangé, on ne fait que le GRANT propre)
-- =====================================================

REVOKE ALL ON FUNCTION public.cancel_sale(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_sale(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pay_ticket(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pay_ticket(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_ticket(uuid, uuid, text, uuid, integer, integer, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_ticket(uuid, uuid, text, uuid, integer, integer, text, text) TO authenticated, service_role;

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- POST-VOL (à exécuter APRÈS, résultats à certifier) :
--   -- (a) Les 3 fonctions ne doivent plus être exécutables par PUBLIC/anon :
--   --   SELECT p.proname,
--   --     array_agg(DISTINCT acl.grantee::regrole::text) AS grantees
--   --   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   --   CROSS JOIN LATERAL aclexplode(p.proacl) acl
--   --   WHERE n.nspname='public'
--   --     AND p.proname IN ('cancel_sale','create_ticket','pay_ticket')
--   --     AND acl.privilege_type='EXECUTE'
--   --   GROUP BY p.proname;
--   -- Attendu : {authenticated, service_role} — PAS de PUBLIC ni anon.
--   -- (b) Smoke-test guards via l'UI (SQL Editor a auth.uid()=NULL, donc
--   --   pay_ticket/cancel_sale lèveront "Access denied" ici — comportement
--   --   attendu, PAS un bug ; valider le chemin nominal depuis l'app).
-- =====================================================

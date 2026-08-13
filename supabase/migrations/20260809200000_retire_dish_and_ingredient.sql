-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: retirer un plat ou un ingrédient de la carte
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ LE BESOIN (09/08/2026)
-- > « Est-ce possible de supprimer un plat, ingrédient… ? »
--
-- NON, ça ne l'était pas. Les deux tables portent `is_active` depuis leur
-- création - le soft delete était PRÉVU - mais aucune RPC ne l'écrivait et
-- aucun écran ne le proposait. Un plat créé par erreur restait au menu pour
-- toujours.
--
-- ⛔ POURQUOI UN RETRAIT ET NON UN `DELETE`
-- Vos ventes passées référencent ces plats, et le journal des pertes afficherait
-- « plat supprimé » au lieu du nom. Un `DELETE` échouerait d'ailleurs sur les
-- clés étrangères (`dish_ingredients` porte `ON DELETE RESTRICT`).
-- Le retrait garde la TRACE, retire de la CARTE.
--
-- ⭐ RÉVERSIBLE, arbitrage de l'exploitant. Un plat retiré par erreur doit
-- pouvoir revenir : le rendre définitif obligerait à le recréer, en perdant sa
-- recette, son historique de coûts, et en créant un doublon dans les
-- statistiques.
--
-- ⭐⭐ DEUX BLOCAGES, ET CHACUN PROTÈGE UN CHIFFRE
--
--   1. INGRÉDIENT AVEC DU STOCK → REFUS.
--      Retirer un ingrédient qui a 8 kg en lot ferait disparaître ces 8 kg des
--      comptes SANS les compter en perte - exactement le trou que le bouton
--      « Terminer » créait sur les lots, retiré le même jour (1239f11).
--      ⚠️ Le message dit QUOI FAIRE : déclarer la perte, ou attendre que le
--      stock soit consommé.
--
--   2. PLAT UTILISÉ DANS UNE COMPOSITION → REFUS.
--      Retirer « Poisson braisé » alors qu'« Akassa Poisson Carpe » en dépend
--      casserait ce dernier EN SILENCE : il ne pourrait plus prélever, et le
--      défaut se découvrirait au premier service.
--      ⚠️ Le message NOMME le plat qui l'utilise - sinon on cherche.
--
-- ⛔ CE QUI NE BLOQUE PAS, ET C'EST DÉLIBÉRÉ
--   · un plat avec un historique de ventes : c'est le cas NORMAL, et le
--     retrait existe précisément pour lui ;
--   · un ingrédient présent dans une recette : la recette garde sa ligne, le
--     plat affichera un coût incomplet. Bloquer là obligerait à démonter
--     toutes les recettes avant de retirer un ingrédient périmé du catalogue.
--   · un plat avec un LOT ACTIF : le lot reste consommable jusqu'à épuisement
--     ou clôture. Le plat ne réapparaîtra pas à la vente pour autant.
--
-- BREAKING_CHANGE: NO - deux nouvelles fonctions, rien de touché.
--
-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.set_dish_active(uuid,uuid,boolean);
--   DROP FUNCTION IF EXISTS public.set_ingredient_active(uuid,uuid,boolean);
--
-- FUNCTIONS_CREATED: public.set_dish_active, public.set_ingredient_active
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) Les fonctions ne doivent PAS exister :
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('set_dish_active','set_ingredient_active');
--   → 0 ligne.
--
-- 2) La colonne `is_active` existe sur les deux tables :
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema='public' AND column_name='is_active'
--    AND table_name IN ('dishes','ingredients');
--   → 2 lignes.
--
-- 3) Les tables de dépendance existent :
-- SELECT to_regclass('public.dish_recipe_components') AS t_drc,
--        to_regclass('public.ingredient_lots')        AS t_lots;
--   → les 2 NON NULL.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. RETIRER OU REMETTRE UN PLAT                                   │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.set_dish_active(
  p_bar_id  UUID,
  p_dish_id UUID,
  p_active  BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dish     RECORD;
  v_used_by  TEXT;
BEGIN
  -- ⭐⭐ En SECURITY DEFINER la RLS ne s'applique pas : garde explicite.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT * INTO v_dish
  FROM public.dishes
  WHERE id = p_dish_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
  END IF;

  -- ⭐ IDEMPOTENCE : un double-clic retourne l'état atteint, sans erreur.
  IF v_dish.is_active = p_active THEN
    RETURN jsonb_build_object(
      'success', true,
      'dish_id', p_dish_id,
      'is_active', p_active,
      'unchanged', true
    );
  END IF;

  /**
   * ⛔⛔ BLOCAGE - le plat sert de BASE à un autre.
   *
   * Retirer « Poisson braisé » alors qu'« Akassa Poisson Carpe » en dépend
   * casserait ce dernier EN SILENCE : `mark_ready` ne trouverait plus de lot à
   * prélever, et le défaut se découvrirait au premier service.
   *
   * ⚠️ Le message NOMME le plat qui l'utilise. Un refus qui ne dit pas QUI
   * bloque oblige à chercher dans toute la carte.
   * ⚠️ Ne s'applique QU'AU RETRAIT : remettre un plat ne casse rien.
   * ⚠️ On ne regarde que les plats ENCORE ACTIFS - un plat déjà retiré ne
   *    prélèvera jamais.
   */
  IF NOT p_active THEN
    SELECT string_agg(d.name, ', ')
    INTO v_used_by
    FROM public.dish_recipe_components drc
    JOIN public.dishes d ON d.id = drc.dish_id
    WHERE drc.base_dish_id = p_dish_id
      AND drc.bar_id = p_bar_id
      AND d.is_active;

    IF v_used_by IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          '« %s » est utilisé par : %s. Retirez d''abord ces plats, ou modifiez leur composition.',
          v_dish.name, v_used_by
        ),
        'used_by', v_used_by
      );
    END IF;
  END IF;

  UPDATE public.dishes
  SET is_active = p_active,
      updated_at = NOW()
  WHERE id = p_dish_id;

  RETURN jsonb_build_object(
    'success', true,
    'dish_id', p_dish_id,
    'dish_name', v_dish.name,
    'is_active', p_active
  );
END;
$$;

COMMENT ON FUNCTION public.set_dish_active(UUID, UUID, BOOLEAN) IS
  '⭐ Retire un plat de la carte, ou l''y remet. Soft delete : l''historique des '
  'ventes continue de le référencer. '
  '⛔ REFUSE le retrait si le plat sert de BASE à un plat composé encore actif - '
  'le retirer casserait ce dernier en silence. Le message nomme les plats '
  'concernés. '
  '⚠️ Ne bloque PAS sur un historique de ventes (cas normal) ni sur un lot '
  'actif (il reste consommable jusqu''à épuisement).';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. RETIRER OU REMETTRE UN INGRÉDIENT                             │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.set_ingredient_active(
  p_bar_id        UUID,
  p_ingredient_id UUID,
  p_active        BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ing    RECORD;
  v_stock  NUMERIC;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT * INTO v_ing
  FROM public.ingredients
  WHERE id = p_ingredient_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingrédient introuvable dans ce bar');
  END IF;

  IF v_ing.is_active = p_active THEN
    RETURN jsonb_build_object(
      'success', true,
      'ingredient_id', p_ingredient_id,
      'is_active', p_active,
      'unchanged', true
    );
  END IF;

  /**
   * ⛔⛔ BLOCAGE - il reste du STOCK.
   *
   * Retirer un ingrédient qui a 8 kg en lot ferait disparaître ces 8 kg des
   * comptes SANS les compter en perte. C'est exactement le trou que le bouton
   * « Terminer » créait sur les lots de production, retiré le même jour
   * (1239f11) - et pour la même raison : « c'est important pour la
   * transparence ».
   *
   * ⭐ On lit les LOTS, pas le cache `current_stock` : celui-ci soustrait les
   * dettes ouvertes et pourrait valoir 0 alors qu'il reste de la matière
   * physique. C'est la matière RÉELLE qui doit bloquer.
   *
   * ⚠️ Le message dit QUOI FAIRE - un refus sans issue fait chercher au hasard.
   */
  IF NOT p_active THEN
    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_stock
    FROM public.ingredient_lots
    WHERE ingredient_id = p_ingredient_id
      AND bar_id = p_bar_id
      AND status = 'active';

    IF v_stock > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          'Il reste %s %s de « %s » en stock. Déclarez cette quantité en perte, ou attendez qu''elle soit consommée.',
          v_stock, v_ing.unit, v_ing.name
        ),
        'remaining_stock', v_stock
      );
    END IF;
  END IF;

  UPDATE public.ingredients
  SET is_active = p_active,
      updated_at = NOW()
  WHERE id = p_ingredient_id;

  RETURN jsonb_build_object(
    'success', true,
    'ingredient_id', p_ingredient_id,
    'ingredient_name', v_ing.name,
    'is_active', p_active
  );
END;
$$;

COMMENT ON FUNCTION public.set_ingredient_active(UUID, UUID, BOOLEAN) IS
  '⭐ Retire un ingrédient du catalogue, ou l''y remet. Soft delete : les '
  'consommations passées continuent de le référencer. '
  '⛔ REFUSE le retrait s''il reste du STOCK - le retirer ferait disparaître '
  'cette matière des comptes sans la compter en perte. '
  '⭐ Lit les LOTS et non le cache `current_stock`, qui soustrait les dettes et '
  'pourrait valoir 0 alors qu''il reste de la matière physique. '
  '⚠️ Ne bloque PAS si l''ingrédient est utilisé dans une recette : la ligne '
  'reste, le plat affiche un coût incomplet. Bloquer là obligerait à démonter '
  'toutes les recettes avant de retirer un ingrédient du catalogue.';

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.set_dish_active(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_dish_active(UUID, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_dish_active(UUID, UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.set_ingredient_active(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_ingredient_active(UUID, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_ingredient_active(UUID, UUID, BOOLEAN) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les deux fonctions existent, SECURITY DEFINER :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('set_dish_active','set_ingredient_active');
--   → 2 lignes, prosecdef = true pour les deux.
--
-- 2) ⛔ Privilèges :
-- SELECT has_function_privilege('anon',
--          'public.set_dish_active(uuid,uuid,boolean)','EXECUTE')       AS anon_dish,
--        has_function_privilege('authenticated',
--          'public.set_dish_active(uuid,uuid,boolean)','EXECUTE')       AS auth_dish,
--        has_function_privilege('anon',
--          'public.set_ingredient_active(uuid,uuid,boolean)','EXECUTE') AS anon_ing,
--        has_function_privilege('authenticated',
--          'public.set_ingredient_active(uuid,uuid,boolean)','EXECUTE') AS auth_ing;
--   → anon_* = false, auth_* = true.
--
-- 3) ⚠️ LES DEUX BLOCAGES SONT EN PLACE (commentaires retirés, sinon faux
--    positif - leçon du post-vol `loss_cost`) :
-- SELECT p.proname,
--        regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'IF NOT p_active THEN' AS bloque_au_retrait
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('set_dish_active','set_ingredient_active');
--   → bloque_au_retrait = true pour les DEUX.
--
-- 4) ⭐ L'INGRÉDIENT LIT LES LOTS, PAS LE CACHE :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'ingredient_lots' AS lit_les_lots
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='set_ingredient_active';
--   → true. `current_stock` soustrait les dettes et pourrait valoir 0 à tort.
--
-- 5) SMOKE TEST - le refus est ATTENDU (auth.uid() vaut NULL ici) :
-- SELECT public.set_dish_active(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1),
--   gen_random_uuid(), false);
--   → {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 6) TEST RÉEL DEPUIS L'UI :
--    a. retirer un plat SANS dépendance → il quitte la carte, l'historique
--       des ventes le nomme toujours ;
--    b. retirer « Poisson braisé » (base d'« Akassa Poisson Carpe ») → REFUS,
--       le message NOMME le plat qui l'utilise ;
--    c. retirer un ingrédient AVEC du stock → REFUS, le message donne la
--       quantité restante ;
--    d. remettre un plat retiré → il réapparaît, recette et coûts intacts.

-- ===================================================================
-- MIGRATION: upsert_dish — ne plus effacer photo_url sur une mise à jour
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: 2 du module restauration — CORRECTIF
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM (trouvé à la code review, jamais déclenché en production) :
--   `upsert_dish` écrivait  photo_url = NULLIF(p_dish->>'photo_url','')
--   Un appelant qui n'envoie PAS `photo_url` écrasait donc la valeur en base
--   par NULL. Le toggle « Dispo / Coupé » de l'onglet Plats — geste le PLUS
--   FRÉQUENT du service (§9) — ne transmet pas ce champ : chaque bascule
--   aurait effacé la photo du plat.
--
-- ⚠️ POURQUOI C'EST GRAVE ALORS QUE PERSONNE N'A DE PHOTO AUJOURD'HUI :
--   le défaut est LATENT. Aucune photo n'étant saisie, rien ne se voit. Il se
--   déclencherait SILENCIEUSEMENT le jour de l'ajout de l'upload, et le lien
--   entre « les photos disparaissent » et « on a coupé un plat » serait
--   pratiquement introuvable.
--
-- ⭐ La bonne façon existait DÉJÀ dans la même requête, une ligne au-dessus :
--       is_available = COALESCE((p_dish->>'is_available')::BOOLEAN, is_available)
--   `photo_url` était le seul champ à ne pas suivre ce motif — un oubli, pas
--   une intention.

-- SOLUTION:
--   photo_url = CASE WHEN p_dish ? 'photo_url'
--                    THEN NULLIF(p_dish->>'photo_url','')
--                    ELSE photo_url END
--
--   ⚠️ L'opérateur `?` (la clé existe-t-elle ?) et NON COALESCE : il faut
--   distinguer « champ ABSENT » (conserver) de « champ présent à null ou ''»
--   (effacer volontairement). COALESCE confondrait les deux et rendrait la
--   suppression d'une photo IMPOSSIBLE.

-- BREAKING_CHANGE: NO — même signature, même contrat de retour.
--   Seul le comportement sur `photo_url` absent change : conserver au lieu
--   d'effacer. Aucun appelant ne dépendait de l'effacement (c'était un bug).

-- ROLLBACK_STRATEGY:
--   Réappliquer 20260803120000 (section upsert_dish).
--   ⚠️ Rollback DÉCONSEILLÉ : il réintroduirait la perte de données.

-- FUNCTIONS_MODIFIED: upsert_dish
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe et porte bien le défaut :
--
--    SELECT pg_get_functiondef(p.oid) LIKE '%photo_url            = NULLIF%'
--             AS porte_le_defaut
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='upsert_dish';
--    -- ATTENDU : true.
--    -- Si false : le correctif est déjà appliqué, ou la fonction a divergé.
--
-- 2) ⚠️ Photographier les privilèges AVANT — CREATE OR REPLACE les PERD
--    (leçon des vagues de durcissement RPC) :
--
--    SELECT has_function_privilege('authenticated','public.upsert_dish(uuid,jsonb)','EXECUTE') AS auth,
--           has_function_privilege('anon','public.upsert_dish(uuid,jsonb)','EXECUTE')          AS anon;
--    -- ATTENDU : true | false  (à retrouver À L'IDENTIQUE au post-vol)
--
-- 3) Aucune photo en base aujourd'hui — confirme que le défaut est resté latent :
--
--    SELECT count(*) AS plats_avec_photo FROM public.dishes WHERE photo_url IS NOT NULL;
--    -- ATTENDU : 0. Si > 0, ces photos ont pu être perdues avant le correctif.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_dish'
  ) THEN
    RAISE EXCEPTION 'upsert_dish absente — appliquer d''abord 20260803120000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_dish(
  p_bar_id UUID,
  p_dish   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dish_id     UUID;
  v_name        TEXT;
  v_price       NUMERIC(12, 2);
  v_category_id UUID;
  v_is_base     BOOLEAN;
  v_portions    INTEGER;
  v_actor_id    UUID := auth.uid();
  v_row         RECORD;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  v_dish_id     := NULLIF(p_dish->>'id', '')::UUID;
  v_name        := NULLIF(TRIM(p_dish->>'name'), '');
  v_price       := (p_dish->>'price')::NUMERIC;
  v_category_id := NULLIF(p_dish->>'category_id', '')::UUID;
  v_is_base     := COALESCE((p_dish->>'is_batch_base')::BOOLEAN, FALSE);
  v_portions    := NULLIF(p_dish->>'portions_per_batch', '')::INTEGER;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le nom du plat est obligatoire');
  END IF;

  IF v_price IS NULL OR v_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le prix doit être positif ou nul');
  END IF;

  IF v_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bar_categories
      WHERE id = v_category_id AND bar_id = p_bar_id AND type = 'dish'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Catégorie invalide : elle doit appartenir à ce bar et être une catégorie de plats'
      );
    END IF;
  END IF;

  IF v_is_base AND v_portions IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Un plat préparé en lot doit indiquer son rendement (nombre de portions)'
    );
  END IF;
  IF NOT v_is_base AND v_portions IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Le rendement ne s''applique qu''aux plats préparés en lot'
    );
  END IF;

  IF v_dish_id IS NULL THEN
    -- ── CRÉATION ──
    IF EXISTS (
      SELECT 1 FROM public.dishes
      WHERE bar_id = p_bar_id AND lower(name) = lower(v_name) AND is_active = TRUE
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('Le plat « %s » existe déjà', v_name));
    END IF;

    INSERT INTO public.dishes (
      bar_id, name, category_id, price,
      production_mode, preparation_time_min,
      is_batch_base, portions_per_batch,
      is_available, photo_url, created_by
    ) VALUES (
      p_bar_id, v_name, v_category_id, v_price,
      -- Toujours 'on_order' à la création : le mode réel est DÉRIVÉ par
      -- replace_dish_recipe une fois la recette connue (§16.8).
      'on_order',
      NULLIF(p_dish->>'preparation_time_min','')::INTEGER,
      v_is_base, v_portions,
      COALESCE((p_dish->>'is_available')::BOOLEAN, TRUE),
      NULLIF(p_dish->>'photo_url',''),
      v_actor_id
    )
    RETURNING * INTO v_row;

  ELSE
    -- ── MODIFICATION ──
    IF NOT EXISTS (
      SELECT 1 FROM public.dishes WHERE id = v_dish_id AND bar_id = p_bar_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dishes
      WHERE bar_id = p_bar_id AND lower(name) = lower(v_name)
        AND is_active = TRUE AND id <> v_dish_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('Le plat « %s » existe déjà', v_name));
    END IF;

    UPDATE public.dishes SET
      name                 = v_name,
      category_id          = v_category_id,
      price                = v_price,
      preparation_time_min = NULLIF(p_dish->>'preparation_time_min','')::INTEGER,
      is_batch_base        = v_is_base,
      portions_per_batch   = v_portions,
      is_available         = COALESCE((p_dish->>'is_available')::BOOLEAN, is_available),
      -- ⭐ CORRECTIF — `?` teste la PRÉSENCE de la clé, pas sa valeur.
      -- Un appelant qui n'envoie pas photo_url (le toggle Dispo/Coupé, geste
      -- le plus fréquent du service) CONSERVE la photo existante.
      -- ⚠️ COALESCE ne conviendrait PAS : il confondrait « absent » et
      -- « présent à null », rendant la SUPPRESSION d'une photo impossible.
      photo_url            = CASE
                               WHEN p_dish ? 'photo_url'
                               THEN NULLIF(p_dish->>'photo_url','')
                               ELSE photo_url
                             END
      -- ⚠️ production_mode ABSENT volontairement : il appartient à
      -- replace_dish_recipe, qui seul voit la recette (§16.8).
    WHERE id = v_dish_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dish', to_jsonb(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_dish(UUID, JSONB) IS
  'Crée ou modifie un plat. Valide que la catégorie appartient au bar ET est de type ''dish'' — '
  'garantie impossible par FK (pas de FK conditionnelle en PostgreSQL, §13.10). '
  '⚠️ N''écrit JAMAIS production_mode : il est DÉRIVÉ de la recette par replace_dish_recipe '
  '(§16.8), la distinction batch/batch_finish n''ayant pas à être demandée à l''utilisateur. '
  '⭐ photo_url n''est écrit que si la CLÉ est présente dans le payload (opérateur ?) : un '
  'appelant partiel — comme le toggle Dispo/Coupé — conserve la photo au lieu de l''effacer.';

-- ⚠️⚠️ CREATE OR REPLACE PERD LES GRANTS — leçon des vagues de durcissement.
-- Les rejouer n'est PAS optionnel : sans ces lignes, `authenticated` perdrait
-- le droit d'exécution et la création de plat casserait en production.
REVOKE ALL ON FUNCTION public.upsert_dish(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_dish(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_dish(UUID, JSONB) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Le correctif est en place :
--
--    SELECT pg_get_functiondef(p.oid) LIKE '%p_dish ? ''photo_url''%' AS correctif_applique
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='upsert_dish';
--    -- ATTENDU : true
--
-- 2) ⚠️ CRITIQUE — les privilèges sont RESTAURÉS (comparer au pré-vol 2) :
--
--    SELECT has_function_privilege('authenticated','public.upsert_dish(uuid,jsonb)','EXECUTE') AS auth,
--           has_function_privilege('anon','public.upsert_dish(uuid,jsonb)','EXECUTE')          AS anon;
--    -- ATTENDU : true | false — IDENTIQUE au pré-vol.
--    -- ⛔ auth = false : la création de plat est CASSÉE. Rejouer les GRANT.
--
-- 3) search_path toujours figé (CREATE OR REPLACE aurait pu le perdre) :
--
--    SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='upsert_dish';
--    -- ATTENDU : {search_path=public}
--
-- ⭐ TEST FONCTIONNEL — depuis l'APPLICATION (le SQL Editor a auth.uid() = NULL) :
--
-- ☐ 4a. Créer un plat, lui poser une photo_url à la main en SQL, puis
--        basculer « Dispo / Coupé » dans l'UI → la photo DOIT SURVIVRE.
--        C'est le scénario exact du défaut corrigé.
-- ☐ 4b. Modifier un plat en envoyant photo_url = '' → la photo DOIT être
--        effacée (l'effacement volontaire reste possible).

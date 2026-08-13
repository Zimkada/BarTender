-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: `is_sellable` - un plat-base apparaît-il à la vente ?
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ LE BESOIN, DIT PAR L'EXPLOITANT (08/08/2026)
-- > « Le client peut demander à compléter une boule d'akassa ou une portion de
-- >   frite [...] il faut donner la possibilité de rendre visible un plat de
-- >   base dans les interfaces de vente, c'est le choix du bar. »
--
-- Un plat-base est un intermédiaire de production (« Poisson braisé »,
-- « Akassa ») : il sert surtout à composer d'autres plats. Mais certains se
-- vendent AUSSI seuls, en supplément. Les deux usages coexistent, et c'est le
-- BAR qui tranche - pas le modèle.
--
-- ⛔ POURQUOI UNE COLONNE ET NON UNE DÉDUCTION
-- Aucun des trois drapeaux existants ne répond à cette question :
--   · `is_active`     - le plat existe-t-il encore ? (soft delete)
--   · `is_available`  - est-il servable AUJOURD'HUI ? (rupture ponctuelle)
--   · `is_batch_base` - produit-il un lot ?
-- Déduire la vendabilité de `is_batch_base` imposerait un choix au bar : soit
-- tous les plats-bases sont vendables, soit aucun. Les deux sont faux.
--
-- ⭐ DÉFAUT `TRUE`, ET C'EST DÉLIBÉRÉ
-- Un plat NON-base est vendable par nature ; mettre `FALSE` par défaut ferait
-- disparaître TOUS les plats existants de la grille de vente à l'instant de
-- la migration. Le défaut sûr est celui qui ne change rien.
--
-- ⚠️ CONSÉQUENCE ASSUMÉE : les plats-bases déjà créés resteront visibles à la
-- vente après cette migration. C'est le comportement ACTUEL - la colonne
-- donne le moyen de les masquer, elle ne le fait pas à la place du bar.
--
-- ⛔ CE DRAPEAU NE PROTÈGE RIEN. Il ne fait que masquer une carte dans une
-- grille. Un plat-base masqué reste commandable par toute autre voie, et c'est
-- correct : il n'y a aucun enjeu de sécurité ici, seulement de lisibilité.
--
-- BREAKING_CHANGE: NO - colonne ajoutée avec DEFAULT, aucune ligne modifiée
--   dans son comportement.
--
-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.dishes DROP COLUMN IF EXISTS is_sellable;
--   puis réappliquer 20260803130000_fix_upsert_dish_photo_url.sql.
--
-- TABLES_MODIFIED: public.dishes (+1 colonne)
-- FUNCTIONS_CREATED: (aucune - CREATE OR REPLACE de upsert_dish)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) La colonne ne doit PAS déjà exister :
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='dishes'
--    AND column_name='is_sellable';
--   → 0 ligne attendue. Si une ligne sort, la migration est déjà appliquée.
--
-- 2) État actuel des plats-bases (ceux que la colonne concerne) :
-- SELECT count(*) FILTER (WHERE is_batch_base)     AS plats_bases,
--        count(*) FILTER (WHERE NOT is_batch_base) AS plats_normaux
--   FROM public.dishes WHERE bar_id = '<BAR_ID>'::uuid AND is_active;
--   → Noter : après migration, TOUS restent vendables (défaut TRUE).

ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.dishes.is_sellable IS
  '⭐ Le plat apparaît-il dans les grilles de VENTE ? Distinct des trois autres '
  'drapeaux : is_active = existe encore (soft delete), is_available = servable '
  'aujourd''hui (rupture), is_batch_base = produit un lot. '
  'Sert aux plats-BASES : « Poisson braisé » compose d''autres plats et peut '
  'aussi se vendre seul en supplément - c''est le BAR qui tranche (§19.1). '
  'DEFAULT TRUE : un plat non-base est vendable par nature, et FALSE aurait '
  'fait disparaître tous les plats existants de la grille. '
  '⛔ N''est PAS une protection : masque une carte, ne bloque aucune commande.';

-- ⚠️ AUCUN INDEX. Le filtrage se fait côté client sur une liste déjà en cache
-- (quelques dizaines de plats par bar) : un index serait du poids mort.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ upsert_dish - écrire la colonne                                  │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ Sans ce REPLACE, la colonne existerait mais ne serait JAMAIS renseignée :
-- le formulaire enverrait `is_sellable` et le RPC l'ignorerait en silence.
--
-- ⛔ Version de référence : 20260803130000_fix_upsert_dish_photo_url.sql, et
-- NON la définition d'origine (20260803120000) - elle a déjà été remplacée.
-- Partir du mauvais fichier aurait fait PERDRE le correctif `photo_url`.

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
  v_sellable    BOOLEAN;
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
  /**
   * ⭐ `is_sellable` — le plat apparaît-il dans les grilles de VENTE ? (§19.1)
   *
   * ⚠️ DÉFAUT `TRUE` : un plat non-base est vendable par nature, et un
   * appelant qui n'envoie pas le champ ne doit pas faire disparaître le plat
   * de la carte. Même prudence que `photo_url` ci-dessous.
   */
  v_sellable    := COALESCE((p_dish->>'is_sellable')::BOOLEAN, TRUE);
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
      is_batch_base, portions_per_batch, is_sellable,
      is_available, photo_url, created_by
    ) VALUES (
      p_bar_id, v_name, v_category_id, v_price,
      -- Toujours 'on_order' à la création : le mode réel est DÉRIVÉ par
      -- replace_dish_recipe une fois la recette connue (§16.8).
      'on_order',
      NULLIF(p_dish->>'preparation_time_min','')::INTEGER,
      v_is_base, v_portions, v_sellable,
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
      -- ⚠️ CONDITIONNEL, comme `photo_url` : un appelant qui n'envoie pas
      -- `is_sellable` (le toggle Dispo/Coupé, par exemple) ne doit pas
      -- remettre le plat en vente à son insu. Sans ce garde, le COALESCE à
      -- TRUE ci-dessus ré-afficherait un plat-base délibérément masqué.
      is_sellable          = CASE
                               WHEN p_dish ? 'is_sellable'
                               THEN v_sellable
                               ELSE is_sellable
                             END,
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

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.upsert_dish(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_dish(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_dish(UUID, JSONB) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La colonne existe, avec le bon type et le bon défaut :
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='dishes'
--    AND column_name='is_sellable';
--   → 1 ligne : boolean, is_nullable = 'NO', column_default = 'true'.
--
-- 2) ⛔ AUCUN PLAT N'A DISPARU DE LA VENTE (le contrôle qui compte) :
-- SELECT count(*) AS plats_non_vendables
--   FROM public.dishes
--  WHERE bar_id = '<BAR_ID>'::uuid AND NOT is_sellable;
--   → 0 attendu. Toute autre valeur signifie qu'une ligne a été modifiée par
--     erreur : ARRÊTER et vérifier.
--
-- 3) ⛔ upsert_dish ÉCRIT bien la colonne (sinon la case serait sans effet) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'is_sellable' AS ecrit_la_colonne
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='upsert_dish';
--   → true.
--
-- 4) Les grants d'upsert_dish ont survécu au REPLACE :
-- SELECT has_function_privilege('anon',
--          'public.upsert_dish(uuid,jsonb)','EXECUTE') AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.upsert_dish(uuid,jsonb)','EXECUTE') AS auth_peut;
--   → anon_peut = false, auth_peut = true.
--
-- 5) ⚠️ NON-RÉGRESSION photo_url - le correctif de 20260803130000 doit être
--    toujours là (il est CONDITIONNEL, comme is_sellable) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'p_dish \\? .photo_url.' AS photo_conditionnelle
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='upsert_dish';
--   → true. Si false : le correctif photo_url a été perdu, ARRÊTER.
--
-- 6) Test UI : ouvrir la fiche d'un plat coché « préparé d'avance ».
--    → la case « Proposer à la vente » doit être VISIBLE et COCHÉE.
--    → la décocher, enregistrer, puis vérifier que le plat disparaît de la
--      grille de vente sans disparaître de Plats → Menu.

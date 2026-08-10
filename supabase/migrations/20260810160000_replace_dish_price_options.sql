-- ═══════════════════════════════════════════════════════════════════════
-- ÉCRITURE DES FORMATS DE PRIX — §19.5
-- 10/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- Complète `20260810140000_dish_price_options.sql` : la table existait, mais
-- rien ne permettait d'y écrire. `authenticated` n'a que le SELECT, l'écriture
-- passe obligatoirement par une RPC — comme partout dans le module.
--
-- ⭐ MODÈLE `replace_dish_components` : le gérant envoie la liste COMPLÈTE des
-- formats, la RPC réconcilie. C'est le geste réel de l'écran d'édition d'un
-- plat, où l'on voit et modifie tous les formats d'un coup.
--
-- ⛔⛔ MAIS AVEC UNE DIFFÉRENCE CAPITALE : `replace_dish_components` SUPPRIME
-- physiquement les lignes absentes. Ici ce serait un DÉFAUT GRAVE — un format
-- est référencé par les commandes passées (`kitchen_order_items.price_option_id`).
-- Le supprimer ferait perdre la réponse à « combien de Petits ai-je vendus en
-- juillet ? », qui est précisément la raison d'être de cette colonne.
-- ⭐ Un format absent de la liste est donc RETIRÉ (`is_active = FALSE`), jamais
-- supprimé — aligné sur `set_dish_active` et `set_ingredient_active` (09/08).
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. La table existe (migration 20260810140000 appliquée)
--   SELECT to_regclass('public.dish_price_options') AS t_options;
--   -- ATTENDU : non NULL
--
--   -- 2. La fonction n'existe pas déjà
--   SELECT proname FROM pg_proc
--   WHERE proname = 'replace_dish_price_options' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : aucune ligne

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_dish_price_options(
  p_bar_id  UUID,
  p_dish_id UUID,
  -- ⚠️ Pas d'`id` : la réconciliation se fait par LIBELLÉ (cf. passe 2).
  p_options JSONB   -- [{label, price, sort_order?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opt        JSONB;
  v_label      TEXT;
  v_price      NUMERIC;
  v_id         UUID;
  v_role       TEXT;
  v_kept       UUID[] := ARRAY[]::UUID[];
  v_count      INTEGER := 0;
  v_retired    INTEGER := 0;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF jsonb_typeof(p_options) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de données invalide');
  END IF;

  /**
   * ⛔ RÉSERVÉ AUX RÔLES DE GESTION — c'est tout l'intérêt du mécanisme.
   *
   * Le serveur CHOISIT un format, il n'en crée jamais : si un serveur pouvait
   * écrire ici, il fabriquerait son propre prix et la liste fermée qui protège
   * de la fraude n'en serait plus une.
   * ⚠️ Liste BLANCHE, en miroir des autres écritures du module : un rôle
   * ajouté plus tard est refusé par défaut.
   */
  IF auth.role() <> 'service_role' THEN
    SELECT bm.role INTO v_role
    FROM public.bar_members bm
    WHERE bm.user_id = auth.uid() AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN ('super_admin','promoteur','gerant') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le gérant peut configurer les formats de prix'
      );
    END IF;
  END IF;

  -- ⛔ ISOLATION : le plat doit appartenir à CE bar.
  IF NOT EXISTS (
    SELECT 1 FROM public.dishes
    WHERE id = p_dish_id AND bar_id = p_bar_id AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
  END IF;

  /**
   * ⭐ PASSE 1 — VALIDATION COMPLÈTE avant toute écriture, comme
   * `create_kitchen_order`. Un plat dont la moitié des formats a été écrite
   * est pire qu'un refus : le serveur verrait une liste incohérente en plein
   * service.
   *
   * ⚠️ UN SEUL FORMAT EST REFUSÉ ICI, pas seulement dans l'UI. Un choix
   * unique n'est pas un choix : il impose une étape au serveur sans rien lui
   * apprendre. Un gérant qui n'a qu'un prix n'a pas besoin de formats — il
   * envoie une liste VIDE et le plat retombe sur `dishes.price`.
   * ⭐ Porter la règle en base et pas seulement à l'écran évite qu'un autre
   * appelant (import, script) ne crée cet état bancal.
   */
  IF jsonb_array_length(p_options) = 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Un seul format revient à un prix fixe. Supprimez-les tous, ou ajoutez-en un second.'
    );
  END IF;

  FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    v_label := NULLIF(TRIM(v_opt->>'label'), '');
    v_price := (v_opt->>'price')::NUMERIC;

    IF v_label IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Un format doit avoir un nom');
    END IF;

    IF v_price IS NULL OR v_price < 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Prix invalide pour « %s »', v_label)
      );
    END IF;
  END LOOP;

  /**
   * ⚠️ DOUBLONS DE LIBELLÉ REJETÉS EXPLICITEMENT, sans attendre la contrainte
   * UNIQUE. Celle-ci ne verrait pas le cas où un libellé entrant collide avec
   * un format RETIRÉ du même plat : l'UPDATE de réactivation échouerait alors
   * sur une erreur SQL brute au lieu d'un message lisible.
   */
  /**
   * ⚠️ `lower()` EN PLUS DU `TRIM` - défaut trouvé à la certification.
   *
   * La contrainte `UNIQUE (dish_id, label)` est SENSIBLE À LA CASSE : « Grand »
   * et « grand » y passeraient tous les deux, et le serveur verrait deux
   * entrées quasi identiques dans sa liste, en plein service, face au client.
   * ⭐ On refuse ici ce que la base accepterait - c'est le seul endroit où la
   * règle peut être posée sans changer la contrainte.
   */
  IF (
    SELECT count(DISTINCT lower(TRIM(o->>'label'))) FROM jsonb_array_elements(p_options) o
  ) <> jsonb_array_length(p_options) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Deux formats portent le même nom'
    );
  END IF;

  -- ⭐ PASSE 2 — écriture.
  FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    v_label := TRIM(v_opt->>'label');
    v_price := (v_opt->>'price')::NUMERIC;

    /**
     * ⭐ RÉCONCILIATION PAR LIBELLÉ, pas seulement par id.
     *
     * Un gérant qui retire « Petit » puis le recrée plus tard doit RETROUVER
     * le même format, pas en obtenir un second : sinon l'historique se
     * scinderait en deux entités portant le même nom, et le décompte par
     * format deviendrait faux sans que rien ne le signale.
     * ⚠️ C'est ce que garantit `ON CONFLICT (dish_id, label)` — la contrainte
     * porte sur le libellé, indépendamment de `is_active`.
     */
    /**
     * ⛔ L'`id` ENVOYÉ PAR LE CLIENT EST IGNORÉ - défaut trouvé à la
     * relecture. Le fournir dans le VALUES créait un piège : si le gérant
     * RENOMME un format en gardant son id, `ON CONFLICT (dish_id, label)` ne
     * se déclenche pas (le libellé est nouveau) et le conflit tombe sur la
     * CLÉ PRIMAIRE - une erreur SQL brute sur un geste parfaitement normal.
     *
     * ⭐ La réconciliation se fait donc par LIBELLÉ seul. Conséquence
     * assumée : renommer « Petit » en « Mini » crée un NOUVEAU format et
     * retire l'ancien. C'est le comportement JUSTE - l'historique de juillet
     * doit rester attaché au nom sous lequel les plats ont été vendus, pas
     * être réécrit rétroactivement.
     *
     * ⚠️ LIMITE CONNUE, bornée et documentée : la contrainte étant sensible à
     * la casse, saisir « grand » alors que « Grand » existe (retiré) crée un
     * SECOND format au lieu de réactiver le premier. La validation ci-dessus
     * bloque les doublons DANS UN MÊME ENVOI, pas ce cas différé.
     * ⭐ Non corrigé volontairement : passer la contrainte en index fonctionnel
     * `lower(label)` casserait l'`ON CONFLICT (dish_id, label)` - un coût
     * disproportionné pour un cas que l'UI évite en proposant les formats
     * existants plutôt qu'une saisie libre.
     */
    INSERT INTO public.dish_price_options (bar_id, dish_id, label, price, sort_order, is_active)
    VALUES (
      p_bar_id,
      p_dish_id,
      v_label,
      v_price,
      COALESCE((v_opt->>'sort_order')::INTEGER, v_count),
      TRUE
    )
    ON CONFLICT (dish_id, label) DO UPDATE
      SET price      = EXCLUDED.price,
          sort_order = EXCLUDED.sort_order,
          -- ⭐ Réactive un format précédemment retiré, en conservant son id
          -- donc tout son historique de ventes.
          is_active  = TRUE,
          updated_at = NOW()
    RETURNING id INTO v_id;

    v_kept  := array_append(v_kept, v_id);
    v_count := v_count + 1;
  END LOOP;

  /**
   * ⛔⛔ RETRAIT, JAMAIS SUPPRESSION — la différence capitale avec
   * `replace_dish_components`.
   *
   * Un format absent de la liste est référencé par `kitchen_order_items` :
   * le supprimer déclencherait `ON DELETE SET NULL` et ferait perdre le
   * format des commandes passées. « Combien de Petits ai-je vendus en
   * juillet ? » cesserait de répondre — soit exactement ce que la colonne
   * `price_option_id` existe pour permettre.
   */
  UPDATE public.dish_price_options
  SET is_active = FALSE, updated_at = NOW()
  WHERE dish_id = p_dish_id
    AND bar_id = p_bar_id
    AND is_active = TRUE
    AND NOT (id = ANY(v_kept));

  GET DIAGNOSTICS v_retired = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'dish_id', p_dish_id,
    'options_count', v_count,
    'retired_count', v_retired
  );
END;
$$;

COMMENT ON FUNCTION public.replace_dish_price_options(UUID, UUID, JSONB) IS
  '§19.5 — remplace les formats de prix d''un plat. Le gérant envoie la liste COMPLÈTE, la RPC '
  'réconcilie par LIBELLÉ (ON CONFLICT (dish_id, label)) : recréer un format retiré retrouve son '
  'id, donc son historique de ventes, au lieu d''en créer un second homonyme. '
  '⛔ Un format absent de la liste est RETIRÉ (is_active = FALSE), JAMAIS supprimé — il est '
  'référencé par les commandes passées, et le supprimer ferait perdre le décompte par format. '
  '⚠️ UN SEUL format est refusé en base, pas seulement à l''écran : un choix unique n''est pas un '
  'choix. Liste vide = le plat retombe sur `dishes.price`. '
  '⛔ Réservé aux rôles de gestion : un serveur CHOISIT un format, il n''en crée jamais — sans quoi '
  'la liste fermée qui protège de la fraude n''en serait plus une.';

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS.
REVOKE ALL ON FUNCTION public.replace_dish_price_options(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_dish_price_options(UUID, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_dish_price_options(UUID, UUID, JSONB) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. La fonction existe
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname = 'replace_dish_price_options' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : 1 ligne, pronargs = 3
--
--   -- 2. ⛔ `anon` ne peut PAS écrire
--   SELECT
--     has_function_privilege('anon',
--       'public.replace_dish_price_options(uuid,uuid,jsonb)', 'EXECUTE') AS anon_peut,
--     has_function_privilege('authenticated',
--       'public.replace_dish_price_options(uuid,uuid,jsonb)', 'EXECUTE') AS auth_peut;
--   -- ATTENDU : false / true
--
--   -- 3. Les gardes sont dans le CORPS, pas dans un commentaire
--   SELECT
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%is_active = FALSE%'
--       AS retire_sans_supprimer,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') NOT LIKE '%DELETE FROM public.dish_price_options%'
--       AS aucune_suppression,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%ON CONFLICT (dish_id, label)%'
--       AS reconcilie_par_libelle
--   FROM pg_proc
--   WHERE proname = 'replace_dish_price_options' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true / true
--
--   -- 4. Aucun format en base avant le premier usage
--   SELECT count(*) FROM public.dish_price_options;
--   -- ATTENDU : 0
--
-- ⚠️ PL/pgSQL ne résout ses requêtes qu'À L'EXÉCUTION : ces contrôles ne
-- prouvent pas que la fonction RÉPOND. Smoke-test par l'UI obligatoire.

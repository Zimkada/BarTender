-- ═══════════════════════════════════════════════════════════════════════
-- RAPPROCHEMENT REÇUS ↔ VENDUS PAR TAILLE — §19.6
-- 11/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- Complète `20260811090000_ingredient_sizes.sql` : les tables existaient, mais
-- rien ne permettait d'y écrire ni de comparer.
--
-- ⭐ LE CONTRÔLE QUE LE RESTAURATEUR FAIT DÉJÀ AU CAHIER : « ce carton avait
-- 12 grands, j'en ai vendu 11, il m'en reste un ». Un écart POSITIF (vendus >
-- reçus) est le signal qui compte - erreur de tri, ou serveur qui facture du
-- grand en servant du moyen.
--
-- ⛔⛔ RAPPROCHEMENT PAR PÉRIODE, PAS PAR CARTON - et c'est un arbitrage.
-- Relier une VENTE à son CARTON exigerait de parcourir `lot_breakdown`, un
-- JSONB non indexable, pour chaque consommation de la période. Le coût serait
-- réel et le gain nul : en pratique le restaurateur compare des totaux sur
-- quelques jours, exactement comme son cahier. Un rapprochement strict par
-- carton reste possible plus tard si le besoin se confirme.
--
-- ⚠️ CONSÉQUENCE ASSUMÉE : un carton reçu la veille et vendu le lendemain
-- apparaît dans la période de sa RÉCEPTION côté reçus, et dans celle de la
-- VENTE côté vendus. Sur une période courte, les deux peuvent donc diverger
-- sans anomalie réelle - d'où le libellé « sur la période » à l'écran, jamais
-- « il manque X ».
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Les 3 tables de la migration précédente existent
--   SELECT to_regclass('public.ingredient_sizes')      AS t1,
--          to_regclass('public.ingredient_lot_counts') AS t2,
--          to_regclass('public.price_option_sizes')    AS t3;
--   -- ATTENDU : les 3 non NULL
--
--   -- 2. Aucune des fonctions n'existe déjà
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('replace_ingredient_sizes','record_lot_counts',
--                     'set_price_option_size','get_size_reconciliation')
--     AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : aucune ligne

BEGIN;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. DÉCLARER LES TAILLES D'UN INGRÉDIENT                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Même modèle que `replace_dish_price_options` : liste complète,
-- réconciliation par libellé, retrait au lieu de suppression.

CREATE OR REPLACE FUNCTION public.replace_ingredient_sizes(
  p_bar_id        UUID,
  p_ingredient_id UUID,
  p_sizes         JSONB   -- [{label, sort_order?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size    JSONB;
  v_label   TEXT;
  v_id      UUID;
  v_role    TEXT;
  v_kept    UUID[] := ARRAY[]::UUID[];
  v_count   INTEGER := 0;
  v_retired INTEGER := 0;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF jsonb_typeof(p_sizes) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de données invalide');
  END IF;

  -- ⛔ Rôles de gestion : déclarer les tailles est une décision de carte.
  IF auth.role() <> 'service_role' THEN
    SELECT bm.role INTO v_role
    FROM public.bar_members bm
    WHERE bm.user_id = auth.uid() AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN ('super_admin','promoteur','gerant') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le gérant peut déclarer les tailles'
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients
    WHERE id = p_ingredient_id AND bar_id = p_bar_id AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingrédient introuvable dans ce bar');
  END IF;

  -- ⚠️ Doublons insensibles à la CASSE : la contrainte UNIQUE ne l'est pas,
  -- « Grand » et « grand » y passeraient tous les deux (leçon du 10/08).
  IF (
    SELECT count(DISTINCT lower(TRIM(s->>'label'))) FROM jsonb_array_elements(p_sizes) s
  ) <> jsonb_array_length(p_sizes) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deux tailles portent le même nom');
  END IF;

  FOR v_size IN SELECT * FROM jsonb_array_elements(p_sizes)
  LOOP
    v_label := NULLIF(TRIM(v_size->>'label'), '');
    IF v_label IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Une taille doit avoir un nom');
    END IF;
  END LOOP;

  FOR v_size IN SELECT * FROM jsonb_array_elements(p_sizes)
  LOOP
    v_label := TRIM(v_size->>'label');

    -- ⭐ Réconciliation par LIBELLÉ : recréer une taille retirée retrouve son
    -- id, donc tout l'historique de comptage qui y est attaché.
    INSERT INTO public.ingredient_sizes (bar_id, ingredient_id, label, sort_order, is_active)
    VALUES (p_bar_id, p_ingredient_id, v_label,
            COALESCE((v_size->>'sort_order')::INTEGER, v_count), TRUE)
    ON CONFLICT (ingredient_id, label) DO UPDATE
      SET sort_order = EXCLUDED.sort_order,
          is_active  = TRUE
    RETURNING id INTO v_id;

    v_kept  := array_append(v_kept, v_id);
    v_count := v_count + 1;
  END LOOP;

  /**
   * ⛔ RETRAIT, JAMAIS SUPPRESSION. Une taille est référencée par
   * `ingredient_lot_counts` (comptages réels) et `price_option_sizes`
   * (associations). La supprimer buterait d'ailleurs sur le RESTRICT - mais
   * le retrait est aussi le bon comportement métier : « combien de Grands
   * ai-je reçus en juillet » doit continuer de répondre.
   */
  UPDATE public.ingredient_sizes
  SET is_active = FALSE
  WHERE ingredient_id = p_ingredient_id
    AND bar_id = p_bar_id
    AND is_active = TRUE
    AND NOT (id = ANY(v_kept));

  GET DIAGNOSTICS v_retired = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'ingredient_id', p_ingredient_id,
    'sizes_count', v_count,
    'retired_count', v_retired
  );
END;
$$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. COMPTER UN LOT À LA RÉCEPTION                                 │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.record_lot_counts(
  p_bar_id UUID,
  p_lot_id UUID,
  p_counts JSONB   -- [{size_id, qty}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry     JSONB;
  v_size_id   UUID;
  v_qty       NUMERIC;
  v_role      TEXT;
  v_lot       RECORD;
  v_total     NUMERIC := 0;
  v_count     INTEGER := 0;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF jsonb_typeof(p_counts) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de données invalide');
  END IF;

  IF auth.role() <> 'service_role' THEN
    SELECT bm.role INTO v_role
    FROM public.bar_members bm
    WHERE bm.user_id = auth.uid() AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN ('super_admin','promoteur','gerant') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le gérant peut compter un approvisionnement'
      );
    END IF;
  END IF;

  SELECT id, ingredient_id, initial_qty INTO v_lot
  FROM public.ingredient_lots
  WHERE id = p_lot_id AND bar_id = p_bar_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approvisionnement introuvable');
  END IF;

  -- ⭐ PASSE 1 — validation complète avant écriture.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_counts)
  LOOP
    v_size_id := NULLIF(v_entry->>'size_id','')::UUID;
    v_qty     := (v_entry->>'qty')::NUMERIC;

    IF v_size_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Comptage invalide');
    END IF;

    /**
     * ⛔ LA TAILLE DOIT APPARTENIR À L'INGRÉDIENT DE CE LOT **ET** À CE BAR.
     * Sans cette garde, on pourrait compter des « grands poissons » sur un
     * carton de riz - et le rapprochement deviendrait absurde sans que rien
     * ne le signale.
     */
    IF NOT EXISTS (
      SELECT 1 FROM public.ingredient_sizes
      WHERE id = v_size_id
        AND ingredient_id = v_lot.ingredient_id
        AND bar_id = p_bar_id
        AND is_active = TRUE
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Taille inconnue pour cet ingrédient'
      );
    END IF;

    v_total := v_total + v_qty;
  END LOOP;

  /**
   * ⚠️ AVERTISSEMENT, PAS UN REFUS. Compter plus d'unités que le lot n'en
   * contient est probablement une erreur de saisie - mais REFUSER bloquerait
   * un cas réel : un carton annoncé pour 40 poissons qui en contient 42.
   * Le §4.4 vaut ici comme ailleurs : on signale, on ne bloque pas.
   */
  -- ⭐ PASSE 2 — remplacement complet du comptage de ce lot.
  DELETE FROM public.ingredient_lot_counts
  WHERE lot_id = p_lot_id AND bar_id = p_bar_id;

  INSERT INTO public.ingredient_lot_counts (bar_id, lot_id, size_id, counted_qty, created_by)
  SELECT
    p_bar_id,
    p_lot_id,
    (e->>'size_id')::UUID,
    (e->>'qty')::NUMERIC,
    auth.uid()
  FROM jsonb_array_elements(p_counts) AS e;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', p_lot_id,
    'lines_count', v_count,
    'counted_total', v_total,
    'lot_qty', v_lot.initial_qty,
    -- ⭐ L'appelant décide quoi en dire ; la base ne bloque pas.
    'exceeds_lot', (v_total > v_lot.initial_qty)
  );
END;
$$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. ASSOCIER UN FORMAT DE PLAT À UNE TAILLE                       │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.set_price_option_size(
  p_bar_id          UUID,
  p_price_option_id UUID,
  -- ⚠️ NULL = retirer l'association. Un format peut cesser d'être suivi.
  p_size_id         UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF auth.role() <> 'service_role' THEN
    SELECT bm.role INTO v_role
    FROM public.bar_members bm
    WHERE bm.user_id = auth.uid() AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN ('super_admin','promoteur','gerant') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le gérant peut associer un format à une taille'
      );
    END IF;
  END IF;

  -- ⛔ Le format doit appartenir à ce bar.
  IF NOT EXISTS (
    SELECT 1 FROM public.dish_price_options
    WHERE id = p_price_option_id AND bar_id = p_bar_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format introuvable dans ce bar');
  END IF;

  IF p_size_id IS NULL THEN
    DELETE FROM public.price_option_sizes
    WHERE price_option_id = p_price_option_id AND bar_id = p_bar_id;

    RETURN jsonb_build_object('success', true, 'price_option_id', p_price_option_id, 'linked', false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredient_sizes
    WHERE id = p_size_id AND bar_id = p_bar_id AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Taille introuvable dans ce bar');
  END IF;

  INSERT INTO public.price_option_sizes (bar_id, price_option_id, size_id)
  VALUES (p_bar_id, p_price_option_id, p_size_id)
  -- ⭐ Un format n'a qu'UNE taille : réassocier remplace.
  ON CONFLICT (price_option_id) DO UPDATE
    SET size_id = EXCLUDED.size_id;

  RETURN jsonb_build_object('success', true, 'price_option_id', p_price_option_id, 'linked', true);
END;
$$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. LE RAPPROCHEMENT                                              │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_size_reconciliation(
  p_bar_id    UUID,
  p_start     DATE,
  p_end       DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_close INTEGER;
  v_rows  JSONB;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT COALESCE(closing_hour, 6) INTO v_close
  FROM public.bars WHERE id = p_bar_id;

  /**
   * ⭐⭐ UNE SEULE REQUÊTE, deux agrégats indépendants joints sur la taille.
   *
   * ⚠️ LES DEUX CTE NE PEUVENT PAS ÊTRE FUSIONNÉES : joindre reçus et vendus
   * dans un même FROM multiplierait les lignes (un carton compté × chaque
   * vente de la période). C'est le fanout classique - on agrège SÉPARÉMENT
   * puis on rapproche.
   */
  WITH received AS (
    SELECT
      ilc.size_id,
      SUM(ilc.counted_qty) AS qty
    FROM public.ingredient_lot_counts ilc
    JOIN public.ingredient_lots il ON il.id = ilc.lot_id
    WHERE ilc.bar_id = p_bar_id
      /**
       * ⭐ Journée COMMERCIALE du lot, déjà calculée à la réception.
       *
       * ⚠️⚠️ ÉCART CONNU ET ASSUMÉ, trouvé à la code review du 11/08/2026.
       * `receive_ingredient_supply` calcule cette date avec un `6` CODÉ EN DUR
       * et sans fuseau explicite :
       *     CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 ...
       * tandis que le côté VENDU (ci-dessous) utilise le `closing_hour` RÉEL du
       * bar et le fuseau Africa/Porto-Novo.
       *
       * · Bar fermant à 6h  → les deux coïncident, aucun écart.
       * · Bar fermant à 2h ou 8h → un appro reçu dans la fenêtre de bascule
       *   peut être rangé dans une journée et ses ventes dans la suivante.
       *
       * ⭐ NON CORRIGÉ ICI, délibérément : aligner exigerait de modifier
       * `receive_ingredient_supply`, une RPC en PRODUCTION qui écrit du stock
       * et une dépense comptable. Le faire au passage, dans une migration
       * portant sur un autre sujet, ferait bouger des dates d'appro existantes
       * sans que personne ne l'ait demandé.
       * ⚠️ L'impact est BORNÉ : ce rapprochement est un outil de CONTRÔLE, il
       * ne valorise ni ne bloque rien. Un décalage d'un jour sur une période de
       * plusieurs jours se dilue — et l'écran annonce « sur la période »,
       * jamais « il manque X ».
       */
      AND il.business_date BETWEEN p_start AND p_end
    GROUP BY ilc.size_id
  ),
  sold AS (
    /**
     * ⭐ LA CHAÎNE COMPLÈTE : ligne de commande → format → taille.
     *
     * ⚠️ `status = 'served'` et NON `ready` : une assiette prête mais non
     * servie n'est pas une vente. La compter ferait apparaître un écart
     * pendant le service, qui se résorberait tout seul - et le gérant
     * cesserait de croire le chiffre.
     *
     * ⚠️ Les lignes ANNULÉES sont exclues par ce même filtre : un plat prêt
     * puis annulé a consommé de la matière, mais il n'a pas été VENDU. Il
     * apparaît dans le journal des pertes, pas ici.
     */
    SELECT
      pos.size_id,
      SUM(koi.quantity)::NUMERIC AS qty
    FROM public.kitchen_order_items koi
    JOIN public.price_option_sizes pos ON pos.price_option_id = koi.price_option_id
    WHERE koi.bar_id = p_bar_id
      AND koi.status = 'served'
      AND koi.served_at IS NOT NULL
      AND DATE((koi.served_at AT TIME ZONE 'Africa/Porto-Novo')
               - (v_close || ' hours')::INTERVAL) BETWEEN p_start AND p_end
    GROUP BY pos.size_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'size_id',       s.id,
      'size_label',    s.label,
      'ingredient_id', s.ingredient_id,
      'ingredient_name', i.name,
      'received',      COALESCE(r.qty, 0),
      'sold',          COALESCE(so.qty, 0),
      -- ⭐ POSITIF = il reste, NÉGATIF = on a vendu plus qu'on n'a reçu.
      -- C'est le second cas qui intéresse : erreur de tri, ou facturation
      -- d'un grand pour un moyen servi.
      'gap',           COALESCE(r.qty, 0) - COALESCE(so.qty, 0)
    )
    ORDER BY i.name, s.sort_order
  ), '[]'::JSONB)
  INTO v_rows
  FROM public.ingredient_sizes s
  JOIN public.ingredients i ON i.id = s.ingredient_id
  LEFT JOIN received r ON r.size_id = s.id
  LEFT JOIN sold so    ON so.size_id = s.id
  WHERE s.bar_id = p_bar_id
    AND s.is_active = TRUE
    /**
     * ⚠️ On n'affiche QUE les tailles qui ont eu du mouvement. Lister une
     * taille à 0 reçu et 0 vendu remplirait l'écran de lignes vides et
     * noierait les écarts réels.
     */
    AND (r.qty IS NOT NULL OR so.qty IS NOT NULL);

  RETURN jsonb_build_object(
    'success', true,
    'start', p_start,
    'end', p_end,
    'rows', v_rows
  );
END;
$$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 5. PRIVILÈGES                                                    │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS.

REVOKE ALL ON FUNCTION public.replace_ingredient_sizes(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_ingredient_sizes(UUID, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_ingredient_sizes(UUID, UUID, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.record_lot_counts(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_lot_counts(UUID, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_lot_counts(UUID, UUID, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.set_price_option_size(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_price_option_size(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_price_option_size(UUID, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_size_reconciliation(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_size_reconciliation(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_size_reconciliation(UUID, DATE, DATE) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Les 4 fonctions existent
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname IN ('replace_ingredient_sizes','record_lot_counts',
--                     'set_price_option_size','get_size_reconciliation')
--     AND pronamespace = 'public'::regnamespace
--   ORDER BY proname;
--   -- ATTENDU : 4 lignes (3, 3, 3, 3 arguments)
--
--   -- 2. ⛔ `anon` ne peut exécuter AUCUNE
--   SELECT
--     has_function_privilege('anon','public.replace_ingredient_sizes(uuid,uuid,jsonb)','EXECUTE') AS a1,
--     has_function_privilege('anon','public.record_lot_counts(uuid,uuid,jsonb)','EXECUTE')        AS a2,
--     has_function_privilege('anon','public.set_price_option_size(uuid,uuid,uuid)','EXECUTE')     AS a3,
--     has_function_privilege('anon','public.get_size_reconciliation(uuid,date,date)','EXECUTE')   AS a4;
--   -- ATTENDU : false / false / false / false
--
--   -- 3. `authenticated` le peut
--   SELECT
--     has_function_privilege('authenticated','public.get_size_reconciliation(uuid,date,date)','EXECUTE') AS auth_lit;
--   -- ATTENDU : true
--
--   -- 4. Les gardes sont dans le CORPS, pas dans un commentaire
--   SELECT
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%koi.status = ''served''%'
--       AS compte_les_servis,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%price_option_sizes%'
--       AS passe_par_l_association
--   FROM pg_proc
--   WHERE proname = 'get_size_reconciliation' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true
--
--   -- 5. La garde d'appartenance de la taille est dans `record_lot_counts`
--   SELECT regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g')
--          LIKE '%ingredient_id = v_lot.ingredient_id%' AS taille_liee_a_l_ingredient
--   FROM pg_proc
--   WHERE proname = 'record_lot_counts' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
-- ⚠️⚠️ PL/pgSQL ne résout ses requêtes qu'À L'EXÉCUTION : ces contrôles ne
-- prouvent pas que les fonctions RÉPONDENT. Smoke-test par l'UI obligatoire -
-- et il ne peut pas se faire depuis le SQL Editor, où `auth.uid()` vaut NULL.

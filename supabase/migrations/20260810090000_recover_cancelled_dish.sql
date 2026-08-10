-- ═══════════════════════════════════════════════════════════════════════
-- RÉCUPÉRER UN PLAT ANNULÉ — §19.4
-- 10/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- LE PROBLÈME, remonté comme besoin métier réel.
--
-- Un plat déjà `ready` que le client refuse (il est parti, il a changé
-- d'avis) part DIRECTEMENT en perte. Il est pourtant encore parfaitement
-- servable pendant un moment : en salle, le cuisinier le sert à la table
-- d'à côté. Les comptes affichent alors une PERTE **et** une vente sans
-- matière — les deux chiffres sont faux, en sens inverse.
--
-- CE QU'ON N'INVENTE PAS. `production_batches` est déjà un stock de portions
-- PRÊTES dans lequel les commandes se servent, avec quantité restante,
-- péremption et perte partielle. Un plat récupéré n'a pas besoin d'une
-- « liste des plats annulés » : il a besoin d'entrer dans ce bac.
--
-- ⭐ LE PRÉCÉDENT EST `source = 'purchased'` (§19.3) : un lot peut déjà
-- naître SANS qu'on cuisine, et le prélèvement IGNORE volontairement
-- l'origine (« les deux lots sont dans le même bac »). `recovered` est une
-- troisième origine, pas un mécanisme nouveau.
--
-- ⛔⛔ CE QUE CETTE MIGRATION NE FAIT PAS. Un plat `on_order` ne regarde
-- JAMAIS les lots (`WHERE v_mode = 'batch'` dans accept_kitchen_item). Un
-- poisson braisé à la commande récupéré entre donc dans un bac que rien ne
-- consomme automatiquement : il est VISIBLE et DÉCLARABLE EN PERTE, mais
-- pas servable sans geste. Les plats `batch` et `batch_finish`, eux, le
-- servent immédiatement — le prélèvement existe déjà.
-- ⭐ Rendre `on_order` servable depuis un lot est la « pièce 2 », qui touche
-- la machine d'état (accept_kitchen_item / mark_kitchen_item_ready). Elle
-- est VOLONTAIREMENT hors de cette migration : treize migrations cuisine
-- attendent encore leur première soirée de service, et on n'empile pas du
-- code non éprouvé sous du code non éprouvé.
--
-- ⚠️ AUCUNE DURÉE DE VALIDITÉ AUTOMATIQUE. Un poisson braisé et une salade
-- n'ont pas la même tolérance, et le code ne peut pas le deviner.
-- `expires_at` reste NULL : le cuisinier voit l'heure de récupération
-- (`produced_at`) et juge. C'est déjà lui qui répond du stock (§16.7).
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, et à lire                            │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Nom RÉEL de la contrainte CHECK sur `source`. Elle a été créée
--   --    sans nom explicite (§19.3) donc PostgreSQL l'a nommée seul :
--   --    ne PAS supposer `production_batches_source_check`.
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.production_batches'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%source%';
--
--   -- 2. La fonction cible existe et n'a pas dérivé
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname = 'cancel_kitchen_item' AND pronamespace = 'public'::regnamespace;
--
--   -- 3. Aucune ligne ne porterait déjà une source inconnue
--   SELECT source, count(*) FROM public.production_batches GROUP BY source;
--
-- ⚠️ Si le pré-vol n°1 ne retourne RIEN, arrêter : la colonne `source`
-- n'existe pas et la migration 20260808140000 n'a pas été appliquée.

BEGIN;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. LA TROISIÈME ORIGINE                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔⛔ MÊME PIÈGE QU'`expenses_category_check` LE 09/08 : un CHECK se
-- REMPLACE, il ne s'étend pas. Le DROP doit viser le nom RÉEL relevé au
-- pré-vol — d'où le bloc dynamique plutôt qu'un nom écrit en dur.

DO $do$
DECLARE
  v_conname TEXT;
  v_count   INTEGER;
BEGIN
  /**
   * ⛔⛔ DEUX GARDES, ET LA SECONDE EST LA PLUS IMPORTANTE — défaut trouvé
   * à la code review.
   *
   * `production_batches` porte SEPT contraintes CHECK (produced_qty,
   * remaining_qty, unit_cost, status, discarded_qty, pb_remaining_lte_produced,
   * pb_discard_coherence). Aujourd'hui une SEULE mentionne `source`, mais un
   * `SELECT ... INTO` sur plusieurs lignes n'ERREUR PAS en PL/pgSQL : il prend
   * silencieusement la PREMIÈRE, dans un ordre non déterministe.
   *
   * ⚠️ Le jour où quelqu'un ajoute une colonne `cost_source` ou
   * `source_lot_id` avec son propre CHECK, ce bloc DÉTRUIRAIT cette
   * contrainte-là au lieu de la nôtre — sans un mot, et la perte serait
   * définitive (un DROP ne se rejoue pas à l'envers).
   *
   * ⭐ On COMPTE d'abord, et on refuse d'agir si le compte n'est pas 1.
   */
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.production_batches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Contrainte CHECK sur `source` introuvable — la migration 20260808140000 (purchased_batch) est-elle appliquée ?';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'AMBIGUÏTÉ : % contraintes CHECK mentionnent `source` sur production_batches. Relever leurs noms au pré-vol et viser la bonne EXPLICITEMENT plutôt que par motif.', v_count;
  END IF;

  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.production_batches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%';

  EXECUTE format('ALTER TABLE public.production_batches DROP CONSTRAINT %I', v_conname);
END
$do$;

ALTER TABLE public.production_batches
  ADD CONSTRAINT production_batches_source_check
  CHECK (source IN ('produced', 'purchased', 'recovered'));

COMMENT ON COLUMN public.production_batches.source IS
  '§19.3/§19.4 — origine du lot. `produced` : cuisiné sur place, ingrédients consommés en FEFO. '
  '`purchased` : acheté prêt, AUCUN ingrédient consommé, unit_cost = prix payé / portions. '
  '`recovered` : plat déjà prêt dont la commande a été annulée — la matière était DÉJÀ consommée, '
  'son coût MIGRE de la ligne annulée vers le lot (il ne s''y ajoute pas). '
  '⭐ Le PRÉLÈVEMENT ne distingue PAS l''origine : tous les lots sont dans le même bac, on sert '
  'le plus ancien (FIFO). Chaque assiette prend le coût de SON lot.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. LA RPC                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ RPC SÉPARÉE, et non un paramètre de plus sur `cancel_kitchen_item`.
-- Trois raisons :
--   1. `cancel_kitchen_item` est au cœur de la machine d'état — la
--      modifier pour un besoin annexe élargit la surface de régression
--      d'un chemin emprunté à chaque service.
--   2. Le geste est SÉQUENTIEL en salle : on annule d'abord (le client
--      part), on décide ensuite si le plat est récupérable — parfois après
--      être allé le regarder.
--   3. Une récupération peut se décider quelques minutes APRÈS
--      l'annulation. Un paramètre l'aurait rendue impossible.

CREATE OR REPLACE FUNCTION public.recover_cancelled_dish(
  p_bar_id  UUID,
  p_item_id UUID,
  p_note    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          RECORD;
  v_actor         UUID := auth.uid();
  v_role          TEXT;
  v_close         INTEGER;
  v_business_date DATE;
  v_unit_cost     NUMERIC(12,4);
  v_lot_id        UUID;
  v_idem          TEXT;
BEGIN
  -- ⛔ ISOLATION MULTI-TENANT — jamais déductible du seul p_item_id.
  IF NOT public.is_bar_member(p_bar_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⭐ FOR UPDATE : deux gérants qui récupèrent le même plat en même temps
  -- créeraient deux lots pour une seule assiette. Le verrou sérialise.
  SELECT koi.*, ko.bar_id AS ko_bar_id
  INTO v_item
  FROM public.kitchen_order_items koi
  JOIN public.kitchen_orders ko ON ko.id = koi.kitchen_order_id
  WHERE koi.id = p_item_id AND koi.bar_id = p_bar_id
  FOR UPDATE OF koi;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable');
  END IF;

  -- ⛔ SEULE UNE LIGNE ANNULÉE SE RÉCUPÈRE. Une ligne `ready` non annulée
  -- appartient encore à son client : la verser au bac la lui volerait.
  IF v_item.status <> 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Seul un plat annulé peut être récupéré. Annulez d''abord la commande.'
    );
  END IF;

  /**
   * ⛔⛔ LA GARDE QUI ÉVITE DE CRÉER DE LA MATIÈRE À PARTIR DE RIEN.
   *
   * `consumed_at IS NOT NULL` EST la définition d'un plat dont la matière a
   * été engagée (§6.1). Une ligne annulée AVANT `ready` n'a rien consommé :
   * la récupérer créerait un lot valorisé à zéro, un lot FANTÔME qui
   * diluerait le coût de toutes les portions qu'il sert — exactement le
   * défaut que `idempotency_key` prévient sur `produce_batch`.
   *
   * ⭐ C'est aussi le REJEU : une ligne déjà récupérée a vu son
   * `consumed_at` remis à NULL (cf. plus bas), donc un second appel tombe
   * ici et retourne proprement au lieu de créer un deuxième lot.
   */
  IF v_item.consumed_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce plat n''a pas été préparé, il n''y a rien à récupérer.',
      'already_recovered', TRUE
    );
  END IF;

  -- ⛔ §6.1 — MÊME LISTE BLANCHE QUE L'ANNULATION POST-`ready`. Décider
  -- qu'un plat reste servable est une décision sanitaire : elle appartient
  -- au gérant, pas au serveur qui a perdu son client.
  -- ⚠️ Liste BLANCHE : un rôle ajouté plus tard est refusé par défaut.
  IF auth.role() <> 'service_role' THEN
    SELECT bm.role INTO v_role
    FROM public.bar_members bm
    WHERE bm.user_id = v_actor AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    IF v_role IS NULL OR v_role NOT IN ('super_admin','promoteur','gerant') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Seul le gérant peut remettre un plat annulé en vente'
      );
    END IF;
  END IF;

  /**
   * ⛔⛔ CORRECTIF N°3 DE LA CERTIFICATION — `computed_cost` est le coût de
   * la LIGNE ENTIÈRE, pas d'une portion. Une ligne de 3 plats porte le coût
   * des 3. Sans cette division, `unit_cost` vaudrait le triple et chaque
   * portion servie depuis ce lot coûterait trois fois son prix réel.
   *
   * ⚠️ `quantity` est NOT NULL et CHECK > 0 sur la table, mais on garde le
   * GREATEST : une division par zéro ici ferait perdre TOUTE la
   * transaction, donc l'annulation elle-même.
   */
  v_unit_cost := ROUND(
    COALESCE(v_item.computed_cost, 0) / GREATEST(COALESCE(v_item.quantity, 1), 1),
    4
  );

  -- Journée COMMERCIALE — un plat récupéré à 2h du matin appartient au
  -- service de la veille. Même formule que `produce_batch`.
  SELECT COALESCE(closing_hour, 6) INTO v_close
  FROM public.bars WHERE id = p_bar_id;

  v_business_date := DATE(
    (NOW() AT TIME ZONE 'Africa/Porto-Novo') - (v_close || ' hours')::INTERVAL
  );

  -- ⭐ CLÉ DÉTERMINISTE dérivée de la ligne : `idempotency_key` est NOT NULL
  -- et UNIQUE sur la table. Deux récupérations de la MÊME ligne butent donc
  -- sur l'unicité côté base, en plus de la garde `consumed_at` ci-dessus —
  -- la seule protection qui tienne entre deux transactions concurrentes.
  v_idem := 'recovered:' || p_item_id::TEXT;

  INSERT INTO public.production_batches (
    bar_id, dish_id, produced_qty, remaining_qty, unit_cost,
    status, source, produced_at, produced_by, business_date,
    expires_at, notes, idempotency_key
  ) VALUES (
    p_bar_id,
    v_item.dish_id,
    v_item.quantity,
    v_item.quantity,
    v_unit_cost,
    'active',
    'recovered',
    NOW(),
    v_actor,
    v_business_date,
    -- ⚠️ NULL ASSUMÉ : aucune durée de validité automatique (cf. en-tête).
    NULL,
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    v_idem
  )
  RETURNING id INTO v_lot_id;

  /**
   * ⛔⛔⛔ LES DEUX CORRECTIFS LES PLUS IMPORTANTS DE LA CERTIFICATION.
   * Sans eux, ce mécanisme produisait DEUX chiffres faux en comptabilité.
   *
   * 1. DOUBLE COMPTAGE DU COÛT. Le plat porterait sa matière DEUX fois :
   *    dans `computed_cost` de la ligne annulée (que la marge matière somme,
   *    cf. get_kitchen_metrics) ET dans le lot que la nouvelle commande
   *    consomme. Plus le mécanisme sert, plus la marge devient fausse.
   *
   * 2. DOUBLE COMPTAGE DE LA PERTE. `get_kitchen_losses` compte toute ligne
   *    `cancelled` avec `consumed_at IS NOT NULL AND sale_id IS NULL`. La
   *    ligne resterait une perte, PUIS sa perte réelle serait comptée une
   *    seconde fois via `record_batch_loss`.
   *
   * ⭐ LE COÛT MIGRE, IL NE SE DUPLIQUE PAS. Remettre les deux champs à NULL
   * fait sortir la ligne des deux calculs : la matière vit désormais dans le
   * lot, qui porte sa valeur et sa perte éventuelle.
   *
   * ⚠️ LES DEUX VONT ENSEMBLE, ce n'est pas un choix : la contrainte
   * `(consumed_at IS NULL AND computed_cost IS NULL) OR (les deux NOT NULL)`
   * l'impose. En annuler un seul ferait échouer l'UPDATE.
   *
   * ⚠️ ON NE TOUCHE PAS `status` : la ligne RESTE `cancelled`. Le client
   * n'a rien reçu, le ticket est réglé, l'historique de la commande doit le
   * dire. Ce qui change n'est pas ce qui s'est passé en salle, c'est le
   * SORT DE LA MATIÈRE.
   */
  UPDATE public.kitchen_order_items
  SET consumed_at   = NULL,
      computed_cost = NULL,
      cancel_note   = TRIM(
        COALESCE(cancel_note || ' | ', '') || 'Récupéré en lot ' || v_lot_id::TEXT
      )
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'batch_id', v_lot_id,
    'qty', v_item.quantity,
    -- ⭐ Le coût N'EST PLUS une perte : l'appelant doit pouvoir dire au
    -- gérant ce qui a été sauvé, pas ce qui a été perdu.
    'recovered_cost', ROUND(v_unit_cost * v_item.quantity, 2),
    'idempotent_replay', false
  );
END;
$$;

COMMENT ON FUNCTION public.recover_cancelled_dish(UUID, UUID, TEXT) IS
  '§19.4 — remet en vente un plat annulé APRÈS `ready`, dont la matière était déjà consommée. '
  'Crée un lot `source = recovered` valorisé au coût réel du plat (computed_cost / quantity — '
  'le coût est celui de la LIGNE, pas d''une portion). '
  '⛔ Le coût MIGRE vers le lot : `consumed_at` et `computed_cost` sont remis à NULL sur la ligne, '
  'sans quoi la matière serait comptée deux fois (marge matière) et la perte deux fois '
  '(get_kitchen_losses). La ligne reste `cancelled` — le client n''a rien reçu. '
  '⚠️ Réservé au gérant (§6.1, même liste blanche que l''annulation post-ready) : décider qu''un '
  'plat reste servable est une décision sanitaire. '
  '⚠️ Un plat `on_order` récupéré est VISIBLE et déclarable en perte, mais pas servi '
  'automatiquement — le prélèvement ne regarde les lots que pour `batch` et `batch_finish`.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. PRIVILÈGES                                                    │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS — leçon des vagues 1-4 du
-- durcissement RPC. Toujours re-REVOKE/GRANT, et le vérifier au post-vol.

REVOKE ALL ON FUNCTION public.recover_cancelled_dish(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_cancelled_dish(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.recover_cancelled_dish(UUID, UUID, TEXT) TO authenticated;

COMMIT;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. La troisième origine est acceptée, les deux autres survivent
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'production_batches_source_check';
--   -- attendu : CHECK (source = ANY (ARRAY['produced','purchased','recovered']))
--
--   -- 2. La fonction existe
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname = 'recover_cancelled_dish' AND pronamespace = 'public'::regnamespace;
--
--   -- 3. ⛔ LE PLUS IMPORTANT — `anon` ne peut PAS l'exécuter
--   SELECT has_function_privilege('anon',
--     'public.recover_cancelled_dish(uuid,uuid,text)', 'EXECUTE') AS anon_peut;
--   -- attendu : false
--   SELECT has_function_privilege('authenticated',
--     'public.recover_cancelled_dish(uuid,uuid,text)', 'EXECUTE') AS auth_peut;
--   -- attendu : true
--
--   -- 4. Les deux correctifs anti-double-comptage sont bien dans le corps
--   SELECT
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%consumed_at   = NULL%'
--       AS remet_consumed_at,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%computed_cost = NULL%'
--       AS remet_computed_cost,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%GREATEST%'
--       AS divise_par_quantite
--   FROM pg_proc
--   WHERE proname = 'recover_cancelled_dish' AND pronamespace = 'public'::regnamespace;
--   -- attendu : true / true / true
--   -- ⚠️ `pg_get_functiondef` CONSERVE les commentaires : sans le
--   --    regexp_replace, ces motifs matcheraient le texte des commentaires
--   --    et le post-vol passerait au vert sur une fonction vidée.
--
--   -- 5. Aucun lot `recovered` ne doit exister avant le premier usage
--   SELECT count(*) FROM public.production_batches WHERE source = 'recovered';
--   -- attendu : 0
--
-- ⚠️⚠️ CE QUE LE POST-VOL NE PROUVE PAS. PL/pgSQL ne résout ses requêtes
-- qu'À L'EXÉCUTION : ces cinq contrôles peuvent passer au vert sur une
-- fonction qui échouerait au premier appel réel. Un smoke-test via l'UI
-- reste nécessaire — et il ne peut pas se faire depuis le SQL Editor, où
-- `auth.uid()` vaut NULL et où la fonction s'arrête sur `is_bar_member`
-- avant d'exécuter son corps.

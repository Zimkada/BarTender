-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: la cuisine entre en COMPTABILITÉ
-- ═══════════════════════════════════════════════════════════════════
--
-- ⛔⛔ LE MODULE CUISINE ÉTAIT COMPTABLEMENT BORGNE.
--
-- Un plat servi crée une VENTE ordinaire : son chiffre d'affaires remontait
-- donc déjà dans « Comptabilité », sans qu'on ait rien branché. Mais AUCUN de
-- ses coûts n'y entrait - ni les achats d'ingrédients, ni le coût matière, ni
-- les pertes.
--
-- Conséquence mesurée le 09/08/2026 : un plat vendu 1500 F avec 800 F de
-- matière apparaissait comme 1500 F de BÉNÉFICE PUR. Plus le restaurant
-- marchait, plus le résultat comptable s'éloignait du réel - l'inverse exact
-- de ce que onze migrations de traçabilité cherchaient à établir.
--
-- ⭐ CE QUI EST COMPTÉ : L'ACHAT, pas la consommation.
-- Même règle que les boissons, où un casier acheté est une dépense immédiate
-- et non au moment où la bière se vend. C'est aussi ce que suit la trésorerie
-- réelle : on paie le poisson à la livraison, qu'il soit servi ou non.
-- ⚠️ Le coût matière consommé serait plus juste comptablement, mais il vit
-- DÉJÀ dans le module cuisine avec sa marge par plat. Le dupliquer ici
-- créerait deux chiffres concurrents pour la même chose.
--
-- ⭐⭐ CATÉGORIE DÉDIÉE `kitchen_supply`, ET C'EST LE CŒUR DE L'ARBITRAGE.
-- Avec `supply`, cet achat se fondrait dans les casiers de bière : le chiffre
-- existerait, NOYÉ, et « combien me coûte ma cuisine ? » resterait sans
-- réponse. Une catégorie distincte donne une part propre au camembert.
--
-- ⛔ CATÉGORIE SYSTÈME, JAMAIS SAISIE À LA MAIN. Le formulaire de dépense
-- liste toutes les catégories sauf `custom` : sans exclusion explicite,
-- `kitchen_supply` deviendrait saisissable - et VISIBLE SUR UN BAR PUR, ce qui
-- violerait le §3. L'exclusion est faite côté client (ExpenseFormModal).
--
-- ⭐ INVARIANCE DES BARS PURS (§3) - ACQUISE PAR CONSTRUCTION, sans garde.
-- Le camembert construit ses catégories depuis les dépenses RÉELLEMENT
-- présentes (`filteredExpenses.forEach`), jamais depuis une liste figée. Un
-- bar sans cuisine n'a aucune dépense `kitchen_supply` : aucune part, aucune
-- ligne, aucun changement. Vérifié dans AccountingOverview l.421-443.
--
-- ⭐ LES GRAPHIQUES SE CORRIGENT SEULS. `operating_expenses` filtre sur
-- `category != 'investment'` - une LISTE NOIRE. La nouvelle catégorie y entre
-- automatiquement, et la courbe « Revenus / Coûts » cesse d'afficher un coût
-- amputé. Aucun composant de graphique à modifier.
--
-- ⚠️ LA VUE `expenses_summary_mat` NE SE RAFRAÎCHIT PAS IMMÉDIATEMENT.
-- Le trigger `after_expense_refresh_summary` fait un `pg_notify`, PAS un
-- `REFRESH` - et personne n'écoute cette notification (vérifié le 09/08/2026).
-- ⭐ C'est une BONNE chose pour cette RPC : la transaction d'appro n'est pas
-- ralentie par le rafraîchissement d'une vue.
-- ⚠️ Le rafraîchissement réel vient de `useViewMonitoring`, au démarrage de
-- l'app, et SEULEMENT si la vue a plus de 60 minutes.
-- ⛔ CONSÉQUENCE AU TEST : la dépense apparaît IMMÉDIATEMENT dans l'onglet
-- Dépenses et le camembert (qui lisent `expenses`), mais avec un DÉLAI dans
-- les courbes Revenus/Coûts (qui lisent la vue). Ce n'est pas un défaut de ce
-- chantier - c'est déjà le cas de toutes les dépenses, y compris une facture
-- d'électricité saisie à la main.
--
-- BREAKING_CHANGE: NO - le CHECK est ÉTENDU (aucune valeur retirée), et la
--   RPC garde sa signature et son enveloppe de retour.
--
-- ⚠️ NON RÉTROACTIF : les approvisionnements cuisine déjà saisis n'ont pas de
--   dépense et n'en auront pas. Seuls les futurs entrent en comptabilité. Les
--   créer après coup supposerait de deviner leur auteur et leur date - une
--   fabrication, pas une correction.
--
-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.expenses DROP CONSTRAINT expenses_category_check;
--   ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check
--     CHECK (category IN ('supply','water','electricity','maintenance',
--                         'investment','custom'));
--   puis réappliquer 20260802150000_receive_ingredient_supply_rpc.sql.
--   ⛔ Le DROP échouera si des dépenses `kitchen_supply` existent déjà : il
--   faut les supprimer ou les reclasser d'abord.
--
-- TABLES_MODIFIED: public.expenses (contrainte étendue)
-- FUNCTIONS_CREATED: (aucune - CREATE OR REPLACE de receive_ingredient_supply)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) ⛔ LE CHECK ACTUEL - il doit correspondre EXACTEMENT à ceci, sinon la
--    reconstruction plus bas retirerait une valeur en usage :
-- SELECT conname, pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--  WHERE conrelid='public.expenses'::regclass
--    AND contype='c' AND conname='expenses_category_check';
--   → CHECK ((category = ANY (ARRAY['supply'::text, 'water'::text,
--     'electricity'::text, 'maintenance'::text, 'investment'::text,
--     'custom'::text])))
--   ⛔ Toute autre valeur dans la liste : ARRÊTER et me la signaler.
--
-- 2) Aucune dépense ne doit déjà porter cette catégorie :
-- SELECT count(*) FROM public.expenses WHERE category = 'kitchen_supply';
--   → 0.
--
-- 3) La RPC à remplacer existe, en UN exemplaire :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='receive_ingredient_supply';
--   → 1 ligne. Noter les arguments : ils doivent être IDENTIQUES après.
--
-- 4) Le trigger de rafraîchissement est bien là :
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid='public.expenses'::regclass
--    AND tgname='after_expense_refresh_summary';
--   → 1 ligne. Sans lui, la dépense n'apparaîtrait pas dans les graphiques.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. ÉTENDRE LA CONTRAINTE DE CATÉGORIE                            │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ PostgreSQL ne sait pas modifier un CHECK : il faut le retirer et le
-- recréer. La liste ci-dessous reprend l'existant À L'IDENTIQUE + la nouvelle
-- valeur - retirer une valeur en usage ferait échouer le ALTER sur les lignes
-- existantes.
-- ⭐ `salary` n'y figure pas, et c'est NORMAL : c'est une catégorie
-- SYNTHÉTIQUE fabriquée côté client depuis la table des salaires, elle
-- n'existe pas en base (vérifié dans useUnifiedExpenses l.175).

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'supply', 'water', 'electricity', 'maintenance', 'investment', 'custom',
    -- ⭐ Appro cuisine - écrit par receive_ingredient_supply, jamais saisi.
    'kitchen_supply'
  ));

COMMENT ON CONSTRAINT expenses_category_check ON public.expenses IS
  '⭐ `kitchen_supply` ajoutée le 09/08/2026 : les approvisionnements cuisine '
  'entrent en comptabilité, dans une catégorie DISTINCTE de `supply` pour ne '
  'pas se fondre dans les achats de boissons. Écrite par la RPC uniquement.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. L'APPRO CUISINE CRÉE SA DÉPENSE                               │
-- └─────────────────────────────────────────────────────────────────┘
-- ⛔ Version de référence : 20260802150000, SEULE définition existante
-- (vérifié). Le corps est repris À L'IDENTIQUE, seule l'étape 4 est ajoutée.

CREATE OR REPLACE FUNCTION public.receive_ingredient_supply(
  p_bar_id          UUID,
  p_ingredient_id   UUID,
  p_qty             NUMERIC,
  p_unit_cost       NUMERIC,
  p_idempotency_key TEXT,
  p_expires_at      DATE DEFAULT NULL,
  p_business_date   DATE DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_actor_id       UUID;
  v_caller_role    TEXT;
  v_business_date  DATE;
  v_existing_lot   public.ingredient_lots;
  v_debt           RECORD;
  v_remaining_qty  NUMERIC;
  -- ⭐ Montant de la dépense comptable générée par cet appro (09/08/2026).
  v_expense_amount NUMERIC(12, 2);
  v_settle_qty     NUMERIC;
  v_settled_total  NUMERIC := 0;
  v_variance       NUMERIC;
  v_fully_settled  BOOLEAN;
  v_lot_id         UUID;
  v_ingredient     public.ingredients;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '30s';

  -- ── Validation de base ────────────────────────────────────────────
  IF p_bar_id IS NULL OR p_ingredient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'bar_id et ingredient_id sont requis');
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La quantité doit être strictement positive');
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le coût unitaire ne peut pas être négatif');
  END IF;

  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_key est requise');
  END IF;

  -- ── 🛡️ SECURITY CHECK — membre actif + permission ─────────────────
  -- Bypass service_role pour SyncManager, migrations et tests.
  -- ⚠️ Sous service_role, v_actor_id reste NULL : le lot créé aura
  --    created_by = NULL. La colonne est nullable, donc pas d'échec, mais la
  --    traçabilité est perdue. Acceptable pour un rejeu de sync (l'auteur
  --    réel est dans la file offline) ; à garder à l'esprit en test manuel.
  IF auth.role() <> 'service_role' THEN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
    END IF;

    SELECT bm.role INTO v_caller_role
    FROM public.bar_members bm
    WHERE bm.user_id = v_actor_id
      AND bm.bar_id = p_bar_id
      AND bm.is_active = TRUE;

    IF v_caller_role IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Accès refusé : non membre actif de ce bar');
    END IF;

    -- ⭐ LISTE BLANCHE, jamais liste noire — leçon de create_sale_idempotent.
    --    Correspond à canManageIngredientStock (MATRICE_RBAC_CUISINIER §3) :
    --    le cuisinier réceptionne les livraisons, le serveur non.
    IF v_caller_role NOT IN ('super_admin', 'promoteur', 'gerant', 'cuisinier') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Accès refusé : le rôle %s ne peut pas enregistrer un approvisionnement', v_caller_role)
      );
    END IF;
  END IF;

  -- ── ⭐ IDEMPOTENCE — avant toute écriture ─────────────────────────
  SELECT * INTO v_existing_lot
  FROM public.ingredient_lots
  WHERE bar_id = p_bar_id AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'lot_id', v_existing_lot.id,
      'idempotent_replay', true
    );
  END IF;

  -- ── Verrouiller l'ingrédient ──────────────────────────────────────
  -- ⚠️ FOR UPDATE : deux appros simultanés sur le même ingrédient
  --    liraient le même current_stock et le second écraserait le premier.
  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = p_ingredient_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingrédient introuvable dans ce bar');
  END IF;

  IF NOT v_ingredient.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cet ingrédient est désactivé');
  END IF;

  v_business_date := COALESCE(
    p_business_date,
    (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
  );

  v_remaining_qty := p_qty;

  -- ── ⭐ ÉTAPE 1 : SOLDER LES DETTES, AVANT de créer le lot (§13.2) ──
  --
  -- L'ordre EST la spécification. Créer le lot puis solder donnerait le même
  -- current_stock, mais une valorisation FAUSSE : la quantité qui solde une
  -- dette n'a jamais été disponible, elle ne doit donc jamais figurer dans
  -- remaining_qty — sinon le FEFO consommerait deux fois la même matière.
  --
  -- FIFO sur incurred_at : la dette la plus ancienne se solde d'abord.
  FOR v_debt IN
    SELECT * FROM public.ingredient_stock_debts
    WHERE ingredient_id = p_ingredient_id
      AND bar_id = p_bar_id
      AND status = 'open'
    ORDER BY incurred_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_settle_qty := LEAST(v_remaining_qty, v_debt.qty_owed - v_debt.settled_qty);

    -- ⭐ price_variance : écart entre l'estimation faite à la consommation
    --    et le coût réellement payé. C'est CE chiffre qui rend l'anomalie
    --    exploitable — il alimente l'écart théorique/réel (§8).
    v_variance := (p_unit_cost - v_debt.estimated_unit_cost) * v_settle_qty;

    -- ⚠️ `v_fully_settled` calculé AVANT l'UPDATE, sur les valeurs lues.
    --    Répéter `settled_qty + v_settle_qty >= qty_owed` dans le SET est
    --    fragile : ces colonnes y désignent les valeurs AVANT mise à jour,
    --    ce qui est correct mais non évident — et la moindre réécriture par
    --    un tiers casserait la cohérence avec la contrainte.
    v_fully_settled := (v_debt.settled_qty + v_settle_qty) >= v_debt.qty_owed;

    UPDATE public.ingredient_stock_debts
    SET -- ⚠️ Sur solde total, on POSE qty_owed plutôt que d'additionner : la
        --    contrainte ingredient_debts_settled_coherence exige l'égalité
        --    STRICTE, et une addition de NUMERIC(14,3) pourrait la manquer
        --    d'un millième — la transaction entière échouerait alors.
        settled_qty    = CASE WHEN v_fully_settled THEN qty_owed
                              ELSE settled_qty + v_settle_qty END,
        price_variance = COALESCE(price_variance, 0) + v_variance,
        status         = CASE WHEN v_fully_settled THEN 'settled' ELSE 'open' END,
        settled_at     = CASE WHEN v_fully_settled THEN NOW() ELSE settled_at END
    WHERE id = v_debt.id;

    v_remaining_qty := v_remaining_qty - v_settle_qty;
    v_settled_total := v_settled_total + v_settle_qty;
  END LOOP;

  -- ── ÉTAPE 2 : créer le lot avec le RELIQUAT ───────────────────────
  -- ⚠️ Si tout l'appro a soldé des dettes, il n'y a PAS de lot à créer :
  --    initial_qty > 0 est une contrainte, et un lot vide n'aurait aucun sens.
  IF v_remaining_qty > 0 THEN
    INSERT INTO public.ingredient_lots (
      bar_id, ingredient_id, initial_qty, remaining_qty, unit_cost,
      expires_at, business_date, status, created_by, idempotency_key
    ) VALUES (
      p_bar_id, p_ingredient_id, v_remaining_qty, v_remaining_qty, p_unit_cost,
      p_expires_at, v_business_date, 'active', v_actor_id, p_idempotency_key
    )
    RETURNING id INTO v_lot_id;
  END IF;

  -- ── ÉTAPE 3 : mettre à jour le cache ──────────────────────────────
  -- ⚠️ Recalcul depuis la SOURCE DE VÉRITÉ, jamais un incrément : un
  --    `current_stock + p_qty` accumulerait les dérives silencieusement.
  --    C'est la leçon du CUMP (vague 4c).
  UPDATE public.ingredients
  SET current_stock = (
        SELECT COALESCE(SUM(remaining_qty), 0)
        FROM public.ingredient_lots
        WHERE ingredient_id = p_ingredient_id AND status = 'active'
      ) - (
        SELECT COALESCE(SUM(qty_owed - settled_qty), 0)
        FROM public.ingredient_stock_debts
        WHERE ingredient_id = p_ingredient_id AND status = 'open'
      ),
      last_unit_cost = p_unit_cost
  WHERE id = p_ingredient_id;

  /**
   * ⭐⭐ ÉTAPE 4 : LA DÉPENSE COMPTABLE (09/08/2026)
   *
   * Sans elle, le module cuisine était comptablement BORGNE : un plat servi
   * crée une vente - donc son CA remonte dans « Comptabilité » - mais aucun
   * de ses coûts n'y entrait. Un plat vendu 1500 F avec 800 F de matière
   * apparaissait comme 1500 F de bénéfice pur, et plus le restaurant
   * marchait, plus le résultat comptable s'éloignait du réel.
   *
   * ⭐ CATÉGORIE DÉDIÉE `kitchen_supply`, jamais `supply`. Avec `supply`, cet
   * achat se fondrait dans les casiers de bière et deviendrait
   * indistinguable : impossible de répondre à « combien me coûte ma
   * cuisine ? ». Le chiffre existerait, noyé.
   *
   * ⭐ C'est l'ACHAT qui est compté, pas la consommation - même règle que les
   * boissons, où un casier acheté est une dépense immédiate et non au moment
   * où la bière se vend. C'est aussi ce que suit votre trésorerie : vous payez
   * le poisson à la livraison, qu'il soit servi ou non.
   *
   * ⛔⛔ DEUX GARDES, ET AUCUNE N'EST DÉFENSIVE PAR EXCÈS DE PRUDENCE :
   * chacune couvre un cas RÉEL où l'insertion échouerait et ferait perdre
   * TOUT l'approvisionnement, transaction oblige.
   *
   *   1. `v_expense_amount > 0` — `expenses.amount` porte `CHECK (amount > 0)`
   *      alors que cette RPC accepte `p_unit_cost = 0`. Un fournisseur qui
   *      OFFRE un sac de riz est un cas courant : sans cette garde, il
   *      deviendrait impossible de le saisir en stock.
   *
   *   2. `v_actor_id IS NOT NULL` — `expenses.created_by` est NOT NULL, et
   *      sous `service_role` l'acteur reste NULL (cf. commentaire plus haut).
   *      Les appros cuisine ne passent pas par la file offline aujourd'hui,
   *      mais un appel direct par clé de service échouerait sans cette garde.
   *
   * ⚠️ CONSÉQUENCE ASSUMÉE : dans ces deux cas, le stock entre SANS ligne
   * comptable. C'est le bon arbitrage - le stock est la fonction principale,
   * la comptabilité en est la conséquence. Un appro offert n'a d'ailleurs
   * rien coûté : ne rien enregistrer est JUSTE, pas un pis-aller.
   *
   * ⭐ PLACÉE APRÈS LE GARDE D'IDEMPOTENCE (ligne ~206) : un rejeu retourne
   * avant d'arriver ici, donc un retry réseau ne crée jamais deux dépenses.
   *
   * ⚠️ `related_supply_id` reste NULL : cette colonne référence `supplies`,
   * une table structurellement liée aux PRODUITS du bar (`product_id`). Un
   * appro cuisine n'y a pas sa place.
   */
  v_expense_amount := ROUND(p_qty * p_unit_cost, 2);

  IF v_expense_amount > 0 AND v_actor_id IS NOT NULL THEN
    INSERT INTO public.expenses (
      bar_id, amount, category, description,
      date, expense_date, created_by, notes
    ) VALUES (
      p_bar_id,
      v_expense_amount,
      'kitchen_supply',
      -- ⭐ `v_ingredient` est DEJA charge et valide plus haut (l.234) : une
      -- sous-requete referait la meme lecture, et son resultat pourrait
      -- differer si la ligne changeait entre-temps.
      format('Appro cuisine : %s', v_ingredient.name),
      NOW(),
      -- ⭐ La JOURNÉE COMMERCIALE, pas la date civile : un appro reçu à 2h du
      -- matin appartient au service de la veille, comme partout ailleurs.
      v_business_date,
      v_actor_id,
      p_notes
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot_id,                    -- NULL si tout a soldé des dettes
    'qty_received', p_qty,
    'qty_settled_debts', v_settled_total,
    'qty_stocked', v_remaining_qty,
    'idempotent_replay', false
  );

EXCEPTION
  -- ⭐ Une violation de contrainte n'est PAS une erreur ordinaire : elle
  --    signale un INVARIANT CASSÉ (dette sur-soldée, lot négatif, forfait
  --    incohérent). La confondre avec « ingrédient introuvable » ferait
  --    disparaître un bug de calcul derrière un message anodin.
  WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );
  WHEN OTHERS THEN
    -- ⚠️ Message SQL brut conservé : diagnostiquer un appro raté sans lui
    --    serait impossible (observabilité).
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.receive_ingredient_supply(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receive_ingredient_supply(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE, DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_ingredient_supply(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE, DATE, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La contrainte accepte la nouvelle valeur ET a gardé les anciennes :
-- SELECT pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--  WHERE conrelid='public.expenses'::regclass
--    AND conname='expenses_category_check';
--   → les 6 valeurs d'origine + 'kitchen_supply'. Si une manque : ARRÊTER,
--     des dépenses existantes deviendraient invalides au prochain UPDATE.
--
-- 2) La RPC existe toujours, en UN exemplaire, MÊME signature :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='receive_ingredient_supply';
--   → 1 ligne, args IDENTIQUES au pré-vol, prosecdef = true.
--   ⛔ 2 lignes = surcharge créée : l'application appellerait l'ancienne.
--
-- 3) ⛔ Les grants ont survécu :
-- SELECT has_function_privilege('anon',
--          'public.receive_ingredient_supply(uuid,uuid,numeric,numeric,text,date,date,text)',
--          'EXECUTE') AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.receive_ingredient_supply(uuid,uuid,numeric,numeric,text,date,date,text)',
--          'EXECUTE') AS auth_peut;
--   → anon_peut = false, auth_peut = true.
--
-- 4) ⚠️ LES DEUX GARDES SONT EN PLACE (commentaires retirés, sinon faux
--    positif - leçon du post-vol `loss_cost`). Sans elles, un appro OFFERT ou
--    un appel par clé de service échouerait ENTIÈREMENT :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'v_expense_amount > 0 AND v_actor_id IS NOT NULL' AS gardes_ok
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='receive_ingredient_supply';
--   → true.
--
-- 5) ⚠️ La dépense est créée APRÈS le garde d'idempotence - sinon un retry
--    réseau en créerait deux :
-- SELECT strpos(def, 'INSERT INTO public.expenses')
--      > strpos(def, 'idempotent_replay') AS ordre_correct
--   FROM (
--     SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^
]*', '', 'g') AS def
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.proname='receive_ingredient_supply'
--   ) t;
--   → true.
--   ⚠️ Version corrigée le 09/08/2026 : la première utilisait `position(...
--   in ...)` avec une apostrophe mal échappée - la requête échouait au lieu
--   de répondre. Un post-vol qui ne s'exécute pas ne vérifie rien.
--
-- 6) SMOKE TEST - le refus est ATTENDU (auth.uid() vaut NULL ici) :
-- SELECT public.receive_ingredient_supply(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1),
--   gen_random_uuid(), 1, 100, gen_random_uuid()::text);
--   → une erreur d'authentification ou d'ingrédient introuvable = garde OK.
--
-- 7) ⛔⛔ TEST RÉEL DEPUIS L'UI - le SEUL qui prouve que la RPC RÉPOND.
--    Leçon du 09/08 : `get_kitchen_losses` a passé cinq contrôles au vert sur
--    une fonction cassée, parce qu'aucun n'exécutait le corps.
--    a. saisir un appro cuisine de 10 kg à 500 F ;
--    b. Comptabilité → Dépenses : une ligne « Appro cuisine » à 5 000 F ;
--    c. le camembert porte une part « Appro cuisine » ;
--    d. la courbe Revenus/Coûts montre le coût monter ;
--    e. ⭐ saisir un appro à coût 0 → le stock entre, AUCUNE dépense, et
--       surtout AUCUNE erreur ;
--    f. ⭐ sur un bar SANS cuisine : aucune part, aucune ligne, aucun
--       changement - strictement identique à avant.
--
-- 8) ⚠️ SI LA COURBE « Revenus / Coûts » NE BOUGE PAS TOUT DE SUITE, c'est
--    NORMAL - pas un échec de la migration.
--    Les courbes lisent `expenses_summary_mat`, une vue MATÉRIALISÉE que rien
--    ne rafraîchit à l'INSERT (le trigger se contente d'un `pg_notify` que
--    personne n'écoute). Elle se rafraîchit au démarrage de l'app, si elle a
--    plus de 60 minutes.
--    ⭐ Pour forcer et vérifier tout de suite :
--      SELECT public.refresh_all_materialized_views('post_vol');
--      -- puis recharger l'écran Comptabilité.
--    ⚠️ Comportement PRÉEXISTANT, identique pour une facture d'électricité
--    saisie à la main. À ne pas confondre avec un défaut de ce chantier.

-- ===================================================================
-- MIGRATION : Débounce SERVEUR du refresh post_mutation
-- DATE   : 2026-09-14
-- MOTIF  : alerte Supabase "Disk IO Budget depleting"
-- ===================================================================
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POURQUOI CETTE MIGRATION                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Un débounce avait été posé côté NAVIGATEUR le 11/09 (commit c78be5b,
-- useSalesMutations.ts). Mesure du 14/09 : il ne fonctionne qu'en
-- partie.
--
--   ratio refresh/vente  : 0,99 avant  ->  0,86 après
--   post_mutation/jour   : ~95 avant   ->  47-63 après
--
-- Il filtre AU SEIN d'un appareil, mais la Map JavaScript vit dans un
-- onglet : chaque appareil, chaque onglet, chaque rechargement a la
-- sienne. Avec plusieurs serveurs qui vendent en parallèle sur le même
-- bar, rien n'est mutualisé.
--
-- ⭐ SECONDE ERREUR DE CETTE PREMIÈRE VERSION : elle était clé par
--    barId. Or ce RPC a la signature (p_view_name, p_triggered_by) —
--    AUCUN bar_id. REFRESH MATERIALIZED VIEW recalcule la vue ENTIÈRE.
--    Relevé du 14/09 : daily_sales_summary_mat contient 7 bars et
--    626 lignes. Deux bars distincts déclenchent donc le MÊME refresh.
--    => Le verrou doit être PAR VUE, jamais par bar.
--
-- GAIN ATTENDU : ~51 % du coût total de refresh (bloc 3 du 14/09,
-- mesuré sur 7 jours : 2321 s -> 1143 s).
--
-- ⚠️ CE N'EST PAS LA SOLUTION DE FOND. Le cron pèse 240 refresh/jour
--    contre 47-95 pour post_mutation, et daily_sales_summary porte à
--    elle seule 79,6 % du coût. La vraie correction est la migration de
--    getRevenueSummary vers les tables brutes (gain mesuré : 84 %),
--    dont la parité a été validée le 14/09 (0 écart sur 70 couples
--    bar/jour, 11 bars tous à closing_hour = 6).
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ SÉCURITÉ / RÉVERSIBILITÉ                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- • Le corps du RPC est repris À L'IDENTIQUE du relevé pg_get_functiondef
--   du 14/09, y compris SET search_path TO 'public', 'extensions' posé
--   par 20260703050000_vague4d_search_path_hardening.
--   ⭐ Leçon projet : les fichiers ne reflètent pas la prod. Ce corps
--      vient de la BASE, pas de 20260518000000.
--
-- • PRIVILÈGES : le pré-vol du 14/09 donne proacl = NULL, donc AUCUN
--   GRANT explicite — authenticated/anon/service_role héritent de
--   PUBLIC. Un CREATE OR REPLACE conserve ce cas : rien à restaurer.
--   Le post-vol le vérifie quand même.
--   ⚠️ anon_execute = true vient de l'héritage PUBLIC, PAS d'un GRANT.
--      Ne PAS le durcir ici : le durcissement RPC se fait au cas par
--      cas, jamais en effet de bord d'un autre chantier.
--
-- • BREAKING_CHANGE : NON.
-- • RLS_CHANGES     : AUCUN.
-- • IDEMPOTENT      : OUI (CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE).
--
-- ✅ EXÉCUTABLE PENDANT LE SERVICE : aucun VACUUM, aucun verrou long.
--    Le seul risque serait un refresh en vol au moment du REPLACE, que
--    PostgreSQL sérialise de lui-même.
-- ===================================================================


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — LA TABLE DE VERROU
-- ═══════════════════════════════════════════════════════════════════
--
-- Une ligne par vue. Pas de bar_id : voir l'explication en tête de
-- fichier — la vue est globale.

CREATE TABLE IF NOT EXISTS public.mat_view_refresh_lock (
    view_name        TEXT PRIMARY KEY,
    last_refresh_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ⭐ IF NOT EXISTS est silencieux si une table HOMONYME mais de structure
-- differente existe deja (ex. un brouillon anterieur cle par bar_id). Le
-- ON CONFLICT (view_name) du RPC leverait alors a CHAQUE vente. Le pre-vol
-- (bloc 4) a confirme l'absence d'une telle table, mais la migration doit
-- echouer bruyamment si elle est rejouee dans un environnement divergent.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'mat_view_refresh_lock'
      AND a.attname = 'view_name'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION
      'mat_view_refresh_lock existe mais n''a pas la colonne view_name — structure divergente, migration interrompue.';
  END IF;
END;
$guard$;

COMMENT ON TABLE public.mat_view_refresh_lock IS
'Verrou anti-rafale pour le refresh des vues materialisees. Une ligne par
vue (les vues sont globales, tous bars confondus). Empeche les refresh
post_mutation redondants declenches par plusieurs appareils en parallele.';

-- RLS : la table n'est jamais lue par le client. Seul le RPC
-- (SECURITY DEFINER) y accede. On active RLS sans policy permissive :
-- tout acces direct est donc refuse, le RPC passant outre via DEFINER.
ALTER TABLE public.mat_view_refresh_lock ENABLE ROW LEVEL SECURITY;

-- PUBLIC inclus : les privileges de table s'heritent de PUBLIC comme ceux
-- des fonctions (cf. note sur anon_execute en tete de fichier). Omettre
-- PUBLIC laisserait un acces residuel malgre le REVOKE nominatif.
REVOKE ALL ON TABLE public.mat_view_refresh_lock FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — LE RPC, AVEC LE VERROU
-- ═══════════════════════════════════════════════════════════════════
--
-- CE QUI CHANGE par rapport au corps relevé en base :
--   1. Un bloc de garde en tête, actif UNIQUEMENT pour
--      p_triggered_by = 'post_mutation'.
--   2. La mise à jour du verrou après un refresh réussi.
--
-- ⭐ CE QUI NE CHANGE PAS, VOLONTAIREMENT :
--   • 'cron'   n'est PAS debounce : c'est le filet de securite, il doit
--     passer meme si une vente vient d'en declencher un.
--   • 'manual' n'est PAS debounce : quand un utilisateur demande
--     explicitement un rafraichissement (useViewMonitoring.ts:108,
--     AccountingPage.tsx:38), il doit l'obtenir. Le debouncer
--     donnerait un bouton qui ne fait rien.
--   • Tout le reste du corps est repris a l'identique.

CREATE OR REPLACE FUNCTION public.refresh_materialized_view_with_logging(
  p_view_name TEXT,
  p_triggered_by TEXT DEFAULT 'manual'::text
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_log_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_row_count INTEGER;
  v_view_name_mat TEXT;
  v_last_refresh TIMESTAMPTZ;
  -- Valeur du verrou AVANT reservation, pour pouvoir la restaurer si le
  -- refresh echoue (voir le bloc EXCEPTION en fin de fonction).
  v_last_refresh_prev TIMESTAMPTZ;
  -- Fenetre de debounce. 60 s : une vente de plus dans la minute ne
  -- justifie pas de reecrire une vue de 626 lignes couvrant 7 bars.
  c_debounce_interval CONSTANT INTERVAL := INTERVAL '60 seconds';
BEGIN
  -- Guard 1 : rejeter les valeurs nulles/vides
  IF p_view_name IS NULL OR trim(p_view_name) = '' THEN
    RAISE EXCEPTION
      'refresh_materialized_view_with_logging: p_view_name ne peut pas être null ou vide';
  END IF;

  -- Guard 2 : rejeter les noms déjà suffixés en _mat pour éviter le double _mat_mat
  IF right(p_view_name, 4) = '_mat' THEN
    RAISE EXCEPTION
      'refresh_materialized_view_with_logging: passer le nom de base sans suffixe _mat (reçu: %)',
      p_view_name;
  END IF;

  -- ⚡ Guard 3 (NOUVEAU, 14/09/2026) : debounce des refresh post_mutation.
  --
  -- Le verrou est pose en base, donc partage par TOUS les appareils —
  -- contrairement au debounce navigateur de c78be5b, qui ne protegeait
  -- qu'un onglet.
  --
  -- Retourne NULL : l'appelant (AnalyticsService.refreshView) traite
  -- deja logId null sans erreur (il saute la verification de statut).
  --
  -- ⚠️ LIMITE ASSUMEE : aucune ligne de log n'est ecrite pour un refresh
  -- saute. Le log reste donc le reflet des refresh REELLEMENT executes —
  -- bon pour mesurer le cout, mais un echec REPETE y ressemble a une
  -- faible activite. get_view_freshness et materialized_view_metrics
  -- derivent tous deux de MAX(refresh_completed_at) FILTER (success) :
  -- c'est LA qu'une peremption se voit, pas dans le compteur de refresh.
  -- Le bloc EXCEPTION en fin de fonction relache le verrou sur echec,
  -- pour qu'un echec ne se propage pas en 60 s de silence.
  IF p_triggered_by = 'post_mutation' THEN
    -- ⭐ La DECISION est portee par l'ECRITURE, pas par un SELECT prealable.
    --
    -- Une premiere version faisait SELECT puis INSERT ... ON CONFLICT. En
    -- READ COMMITTED ces deux ordres ne sont pas atomiques : deux ventes
    -- simultanees depuis deux appareils lisaient toutes les deux un verrou
    -- expire et passaient toutes les deux. La garde fuyait exactement dans
    -- le scenario multi-appareils qui a motive cette migration.
    --
    -- Ici, le WHERE du DO UPDATE est evalue sous le verrou de ligne pris par
    -- ON CONFLICT : un seul appelant peut satisfaire la condition. Les
    -- autres ne mettent a jour aucune ligne, donc RETURNING ne renvoie rien.
    SELECT last_refresh_at INTO v_last_refresh_prev
    FROM mat_view_refresh_lock
    WHERE view_name = p_view_name;

    INSERT INTO mat_view_refresh_lock (view_name, last_refresh_at)
    VALUES (p_view_name, clock_timestamp())
    ON CONFLICT (view_name)
    DO UPDATE SET last_refresh_at = clock_timestamp()
    WHERE mat_view_refresh_lock.last_refresh_at
          < clock_timestamp() - c_debounce_interval
    RETURNING last_refresh_at INTO v_last_refresh;

    -- Aucune ligne affectee = un autre appelant detient la fenetre.
    IF v_last_refresh IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  v_view_name_mat := p_view_name || '_mat';

  -- 'running' : aligné avec CHECK ('running','success','failed','timeout') de 20251227221000
  INSERT INTO materialized_view_refresh_log (view_name, status, triggered_by)
  VALUES (p_view_name, 'running', p_triggered_by)
  RETURNING id INTO v_log_id;

  v_start_time := clock_timestamp();

  BEGIN
    -- CONCURRENTLY : pas de lock exclusif sur la vue pendant le refresh.
    -- Les requêtes utilisateurs continuent de lire la version actuelle pendant
    -- que la nouvelle version est construite en parallèle, puis swap atomique.
    -- Requiert un index UNIQUE sur chaque vue (vérifié pour les 6 vues
    -- rafraîchies par refresh_all_materialized_views).
    --
    -- Fallback : si CONCURRENTLY échoue (vue sans index unique, autre erreur),
    -- on retombe sur REFRESH classique pour préserver la fonctionnalité.
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', v_view_name_mat);
    EXCEPTION
      WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
        -- Fallback : la vue n'a pas d'index unique → REFRESH classique
        RAISE NOTICE '[%] CONCURRENTLY non supporté, fallback REFRESH classique', p_view_name;
        EXECUTE format('REFRESH MATERIALIZED VIEW %I', v_view_name_mat);
    END;

    v_end_time := clock_timestamp();
    v_duration_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;
    EXECUTE format('SELECT COUNT(*) FROM %I', v_view_name_mat) INTO v_row_count;

    -- 'success' : aligné avec la contrainte
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = v_end_time,
      duration_ms          = v_duration_ms,
      row_count            = v_row_count,
      status               = 'success'
    WHERE id = v_log_id;

    RAISE NOTICE '[%] Refresh completed in % ms (% rows)', p_view_name, v_duration_ms, v_row_count;

  EXCEPTION WHEN OTHERS THEN
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = clock_timestamp(),
      status               = 'failed',
      error_message        = SQLERRM
    WHERE id = v_log_id;

    -- ⭐ RELACHER LE VERROU : la reservation a ete posee AVANT le refresh
    -- (pour fermer la course multi-appareils). Sans cette annulation, un
    -- refresh en echec bloquerait 60 s de refresh legitimes — et comme ce
    -- bloc ne re-leve pas, l'echec serait silencieux. Le CA de l'Historique
    -- resterait perime tout en etant presente comme source de verite.
    --
    -- ⚠️ On NE restaure PAS v_last_refresh_prev tel quel : au tout premier
    -- refresh d'une vue la ligne n'existait pas, donc cette variable vaut
    -- NULL — et la colonne est NOT NULL. L'UPDATE echouerait A L'INTERIEUR
    -- du gestionnaire d'exception, masquant l'erreur d'origine par une
    -- violation de contrainte.
    -- On antidate donc le verrou hors de la fenetre : effet identique
    -- (le prochain appel passe), sans jamais ecrire NULL.
    IF p_triggered_by = 'post_mutation' THEN
      UPDATE mat_view_refresh_lock
      SET last_refresh_at = COALESCE(
            v_last_refresh_prev,
            clock_timestamp() - c_debounce_interval - INTERVAL '1 second'
          )
      WHERE view_name = p_view_name;
    END IF;

    RAISE WARNING '[%] Refresh failed: %', p_view_name, SQLERRM;
  END;

  RETURN v_log_id;
END;
$function$;

COMMENT ON FUNCTION public.refresh_materialized_view_with_logging IS
'Rafraichit une vue materialisee avec CONCURRENTLY et journalise le resultat.
Depuis le 14/09/2026 : les appels post_mutation sont debounces a 60 s par vue
via mat_view_refresh_lock (verrou en base, partage entre tous les appareils).
cron et manual ne sont jamais debounces.';


-- ═══════════════════════════════════════════════════════════════════
-- ÉTAPE 3 — POST-VOL (à exécuter et à me renvoyer)
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐ Leçon projet : apres tout CREATE OR REPLACE, verifier que les
--    privileges ont survecu.
--
-- ATTENDU (identique au pre-vol du 14/09) :
--   privileges_bruts     = NULL  (aucun GRANT explicite, heritage PUBLIC)
--   authenticated_execute = true
--   anon_execute          = true
--   service_role_execute  = true
--   security_definer      = true
--   search_path           = public, extensions

SELECT
    p.proname                                                  AS fonction,
    p.prosecdef                                                AS security_definer,
    p.proconfig                                                AS search_path,
    p.proacl::text                                             AS privileges_bruts,
    has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE')   AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_materialized_view_with_logging';


-- Verifier que la table de verrou est bien creee et protegee.
-- ATTENDU : rowsecurity = true, aucune policy (acces refuse a tous sauf
-- au RPC qui passe par SECURITY DEFINER).
SELECT
    c.relname                                   AS table_verrou,
    c.relrowsecurity                            AS rls_active,
    (SELECT COUNT(*) FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'mat_view_refresh_lock') AS nb_policies,
    -- ⭐ Prouver l'ACCES EFFECTIF, pas seulement la presence de RLS :
    -- rowsecurity=true + 0 policy bloque deja, mais un privilege residuel
    -- resterait invisible sans ces trois colonnes.
    -- ATTENDU : les trois a false.
    has_table_privilege('anon',          c.oid, 'SELECT') AS anon_select,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
    has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'mat_view_refresh_lock';


-- ═══════════════════════════════════════════════════════════════════
-- MESURE (à relancer 24 h après)
-- ═══════════════════════════════════════════════════════════════════
--
-- Reference AVANT (bloc 5 du pre-vol, 14/09) :
--   post_mutation/jour : 47 a 131 selon l'activite
--   ratio refresh/vente : ~0,86-1,14
--
-- ATTENDU APRES : le ratio doit tomber NETTEMENT sous 1, plafonne par
-- la fenetre de 60 s quel que soit le nombre d'appareils.
--
-- SELECT
--     s.business_date                                   AS journee,
--     COUNT(*)                                          AS ventes_validees,
--     (SELECT COUNT(*) FROM materialized_view_refresh_log m
--       WHERE m.triggered_by = 'post_mutation'
--         AND DATE(m.created_at) = s.business_date)     AS refresh,
--     ROUND((SELECT COUNT(*) FROM materialized_view_refresh_log m
--             WHERE m.triggered_by = 'post_mutation'
--               AND DATE(m.created_at) = s.business_date)::numeric
--           / NULLIF(COUNT(*), 0), 2)                   AS refresh_par_vente
-- FROM sales s
-- WHERE s.business_date > CURRENT_DATE - 14
--   AND s.status = 'validated'
-- GROUP BY s.business_date
-- ORDER BY s.business_date DESC;


-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
--
-- Pour revenir en arriere : reexecuter le corps releve le 14/09 par
-- pg_get_functiondef (sans le bloc Guard 3), puis :
--   DROP TABLE IF EXISTS public.mat_view_refresh_lock;
--
-- Alternative moins invasive, si le debounce pose probleme : porter
-- c_debounce_interval a INTERVAL '0 seconds' desactive le verrou sans
-- toucher a la structure.

-- =====================================================
-- MIGRATION: Purger les surcharges RPC ambiguës ou mortes
-- Date: 2026-07-03
-- Incident: "Could not choose the best candidate function between
--   public.reject_sale(p_sale_id => uuid, p_rejected_by => uuid) et
--   public.reject_sale(p_sale_id => uuid, p_rejected_by => uuid, p_note => text)"
--   → rejet de commande cassé en prod (serveur ET manager).
--
-- Cause racine: CREATE OR REPLACE avec une liste d'arguments modifiée ne
-- remplace PAS la fonction — il crée une surcharge. Quand le client omet un
-- paramètre optionnel (clé undefined strippée du JSON par supabase-js),
-- PostgREST ne peut plus départager les candidates → erreur PGRST300.
--
-- CERTIFICATION (2026-07-03, requêtes pg_proc + pg_get_functiondef +
-- pg_depend exécutées en prod, résultats revus ligne par ligne avant
-- d'écrire le moindre DROP) :
--   - pg_depend : AUCUNE dépendance (vue/trigger/fonction) sur les 12
--     variantes concernées → DROP sans risque de casser un objet tiers.
--   - Signatures ci-dessous copiées TELLES QUELLES depuis
--     pg_get_function_identity_arguments(oid), jamais retapées de mémoire.
--   - pg_stat_user_functions : tracking désactivé côté Supabase (calls=null
--     partout) → pas de signal d'usage runtime, décision basée uniquement
--     sur le corps SQL (pg_get_functiondef) + grep des appelants TS.
--
-- Traitement fonction par fonction :
--
--   1. reject_sale (oid 202450 à dropper) : la version 3-args (206969) fait
--      strictement tout ce que fait la 2-args, plus la gestion des notes.
--      Zéro appelant TS sur la 2-args. Cause du crash actif.
--
--   2. pay_ticket (oid 188708 à dropper) : la version 3-args (189833) fait
--      tout ce que fait la 2-args, PLUS la propagation payment_method vers
--      sales.payment_method (fix 20260213). Seul appelant TS
--      (tickets.service.ts:138) envoie p_payment_method. La 2-args était un
--      risque silencieux : un appel sans p_payment_method aurait pu router
--      vers l'ancienne fonction sans crash ni propagation comptable.
--
--   3. create_ticket (oids 188703, 189832, 189838 à dropper) : 4 variantes
--      en escalade stricte (ticket_number+lock à partir de la 2e,
--      idempotency_key+guard membership uniquement dans la 4e, oid 227281).
--      Seul appelant TS (tickets.service.ts, SyncManager.ts) envoie
--      p_idempotency_key → matche uniquement la 4e. Les 3 autres sont des
--      versions historiques mortes.
--
--   4. create_sale_with_promotions (oids 188704, 205818 — les DEUX à
--      dropper) : AUCUN appelant TS trouvé dans tout le repo (seul un
--      SELECT en commentaire dans une vieille migration). Remplacée par
--      create_sale_idempotent (20260326000000). Code mort complet.
--
--   5. get_bar_sales_cursor (oid 115353 timestamptz à dropper, 115377 date
--      conservée) : fix explicitement documenté dans MIGRATION_LOG.md:2139.
--      La comparaison de tuple (s.business_date, s.id) < (p_cursor_date,
--      p_cursor_id) exige que p_cursor_date soit du même type que
--      business_date (DATE), sinon la comparaison de tuple echoue/diverge.
--      Seul appelant TS (sales.service.ts:614) ne force aucun format —
--      la version DATE est la version corrigée et voulue.
--
-- VOLONTAIREMENT EXCLU DE CETTE MIGRATION : admin_as_get_bar_sales_cursor
-- (oids 115352 timestamptz / 115376 date). Corps quasi identiques à
-- get_bar_sales_cursor, mais le fix MIGRATION_LOG.md:2139 documente
-- explicitement CETTE fonction-là, pas sa jumelle admin — le choix DATE
-- pour admin_as_* est une inférence par analogie, pas une preuve directe.
-- Aucun appelant TS trouvé donc aucune urgence. À traiter séparément après
-- certification directe (relecture du corps + confirmation qu'aucun outil
-- admin externe ne l'appelle).
-- =====================================================

-- 1. reject_sale — garder (uuid, uuid, text DEFAULT NULL)
DROP FUNCTION IF EXISTS public.reject_sale(p_sale_id uuid, p_rejected_by uuid);

-- 2. pay_ticket — garder (uuid, uuid, text)
DROP FUNCTION IF EXISTS public.pay_ticket(p_ticket_id uuid, p_paid_by uuid);

-- 3. create_ticket — garder la variante à 8 params (avec p_idempotency_key)
DROP FUNCTION IF EXISTS public.create_ticket(p_bar_id uuid, p_created_by uuid, p_notes text, p_server_id uuid);
DROP FUNCTION IF EXISTS public.create_ticket(p_bar_id uuid, p_created_by uuid, p_notes text, p_server_id uuid, p_closing_hour integer);
DROP FUNCTION IF EXISTS public.create_ticket(p_bar_id uuid, p_created_by uuid, p_notes text, p_server_id uuid, p_closing_hour integer, p_table_number integer, p_customer_name text);

-- 4. create_sale_with_promotions — aucune version à garder (remplacée par create_sale_idempotent)
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(p_bar_id uuid, p_items jsonb, p_payment_method text, p_sold_by uuid, p_server_id uuid, p_status text, p_validated_by uuid, p_customer_name text, p_customer_phone text, p_notes text, p_business_date date, p_ticket_id uuid);
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(p_bar_id uuid, p_items jsonb, p_payment_method text, p_sold_by uuid, p_status text, p_customer_name text, p_customer_phone text, p_notes text, p_business_date date);

-- 5. get_bar_sales_cursor — garder la variante p_cursor_date DATE (fix documenté MIGRATION_LOG.md:2139)
DROP FUNCTION IF EXISTS public.get_bar_sales_cursor(p_bar_id uuid, p_limit integer, p_cursor_date timestamp with time zone, p_cursor_id uuid);

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

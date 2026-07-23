-- MIGRATION : Agent WhatsApp — tables wa_conversations + wa_leads
-- DATE: 2026-07-19
-- AUTHOR: BarTender
--
-- PROBLEM: L'agent commercial/support WhatsApp (Edge Function wa-webhook) a besoin de
--          persister l'historique des conversations (avec bascule bot/humain) et les
--          leads qualifiés (CRM léger). Aucune table n'existe pour cela.
-- IMPACT:  2 nouvelles tables hors périmètre multi-tenant bar (données propres à
--          l'éditeur, pas à un bar) : wa_conversations, wa_leads.
-- SOLUTION: - wa_conversations : 1 ligne par numéro WhatsApp, historique JSONB,
--             mode bot/humain/escalade_pending (l'admin peut reprendre la main)
--           - wa_leads : 1 lead par numéro (upsert par l'Edge Function via tool
--             enregistrer_lead), statut CRM simple
--           - RLS : super_admin uniquement (is_super_admin()). L'Edge Function
--             utilise service_role (bypass RLS) — AUCUN accès anon ni bar user.
--
-- BREAKING_CHANGE: NO (tables nouvelles uniquement)
-- TABLES_MODIFIED: wa_conversations (new), wa_leads (new)
-- RLS_CHANGES: nouvelles policies super_admin-only sur les 2 tables
-- À EXÉCUTER À LA MAIN dans le SQL Editor.
--
-- ============ PRÉ-VOL (exécuter seul AVANT, vérifier les résultats) ============
-- 1) Les helpers doivent exister (2 lignes attendues) :
--    SELECT proname FROM pg_proc
--    WHERE proname IN ('is_super_admin', 'update_updated_at_column');
-- 2) is_super_admin() doit être exécutable par authenticated (true attendu —
--    sinon les policies RLS ci-dessous échoueront avec "permission denied for
--    function" au lieu d'un simple filtrage) :
--    SELECT has_function_privilege('authenticated', 'is_super_admin()', 'EXECUTE');
-- 3) Les tables ne doivent PAS déjà exister (0 ligne attendue) :
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('wa_conversations', 'wa_leads');
-- ==============================================================================

BEGIN;

-- =====================================================
-- 1. TABLE wa_conversations — 1 ligne par numéro WhatsApp
-- =====================================================
-- phone : identifiant WhatsApp Meta (wa_id, ex: '2290155282525') — clé métier unique.
-- messages : tableau JSONB [{role:'user'|'assistant', content:text, ts:iso}, ...]
-- mode : 'bot' (répond auto) | 'humain' (admin a repris la main, bot muet)
--        | 'escalade_pending' (bot a transmis, bot muet en attendant l'admin)
-- escalade : dernier appel escalader_humain {motif, resume, urgence, ts} (info admin)

CREATE TABLE public.wa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  wa_name TEXT,
  profil TEXT NOT NULL DEFAULT 'inconnu'
    CHECK (profil IN ('inconnu', 'prospect', 'client')),
  mode TEXT NOT NULL DEFAULT 'bot'
    CHECK (mode IN ('bot', 'humain', 'escalade_pending')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalade JSONB,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_conversations IS
'Conversations de l''agent WhatsApp (commercial + support N1). Écrites par l''Edge Function wa-webhook (service_role). Lecture/écriture UI : super_admin uniquement.';

-- Liste "à traiter" de la page admin : conversations où le bot est muet
CREATE INDEX idx_wa_conversations_attention
  ON public.wa_conversations (mode)
  WHERE mode <> 'bot';

-- Tri antéchronologique de la liste admin
CREATE INDEX idx_wa_conversations_last_message
  ON public.wa_conversations (last_message_at DESC NULLS LAST);

CREATE TRIGGER trg_wa_conversations_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. TABLE wa_leads — CRM léger, 1 lead par numéro
-- =====================================================
-- Alimentée par le tool enregistrer_lead (upsert ON CONFLICT (phone) par l'Edge
-- Function : les champs se complètent au fil de la conversation).
-- volume_activite : texte libre (proxies terrain : casiers/semaine, affluence...),
-- jamais un "nombre de tickets/jour" (cf règles de discours).

CREATE TABLE public.wa_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  phone TEXT NOT NULL UNIQUE,
  nom_contact TEXT,
  nom_bar TEXT,
  ville TEXT,
  role TEXT CHECK (role IN ('promoteur', 'gerant', 'autre', 'inconnu')),
  taille_equipe INT CHECK (taille_equipe > 0),
  volume_activite TEXT,
  besoin_principal TEXT,
  niveau_interet TEXT NOT NULL DEFAULT 'froid'
    CHECK (niveau_interet IN ('froid', 'tiede', 'chaud')),
  statut TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (statut IN ('nouveau', 'contacte', 'demo_donnee', 'converti', 'perdu')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_leads IS
'Leads qualifiés par l''agent WhatsApp (tool enregistrer_lead, upsert par phone). statut = suivi CRM manuel par l''admin.';

CREATE INDEX idx_wa_leads_niveau_interet ON public.wa_leads (niveau_interet);
CREATE INDEX idx_wa_leads_statut ON public.wa_leads (statut);
CREATE INDEX idx_wa_leads_created_at ON public.wa_leads (created_at DESC);

CREATE TRIGGER trg_wa_leads_updated_at
  BEFORE UPDATE ON public.wa_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 3. RLS — super_admin uniquement
-- =====================================================
-- 🛡️ Ces tables ne relèvent PAS du multi-tenant bar : ce sont les données de
-- l'éditeur. Aucun promoteur/gérant/serveur ne doit y accéder.
-- L'Edge Function passe par service_role (bypass RLS) — c'est le chemin d'écriture
-- normal. Les policies ne concernent que l'UI admin (authenticated + super_admin).

ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_conversations_super_admin_all
  ON public.wa_conversations
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY wa_leads_super_admin_all
  ON public.wa_leads
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =====================================================
-- 4. GRANTS — authenticated seulement (RLS filtre ensuite), rien pour anon
-- =====================================================

REVOKE ALL ON public.wa_conversations FROM anon;
REVOKE ALL ON public.wa_leads FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_leads TO authenticated;

-- service_role : chemin d'écriture de l'Edge Function wa-webhook (bypass RLS).
-- Sans ce GRANT explicite, la fonction échoue avec "permission denied for table"
-- (42501) malgré service_role : les tables nouvellement créées n'accordent pas
-- automatiquement de privilèges à ce rôle.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_leads TO service_role;

COMMIT;

-- ============ POST-VOL (exécuter APRÈS, vérifier chaque résultat) =============
-- 1) RLS activé sur les 2 tables (relrowsecurity = true attendu) :
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('wa_conversations', 'wa_leads');
-- 2) Policies présentes (2 lignes attendues) :
--    SELECT tablename, policyname, roles FROM pg_policies
--    WHERE tablename IN ('wa_conversations', 'wa_leads');
-- 3) anon n'a AUCUN privilège (false partout attendu) :
--    SELECT
--      has_table_privilege('anon', 'public.wa_conversations', 'SELECT') AS anon_conv_select,
--      has_table_privilege('anon', 'public.wa_leads', 'SELECT')          AS anon_leads_select,
--      has_table_privilege('anon', 'public.wa_conversations', 'INSERT') AS anon_conv_insert,
--      has_table_privilege('anon', 'public.wa_leads', 'INSERT')          AS anon_leads_insert;
-- 4) authenticated a les privilèges table (true attendu — la RLS filtre ensuite) :
--    SELECT
--      has_table_privilege('authenticated', 'public.wa_conversations', 'SELECT') AS auth_conv,
--      has_table_privilege('authenticated', 'public.wa_leads', 'SELECT')          AS auth_leads;
--
-- ⚠️ SMOKE-TEST du guard super_admin : IMPOSSIBLE dans le SQL Editor
--    (auth.uid() = NULL ⇒ is_super_admin() = false pour tout le monde).
--    À tester via l'UI une fois la page /admin/whatsapp branchée :
--    - connecté super_admin : la liste des conversations se charge
--    - connecté promoteur : la requête sur wa_conversations renvoie 0 ligne
-- ==============================================================================

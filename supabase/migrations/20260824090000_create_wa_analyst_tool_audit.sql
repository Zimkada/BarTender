-- =====================================================
-- PROBLEM : le mode analyste WhatsApp expose des donnees reelles de bar
--   (CA, ventes, stocks, performance des serveurs) a travers 5 tools, sans
--   aucune trace de qui a demande quoi. L'etude (§7, "Auditabilite -
--   nouveau besoin absent du bot commercial") pose la journalisation comme
--   prerequis a toute ouverture a un vrai client (§10 etape 5) : en cas de
--   doute a posteriori, pouvoir verifier qu'aucun acces cross-bar n'a eu
--   lieu. C'est un filet de detection, PAS une preuve de correction du
--   design - la preuve reste structurelle (bar_id jamais expose au modele,
--   §3 ; guard is_bar_member sous session reelle, §6).
--
--   Second besoin, du §7bis : le vrai poste de cout du mode analyste n'est
--   pas les tokens Claude mais le volume de requetes Postgres, non
--   chiffrable a priori (il depend du volume de donnees du bar interroge,
--   pas du nombre de messages). D'ou duration_ms - la journalisation sert
--   aussi de tableau de bord de cout reel.
--
-- IMPACT : aucune donnee existante modifiee, aucun RPC ni table existante
--   touche. Nouvelle table seule.
--
-- POURQUOI PAS audit_logs (table generique existante, 027_ensure_missing_tables) :
--   ses colonnes user_name/user_role/description sont NOT NULL (le webhook
--   devrait joindre users + bar_members a chaque tool juste pour remplir un
--   libelle, et inventer une phrase narrative par tool - c'est un journal
--   machine, pas un evenement metier raconte), et son CHECK sur
--   related_entity_type est une liste fermee ('bar','user','product','sale',
--   'expense') sans valeur adaptee a un appel de tool. L'y forcer casserait
--   la contrainte ou obligerait a la modifier - donc a toucher une table
--   partagee avec l'app web pour un besoin qui lui est etranger.
--
-- ECRITURE : uniquement par wa-webhook sous service_role, jamais par l'app.
--   Table verrouillee comme wa_bar_links (RLS active, aucune policy, REVOKE
--   anon/authenticated) : le service_role contourne RLS par nature, tout
--   autre appelant se voit refuser l'acces.
-- =====================================================

BEGIN;

-- --- Pre-vol ---
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'wa_analyst_tool_audit'
  ) INTO v_exists;
  RAISE NOTICE 'PRE-VOL: wa_analyst_tool_audit existe deja ? % (attendu false).', v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'ECHEC: wa_analyst_tool_audit existe deja.';
  END IF;
END $$;

CREATE TABLE public.wa_analyst_tool_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Horodatage de FIN d'execution du tool (le moment ou la ligne est ecrite).
  -- Combine a duration_ms, il donne l'instant de debut par soustraction.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- L'identite resolue au moment de l'appel. Pas de FK sur bars/users :
  -- un journal d'audit ne doit JAMAIS perdre de lignes parce que le bar ou
  -- le compte a ete supprime depuis - c'est precisement dans ce cas qu'on a
  -- besoin de la trace. (wa_bar_links, elle, porte des FK ON DELETE CASCADE
  -- car c'est une table d'etat courant, pas d'historique.)
  bar_id UUID NOT NULL,
  user_id UUID NOT NULL,

  -- Numero WhatsApp appelant, format Meta (sans "+"), tel que recu du webhook.
  -- Permet de correler avec wa_conversations et de detecter un numero qui
  -- interrogerait un bar auquel il ne devrait plus avoir acces.
  phone_wa_id TEXT NOT NULL,

  -- Role revalide en direct par resolve_wa_bar_link a CET appel - pas le
  -- role_snapshot fige de wa_bar_links (voir le commentaire de cette
  -- colonne : jamais se fier au role fige). Volontairement TEXT sans CHECK :
  -- un journal enregistre ce qui s'est reellement passe, y compris une
  -- valeur inattendue - c'est justement le genre d'anomalie qu'on veut
  -- pouvoir lire, pas faire echouer l'ecriture du journal.
  role TEXT NOT NULL,

  tool_name TEXT NOT NULL,

  -- Parametres tels que fournis par le modele Claude, bornes en taille cote
  -- code avant insertion. On journalise l'input REEL (pas une version
  -- nettoyee) : l'interet d'audit est justement de voir ce que le modele a
  -- demande, y compris une demande aberrante. bar_id/user_id n'y figurent
  -- jamais par construction (§3) - s'ils y apparaissaient un jour, ce serait
  -- l'anomalie a detecter.
  tool_input JSONB,

  -- Succes du tool tel que retourne a Claude (le champ ok de executeTool).
  success BOOLEAN NOT NULL,

  -- Message d'erreur si echec, tronque cote code. NULL si succes.
  error_message TEXT,

  -- Duree TOTALE du tool en millisecondes, ceremonie de session Auth
  -- comprise (creation + revocation) - c'est la latence reellement subie par
  -- le promoteur pour ce tool, celle qui compte pour l'experience (§7bis :
  -- "un message WhatsApp qui met 8-10 secondes a repondre commence a sembler
  -- casse").
  duration_ms INTEGER NOT NULL,

  -- Duree du travail Postgres SEUL, hors ceremonie de session (§7bis :
  -- tableau de bord du cout RPC reel - "un bar a fort volume ne coute pas la
  -- meme chose qu'un bar test a 3 lignes", poste non chiffrable a priori).
  --
  -- Separee de duration_ms parce qu'un chiffre unique les confondrait : un
  -- bar lent et une session Auth lente produiraient la meme valeur, ce qui
  -- priverait la mesure de sa raison d'etre. L'ecart entre les deux colonnes
  -- donne directement le cout de la ceremonie de session.
  --
  -- NULL possible : les tools qui n'ouvrent pas de session (aucun aujourd'hui,
  -- mais rien ne l'interdit) et le cas ou la creation de session echoue avant
  -- toute requete - dans ce dernier cas il n'y a effectivement eu aucun
  -- travail Postgres a mesurer, et 0 serait un chiffre trompeur.
  work_ms INTEGER
);

COMMENT ON TABLE public.wa_analyst_tool_audit IS
'Journal des appels de tools du mode analyste WhatsApp (quel bar, quel tool, quels parametres, '
'horodatage, duree) - whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §7 et §10 etape 5. '
'Filet de detection d''incident (acces cross-bar) et tableau de bord de cout RPC reel (§7bis), '
'jamais une preuve de correction du design - celle-ci reste structurelle (§3, §6). '
'Ecrite uniquement par wa-webhook sous service_role. Sans FK vers bars/users : un journal '
'ne doit pas perdre de lignes quand le bar ou le compte est supprime. '
'Les tools commerciaux (bot Aicha) ne sont PAS journalises ici - aucune donnee sensible en jeu.';

-- Requete d'audit principale : "tout ce qu'a fait ce bar, du plus recent au
-- plus ancien" - le cas d'usage de l'enquete a posteriori.
CREATE INDEX idx_wa_analyst_audit_bar_date
  ON public.wa_analyst_tool_audit (bar_id, created_at DESC);

-- Detection cross-bar : "ce numero a-t-il interroge plusieurs bar_id ?"
CREATE INDEX idx_wa_analyst_audit_phone_date
  ON public.wa_analyst_tool_audit (phone_wa_id, created_at DESC);

-- Meme verrouillage que wa_bar_links : RLS active SANS aucune policy, donc
-- tout role soumis a RLS se voit refuser l'acces par defaut. service_role
-- contourne RLS par nature et reste seul a pouvoir ecrire/lire.
ALTER TABLE public.wa_analyst_tool_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wa_analyst_tool_audit FROM PUBLIC;
REVOKE ALL ON public.wa_analyst_tool_audit FROM anon;
REVOKE ALL ON public.wa_analyst_tool_audit FROM authenticated;

-- ⚠️ CORRECTIF (code review, 24/08/2026, avant execution) : ce GRANT
-- manquait dans la premiere version de ce fichier. service_role contourne
-- RLS, mais PAS les privileges de table - une table fraichement creee
-- n'accorde rien a service_role automatiquement. Sans ce GRANT, chaque
-- INSERT du webhook aurait echoue en 42501, silencieusement (l'erreur est
-- avalee par logAnalystToolCall, non-bloquant par conception) : le journal
-- serait reste vide indefiniment alors que tout semblait fonctionner.
-- Piege deja documente noir sur blanc dans ce projet
-- (20260719000000_create_whatsapp_agent_tables.sql:150-153) et deja applique
-- sur wa_bar_links (GRANT ALL TO service_role, ligne 104) - la premiere
-- version de ce fichier affirmait pourtant "verrouillee comme wa_bar_links"
-- en omettant exactement le GRANT qui la rend fonctionnelle.
--
-- SELECT + INSERT seulement (pas UPDATE/DELETE) : un journal d'audit est
-- append-only par nature. Le webhook n'a aucune raison de modifier ou
-- supprimer une ligne deja ecrite, et ne pas lui en donner le pouvoir est
-- une garantie de plus sur l'integrite de la trace.
GRANT SELECT, INSERT ON public.wa_analyst_tool_audit TO service_role;

NOTIFY pgrst, 'reload schema';

-- --- Post-vol ---
DO $$
DECLARE
  v_rls BOOLEAN;
  v_policies INTEGER;
  v_anon_sel BOOLEAN;
  v_anon_ins BOOLEAN;
  v_auth_sel BOOLEAN;
  v_auth_ins BOOLEAN;
  v_svc_sel BOOLEAN;
  v_svc_ins BOOLEAN;
  v_indexes INTEGER;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'wa_analyst_tool_audit';

  SELECT COUNT(*) INTO v_policies
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'wa_analyst_tool_audit';

  SELECT has_table_privilege('anon', 'public.wa_analyst_tool_audit', 'SELECT') INTO v_anon_sel;
  SELECT has_table_privilege('anon', 'public.wa_analyst_tool_audit', 'INSERT') INTO v_anon_ins;
  SELECT has_table_privilege('authenticated', 'public.wa_analyst_tool_audit', 'SELECT') INTO v_auth_sel;
  SELECT has_table_privilege('authenticated', 'public.wa_analyst_tool_audit', 'INSERT') INTO v_auth_ins;
  SELECT has_table_privilege('service_role', 'public.wa_analyst_tool_audit', 'SELECT') INTO v_svc_sel;
  SELECT has_table_privilege('service_role', 'public.wa_analyst_tool_audit', 'INSERT') INTO v_svc_ins;

  SELECT COUNT(*) INTO v_indexes
  FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'wa_analyst_tool_audit';

  RAISE NOTICE 'POST-VOL: RLS active: % (attendu true), policies: % (attendu 0)', v_rls, v_policies;
  RAISE NOTICE 'POST-VOL: anon SELECT/INSERT: %/% (attendu false/false)', v_anon_sel, v_anon_ins;
  RAISE NOTICE 'POST-VOL: authenticated SELECT/INSERT: %/% (attendu false/false)', v_auth_sel, v_auth_ins;
  RAISE NOTICE 'POST-VOL: service_role SELECT/INSERT: %/% (attendu true/true)', v_svc_sel, v_svc_ins;
  RAISE NOTICE 'POST-VOL: index: % (attendu 3 - pkey + 2 index d''audit)', v_indexes;

  IF NOT v_rls THEN
    RAISE EXCEPTION 'ECHEC: RLS non active sur wa_analyst_tool_audit.';
  END IF;
  IF v_policies <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % policy(ies) sur wa_analyst_tool_audit (attendu 0 - le verrouillage repose sur RLS sans policy).', v_policies;
  END IF;
  IF v_anon_sel OR v_anon_ins OR v_auth_sel OR v_auth_ins THEN
    RAISE EXCEPTION 'ECHEC: anon ou authenticated a un acces sur wa_analyst_tool_audit.';
  END IF;
  -- ⚠️ Assertion POSITIVE ajoutee au meme correctif (code review, 24/08/2026) :
  -- sans elle, le GRANT service_role manquant passait le post-vol en vert.
  -- Un journal d'audit qu'on ne peut pas ecrire est pire qu'absent : il
  -- donne l'illusion d'une tracabilite qui n'existe pas.
  IF NOT (v_svc_sel AND v_svc_ins) THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut pas lire/ecrire wa_analyst_tool_audit - le webhook ne pourrait rien journaliser.';
  END IF;
  -- Meme trou "post-vol vert" que le GRANT ci-dessus : un compte affiche mais
  -- jamais asserte ne verifie rien. Les 2 index d'audit portent les seules
  -- requetes pour lesquelles cette table existe (historique d'un bar,
  -- detection cross-bar par numero) - sans eux elle grossit sans etre
  -- interrogeable utilement.
  IF v_indexes <> 3 THEN
    RAISE EXCEPTION 'ECHEC: % index sur wa_analyst_tool_audit (attendu 3 - pkey + idx bar/date + idx phone/date).', v_indexes;
  END IF;

  RAISE NOTICE 'OK wa_analyst_tool_audit creee, verrouillee (service_role seul).';
END $$;

COMMIT;

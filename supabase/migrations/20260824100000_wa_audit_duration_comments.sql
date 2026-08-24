-- =====================================================
-- PROBLEM : la mutualisation de la session analyste (24/08/2026,
--   wa-webhook/index.ts) change ce que mesurent duration_ms et work_ms de
--   wa_analyst_tool_audit, sans changer les colonnes elles-memes. La
--   migration d'origine (20260824090000) decrit l'ancien comportement dans
--   ses commentaires de CREATE TABLE - or ceux-ci ne sont pas poses en base,
--   donc quelqu'un qui inspecte la table depuis le SQL Editor n'a AUCUNE
--   indication de ce que ces deux colonnes contiennent reellement, ni du
--   fait que leur semantique a change en cours de vie de la table.
--
--   Le risque est une analyse fausse, pas une panne : lire
--   duration_ms - work_ms comme "le cout de ceremonie de ce tool" sous-
--   estimerait desormais ce cout (la revocation n'est plus imputee a aucun
--   tool, et la creation n'est payee que par le premier tool du message).
--
-- IMPACT : aucune donnee modifiee, aucune colonne ajoutee/supprimee/retypee.
--   Uniquement des COMMENT ON COLUMN - metadonnees pures.
--
-- POURQUOI UNE MIGRATION SEPAREE plutot que corriger 20260824090000 :
--   cette derniere est DEJA EXECUTEE en production. Modifier son fichier ne
--   changerait rien en base (les migrations ne sont pas rejouees) et ferait
--   diverger le fichier de ce qui a reellement tourne. Le fichier d'origine
--   est corrige pour sa valeur documentaire, mais l'etat reel de la base se
--   corrige ici.
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
  IF NOT v_exists THEN
    RAISE EXCEPTION 'ECHEC: wa_analyst_tool_audit absente - executer 20260824090000 d abord.';
  END IF;
END $$;

COMMENT ON COLUMN public.wa_analyst_tool_audit.duration_ms IS
'Latence totale du tool en ms, telle que subie par le promoteur. '
'ATTENTION - ce qu''elle inclut a change le 24/08/2026 (mutualisation de session) : '
'avant, une session Auth etait creee ET revoquee par tool, donc duration_ms incluait les deux a chaque ligne ; '
'depuis, la session est mutualisee sur le message, donc la CREATION n''est payee que par le PREMIER tool du message '
'(les suivants ont duration_ms proche de work_ms) et la REVOCATION n''est imputee a aucun tool (elle a lieu apres la boucle). '
'Ne pas comparer des lignes d''avant et d''apres cette date sur ce critere. '
'Ne pas lire duration_ms - work_ms comme le cout de ceremonie du tool : c''est le cout de CREATION, sur le premier tool du message seulement.';

COMMENT ON COLUMN public.wa_analyst_tool_audit.work_ms IS
'Duree du travail Postgres seul, hors ceremonie de session Auth - le poste de cout RPC reel du §7bis '
'(un bar a fort volume ne coute pas la meme chose qu''un bar test). Semantique INCHANGEE par la mutualisation '
'du 24/08/2026 : cette colonne mesure la meme chose avant et apres, elle reste donc comparable sur toute la duree de vie de la table. '
'NULL si le tool n''a ouvert aucune session ou si la creation de session a echoue avant toute requete (0 serait trompeur).';

COMMIT;

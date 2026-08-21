-- =====================================================
-- PROBLEM : resolve_wa_bar_link() (deja en prod, 20260821110000) autorise
--   bm.role IN ('super_admin', 'promoteur', 'gerant'). Mais en ecrivant
--   request_wa_bar_link() (20260822090000, le flux d'opt-in reel), un
--   code review multi-angle a trouve que 'super_admin' ne peut en
--   pratique JAMAIS aboutir a un lien valide : wa_bar_links.role_snapshot
--   porte un CHECK constraint (20260821090000:56) qui n'autorise que
--   ('promoteur', 'gerant', 'serveur') - 'super_admin' en est absent.
--   request_wa_bar_link() a donc ete corrigee pour exclure super_admin de
--   sa propre allowlist (sinon l'INSERT violerait ce CHECK). Consequence :
--   aucun lien role_snapshot='super_admin' ne peut jamais exister en
--   base - le 'super_admin' dans l'allowlist de resolve_wa_bar_link est
--   donc du code mort, et pire, une divergence entre les 2 fonctions qui
--   sont censees appliquer la meme regle de defense en profondeur (§5 de
--   l'etude).
--
-- IMPACT : wa_bar_links reste vide en prod a ce jour (le flux d'opt-in
--   n'a pas encore ete branche a une Edge Function reelle) - cette
--   migration ne modifie aucune donnee, uniquement le corps de la
--   fonction. CREATE OR REPLACE avec meme signature : privileges
--   (service_role uniquement) devraient survivre, re-verifies au
--   post-vol.
--
-- SOLUTION : retirer 'super_admin' de l'allowlist de resolve_wa_bar_link,
--   pour qu'elle reste identique a celle de request_wa_bar_link
--   (promoteur, gerant uniquement) - les deux fonctions qui appliquent la
--   meme regle de defense en profondeur doivent rester strictement
--   coherentes entre elles, sinon la divergence elle-meme devient une
--   source de confusion future (laquelle des deux listes est la bonne
--   reference ?).
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_wa_bar_link(p_phone_wa_id TEXT)
RETURNS TABLE (
  bar_id UUID,
  user_id UUID,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.bar_id,
    l.user_id,
    bm.role
  FROM public.wa_bar_links l
  JOIN public.bar_members bm ON bm.user_id = l.user_id AND bm.bar_id = l.bar_id
  WHERE l.phone_wa_id = p_phone_wa_id
    AND l.revoked_at IS NULL
    AND l.verified_at IS NOT NULL
    AND l.is_active_link = true
    AND bm.is_active = true
    AND bm.role IN ('promoteur', 'gerant');
END;
$$;

COMMENT ON FUNCTION public.resolve_wa_bar_link(TEXT) IS
'Point d''entree UNIQUE pour resoudre un numero WhatsApp en (bar_id, role) - ne renvoie QUE le '
'lien actif (is_active_link = true), au plus une ligne par numero, jamais un choix ambigu entre '
'plusieurs bars lies. Allowlist explicite (promoteur, gerant uniquement - PAS super_admin, '
'retire le 22/08/2026 : wa_bar_links.role_snapshot ne peut de toute facon jamais valoir '
'super_admin, CHECK constraint 20260821090000:56, donc aucun lien super_admin ne peut exister - '
'garder super_admin ici aurait ete du code mort et une divergence avec request_wa_bar_link) - '
'echoue FERME sur tout role non liste (serveur, cuisinier, super_admin, ou futur) - defense en '
'profondeur, §5 de l''etude. Revalide bar_members.is_active ET bar_members.role a chaque appel '
'(pas seulement a la creation du lien). A appeler depuis wa-webhook (service_role) uniquement - '
'jamais exposee a authenticated/anon : le numero WhatsApp n''est pas une preuve d''identite '
'verifiable par RLS classique.';

-- Pas de nouveau GRANT/REVOKE : signature inchangee, privileges deja
-- poses devraient survivre - re-verifies ci-dessous.

-- Test fonctionnel du predicat, meme discipline que 20260821110000 :
-- verifie explicitement que super_admin est desormais exclu, en plus de
-- serveur et cuisinier.
DO $$
DECLARE
  v_role TEXT;
  v_allowed BOOLEAN;
  v_expected BOOLEAN;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['super_admin', 'promoteur', 'gerant', 'serveur', 'cuisinier']
  LOOP
    v_allowed := v_role IN ('promoteur', 'gerant');
    v_expected := v_role NOT IN ('super_admin', 'serveur', 'cuisinier');
    RAISE NOTICE 'POST-VOL predicat -- role % : autorise = % (attendu %)', v_role, v_allowed, v_expected;
    IF v_allowed <> v_expected THEN
      RAISE EXCEPTION 'ECHEC: le predicat d''allowlist ne se comporte pas comme attendu pour le role %.', v_role;
    END IF;
  END LOOP;
  RAISE NOTICE '✅ Predicat d''allowlist verifie : super_admin desormais exclu, coherent avec request_wa_bar_link.';
END $$;

DO $$
DECLARE
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
  v_service_fn BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_auth_fn;
  SELECT has_function_privilege('service_role', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_service_fn;

  RAISE NOTICE 'POST-VOL resolve_wa_bar_link -- anon: % (attendu false), authenticated: % (attendu false), service_role: % (attendu true)',
    v_anon_fn, v_auth_fn, v_service_fn;

  IF v_anon_fn OR v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: resolve_wa_bar_link accessible par anon ou authenticated apres le CREATE OR REPLACE.';
  END IF;
  IF NOT v_service_fn THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut plus executer resolve_wa_bar_link.';
  END IF;

  RAISE NOTICE '✅ resolve_wa_bar_link harmonisee avec request_wa_bar_link (promoteur, gerant uniquement).';
END $$;

COMMIT;

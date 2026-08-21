-- =====================================================
-- PROBLEM : wa_conversations est UNIQUE(phone) en production depuis le
--   19/07/2026 (20260719000000_create_whatsapp_agent_tables.sql:48), et
--   le webhook charge une conversation par phone seul
--   (wa-webhook/index.ts:443, .eq('phone', phone).maybeSingle()). Un
--   numero = une seule conversation aujourd'hui.
--
--   Le futur agent analyste (§4bis de l'etude) doit permettre a un
--   promoteur multi-bar de lier plusieurs bars a un meme numero
--   (wa_bar_links, migration precedente). Sans evolution de cette table,
--   un promoteur lie a deux bars verrait ses deux contextes fusionnes
--   dans un seul historique de conversation, avec un seul mode/escalade -
--   risque de confusion contextuelle et, si un tool repond en se basant
--   sur un mauvais bar resolu depuis cet historique melange, de fuite
--   indirecte entre bars.
--
-- IMPACT : table DEJA EN PRODUCTION avec ~1 mois de conversations reelles
--   (agent commercial Aicha). Cette migration ajoute une colonne nullable
--   et un index compose - AUCUNE ligne existante n'est modifiee (bar_id
--   reste NULL partout, comportement commercial inchange). Le code du
--   webhook n'est PAS modifie par cette migration : wa-webhook continue
--   de charger par .eq('phone', phone) exactement comme avant, ce qui
--   revient a toujours cibler la ligne bar_id IS NULL (garanti unique par
--   le nouvel index partiel ci-dessous, qui remplace l'ancienne contrainte
--   UNIQUE(phone) globale). Aucune regression possible sur le bot
--   commercial tant que le code n'est pas modifie pour lire/ecrire bar_id.
--
-- SOLUTION : bar_id UUID REFERENCES bars(id), NULLABLE (NULL = conversation
--   commerciale actuelle, non-NULL = conversation analyste liee a un bar).
--   Remplacer l'UNIQUE(phone) global par deux index uniques partiels :
--   (phone) WHERE bar_id IS NULL (au plus une conversation commerciale
--   par numero, comportement actuel preserve a l'identique) et
--   (phone, bar_id) WHERE bar_id IS NOT NULL (au plus une conversation
--   analyste par couple numero+bar). Voir §4bis de l'etude.
-- =====================================================

BEGIN;

-- --- Pre-vol : capturer l'etat actuel pour comparaison post-vol ---
DO $$
DECLARE
  v_count_before BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count_before FROM public.wa_conversations;
  RAISE NOTICE 'PRE-VOL: % conversations existantes avant migration.', v_count_before;
END $$;

-- --- 1. Ajouter la colonne bar_id, nullable ---
ALTER TABLE public.wa_conversations
  ADD COLUMN bar_id UUID REFERENCES public.bars(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.wa_conversations.bar_id IS
'NULL = conversation en mode commercial/support (comportement actuel, Aicha). '
'Non-NULL = conversation en mode analyste liee a ce bar precis (chantier futur, non implemente). '
'Voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4bis.';

-- --- 2. Remplacer la contrainte UNIQUE(phone) globale par 2 index partiels ---
-- La contrainte UNIQUE(phone) a ete posee inline dans la colonne (NOT NULL
-- UNIQUE) le 19/07 sans nom explicite : Postgres genere par convention
-- wa_conversations_phone_key, mais on la retrouve dynamiquement via
-- pg_constraint plutot que de supposer ce nom en dur, pour que cette
-- migration ne casse jamais sur une divergence de nommage reelle. On la
-- retire et la remplace par les 2 index partiels du §4bis - strictement
-- equivalente pour bar_id IS NULL, donc aucune ligne existante ne peut
-- violer la nouvelle contrainte (toutes ont bar_id NULL a ce stade, ajoute
-- a l'etape 1 ci-dessus).
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.wa_conversations'::regclass
    AND contype = 'u'
    AND (
      SELECT array_agg(attname ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.wa_conversations'::regclass
        AND attnum = ANY(conkey)
    ) = ARRAY['phone'];

  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'ECHEC: aucune contrainte UNIQUE sur (phone) trouvee sur wa_conversations - le schema a peut-etre deja change.';
  END IF;

  EXECUTE format('ALTER TABLE public.wa_conversations DROP CONSTRAINT %I', v_constraint_name);
  RAISE NOTICE 'Contrainte UNIQUE(phone) supprimee : %', v_constraint_name;
END $$;

CREATE UNIQUE INDEX idx_wa_conversations_phone_commercial
  ON public.wa_conversations (phone)
  WHERE bar_id IS NULL;

CREATE UNIQUE INDEX idx_wa_conversations_phone_bar_analyste
  ON public.wa_conversations (phone, bar_id)
  WHERE bar_id IS NOT NULL;

CREATE INDEX idx_wa_conversations_bar_id
  ON public.wa_conversations (bar_id)
  WHERE bar_id IS NOT NULL;

-- --- Post-vol : non-regression + conformite des nouvelles contraintes ---
DO $$
DECLARE
  v_count_after BIGINT;
  v_count_null_bar BIGINT;
  v_count_non_null_bar BIGINT;
  v_old_constraint_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_count_after FROM public.wa_conversations;
  SELECT COUNT(*) INTO v_count_null_bar FROM public.wa_conversations WHERE bar_id IS NULL;
  SELECT COUNT(*) INTO v_count_non_null_bar FROM public.wa_conversations WHERE bar_id IS NOT NULL;

  -- Meme logique dynamique que l'etape 2 (pas de nom en dur) : verifie
  -- qu'aucune contrainte UNIQUE portant uniquement sur (phone) ne subsiste.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wa_conversations'::regclass
      AND contype = 'u'
      AND (
        SELECT array_agg(attname ORDER BY attnum)
        FROM pg_attribute
        WHERE attrelid = 'public.wa_conversations'::regclass
          AND attnum = ANY(conkey)
      ) = ARRAY['phone']
  ) INTO v_old_constraint_exists;

  RAISE NOTICE 'POST-VOL: % conversations apres migration (attendu = meme nombre qu''avant).', v_count_after;
  RAISE NOTICE 'POST-VOL: % avec bar_id NULL (attendu = TOUTES, aucune migree en mode analyste par ce script), % avec bar_id NOT NULL (attendu 0).',
    v_count_null_bar, v_count_non_null_bar;
  RAISE NOTICE 'POST-VOL: ancienne contrainte UNIQUE(phone) encore presente ? % (attendu false).', v_old_constraint_exists;

  IF v_count_non_null_bar <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % conversation(s) ont deja un bar_id non NULL - inattendu, cette migration ne doit rien assigner.', v_count_non_null_bar;
  END IF;
  IF v_old_constraint_exists THEN
    RAISE EXCEPTION 'ECHEC: l''ancienne contrainte UNIQUE(phone) existe toujours.';
  END IF;

  -- Verifier qu'un doublon (phone, bar_id NULL) serait bien rejete par le
  -- nouvel index (preuve fonctionnelle, pas juste declarative). Si la table
  -- est vide, le SELECT source ne produit aucune ligne : l'INSERT n'insere
  -- rien et ne leve rien - dans ce cas precis le test est juste sans objet
  -- (pas de conversation existante pour fabriquer un doublon), pas un echec.
  IF v_count_after > 0 THEN
    BEGIN
      INSERT INTO public.wa_conversations (phone, wa_name)
      SELECT phone, 'TEST_POSTVOL_DOIT_ECHOUER' FROM public.wa_conversations WHERE bar_id IS NULL LIMIT 1;
      RAISE EXCEPTION 'ECHEC: l''index unique partiel (phone) WHERE bar_id IS NULL n''a pas empeche un doublon.';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE '✅ Index unique partiel commercial confirme fonctionnel (doublon rejete comme attendu).';
    END;
  ELSE
    RAISE NOTICE 'INFO: table vide - test de doublon sans objet (aucune conversation existante a dupliquer).';
  END IF;

  RAISE NOTICE '✅ Migration wa_conversations multi-bar appliquee sans regression sur les conversations existantes.';
END $$;

COMMIT;

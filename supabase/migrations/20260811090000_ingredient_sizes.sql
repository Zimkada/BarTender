-- ═══════════════════════════════════════════════════════════════════════
-- TAILLES D'INGRÉDIENT ET RAPPROCHEMENT CARTON ↔ VENTES — §19.6
-- 11/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- LE BESOIN, remonté du terrain et déjà pratiqué au cahier.
--
-- Un carton de poisson est acheté EN GROS, à un prix global. À la réception,
-- le restaurateur TRIE et compte : « ce carton a 12 grands, 20 moyens,
-- 8 petits ». Ce comptage ne sert PAS à valoriser — il sert au CONTRÔLE A
-- POSTERIORI : si 18 grands ont été vendus alors que le carton n'en contenait
-- que 12, il y a un problème.
--
-- ⛔⛔ CE QUE CE MÉCANISME NE FAIT PAS, ET NE DOIT JAMAIS FAIRE :
--
--   · IL NE VALORISE RIEN. Le carton entre à son prix global, chaque poisson
--     porte le même coût moyen (CUMP). Répartir ce prix entre les tailles
--     exigerait une clé que PERSONNE ne possède - vous n'avez pas payé les
--     gros plus cher. Toute répartition serait un chiffre INVENTÉ qui se
--     propagerait ensuite dans les marges, avec l'apparence de la précision.
--   · IL NE DÉCOMPTE PAS DE STOCK. Vendre un « Grand » retire UN poisson du
--     stock commun, pas « un grand poisson ». Le stock ne se scinde pas.
--   · IL NE BLOQUE JAMAIS UNE VENTE. Vendre 18 grands quand le carton en
--     contenait 12 passe, et l'écart apparaît au rapprochement. C'est le
--     §4.4 : le stock n'est jamais bloquant.
--
-- ⭐ POURQUOI LES TAILLES VIVENT SUR L'INGRÉDIENT ET NON SUR LE PLAT.
-- Un même carton alimente PLUSIEURS plats - poisson braisé ET poisson frit.
-- « Grand » est une caractéristique du POISSON, pas d'une recette. Les poser
-- sur le plat obligerait à les saisir deux fois et rendrait le rapprochement
-- incapable d'additionner les ventes des deux plats.
--
-- ⭐ POURQUOI UNE ASSOCIATION EXPLICITE ET NON UN RAPPROCHEMENT PAR LE NOM.
-- Deux libellés identiques ne garantissent rien : un « Grand » de poisson et
-- un « Grand » de poulet n'ont aucun rapport, et un renommage casserait le
-- lien EN SILENCE. Le gérant déclare donc que le format « Grand » de Poisson
-- braisé consomme la taille « Grand » du poisson - un lien par IDENTIFIANT.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Les tables cibles existent
--   SELECT to_regclass('public.ingredients')          AS t_ing,
--          to_regclass('public.ingredient_lots')      AS t_lots,
--          to_regclass('public.dish_price_options')   AS t_options;
--   -- ATTENDU : les 3 non NULL
--
--   -- 2. Aucune des tables de cette migration n'existe déjà
--   SELECT to_regclass('public.ingredient_sizes')        AS s1,
--          to_regclass('public.ingredient_lot_counts')   AS s2,
--          to_regclass('public.price_option_sizes')      AS s3;
--   -- ATTENDU : les 3 NULL

BEGIN;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. LES TAILLES D'UN INGRÉDIENT                                   │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE public.ingredient_sizes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  -- ⚠️ CASCADE : une taille n'a aucun sens sans son ingrédient.
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,

  -- « Grand », « Moyen », « Petit » - les mots du restaurateur, pas les nôtres.
  label         TEXT NOT NULL CHECK (length(trim(label)) > 0),

  sort_order    INTEGER NOT NULL DEFAULT 0,

  /**
   * ⭐ RETRAIT RÉVERSIBLE, aligné sur tout le module (dishes, ingredients,
   * dish_price_options). Une taille retirée doit rester lisible dans
   * l'historique : « combien de Grands ai-je reçus en juillet ? » ne doit pas
   * cesser de répondre parce que le restaurateur a changé son tri.
   */
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⛔ Deux tailles homonymes rendraient le comptage ambigu à la réception.
  CONSTRAINT is_label_unique_per_ingredient UNIQUE (ingredient_id, label)
);

CREATE INDEX idx_is_ingredient_active
  ON public.ingredient_sizes (ingredient_id, sort_order)
  WHERE is_active = TRUE;

COMMENT ON TABLE public.ingredient_sizes IS
  '§19.6 — tailles d''un ingrédient acheté en gros (Grand / Moyen / Petit…). '
  '⭐ Sur l''INGRÉDIENT et non sur le plat : un même carton alimente plusieurs plats (braisé, '
  'frit), et « Grand » est une caractéristique du poisson, pas d''une recette. '
  '⛔ AUCUN effet sur le stock ni sur le coût : le carton entre à son prix global et chaque '
  'unité porte le CUMP. Ces tailles servent au CONTRÔLE A POSTERIORI, jamais à valoriser.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. LE COMPTAGE D'UN LOT                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ SUR LE LOT ET NON SUR L'INGRÉDIENT : un lot EST un carton. Les lots se
-- chevauchent (un carton dure trois jours, un autre arrive avant la fin), et
-- c'est déjà ainsi que le module gère le FEFO. Compter sur l'ingrédient
-- mélangerait deux cartons.

CREATE TABLE public.ingredient_lot_counts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id      UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  lot_id      UUID NOT NULL REFERENCES public.ingredient_lots(id) ON DELETE CASCADE,
  size_id     UUID NOT NULL REFERENCES public.ingredient_sizes(id) ON DELETE RESTRICT,

  /**
   * ⚠️ `> 0` et non `>= 0` : compter « 0 grand » n'apporte rien qu'une ligne
   * absente ne dise déjà. Autoriser zéro inviterait à saisir des lignes vides.
   */
  counted_qty NUMERIC(14, 3) NOT NULL CHECK (counted_qty > 0),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- ⛔ Une seule ligne par taille et par lot : deux lignes « Grand » sur le
  -- même carton rendraient le total ambigu.
  CONSTRAINT ilc_unique_per_lot_size UNIQUE (lot_id, size_id)
);

CREATE INDEX idx_ilc_lot ON public.ingredient_lot_counts (lot_id);
-- ⭐ Le rapprochement interroge par TAILLE sur une période : cet index sert
-- la jointure vers les lots, qui portent la date.
CREATE INDEX idx_ilc_size ON public.ingredient_lot_counts (size_id);

COMMENT ON TABLE public.ingredient_lot_counts IS
  '§19.6 — répartition par taille d''un lot reçu (« ce carton : 12 grands, 20 moyens, 8 petits »). '
  '⚠️ DÉCLARATIF : aucun effet sur `remaining_qty`, `unit_cost` ni le stock. Le lot garde ses 40 '
  'unités et son coût moyen. '
  '⭐ Sur le LOT et non l''ingrédient : les cartons se chevauchent, et compter sur l''ingrédient '
  'les mélangerait. '
  '⚠️ `ON DELETE RESTRICT` vers `ingredient_sizes` : supprimer une taille comptée effacerait un '
  'comptage réel. Le retrait normal est réversible (`is_active`).';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. L'ASSOCIATION FORMAT DE PLAT ↔ TAILLE D'INGRÉDIENT            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ C'EST CE LIEN QUI REND LE RAPPROCHEMENT POSSIBLE. Sans lui, on saurait
-- combien de « Grands » ont été reçus et combien de « Grands » vendus, sans
-- pouvoir affirmer qu'il s'agit des mêmes.
--
-- ⚠️ PLUSIEURS FORMATS PEUVENT POINTER LA MÊME TAILLE, et c'est le cas
-- NOMINAL : le « Grand » de Poisson braisé et le « Grand » de Poisson frit
-- consomment tous deux un poisson grand. Le rapprochement les ADDITIONNE.

CREATE TABLE public.price_option_sizes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id          UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  price_option_id UUID NOT NULL REFERENCES public.dish_price_options(id) ON DELETE CASCADE,
  size_id         UUID NOT NULL REFERENCES public.ingredient_sizes(id) ON DELETE CASCADE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  /**
   * ⛔ UN FORMAT NE CONSOMME QU'UNE TAILLE. Un « Grand » de poisson braisé ne
   * peut pas consommer à la fois un poisson grand et un poisson moyen - le
   * rapprochement compterait alors la même vente deux fois.
   */
  CONSTRAINT pos_unique_per_option UNIQUE (price_option_id)
);

CREATE INDEX idx_pos_size ON public.price_option_sizes (size_id);

COMMENT ON TABLE public.price_option_sizes IS
  '§19.6 — quel format de plat consomme quelle taille d''ingrédient. '
  '⭐ Lien par IDENTIFIANT et non par nom : deux libellés identiques ne garantissent rien, et un '
  'renommage casserait le rapprochement EN SILENCE. '
  '⚠️ PLUSIEURS formats peuvent pointer la MÊME taille - c''est le cas nominal (braisé et frit '
  'consomment tous deux du poisson grand), et le rapprochement les additionne. '
  '⛔ Mais un format ne consomme qu''UNE taille (contrainte UNIQUE) : sinon la même vente serait '
  'comptée deux fois.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. RLS ET PRIVILÈGES                                             │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ Aligné sur tout le module : lecture pour les membres du bar, écriture
-- par `service_role` uniquement (donc via RPC).

ALTER TABLE public.ingredient_sizes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_lot_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_option_sizes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_sizes_bar_members_select"
  ON public.ingredient_sizes FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "ingredient_lot_counts_bar_members_select"
  ON public.ingredient_lot_counts FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "price_option_sizes_bar_members_select"
  ON public.price_option_sizes FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.ingredient_sizes      TO authenticated;
GRANT SELECT ON public.ingredient_lot_counts TO authenticated;
GRANT SELECT ON public.price_option_sizes    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_sizes      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_lot_counts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_option_sizes    TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Les 3 tables existent
--   SELECT to_regclass('public.ingredient_sizes')      AS t1,
--          to_regclass('public.ingredient_lot_counts') AS t2,
--          to_regclass('public.price_option_sizes')    AS t3;
--   -- ATTENDU : les 3 non NULL
--
--   -- 2. ⚠ CRITIQUE — RLS ACTIVE sur les 3
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('ingredient_sizes','ingredient_lot_counts','price_option_sizes')
--   ORDER BY relname;
--   -- ATTENDU : true / true / true
--
--   -- 3. ⛔ `anon` ne peut RIEN lire
--   SELECT has_table_privilege('anon', 'public.ingredient_sizes', 'SELECT')      AS anon_sizes,
--          has_table_privilege('anon', 'public.ingredient_lot_counts', 'SELECT') AS anon_counts,
--          has_table_privilege('anon', 'public.price_option_sizes', 'SELECT')    AS anon_pos;
--   -- ATTENDU : false / false / false
--
--   -- 4. ⛔ `authenticated` ne peut pas ÉCRIRE (l'écriture passe par RPC)
--   SELECT has_table_privilege('authenticated', 'public.ingredient_sizes', 'INSERT') AS auth_insert;
--   -- ATTENDU : false
--
--   -- 5. Les contraintes d'unicité sont en place
--   SELECT conname FROM pg_constraint
--   WHERE conname IN ('is_label_unique_per_ingredient','ilc_unique_per_lot_size',
--                     'pos_unique_per_option')
--   ORDER BY conname;
--   -- ATTENDU : 3 lignes
--
--   -- 6. NON-RÉGRESSION — aucune donnée avant le premier usage
--   SELECT (SELECT count(*) FROM public.ingredient_sizes)      AS n_sizes,
--          (SELECT count(*) FROM public.ingredient_lot_counts) AS n_counts,
--          (SELECT count(*) FROM public.price_option_sizes)    AS n_pos;
--   -- ATTENDU : 0 / 0 / 0

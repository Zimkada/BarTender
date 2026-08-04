-- ===================================================================
-- MIGRATION: publier kitchen_order_items en Realtime
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§9)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Signalé en test terrain le 04/08/2026 : « j'ai commencé des plats sur le
--   compte cuisinier, mais le promoteur continuait à voir que ça n'a pas
--   commencé, pareil pour plat prêt ».
--
--   L'écran Service est LE PLUS PARTAGÉ du module : le cuisinier fait avancer,
--   le serveur retire, le gérant surveille — trois appareils sur la même file,
--   en même temps. Avec un cache de 5 min et aucun abonnement, chacun voyait un
--   service DIFFÉRENT.

-- ⭐⭐ POURQUOI `kitchen_order_items` ET NON `kitchen_orders`
--   Ce sont les LIGNES qui portent le statut (§4.3) : `kitchen_orders` n'a
--   volontairement AUCUNE colonne `status`, il est dérivé par une vue.
--   S'abonner au parent ne verrait donc PASSER AUCUNE transition — la table
--   parente ne change jamais après sa création.

-- ⚠️ COÛT EGRESS ASSUMÉ
--   Le projet a mené 3 vagues d'optimisation pour ramener la consommation à
--   ~200 MB/jour. Realtime diffuse chaque changement à tous les clients
--   connectés.
--   ⭐ Volume attendu MODESTE : quelques dizaines de transitions par service,
--   contre des centaines de ventes. Et la publication compte déjà 11 tables,
--   dont `salaries` et `promotions` à trafic bien plus faible — publier la
--   cuisine est cohérent avec l'existant, pas une exception.
--   ⚠️ L'ALTERNATIVE COÛTAIT PLUS CHER : sans Realtime, `useSmartSync`
--   retombe sur un polling à 20 s. Sur un écran ouvert toute la soirée, cela
--   représente ~1 400 requêtes par appareil et par service — pour un
--   rafraîchissement plus lent.

-- ⚠️ `tickets` VOLONTAIREMENT NON PUBLIÉE
--   Le résumé d'un bon compte les plats en cuisine depuis le 04/08/2026.
--   `useSmartSync` invalide DÉJÀ les clés `['tickets']` quand une ligne
--   cuisine change — le bon se rafraîchit donc sans abonnement propre.
--   Publier `tickets` ajouterait de l'egress pour un gain nul.

-- BREAKING_CHANGE: NO
--   Ajout à une publication. Aucune table modifiée, aucune donnée touchée,
--   aucune requête existante affectée.

-- ROLLBACK_STRATEGY:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.kitchen_order_items;
--   ⚠️ Sans risque : les clients retombent sur le polling de `useSmartSync`.
--   L'écran reste fonctionnel, seulement moins réactif.

-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune
-- PUBLICATION_MODIFIED: supabase_realtime (+1 table)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) État de la publication AVANT :
--
--    SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--    ORDER BY tablename;
--    -- ATTENDU : 11 lignes, SANS kitchen_order_items
--
-- 2) ⛔ BLOQUANT — la table doit exister :
--
--    SELECT to_regclass('public.kitchen_order_items') AS t;
--    -- ATTENDU : non NULL

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.kitchen_order_items') IS NULL THEN
    RAISE EXCEPTION 'Table kitchen_order_items absente — appliquer d''abord 20260804120000';
  END IF;

  -- ⚠️ Idempotence : rejouer la migration ne doit pas échouer sur un doublon.
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kitchen_order_items'
  ) THEN
    RAISE NOTICE 'kitchen_order_items déjà publiée — rien à faire.';
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_order_items;
    RAISE NOTICE 'kitchen_order_items ajoutée à supabase_realtime.';
  END IF;
END $$;

COMMIT;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ La table est publiée :
--
--    SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--    ORDER BY tablename;
--    -- ATTENDU : 12 lignes, DONT kitchen_order_items
--
-- 2) ⭐ SMOKE-TEST À DEUX APPAREILS — le seul qui prouve quelque chose :
--    a. Recharger les DEUX appareils (les clients doivent rouvrir leur
--       abonnement sur la nouvelle table).
--    b. Cuisinier : cliquer « Commencer » sur un plat.
--    c. Promoteur, SANS RIEN TOUCHER : le plat doit passer en « En cours ».
--    ⚠️ Si rien ne bouge, le défaut est côté `useSmartSync`, pas ici.
--
-- 3) Aucune régression sur les ventes (la publication est partagée) :
--    vendre une boisson depuis un appareil, la voir apparaître sur l'autre.
--
-- ✅ APPLIQUÉE EN PRODUCTION LE 04/08/2026 — post-vol 1 certifié (12 lignes).

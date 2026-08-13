-- ===================================================================
-- MIGRATION: REPLICA IDENTITY FULL sur kitchen_order_items
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§9) — complément de 20260804140000
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Signalé en test terrain le 04/08/2026, APRÈS la publication Realtime :
--   « ça marche lorsque je lance la commande du plat, le cuisinier voit
--   automatiquement. Mais pas dans Service lorsque le cuisinier passe à
--   Commencer ou à Prêt ».
--
--   ⭐ LE SYMPTÔME DÉSIGNE LA CAUSE : `INSERT` remonte, `UPDATE` non. Or
--   « Commencer » et « Prêt » sont des UPDATE sur la même table, avec le même
--   abonnement `event: '*'`. Le client n'était donc pas en cause.

-- ⭐⭐ POURQUOI REPLICA IDENTITY CHANGE TOUT
--   En mode 'd' (défaut), PostgreSQL n'émet que la CLÉ PRIMAIRE dans le
--   payload d'un UPDATE. Supabase filtre les événements sur `bar_id=eq.X`
--   (isolation multi-tenant) — un champ ABSENT de ce payload.
--   → L'événement était REJETÉ AVANT d'atteindre le client. Pas perdu en
--     route : jamais délivré.
--   Un INSERT, lui, porte toutes les colonnes : il passait le filtre.

-- ⚠️ COHÉRENCE AVEC L'EXISTANT — vérifié avant d'agir :
--     sales         → 'f'
--     bar_products  → 'f'
--     kitchen_order_items → 'd'   ⛔
--   Les deux tables dont le Realtime fonctionne étaient déjà en FULL. La
--   cuisine était la seule à ne pas l'être — c'est un alignement, pas une
--   nouveauté.

-- ⚠️ COÛT ASSUMÉ
--   FULL fait émettre l'ANCIENNE ligne entière à chaque UPDATE, en plus de la
--   nouvelle : plus de WAL, plus d'egress. Le projet l'assume déjà sur `sales`
--   et `bar_products`, infiniment plus sollicitées.
--   ⭐ Sur la cuisine : quelques dizaines de transitions par service, ~15
--   colonnes. Surcoût négligeable.
--   ⛔ AUCUNE ALTERNATIVE : sans `bar_id` dans le payload, le filtre Realtime
--   ne peut pas laisser passer l'événement. Retirer le filtre exposerait les
--   lignes de TOUS les bars à TOUS les clients — inacceptable.

-- BREAKING_CHANGE: NO
--   Métadonnée de réplication. Aucune donnée, aucune colonne, aucune requête
--   applicative affectée.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.kitchen_order_items REPLICA IDENTITY DEFAULT;
--   ⚠️ Rétablirait le défaut : les UPDATE cesseraient de remonter et l'écran
--   Service retomberait sur le polling de `useSmartSync` (20 s).

-- TABLES_MODIFIED: kitchen_order_items (métadonnée seule)
-- RLS_CHANGES: aucune · DATA_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⭐ Comparer à une table dont le Realtime FONCTIONNE :
--
--    SELECT c.relname AS table_name, c.relreplident
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname IN ('kitchen_order_items', 'sales', 'bar_products')
--    ORDER BY c.relname;
--    -- ATTENDU : sales = 'f', bar_products = 'f', kitchen_order_items = 'd'
--    -- ⚠️ Si kitchen_order_items est DÉJÀ 'f', le défaut est ailleurs :
--    --    ne pas appliquer, diagnostiquer côté client.
--
-- 2) ⛔ BLOQUANT — la table doit être publiée (sinon cette migration
--    ne changera rien d'observable) :
--
--    SELECT EXISTS (
--      SELECT 1 FROM pg_publication_tables
--      WHERE pubname = 'supabase_realtime'
--        AND schemaname = 'public'
--        AND tablename = 'kitchen_order_items'
--    ) AS publiee;
--    -- ATTENDU : true (migration 20260804140000 appliquée)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.kitchen_order_items') IS NULL THEN
    RAISE EXCEPTION 'Table kitchen_order_items absente — appliquer d''abord 20260804120000';
  END IF;
END $$;

-- ⚠️ Idempotent par nature : réappliquer FULL sur une table déjà FULL est
-- un no-op silencieux.
ALTER TABLE public.kitchen_order_items REPLICA IDENTITY FULL;

COMMIT;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ La table est en FULL :
--
--    SELECT c.relreplident
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname = 'kitchen_order_items';
--    -- ATTENDU : f
--
-- 2) ⭐ SMOKE-TEST À DEUX APPAREILS — le seul qui prouve quelque chose.
--    C'est LE test que la migration précédente ne pouvait pas passer :
--    a. Recharger les DEUX appareils.
--    b. Cuisinier : « Commencer » sur un plat.
--    c. Promoteur, SANS RIEN TOUCHER : le plat passe en « En cours ».
--    d. Répéter avec « Prêt » → colonne « Prêt ».
--    ⚠️ L'étape (d) compte autant que (c) : `mark_ready` écrit plus de
--    colonnes que `accept` (coût figé, horodatage FEFO).
--
-- 3) Non-régression : vendre une boisson depuis un appareil, la voir
--    apparaître sur l'autre (publication partagée avec `sales`).
--
-- ✅ APPLIQUÉE EN PRODUCTION LE 04/08/2026 — post-vol 1 certifié ('f').

-- Migration : Correction des produits corrompus (is_custom_product incohérent)
--
-- Contexte :
--   Le service catalogEnrichment.service.ts oubliait de passer is_custom_product = false
--   lors de la promotion d'un produit local au catalogue global.
--   Résultat : 52 bar_products avec is_custom_product = true ET global_product_id IS NOT NULL,
--   ce qui bloquait toute création de nouveau produit via la validation en DB
--   (check_product_create_permission ou ProductsService.createBarProduct ligne 235).
--
-- Fix applicatif (commit f11797a) : catalogEnrichment.service.ts corrigé.
-- Cette migration corrige rétrospectivement les données déjà corrompues.
--
-- Périmètre :
--   - 32 produits classifiés 'identical' (local_name ≈ global name, même produit)
--   - 1 produit exclu : c0c0e507 (Bar Restau Le Marché — "Youki Cocktail (petit)")
--     → is_active = false + doublon actif existant sur le même global_product_id
--     → résidu de la gestion manuelle des doublons par le support, ne pas toucher
--
--   Cas NON traités ici (à traiter manuellement avec les bars concernés) :
--   - 6 'partial_overlap' : nom local partiellement différent du nom global
--   - 13 'divergent'      : nom local totalement différent (détournement de lien global)
--     LAS VEGAS PRO : Coca (Grand)→Youki Moka (Grand), Coca (Petit)→Youki Cocktail (Petit),
--                     YouZou (Grand)→YouZou (Petit), YouZou (Petit)→Racines
--     Bar Restau Le Marché : Chill (grand/petit)→Chill Citron, Kwaabo→Kuwabo Citron,
--                            Malta café tonic→Malta tonic café, Vodyr→Vody canette,
--                            Youki pamplemousses (grand/petit)→Youki Pamplemousse
--     PRESTIGE BAR 1 : World Cola Petit → World Cola (Petit)

BEGIN;

UPDATE bar_products
SET
  is_custom_product  = false,
  is_source_of_global = true
WHERE is_custom_product = true
  AND global_product_id IS NOT NULL
  AND id IN (
    -- Bar Restau ESPOIR (3)
    'adb3408b-bc8b-4af2-8d11-afd761b60de3',  -- Beaufort (Grand)
    'aacd2d8f-748e-4a15-921e-0b4059e056c1',  -- Béninoise (Grand)
    'e0810da9-56be-4452-8276-d3eef44c7f9f',  -- Doppel

    -- Bar Restau Le Marché (24 — c0c0e507 exclu : doublon désactivé)
    'b93d9ef4-211c-4b32-9f84-f28a3d3b5485',  -- AquaBelle (Grand)
    'a3cbcd0c-eb22-4919-baa5-637b9cf68d14',  -- Awooyo Togo
    'bd9ebaef-277a-40f6-8e29-e23c8a18fc8b',  -- Béninoise (Grand)
    'b89ea484-86a6-4a50-9913-591b4ba9e0c4',  -- Béninoise (Petit)
    '197fc8da-97e4-4adb-9f80-e655ab57dae0',  -- Budweiser canette
    '987043b1-14a6-4dbc-9585-e605a70223cf',  -- Castel
    '77030419-78e1-4aed-907f-f088692058bd',  -- Desperados canette
    '4afd3088-17d6-4b17-8f09-6d2e4f262e8a',  -- Flag
    '27fc8294-05d4-40bb-b1d7-08518925fabb',  -- Guinness
    'c986842f-2c2a-483b-ac1a-70727f72f6d0',  -- Kankpé (Grand)
    '7b9d4662-8aa2-4a18-9763-eb02b8b90db7',  -- Kankpé (petit)
    'f3a4fb9e-daad-4cc4-828e-59f7cd6ce383',  -- Pils Togo
    '51476835-cb13-4c1f-838f-9a27a19e165b',  -- Possotomè Gazéifié
    'aede321d-1a09-4547-b0d7-d043ee837e1c',  -- Sombreros
    '1647a42c-d60e-4491-b4bc-ebcc34a262f2',  -- Whisky cola
    '02419c43-25b2-4a52-b90b-6c914a52930a',  -- YOUKI MOKA (grand)
    '26645f45-944f-46cc-b7a0-662dc3b22c66',  -- Youki Moka (petit)
    'beb157be-657a-4764-add0-2d75769fee34',  -- YOUZOU (petit)

    -- LAS VEGAS PRO (9)
    'c9becdf2-e7f6-4d13-b45c-094e71ed4188',  -- Beaufort (Grand)
    '6bdca0db-3771-4954-b477-0c0a9995de43',  -- Doppel Energy
    '4eedb64e-9327-4da8-8b37-0f39453df511',  -- Fifa (Grand)
    'f24510ff-bc00-46fd-8973-bbae6dae2104',  -- Malta tonic café
    'dfdabe35-cca9-4031-a2b0-6e97791a4ebd',  -- Sombreros
    'd0559d2e-8eee-4fe6-ab7d-4b354b801d8d',  -- Valmont (Grand)
    '0d302e37-965a-4fe6-8632-904d47fe45b9',  -- Vody canette (18%)
    '1a8f335c-a4a4-4990-9a39-1a76d476f8a5',  -- Whisky Cola (inactif)
    '6dbe0cc9-dde0-4cc9-bbbf-3917110d7b3a',  -- XXL Energy

    -- PRESTIGE BAR 1 (1)
    'c919d978-ae9e-45e0-9ae2-01bc5db1c377',  -- Guinness

    -- PRESTIGE BAR 2 (2)
    '4b14dff5-19b2-4715-b5f4-9189cd32b21b',  -- Awooyo Bénin
    'c35ff0c3-03dd-482e-a72f-40b43a111a59'   -- Sombreros
  );

-- Vérification : aucun des produits ciblés ne doit rester avec is_custom_product = true
DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM bar_products
  WHERE id IN (
    'adb3408b-bc8b-4af2-8d11-afd761b60de3','aacd2d8f-748e-4a15-921e-0b4059e056c1',
    'e0810da9-56be-4452-8276-d3eef44c7f9f','b93d9ef4-211c-4b32-9f84-f28a3d3b5485',
    'a3cbcd0c-eb22-4919-baa5-637b9cf68d14','bd9ebaef-277a-40f6-8e29-e23c8a18fc8b',
    'b89ea484-86a6-4a50-9913-591b4ba9e0c4','197fc8da-97e4-4adb-9f80-e655ab57dae0',
    '987043b1-14a6-4dbc-9585-e605a70223cf','77030419-78e1-4aed-907f-f088692058bd',
    '4afd3088-17d6-4b17-8f09-6d2e4f262e8a','27fc8294-05d4-40bb-b1d7-08518925fabb',
    'c986842f-2c2a-483b-ac1a-70727f72f6d0','7b9d4662-8aa2-4a18-9763-eb02b8b90db7',
    'f3a4fb9e-daad-4cc4-828e-59f7cd6ce383','51476835-cb13-4c1f-838f-9a27a19e165b',
    'aede321d-1a09-4547-b0d7-d043ee837e1c','1647a42c-d60e-4491-b4bc-ebcc34a262f2',
    '02419c43-25b2-4a52-b90b-6c914a52930a','26645f45-944f-46cc-b7a0-662dc3b22c66',
    'beb157be-657a-4764-add0-2d75769fee34','c9becdf2-e7f6-4d13-b45c-094e71ed4188',
    '6bdca0db-3771-4954-b477-0c0a9995de43','4eedb64e-9327-4da8-8b37-0f39453df511',
    'f24510ff-bc00-46fd-8973-bbae6dae2104','dfdabe35-cca9-4031-a2b0-6e97791a4ebd',
    'd0559d2e-8eee-4fe6-ab7d-4b354b801d8d','0d302e37-965a-4fe6-8632-904d47fe45b9',
    '1a8f335c-a4a4-4990-9a39-1a76d476f8a5','6dbe0cc9-dde0-4cc9-bbbf-3917110d7b3a',
    'c919d978-ae9e-45e0-9ae2-01bc5db1c377','4b14dff5-19b2-4715-b5f4-9189cd32b21b',
    'c35ff0c3-03dd-482e-a72f-40b43a111a59'
  )
  AND is_custom_product = true;  -- Ces produits NE doivent PLUS être custom après correction

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Vérification échouée : % produit(s) toujours corrompus après UPDATE', v_remaining;
  END IF;
END $$;

COMMIT;

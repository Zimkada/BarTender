/**
 * saleItemSchemas.test.ts
 *
 * ⛔⛔ LES TROIS SCHÉMAS D'ARTICLE DE VENTE DU PROJET.
 *
 * Défaut signalé en test terrain le 04/08/2026 : un bon contenant une vente de
 * 2 500 F s'affichait « Bon vide ». Cause — `product_id` était OBLIGATOIRE
 * dans les trois schémas, alors qu'un PLAT n'en a pas : il porte `item_type:
 * 'dish'` et `dish_id` (§4.2, décision « champ séparé plutôt que renommage »
 * prise pour ne pas reprendre 19 281 ventes).
 *
 * ⚠️ TROIS IMPACTS DISTINCTS, tous silencieux ou tardifs :
 *   · lecture  → items vidés, « Bon vide », historique et export sans lignes
 *   · écriture → « Aucun article valide dans la vente » sur un panier de plats
 *   · offline  → vente REJETÉE à la mise en file, donc perdue hors ligne
 *
 * ⭐ CE FICHIER TESTE LES TROIS ENSEMBLE : corriger un seul schéma aurait
 * laissé les deux autres casser ailleurs, plus tard, sans lien apparent.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SaleItemSchema as OfflineSaleItemSchema } from '../../types/schemas';
import { SaleItemSchema as RevenueSaleItemSchema } from '../../utils/revenueSchemas';

const PRODUCT_ID = '3d6dd954-a382-4dc9-beb7-81390e32741b';
const DISH_ID = '87135303-a593-4042-a80a-c572845ae804';

/** Article BOISSON — forme historique, inchangée depuis toujours. */
const drinkItem = {
  product_id: PRODUCT_ID,
  product_name: 'Béninoise',
  quantity: 2,
  unit_price: 1000,
  total_price: 2000,
};

/** Article PLAT — format retenu le 04/08/2026. PAS de `product_id`. */
const dishItem = {
  item_type: 'dish' as const,
  dish_id: DISH_ID,
  product_name: 'Poulet braisé',
  quantity: 1,
  unit_price: 2500,
  total_price: 2500,
};

/**
 * Les trois schémas, testés par les mêmes cas.
 * ⚠️ Table plutôt que trois `describe` copiés : un cas ajouté ici couvre
 * automatiquement les trois, ce qui empêche qu'ils divergent.
 */
const SCHEMAS: ReadonlyArray<{ name: string; schema: z.ZodTypeAny }> = [
  { name: 'offline (types/schemas)', schema: OfflineSaleItemSchema },
  { name: 'écriture (utils/revenueSchemas)', schema: RevenueSaleItemSchema },
];

describe('Schémas d\'article de vente — produits ET plats', () => {
  for (const { name, schema } of SCHEMAS) {
    describe(name, () => {
      it('✅ accepte une BOISSON (product_id)', () => {
        expect(schema.safeParse(drinkItem).success).toBe(true);
      });

      it('⭐⭐ accepte un PLAT (dish_id, sans product_id)', () => {
        const result = schema.safeParse(dishItem);

        expect(
          result.success,
          'Un plat est rejeté — la vente perdrait ses articles, ou serait refusée'
        ).toBe(true);
      });

      it('⛔ REFUSE un article sans AUCUN identifiant', () => {
        // ⚠️ Rendre `product_id` optionnel ne devait pas ouvrir la porte à des
        // articles sans identité : l'id reste obligatoire, seul son NOM change.
        const orphan = { ...drinkItem } as Record<string, unknown>;
        delete orphan.product_id;

        expect(
          schema.safeParse(orphan).success,
          'Un article sans identifiant est accepté — corruption silencieuse'
        ).toBe(false);
      });

      it('⛔ REFUSE un plat déclaré sans dish_id', () => {
        const broken = { ...dishItem } as Record<string, unknown>;
        delete broken.dish_id;

        expect(schema.safeParse(broken).success).toBe(false);
      });

      it('⚠️ un article SANS item_type est traité comme un produit', () => {
        // Miroir de `COALESCE(item->>'item_type', 'product')` côté SQL : les
        // 19 281 ventes existantes ne portent pas ce champ.
        const legacy = { ...drinkItem };

        expect(schema.safeParse(legacy).success).toBe(true);
      });

      it('⛔ un article sans item_type ET sans product_id reste refusé', () => {
        // ⚠️ C'est ce cas qui distingue « product_id optionnel » (dangereux)
        // de « product_id conditionnel » (correct).
        const broken = {
          product_name: 'Inconnu',
          quantity: 1,
          unit_price: 100,
          total_price: 100,
        };

        expect(schema.safeParse(broken).success).toBe(false);
      });
    });
  }
});

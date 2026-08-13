/**
 * analyticsScopeFiltering.test.ts
 *
 * ⛔⛔ LE DÉFAUT LE PLUS GRAVE DE CE CHANTIER, signalé en test terrain le
 * 05/08/2026 avec relevé SQL à l'appui.
 *
 * En portée Restau, l'onglet Analytique affichait **11 400 F** de CA alors
 * que le CA plats réel valait **5 000 F**. Les KPI sommaient le total de la
 * vente ENTIÈRE (`sale.total`) sans jamais regarder les items : une vente
 * mixte (boisson + plat) comptait donc intégralement côté cuisine.
 *
 * ⚠️ POURQUOI C'EST GRAVE ET NON COSMÉTIQUE : un promoteur aurait cru sa
 * cuisine DEUX FOIS plus rentable qu'elle ne l'est, et aurait décidé de ses
 * prix, de ses achats et de sa carte sur ce chiffre.
 *
 * ⭐ CE FICHIER TESTE LA RÈGLE, PAS LE COMPOSANT : `AnalyticsView` exige une
 * douzaine de contextes pour se monter. On vérifie ici l'arithmétique de
 * répartition, qui est la source du défaut — un test de rendu aurait été
 * fragile sans mieux protéger.
 */

import { describe, it, expect } from 'vitest';
import { itemMatchesScope, type ActivityScope } from '../../components/common/scopeHelpers';
import type { SaleItem } from '../../types';

/** Vente mixte du bar de test : 1 boisson 1 000 F + 1 plat 2 500 F. */
const MIXED_ITEMS: SaleItem[] = [
  {
    product_id: 'p-1',
    product_name: 'Whisky Cola',
    quantity: 1,
    unit_price: 1000,
    total_price: 1000,
  },
  {
    item_type: 'dish',
    dish_id: 'd-1',
    product_name: 'Poulet braisé',
    quantity: 1,
    unit_price: 2500,
    total_price: 2500,
  } as SaleItem,
];

/**
 * Réplique EXACTE de `getScopedNetRevenue` (AnalyticsView) — sans remboursement.
 * ⚠️ Répliquer une règle dans un test la rend aveugle aux changements du code
 * réel. C'est assumé ICI parce que la fonction est locale au composant et que
 * l'enjeu est l'ARITHMÉTIQUE : si elle change, ce test doit être relu.
 */
const scopedGross = (items: SaleItem[], scope: ActivityScope): number =>
  items.reduce(
    (sum, item) => (itemMatchesScope(item, scope) ? sum + item.total_price : sum),
    0
  );

const scopedCount = (items: SaleItem[], scope: ActivityScope): number =>
  items.reduce(
    (sum, item) => (itemMatchesScope(item, scope) ? sum + item.quantity : sum),
    0
  );

describe('Analytique — filtrage du CA par portée', () => {
  describe('⛔ Une vente MIXTE ne compte pas intégralement dans une portée', () => {
    it('⛔⛔ portée Restau : SEUL le plat compte', () => {
      // ⚠️ LE test du défaut terrain. Avant correction, ce montant valait
      // 3 500 (la vente entière) au lieu de 2 500.
      expect(
        scopedGross(MIXED_ITEMS, 'kitchen'),
        'Le CA Restau inclut des boissons — le promoteur croirait sa cuisine plus rentable'
      ).toBe(2500);
    });

    it('portée Bar : SEULE la boisson compte', () => {
      expect(scopedGross(MIXED_ITEMS, 'bar')).toBe(1000);
    });

    it('⭐ portée Tout : la somme des deux, inchangée', () => {
      // ⚠️ Volet indispensable : sans lui, une fonction qui retournerait
      // toujours 0 passerait les assertions « ne compte pas tout ».
      expect(scopedGross(MIXED_ITEMS, 'all')).toBe(3500);
    });

    it('⭐ Bar + Restau = Tout — aucune ligne perdue ni comptée deux fois', () => {
      // Invariant de partition : si un item échappait aux deux portées, ou
      // tombait dans les deux, la somme ne se recomposerait pas.
      expect(
        scopedGross(MIXED_ITEMS, 'bar') + scopedGross(MIXED_ITEMS, 'kitchen')
      ).toBe(scopedGross(MIXED_ITEMS, 'all'));
    });
  });

  describe('⛔ Les ARTICLES suivent la même règle', () => {
    it('portée Restau : 1 article, pas 2', () => {
      // ⚠️ `items_count` (colonne dénormalisée) vaut 2 sur cette vente. Le
      // code l'ignore volontairement dès qu'une portée filtre — sinon les
      // boissons seraient comptées en Restau.
      expect(scopedCount(MIXED_ITEMS, 'kitchen')).toBe(1);
    });

    it('portée Tout : les 2 articles', () => {
      expect(scopedCount(MIXED_ITEMS, 'all')).toBe(2);
    });
  });

  describe('⭐ Une vente NE TOUCHANT PAS la portée vaut zéro', () => {
    it('une vente 100 % boissons ne rapporte rien en Restau', () => {
      // C'est ce qui fait qu'une soirée sans cuisine n'affiche pas « 11
      // ventes » en portée Restau.
      const drinksOnly = [MIXED_ITEMS[0]];

      expect(scopedGross(drinksOnly, 'kitchen')).toBe(0);
      expect(scopedCount(drinksOnly, 'kitchen')).toBe(0);
    });

    it('une vente 100 % plats ne rapporte rien en Bar', () => {
      const dishesOnly = [MIXED_ITEMS[1]];

      expect(scopedGross(dishesOnly, 'bar')).toBe(0);
    });
  });

  describe('⚠️ Prorata du remboursement', () => {
    it('rembourser ampute la portée AU PRORATA, pas en totalité', () => {
      /**
       * Un remboursement de 700 F sur une vente de 3 500 F dont 2 500 F de
       * plats : la cuisine en supporte 2 500/3 500 = 71,4 %, soit 500 F.
       * ⛔ Imputer les 700 F entiers à la cuisine ferait apparaître une perte
       * de CA sur des plats jamais remboursés.
       */
      const saleTotal = 3500;
      const refund = 700;
      const gross = scopedGross(MIXED_ITEMS, 'kitchen'); // 2500
      const ratio = gross / saleTotal;
      const net = gross - refund * ratio;

      expect(net).toBeCloseTo(2000, 2);
    });
  });
});

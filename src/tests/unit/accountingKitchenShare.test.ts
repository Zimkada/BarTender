/**
 * accountingKitchenShare.test.ts
 *
 * ⭐ GARDE DE LA CARTE « Dont cuisine » (onglet Comptabilite > Vue globale),
 * ajoutee le 09/08/2026.
 *
 * ⛔ CE FICHIER EXISTE PARCE QUE TROIS DEFAUTS ONT ETE TROUVES A LA REVUE,
 * dans du code qui compilait et s'affichait correctement. Ils ne sont pas
 * hypothetiques : ils etaient tous les trois presents dans la premiere
 * version, et deux d'entre eux produisaient un CHIFFRE FAUX en comptabilite.
 *
 *   1. PERIODE non refiltree - une vente offline hors periode etait comptee.
 *   2. STATUT non filtre - une vente `pending` comptee comme CA acquis.
 *   3. Date absente remplacee par `new Date()` - une vente sans date tombait
 *      dans la periode courante au lieu d'etre ecartee.
 *
 * ⚠️ ON TESTE LA REGLE, PAS LE COMPOSANT - meme parti pris que
 * `analyticsScopeFiltering.test.ts` : `AccountingOverview` exige une douzaine
 * de contextes pour se monter, et un test de rendu serait fragile sans mieux
 * proteger l'arithmetique, qui est la source des defauts.
 */

import { describe, it, expect } from 'vitest';
import { computeScopedGrossRevenue } from '../../components/common/scopeHelpers';

const PERIOD_START = new Date('2026-08-01T00:00:00');
const PERIOD_END = new Date('2026-08-31T23:59:59');

/** 1 boisson 1 000 F + 1 plat 2 500 F. */
const MIXED_ITEMS = [
  { product_name: 'Whisky Cola', total_price: 1000 },
  { item_type: 'dish' as const, product_name: 'Poulet braise', total_price: 2500 },
];

const saleIn = (over: Record<string, unknown> = {}) => ({
  status: 'validated',
  businessDate: '2026-08-15',
  items: MIXED_ITEMS,
  ...over,
});

describe('computeScopedGrossRevenue - carte « Dont cuisine »', () => {
  describe('ventilation', () => {
    it('ne compte QUE les plats, pas la vente entiere', () => {
      // ⛔ Le defaut historique du 05/08 : sommer `sale.total` comptait la
      // boisson cote cuisine. Ici 3 500 F de vente, 2 500 F de cuisine.
      expect(computeScopedGrossRevenue([saleIn()], 'kitchen', PERIOD_START, PERIOD_END))
        .toBe(2500);
    });

    it('portee Bar : le complement exact, sans recouvrement', () => {
      const bar = computeScopedGrossRevenue([saleIn()], 'bar', PERIOD_START, PERIOD_END);
      const kitchen = computeScopedGrossRevenue([saleIn()], 'kitchen', PERIOD_START, PERIOD_END);
      expect(bar).toBe(1000);
      // ⭐ Bar + Restau doit rendre le total : ni trou, ni double comptage.
      expect(bar + kitchen).toBe(3500);
    });

    it('un item sans `item_type` compte comme PRODUIT (19 000+ ventes historiques)', () => {
      const legacy = saleIn({ items: [{ product_name: 'Beaufort', total_price: 800 }] });
      expect(computeScopedGrossRevenue([legacy], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
      expect(computeScopedGrossRevenue([legacy], 'bar', PERIOD_START, PERIOD_END)).toBe(800);
    });
  });

  describe('⛔ DEFAUT 1 - filtrage par periode', () => {
    it('ecarte une vente ANTERIEURE a la periode', () => {
      // Cas reel : vente offline de juillet encore dans la file IndexedDB.
      // `useUnifiedSales` ne filtre PAS l'offline par date.
      const july = saleIn({ businessDate: '2026-07-20' });
      expect(computeScopedGrossRevenue([july], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });

    it('ecarte une vente POSTERIEURE a la periode', () => {
      const september = saleIn({ businessDate: '2026-09-02' });
      expect(computeScopedGrossRevenue([september], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });

    it('accepte les bornes de la periode (inclusives)', () => {
      const first = saleIn({ businessDate: '2026-08-01' });
      expect(computeScopedGrossRevenue([first], 'kitchen', PERIOD_START, PERIOD_END)).toBe(2500);
    });

    it('lit le snake_case des ventes OFFLINE aussi bien que le camelCase serveur', () => {
      // ⚠️ N'en lire qu'une seule ferait tomber la moitie des ventes hors
      // periode - silencieusement.
      const offline = { status: 'validated', business_date: '2026-08-15', items: MIXED_ITEMS };
      expect(computeScopedGrossRevenue([offline], 'kitchen', PERIOD_START, PERIOD_END)).toBe(2500);
    });
  });

  describe('⛔ DEFAUT 2 - filtrage par statut', () => {
    it('ecarte une vente `pending` (attente de validation gerant)', () => {
      // ⚠️ Un serveur en mode complet cree des ventes `pending`. Les compter
      // annoncerait un CA acquis qui ne l'est pas.
      const pending = saleIn({ status: 'pending' });
      expect(computeScopedGrossRevenue([pending], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });

    it('ecarte une vente `rejected` ou `cancelled`', () => {
      expect(computeScopedGrossRevenue([saleIn({ status: 'rejected' })], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
      expect(computeScopedGrossRevenue([saleIn({ status: 'cancelled' })], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });

    it('une vente sans statut est ecartee, jamais comptee par defaut', () => {
      const noStatus = { businessDate: '2026-08-15', items: MIXED_ITEMS };
      expect(computeScopedGrossRevenue([noStatus], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });
  });

  describe('⛔ DEFAUT 3 - dates absentes ou invalides', () => {
    it('ecarte une vente SANS date au lieu de la dater a maintenant', () => {
      // ⚠️ La premiere version retombait sur `new Date()` : une vente sans
      // date tombait donc TOUJOURS dans la periode courante.
      const undated = { status: 'validated', items: MIXED_ITEMS };
      expect(computeScopedGrossRevenue([undated], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });

    it('ecarte une date illisible plutot que de propager un NaN', () => {
      const broken = saleIn({ businessDate: 'pas-une-date' });
      const result = computeScopedGrossRevenue([broken], 'kitchen', PERIOD_START, PERIOD_END);
      expect(result).toBe(0);
      expect(Number.isNaN(result)).toBe(false);
    });
  });

  describe('cas limites', () => {
    it('aucune vente → 0, jamais NaN', () => {
      const result = computeScopedGrossRevenue([], 'kitchen', PERIOD_START, PERIOD_END);
      expect(result).toBe(0);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('une vente sans items ne casse pas le calcul', () => {
      expect(computeScopedGrossRevenue([saleIn({ items: undefined })], 'kitchen', PERIOD_START, PERIOD_END)).toBe(0);
    });

    it('cumule plusieurs ventes de la periode', () => {
      const sales = [saleIn(), saleIn({ businessDate: '2026-08-20' })];
      expect(computeScopedGrossRevenue(sales, 'kitchen', PERIOD_START, PERIOD_END)).toBe(5000);
    });

    it('⭐ le CA cuisine ne peut jamais depasser le CA total de la periode', () => {
      // Garde-fou de la part affichee : > 100 % signalerait une double lecture.
      const sales = [saleIn(), saleIn({ businessDate: '2026-08-20' })];
      const kitchen = computeScopedGrossRevenue(sales, 'kitchen', PERIOD_START, PERIOD_END);
      const all = computeScopedGrossRevenue(sales, 'all', PERIOD_START, PERIOD_END);
      expect(kitchen).toBeLessThanOrEqual(all);
    });
  });
});

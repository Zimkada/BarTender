/**
 * kitchenAnalyticsBlock.test.tsx
 *
 * ⭐⭐ MÉTRIQUES CUISINE DANS L'ONGLET ANALYTIQUE — §8.
 *
 * Ce fichier protège TROIS règles, par ordre de gravité :
 *
 * 1. ⛔ LES MONTANTS NE FUIENT PAS. Le cuisinier n'a pas
 *    `canViewKitchenCosts` : « il voit les quantités, pas les montants » (§8).
 *    La route `/sales` n'ayant AUCUNE garde de permission, cette vérification
 *    dans le composant est le SEUL rempart — un cuisinier peut y arriver par
 *    URL directe.
 *
 * 2. ⭐ PERTE ≠ ATTENTE. Un plat prêt non servi a coûté sa matière mais reste
 *    SERVABLE. Les confondre ferait passer un service en cours pour une
 *    catastrophe, et le gérant cesserait de croire le chiffre.
 *
 * 3. ⚠️ UNE SEULE SOURCE PAR CHIFFRE. Le CA reste calculé depuis `sales` par
 *    AnalyticsView. Ce bloc ne le réaffiche PAS, alors que la RPC le renvoie :
 *    deux CA sur le même écran, et personne ne sait lequel croire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import type { KitchenMetrics } from '../../services/supabase/kitchen.service';

const mockGetMetrics = vi.fn();

vi.mock('../../services/supabase/kitchen.service', () => ({
  KitchenService: {
    getMetrics: (...a: unknown[]) => mockGetMetrics(...(a as [])),
    getQueue: vi.fn(() => Promise.resolve([])),
  },
}));

let mockHasRestaurant = true;
vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    operatingMode: 'full',
    hasRestaurant: mockHasRestaurant,
  }),
}));

let mockCanViewCosts = true;
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'u-1', role: 'gerant' },
    hasPermission: (p: string) =>
      p === 'canViewKitchenCosts' ? mockCanViewCosts : true,
  }),
}));

import { KitchenAnalyticsBlock } from '../../components/kitchen/KitchenAnalyticsBlock';

/** Jeu conforme au relevé terrain : 2 servis, 1 perte, 1 en attente. */
const makeMetrics = (over: Partial<KitchenMetrics> = {}): KitchenMetrics =>
  ({
    success: true,
    start_date: '2026-07-06',
    end_date: '2026-08-05',
    served_count: 2,
    revenue: 5000,
    cost: 4000,
    margin: 1000,
    margin_rate: 20,
    loss_count: 1,
    loss_cost: 2000,
    pending_count: 1,
    pending_cost: 2000,
    avg_prep_min: 12.5,
    dishes: [
      {
        dish_id: 'd1',
        dish_name: 'Poulet braisé',
        sold_count: 2,
        revenue: 5000,
        cost: 4000,
        margin: 1000,
        margin_rate: 20,
        loss_count: 1,
        loss_cost: 2000,
        avg_prep_min: 12.5,
      },
    ],
    ...over,
  }) as KitchenMetrics;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const renderBlock = () =>
  render(
    <KitchenAnalyticsBlock
      barId="bar-123"
      startDate={new Date('2026-07-06T00:00:00')}
      endDate={new Date('2026-08-05T00:00:00')}
      formatPrice={(v) => `${v} FCFA`}
    />,
    { wrapper: createWrapper() }
  );

const settle = () => new Promise((r) => setTimeout(r, 60));

describe('KitchenAnalyticsBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRestaurant = true;
    mockCanViewCosts = true;
    mockGetMetrics.mockResolvedValue(makeMetrics());
  });

  describe('⛔ Les montants ne fuient pas', () => {
    it('le CUISINIER (sans canViewKitchenCosts) ne voit RIEN', async () => {
      // ⚠️ La route /sales n'a aucune garde : ce composant est le seul rempart.
      mockCanViewCosts = false;
      const { container } = renderBlock();
      await settle();

      expect(
        container.firstChild,
        'Les marges cuisine sont visibles sans canViewKitchenCosts — §8 violé'
      ).toBeNull();
    });

    it('⛔⛔ la REQUETE ne part meme pas sans la permission', async () => {
      /**
       * Defaut de SECURITE trouve a la code review du 05/08/2026 : masquer
       * l affichage NE SUFFIT PAS. La RPC renvoie marges, couts et pertes
       * chiffrees — elle verifie l appartenance au bar, pas la permission de
       * voir les montants.
       * ⚠️ Sans garde dans le hook, les montants arrivaient dans le cache
       * reseau d un SERVEUR (qui accede au Dashboard et peut basculer en
       * portee Restau). Le §8 etait contourne PAR LE RESEAU, invisible a
       * l ecran.
       */
      mockCanViewCosts = false;
      renderBlock();
      await settle();

      expect(
        mockGetMetrics,
        'La RPC de metriques est appelee sans canViewKitchenCosts — les montants transitent malgre le masquage'
      ).not.toHaveBeenCalled();
    });

    it('✅ le gérant voit le bloc', async () => {
      // Volet indispensable : sans lui, un composant qui ne rend JAMAIS rien
      // passerait l'assertion précédente.
      renderBlock();
      await settle();

      expect(screen.getByText(/marge matière/i)).toBeTruthy();
    });
  });

  describe('⚠️ Une seule source par chiffre', () => {
    it('⛔ ne réaffiche PAS le CA, que la RPC renvoie pourtant', async () => {
      // `AnalyticsView` l'affiche déjà depuis `sales`. Deux CA sur le même
      // écran, issus de sources différentes, divergeraient au moindre retard
      // de cache — et personne ne saurait lequel croire.
      renderBlock();
      await settle();

      expect(
        screen.queryByText(/chiffre d'affaires/i),
        'Le bloc réaffiche le CA — deux sources pour un même chiffre'
      ).toBeNull();
      expect(screen.queryByText('5000 FCFA')).toBeNull();
    });

    it('affiche bien coût, marge et pertes', async () => {
      renderBlock();
      await settle();

      // ⚠️ Le JSX fragmente le texte : « 1000 FCFA » et « de matière » sont
      // des noeuds SEPARES. On teste donc les fragments, pas la phrase.
      // ⚠️ getAllByText partout : plusieurs montants coincident (marge du KPI
      // = marge du seul plat), ce qui est normal et non un defaut.
      expect(screen.getAllByText('20 %').length).toBeGreaterThan(0);
      expect(screen.getByText(/marge matière/i)).toBeTruthy();
      expect(screen.getByText(/pertes cuisine/i)).toBeTruthy();
      // ⚠️ Fragments REELLEMENT presents dans le DOM — verifie, pas suppose :
      // les montants sont interpoles au milieu de phrases, donc jamais isoles.
      expect(screen.getByText(/de matière$/)).toBeTruthy();
      expect(screen.getByText(/de matière perdue/)).toBeTruthy();
    });
  });

  describe('⭐ Perte et attente ne se confondent jamais', () => {
    it('signale les plats en attente séparément', async () => {
      renderBlock();
      await settle();

      expect(screen.getByText(/attendent d'être servis/i)).toBeTruthy();
      expect(
        screen.getByText(/ce ne sont pas encore des pertes/i),
        'Rien ne distingue attente et perte — un service en cours passerait pour une catastrophe'
      ).toBeTruthy();
    });

    it('aucun message quand rien n\'attend', async () => {
      mockGetMetrics.mockResolvedValue(
        makeMetrics({ pending_count: 0, pending_cost: 0 })
      );
      renderBlock();
      await settle();

      expect(screen.queryByText(/attendent d'être servis/i)).toBeNull();
    });
  });

  describe('États limites', () => {
    it('⚠️ « — » et JAMAIS 0 % quand le taux est nul', async () => {
      // Un taux sur un CA nul n'a pas de sens mathématique — même règle que
      // calculate_dish_cost pour un plat offert.
      mockGetMetrics.mockResolvedValue(
        makeMetrics({ margin_rate: null, loss_count: 2 })
      );
      renderBlock();
      await settle();

      // Idem : le tiret apparait au KPI ET sur la ligne du plat.
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      expect(screen.queryByText('0 %')).toBeNull();
    });

    it('⛔ aucun bloc vide quand il n\'y a RIEN à dire', async () => {
      // Un bloc vide sous les KPI ventes laisserait croire à un défaut de
      // chargement.
      mockGetMetrics.mockResolvedValue(
        makeMetrics({
          served_count: 0,
          loss_count: 0,
          pending_count: 0,
          dishes: [],
        })
      );
      const { container } = renderBlock();
      await settle();

      expect(container.firstChild).toBeNull();
    });

    it('⭐ la perte PAR PLAT est visible', async () => {
      renderBlock();
      await settle();

      expect(screen.getByText('Poulet braisé')).toBeTruthy();
      expect(screen.getByText(/1 perdu/)).toBeTruthy();
    });
  });

  describe('⭐ §3 — bar pur', () => {
    it('n\'émet AUCUNE requête sans cuisine', async () => {
      mockHasRestaurant = false;
      renderBlock();
      await settle();

      expect(mockGetMetrics).not.toHaveBeenCalled();
    });
  });
});

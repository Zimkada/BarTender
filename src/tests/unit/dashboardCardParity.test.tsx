/**
 * dashboardCardParity.test.tsx
 *
 * ⭐⭐ LA GRILLE D'INDICATEURS FAIT TOUJOURS 6 CARTES.
 *
 * `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6` : 6 est le SEUL total qui
 * tombe juste aux trois paliers — 3 lignes pleines sur mobile, 2 sur
 * tablette, 1 en desktop. Contrainte posée par le terrain : sur petit écran
 * les cartes vont deux par deux, un total impair laisse une carte seule en
 * fin de grille.
 *
 * ⛔ C'EST UN INVARIANT DE MISE EN PAGE, PAS UNE PRÉFÉRENCE. Chaque branche
 * du rendu doit produire exactement 6 cartes, y compris les branches
 * conditionnelles imbriquées (portée × bar mixte × permission). C'est
 * précisément là que se cachent les régressions : ajouter une carte cuisine
 * sans en retirer une autre passe inaperçu en desktop et casse le mobile.
 *
 * ⚠️ ON COMPTE LE DOM RÉEL. Répliquer la règle de composition dans le test
 * le rendrait aveugle à un changement du composant — le piège déjà rencontré
 * sur `hasRestaurant`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/supabase/ingredients.service', () => ({
  IngredientsService: {
    getIngredients: vi.fn(() => Promise.resolve([])),
    getExpiringLots: vi.fn(() => Promise.resolve([])),
    getLotsFefo: vi.fn(() => Promise.resolve([])),
    getStockConsistencyViolations: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../services/supabase/kitchen.service', () => ({
  KitchenService: {
    getQueue: vi.fn(() => Promise.resolve([])),
    getMetrics: vi.fn(() =>
      Promise.resolve({
        dishes_sold: 0,
        dishes_revenue: 0,
        loss_count: 0,
        loss_cost: 0,
        pending_count: 0,
        avg_prep_min: null,
      })
    ),
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

/** Le serveur n'a ni le stock ingrédients ni les coûts cuisine. */
let mockRole = 'gerant';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'u-1', role: mockRole },
    hasPermission: (p: string) => {
      if (p === 'canManageIngredientStock' || p === 'canViewKitchenCosts') {
        return mockRole !== 'serveur';
      }
      return true;
    },
  }),
}));

vi.mock('../../components/DataFreshnessIndicator', () => ({
  DataFreshnessIndicatorCompact: () => null,
}));

vi.mock('../../components/dashboard/StaleSalesCleanupBanner', () => ({
  StaleSalesCleanupBanner: () => null,
}));

import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { DashboardSummary } from '../../components/dashboard/tabs/DashboardSummary';
import type { ActivityScope } from '../../components/common/scopeHelpers';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Monte l'écran et compte les cartes de la grille d'indicateurs.
 *
 * ⚠️ On cible la grille par sa classe de mise en page puis on compte ses
 * ENFANTS DIRECTS : les fragments React (`<>…</>`) des branches
 * conditionnelles n'introduisent aucun niveau de DOM, donc toutes les cartes
 * — d'où qu'elles viennent — sont bien des enfants directs de la grille.
 */
function countCards(scope: ActivityScope) {
  const { container } = render(
    <DashboardSummary
      currentBar={{ id: 'bar-123', name: 'Test' } as never}
      todayTotal={45200}
      salesCount={18}
      pendingSalesCount={2}
      totalItems={62}
      returnsCount={1}
      pendingReturnsCount={0}
      consignmentsCount={3}
      lowStockProducts={[]}
      topProductsList={[]}
      allProductsStockInfo={{}}
      isServerRole={mockRole === 'serveur'}
      scope={scope}
      hasRestaurant={mockHasRestaurant}
      barId="bar-123"
      businessDate="2026-08-05"
      formatPrice={(n) => `${n} F`}
      onRefresh={() => Promise.resolve()}
      onExportWhatsApp={() => {}}
    />,
    { wrapper: Wrapper }
  );

  const grid = container.querySelector('[data-guide="revenue-stats"]');
  if (!grid) throw new Error('Grille d’indicateurs introuvable');
  return grid.children.length;
}

describe('Grille d’indicateurs — 6 cartes en toute circonstance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRestaurant = true;
    mockRole = 'gerant';
  });

  it('bar mixte, portée Tout : 6 cartes', () => {
    expect(countCards('all')).toBe(6);
  });

  it('bar mixte, portée Bar : 6 cartes', () => {
    expect(countCards('bar')).toBe(6);
  });

  it('bar mixte, portée Restau : 6 cartes', () => {
    expect(countCards('kitchen')).toBe(6);
  });

  /**
   * ⭐⭐ LE CAS QUI MOTIVE CE FICHIER. La carte « Ingrédients » est masquée au
   * serveur (les lots portent un coût unitaire). Si elle était simplement
   * RETIRÉE, le serveur tomberait à 5 — une carte seule en fin de grille.
   * Elle est donc REMPLACÉE par « Retours », pas supprimée.
   */
  it('bar mixte, portée Tout, SERVEUR : 6 cartes malgré la carte masquée', () => {
    mockRole = 'serveur';
    expect(countCards('all')).toBe(6);
  });

  it('bar mixte, portée Restau, SERVEUR : 6 cartes', () => {
    mockRole = 'serveur';
    expect(countCards('kitchen')).toBe(6);
  });

  /**
   * ⛔ §3 — un bar PUR doit être STRICTEMENT identique. `scope === 'all'` y
   * est vrai aussi, d'où le booléen `hasRestaurant` : sans lui, un bar sans
   * restauration afficherait les cartes cuisine.
   */
  it('bar PUR : 6 cartes, et AUCUNE carte cuisine', () => {
    mockHasRestaurant = false;
    const { container } = render(
      <DashboardSummary
        currentBar={{ id: 'bar-123', name: 'Test' } as never}
        todayTotal={45200}
        salesCount={18}
        pendingSalesCount={2}
        totalItems={62}
        returnsCount={1}
        pendingReturnsCount={0}
        consignmentsCount={3}
        lowStockProducts={[]}
        topProductsList={[]}
        allProductsStockInfo={{}}
        isServerRole={false}
        scope="all"
        hasRestaurant={false}
        barId="bar-123"
        businessDate="2026-08-05"
        formatPrice={(n) => `${n} F`}
        onRefresh={() => Promise.resolve()}
        onExportWhatsApp={() => {}}
      />,
      { wrapper: Wrapper }
    );

    const grid = container.querySelector('[data-guide="revenue-stats"]');
    expect(grid?.children.length).toBe(6);

    // Les cartes bar historiques sont là, aucune cuisine ne s'est glissée.
    expect(container.textContent).toContain('Consign.');
    expect(container.textContent).toContain('Retours');
    expect(container.textContent).not.toContain('Ingrédients');
    expect(container.textContent).not.toContain('Prêt');
    // ⚠️ Et surtout AUCUNE étiquette d'univers : sur un bar pur, « Bar »
    // n'aurait aucun sens — il n'y a rien d'autre.
    expect(container.textContent).not.toContain('Restau');
  });
});

describe('Étiquettes d’univers — uniquement là où deux univers cohabitent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRestaurant = true;
    mockRole = 'gerant';
  });

  /**
   * ⭐ En « Tout », « Alertes » (boissons) et « Ingrédients » cohabitent :
   * sans étiquette, on croirait qu'Alertes couvre aussi la cuisine.
   */
  it('portée Tout : les cartes non sommables sont étiquetées', () => {
    const { container } = render(
      <DashboardSummary
        currentBar={{ id: 'bar-123', name: 'Test' } as never}
        todayTotal={45200}
        salesCount={18}
        pendingSalesCount={2}
        totalItems={62}
        returnsCount={1}
        pendingReturnsCount={0}
        consignmentsCount={3}
        lowStockProducts={[]}
        topProductsList={[]}
        allProductsStockInfo={{}}
        isServerRole={false}
        scope="all"
        hasRestaurant
        barId="bar-123"
        businessDate="2026-08-05"
        formatPrice={(n) => `${n} F`}
        onRefresh={() => Promise.resolve()}
        onExportWhatsApp={() => {}}
      />,
      { wrapper: Wrapper }
    );

    const grid = container.querySelector('[data-guide="revenue-stats"]');
    expect(grid?.textContent).toContain('Ingrédients');
    expect(grid?.textContent).toContain('Prêt');
    expect(grid?.textContent).toContain('Restau');
    expect(grid?.textContent).toContain('Bar');
  });

  /**
   * ⚠️ CONTRE-ÉPREUVE : en portée Bar, le sélecteur dit DÉJÀ l'univers.
   * Répéter « Bar » sur chaque carte serait du bruit.
   */
  it('portée Bar : aucune étiquette (le sélecteur le dit déjà)', () => {
    const { container } = render(
      <DashboardSummary
        currentBar={{ id: 'bar-123', name: 'Test' } as never}
        todayTotal={45200}
        salesCount={18}
        pendingSalesCount={2}
        totalItems={62}
        returnsCount={1}
        pendingReturnsCount={0}
        consignmentsCount={3}
        lowStockProducts={[]}
        topProductsList={[]}
        allProductsStockInfo={{}}
        isServerRole={false}
        scope="bar"
        hasRestaurant
        barId="bar-123"
        businessDate="2026-08-05"
        formatPrice={(n) => `${n} F`}
        onRefresh={() => Promise.resolve()}
        onExportWhatsApp={() => {}}
      />,
      { wrapper: Wrapper }
    );

    const grid = container.querySelector('[data-guide="revenue-stats"]');
    expect(grid?.textContent).toContain('Consign.');
    expect(grid?.textContent).not.toContain('Restau');
  });
});

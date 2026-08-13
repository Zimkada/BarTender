/**
 * batchAlerts.test.tsx
 *
 * ⭐⭐ L'ALERTE DE LOT ÉPUISÉ — informer AVANT, pas seulement refuser après.
 *
 * `accept_kitchen_item` refuse déjà de démarrer un plat sans lot, et c'est le
 * bon garde-fou. Mais il est RÉACTIF : le cuisinier découvre le problème
 * devant une table qui attend. Cette alerte est proactive.
 *
 * ⛔ CE QUI EST TESTÉ ICI, C'EST LE CALCUL — pas l'affichage. Trois erreurs
 * y sont possibles et toutes silencieuses :
 *   · compter les plats DÉJÀ prêts (ils ont déjà prélevé) → fausse alerte ;
 *   · alerter sur un plat-base que personne ne demande → bruit, et le
 *     cuisinier apprend à ignorer les alertes ;
 *   · oublier de multiplier par la quantité commandée → sous-estimation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ===== Données pilotées par test =====
let mockBatches: Array<{ id: string; dish_id: string; remaining_qty: number }> = [];
let mockComponents: Array<{
  id: string;
  bar_id: string;
  dish_id: string;
  base_dish_id: string;
  quantity: number;
}> = [];
let mockColumns = {
  todo: [] as Array<{ items: Array<{ dish_id: string; dish_name: string; quantity: number }> }>,
  doing: [] as Array<{ items: Array<{ dish_id: string; dish_name: string; quantity: number }> }>,
  done: [] as Array<{ items: Array<{ dish_id: string; dish_name: string; quantity: number }> }>,
};

vi.mock('../../hooks/queries/useBatchQueries', () => ({
  useActiveBatches: () => ({ data: mockBatches }),
}));

vi.mock('../../hooks/queries/useDishesQueries', () => ({
  useAllDishComponents: () => ({ data: mockComponents }),
  useDishes: () => ({
    data: [
      { id: 'base-spag', name: 'Spaghetti cuits' },
      { id: 'base-poulet', name: 'Poulet bouilli' },
      { id: 'plat-sp', name: 'Spaghetti-poulet' },
    ],
  }),
}));

vi.mock('../../hooks/pivots/useUnifiedKitchenQueue', () => ({
  useUnifiedKitchenQueue: () => ({ columns: mockColumns }),
}));

/** Rôle simulé — le serveur n'a PAS `canManageIngredientStock`. */
let mockRole = 'cuisinier';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (p: string) =>
      p === 'canManageIngredientStock' ? mockRole !== 'serveur' : true,
  }),
}));

import { useBatchAlerts } from '../../hooks/pivots/useBatchAlerts';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Un plat en attente : 1 spaghetti-poulet, qui prend 1 portion de base. */
const composition = [
  {
    id: 'c1',
    bar_id: 'bar-1',
    dish_id: 'plat-sp',
    base_dish_id: 'base-spag',
    quantity: 1,
  },
];

const enAttente = (quantity: number) => [
  { items: [{ dish_id: 'plat-sp', dish_name: 'Spaghetti-poulet', quantity }] },
];

describe('useBatchAlerts — alerter juste, ni trop ni trop peu', () => {
  beforeEach(() => {
    mockBatches = [];
    mockComponents = [];
    mockColumns = { todo: [], doing: [], done: [] };
    mockRole = 'cuisinier';
  });

  it('alerte quand le lot est vide et qu’un plat l’attend', () => {
    mockComponents = composition;
    mockColumns.todo = enAttente(1);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });

    expect(result.current.hasAlerts).toBe(true);
    expect(result.current.alerts[0].baseDishName).toBe('Spaghetti cuits');
    expect(result.current.alerts[0].isEmpty).toBe(true);
    expect(result.current.alerts[0].neededQty).toBe(1);
  });

  /**
   * ⛔ LE BRUIT TUE L'ALERTE. Un plat-base dont personne ne dépend n'est pas
   * une alerte, même si son lot est vide. Alerter sur tout apprendrait au
   * cuisinier à ignorer le bandeau — et il ignorerait aussi les vraies.
   */
  it('n’alerte PAS sur un lot vide que personne ne demande', () => {
    mockComponents = composition;
    mockColumns.todo = []; // aucun plat en attente

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(false);
  });

  /**
   * ⛔⛔ LES PLATS `done` ONT DÉJÀ PRÉLEVÉ leur part du lot — le prélèvement a
   * lieu à `ready`. Les compter ferait apparaître une rupture qui n'existe
   * pas : le lot est vide PARCE QUE ces plats l'ont consommé.
   */
  it('ne compte PAS les plats déjà prêts', () => {
    mockComponents = composition;
    mockBatches = [];
    mockColumns.done = enAttente(5); // 5 plats prêts, mais déjà servis du lot

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(false);
  });

  /** ⭐ `todo` ET `doing` comptent : les deux sont AVANT le prélèvement. */
  it('compte les plats en attente ET en préparation', () => {
    mockComponents = composition;
    mockColumns.todo = enAttente(2);
    mockColumns.doing = enAttente(3);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.alerts[0].neededQty).toBe(5);
  });

  /**
   * ⚠️ La QUANTITÉ COMMANDÉE multiplie le besoin. « 3 × spaghetti-poulet »
   * consomme 3 portions, pas 1 — l'oublier sous-estimerait la rupture.
   */
  it('multiplie par la quantité commandée', () => {
    mockComponents = composition;
    mockBatches = [{ id: 'b1', dish_id: 'base-spag', remaining_qty: 2 }];
    mockColumns.todo = enAttente(3); // 3 plats → 3 portions, mais 2 dispo

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(true);
    expect(result.current.alerts[0].neededQty).toBe(3);
    expect(result.current.alerts[0].availableQty).toBe(2);
    // ⚠️ `isEmpty` false : il RESTE des portions, une partie passe encore.
    expect(result.current.alerts[0].isEmpty).toBe(false);
  });

  /** ⭐ Stock suffisant → aucune alerte. La contre-épreuve. */
  it('n’alerte pas quand le stock couvre les commandes', () => {
    mockComponents = composition;
    mockBatches = [{ id: 'b1', dish_id: 'base-spag', remaining_qty: 10 }];
    mockColumns.todo = enAttente(3);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(false);
  });

  /** ⚠️ Plusieurs lots du même plat s'ADDITIONNENT. */
  it('additionne les portions de plusieurs lots actifs', () => {
    mockComponents = composition;
    mockBatches = [
      { id: 'b1', dish_id: 'base-spag', remaining_qty: 2 },
      { id: 'b2', dish_id: 'base-spag', remaining_qty: 3 },
    ];
    mockColumns.todo = enAttente(4); // 4 demandées, 5 disponibles

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(false);
  });

  /**
   * ⭐ Les ruptures TOTALES d'abord : plus rien ne peut être servi, c'est
   * plus urgent qu'un lot qui s'épuise.
   */
  it('trie les ruptures totales en premier', () => {
    mockComponents = [
      ...composition,
      {
        id: 'c2',
        bar_id: 'bar-1',
        dish_id: 'plat-sp',
        base_dish_id: 'base-poulet',
        quantity: 1,
      },
    ];
    // spaghetti : 1 dispo pour 2 → insuffisant. poulet : 0 dispo → vide.
    mockBatches = [{ id: 'b1', dish_id: 'base-spag', remaining_qty: 1 }];
    mockColumns.todo = enAttente(2);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.alerts).toHaveLength(2);
    expect(result.current.alerts[0].isEmpty).toBe(true);
    expect(result.current.alerts[0].baseDishName).toBe('Poulet bouilli');
  });

  /**
   * ⛔⛔ LE DÉFAUT DE LA CODE REVIEW DU 07/08/2026.
   *
   * `useActiveBatches` est gardée par `canManageIngredientStock` : pour un
   * SERVEUR, elle ne charge RIEN. Et un tableau vide se lit comme « zéro
   * portion disponible » — le serveur aurait vu « Plus de Spaghetti cuits »
   * en PERMANENCE, même devant un lot plein.
   *
   * ⚠️ Une fausse alerte constante est PIRE que pas d'alerte : elle
   * discrédite les vraies.
   */
  it('n’alerte JAMAIS un serveur, faute d’accès aux lots', () => {
    mockRole = 'serveur';
    mockComponents = composition;
    mockBatches = []; // non chargés pour lui, comme en réalité
    mockColumns.todo = enAttente(3);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(false);
  });

  /** ⭐ Contre-épreuve : le cuisinier, lui, voit bien l'alerte. */
  it('alerte bien un cuisinier dans la même situation', () => {
    mockRole = 'cuisinier';
    mockComponents = composition;
    mockBatches = [];
    mockColumns.todo = enAttente(3);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(true);
  });

  /** ⚠️ Un bar sans composition n'a rien à signaler — sortie immédiate. */
  it('ne fait rien sans aucune composition', () => {
    mockComponents = [];
    mockColumns.todo = enAttente(5);

    const { result } = renderHook(() => useBatchAlerts('bar-1'), { wrapper });
    expect(result.current.hasAlerts).toBe(false);
  });
});

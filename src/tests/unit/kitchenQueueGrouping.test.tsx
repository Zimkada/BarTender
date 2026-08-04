/**
 * kitchenQueueGrouping.test.tsx
 *
 * ⭐ Regroupement de la file cuisine — §9 (écran Service).
 *
 * ⚠️ On monte le VRAI pivot avec un service mocké, plutôt que d'extraire et
 * tester les fonctions pures isolément. Répliquer la règle de répartition dans
 * le test la rendrait aveugle à un changement du pivot — le piège déjà
 * rencontré sur `hasRestaurant`.
 *
 * ⭐⭐ CE QUE CE FICHIER PROTÈGE EN PRIORITÉ : la LISTE BLANCHE de `columnOf`.
 * Le défaut récurrent de ce chantier — corrigé TROIS fois — est le test par
 * exclusion (« tout sauf X »), qui range silencieusement les statuts inconnus
 * du mauvais côté. Un plat mal rangé dans « à faire » serait recuisiné.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import type {
  KitchenQueueItem,
  KitchenItemStatus,
  ServiceMode,
} from '../../services/supabase/kitchen.service';

const mockGetQueue = vi.fn<() => Promise<KitchenQueueItem[]>>(() => Promise.resolve([]));

vi.mock('../../services/supabase/kitchen.service', () => ({
  KitchenService: {
    getQueue: () => mockGetQueue(),
  },
}));

vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    operatingMode: 'full',
    hasRestaurant: true,
  }),
}));

import { useUnifiedKitchenQueue } from '../../hooks/pivots/useUnifiedKitchenQueue';

const BAR_ID = 'bar-123';

/** Fabrique une ligne de file — seuls les champs discriminants sont exposés. */
function makeItem(overrides: {
  id: string;
  status: KitchenItemStatus;
  ticketId?: string;
  tableNumber?: number | null;
  serviceMode?: ServiceMode;
  orderCreatedAt?: string;
  dishName?: string;
  quantity?: number;
}): KitchenQueueItem {
  return {
    id: overrides.id,
    bar_id: BAR_ID,
    kitchen_order_id: `ko-${overrides.ticketId ?? 't1'}`,
    dish_id: 'dish-1',
    quantity: overrides.quantity ?? 1,
    status: overrides.status,
    accepted_by: null,
    accepted_at: null,
    ready_by: null,
    ready_at: null,
    served_by: null,
    served_at: null,
    cancelled_by: null,
    cancelled_at: null,
    cancel_reason: null,
    cancel_note: null,
    reminder_count: 0,
    last_reminder_at: null,
    modifiers: null,
    unit_price: 1500,
    computed_cost: null,
    consumed_at: null,
    sale_id: null,
    created_at: overrides.orderCreatedAt ?? '2026-08-04T10:00:00Z',
    dish_name: overrides.dishName ?? 'Poulet braisé',
    ticket_id: overrides.ticketId ?? 't1',
    table_number: overrides.tableNumber === undefined ? 5 : overrides.tableNumber,
    customer_name: null,
    service_mode: overrides.serviceMode ?? 'dine_in',
    order_notes: null,
    order_created_at: overrides.orderCreatedAt ?? '2026-08-04T10:00:00Z',
  };
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** Monte le pivot et attend que la file soit chargée. */
async function renderQueue(items: KitchenQueueItem[]) {
  mockGetQueue.mockResolvedValue(items);
  const { result } = renderHook(() => useUnifiedKitchenQueue(BAR_ID), {
    wrapper: createWrapper(),
  });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

describe('useUnifiedKitchenQueue — répartition en colonnes (§9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('⭐⭐ Liste blanche — chaque statut dans SA colonne', () => {
    it('pending et accepted vont dans « À faire »', async () => {
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending' }),
        makeItem({ id: 'i2', status: 'accepted' }),
      ]);

      expect(result.current.counts.todo).toBe(2);
      expect(result.current.counts.doing).toBe(0);
      expect(result.current.counts.done).toBe(0);
    });

    it('preparing va dans « En cours »', async () => {
      const result = await renderQueue([makeItem({ id: 'i1', status: 'preparing' })]);

      expect(result.current.counts.doing).toBe(1);
      expect(result.current.counts.todo).toBe(0);
    });

    it('ready va dans « Prêt »', async () => {
      const result = await renderQueue([makeItem({ id: 'i1', status: 'ready' })]);

      expect(result.current.counts.done).toBe(1);
      expect(result.current.counts.todo).toBe(0);
    });

    it('⛔ served et cancelled n\'apparaissent dans AUCUNE colonne', async () => {
      // ⚠️ Le serveur les filtre déjà, mais le pivot ne doit pas en dépendre :
      // si le filtre serveur changeait, un plat DÉJÀ SERVI réapparaîtrait dans
      // « à faire » et serait recuisiné.
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'served' }),
        makeItem({ id: 'i2', status: 'cancelled' }),
      ]);

      expect(
        result.current.counts.todo + result.current.counts.doing + result.current.counts.done,
        'Un plat servi ou annulé est réapparu dans la file — il serait recuisiné'
      ).toBe(0);
    });

    it('⭐ un statut INCONNU est exclu, jamais rangé par défaut', async () => {
      // ⚠️ LE test qui distingue liste blanche et liste noire. Avec un `default`
      // fourre-tout, ce statut tomberait dans « à faire » et le cuisinier
      // produirait un plat sur la foi d'une valeur que le code ne comprend pas.
      const rogue = { ...makeItem({ id: 'i1', status: 'pending' }), status: 'archived' as KitchenItemStatus };
      const result = await renderQueue([rogue]);

      expect(
        result.current.counts.todo,
        'Un statut inconnu a été rangé dans « à faire » — la liste blanche a été remplacée par une liste noire'
      ).toBe(0);
    });
  });

  describe('Regroupement par destination', () => {
    it('deux plats de la MÊME table forment UN groupe', async () => {
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending', tableNumber: 7 }),
        makeItem({ id: 'i2', status: 'pending', tableNumber: 7 }),
      ]);

      expect(result.current.columns.todo).toHaveLength(1);
      expect(result.current.columns.todo[0].items).toHaveLength(2);
      expect(result.current.columns.todo[0].tableNumber).toBe(7);
    });

    it('deux tables différentes forment DEUX groupes', async () => {
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending', tableNumber: 7 }),
        makeItem({ id: 'i2', status: 'pending', tableNumber: 9 }),
      ]);

      expect(result.current.columns.todo).toHaveLength(2);
    });

    it('⭐ les plats à emporter d\'un MÊME ticket restent ensemble', async () => {
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending', serviceMode: 'takeaway', ticketId: 'tk-1', tableNumber: null }),
        makeItem({ id: 'i2', status: 'pending', serviceMode: 'takeaway', ticketId: 'tk-1', tableNumber: null }),
      ]);

      expect(result.current.columns.todo).toHaveLength(1);
      expect(result.current.columns.todo[0].isTakeaway).toBe(true);
    });

    it('⭐⭐ deux emporter de tickets DIFFÉRENTS ne se mélangent PAS', async () => {
      // ⚠️ Sans clé portant le ticket, les commandes de deux clients distincts
      // finiraient dans le même bloc « emporter » — et le cuisinier remettrait
      // les mauvais plats au mauvais client.
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending', serviceMode: 'takeaway', ticketId: 'tk-1', tableNumber: null }),
        makeItem({ id: 'i2', status: 'pending', serviceMode: 'takeaway', ticketId: 'tk-2', tableNumber: null }),
      ]);

      expect(
        result.current.columns.todo,
        'Deux commandes à emporter de clients différents ont été fusionnées'
      ).toHaveLength(2);
    });

    it('⭐ une ligne SANS table et sans emporter est groupée par ticket', async () => {
      // `table_number` est NULLABLE en base — ce cas n'est pas théorique.
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending', tableNumber: null, ticketId: 'tk-9' }),
        makeItem({ id: 'i2', status: 'pending', tableNumber: null, ticketId: 'tk-9' }),
      ]);

      expect(result.current.columns.todo).toHaveLength(1);
      expect(result.current.columns.todo[0].tableNumber).toBeNull();
    });
  });

  describe('⭐ Ordre de production — le plus ancien en tête', () => {
    it('les groupes sont triés par ancienneté', async () => {
      // ⚠️ Une file cuisine se sert dans l'ordre d'arrivée. Sans ce tri, les
      // premières tables attendraient pendant que les dernières sont servies.
      const result = await renderQueue([
        makeItem({
          id: 'i1', status: 'pending', tableNumber: 3,
          orderCreatedAt: '2026-08-04T12:30:00Z',
        }),
        makeItem({
          id: 'i2', status: 'pending', tableNumber: 8,
          orderCreatedAt: '2026-08-04T12:05:00Z',
        }),
      ]);

      expect(
        result.current.columns.todo[0].tableNumber,
        'La table la plus ancienne n\'est pas en tête — elle attendrait derrière les nouvelles'
      ).toBe(8);
    });

    it('un groupe porte l\'horodatage de sa ligne la PLUS ANCIENNE', async () => {
      const result = await renderQueue([
        makeItem({
          id: 'i1', status: 'pending', tableNumber: 4,
          orderCreatedAt: '2026-08-04T13:00:00Z',
        }),
        makeItem({
          id: 'i2', status: 'pending', tableNumber: 4,
          orderCreatedAt: '2026-08-04T12:00:00Z',
        }),
      ]);

      expect(result.current.columns.todo[0].oldestAt).toBe('2026-08-04T12:00:00Z');
    });
  });

  describe('Compteurs', () => {
    it('⭐ comptent les PLATS et non les groupes', async () => {
      // ⚠️ « 2 tables » ne dit pas au cuisinier combien d'assiettes sortir.
      const result = await renderQueue([
        makeItem({ id: 'i1', status: 'pending', tableNumber: 1 }),
        makeItem({ id: 'i2', status: 'pending', tableNumber: 1 }),
        makeItem({ id: 'i3', status: 'pending', tableNumber: 2 }),
      ]);

      expect(result.current.columns.todo).toHaveLength(2);
      expect(result.current.counts.todo).toBe(3);
    });

    it('une file vide ne casse rien', async () => {
      const result = await renderQueue([]);

      expect(result.current.counts).toEqual({ todo: 0, doing: 0, done: 0 });
      expect(result.current.columns.todo).toEqual([]);
    });
  });
});

/**
 * useIngredientMutations.test.tsx
 *
 * ⭐ CE QU'ON TESTE : que les ANOMALIES ne sont jamais tues.
 *
 * Les trois RPC cuisine réussissent dans des cas qui méritent pourtant un
 * avertissement — c'est leur conception :
 *   - un appro peut solder une dette (on avait consommé sans stock) ;
 *   - une consommation réussit même à stock insuffisant (§4.4, jamais bloquant) ;
 *   - une sortie de lot rejouée avec un autre motif ne re-catégorise PAS.
 *
 * Dans les trois cas, `success: true`. Si le hook se contente de ça, l'anomalie
 * disparaît de l'écran — et un stock négatif qui s'accumule sans que personne
 * n'agisse fait dériver le coût matière, donc la marge (§8).
 *
 * ⚠️ On teste le hook, pas le service : le service est mocké, ce sont les
 * décisions d'affichage qui sont vérifiées.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ===== Mocks =====

const mockReceiveSupply = vi.fn();
const mockConsumeFefo = vi.fn();
const mockDiscardLot = vi.fn();

vi.mock('../../services/supabase/ingredients.service', () => ({
  IngredientsService: {
    receiveSupply: (...args: unknown[]) => mockReceiveSupply(...(args as [])),
    consumeFefo: (...args: unknown[]) => mockConsumeFefo(...(args as [])),
    discardLot: (...args: unknown[]) => mockDiscardLot(...(args as [])),
  },
}));

vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    hasRestaurant: true,
  }),
}));

// ⭐ Les toasts sont chargés en import dynamique dans les hooks : on capture
// les appels pour vérifier CE QUI EST DIT à l'utilisateur.
const toastCalls: Array<{ type: 'success' | 'error' | 'info'; message: string }> = [];

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(
    (message: string) => { toastCalls.push({ type: 'info', message }); },
    {
      success: (message: string) => { toastCalls.push({ type: 'success', message }); },
      error: (message: string) => { toastCalls.push({ type: 'error', message }); },
    }
  );
  return { default: toast, toast };
});

import { useIngredientMutations } from '../../hooks/mutations/useIngredientMutations';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** Laisse le temps aux imports dynamiques de toast de se résoudre. */
const flushToasts = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('useIngredientMutations — les anomalies ne sont jamais tues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastCalls.length = 0;
  });

  describe('📦 receiveSupply', () => {
    it('appro simple → confirmation', async () => {
      mockReceiveSupply.mockResolvedValue({
        success: true, lot_id: 'lot-1', qty_stocked: 10,
        qty_settled_debts: 0, idempotent_replay: false,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.receiveSupply.mutateAsync({
          ingredientId: 'ing-1', qty: 10, unitCost: 500,
        });
      });
      await flushToasts();

      expect(toastCalls.some((t) => t.type === 'success')).toBe(true);
    });

    it('⭐ solde de dette → REMONTÉ, jamais tu', async () => {
      // §13.2 : le solde d'une dette signale qu'on avait consommé sans stock.
      // Le taire ferait disparaître l'anomalie que la table veut rendre visible.
      mockReceiveSupply.mockResolvedValue({
        success: true, lot_id: 'lot-2', qty_stocked: 2,
        qty_settled_debts: 4, idempotent_replay: false,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.receiveSupply.mutateAsync({
          ingredientId: 'ing-1', qty: 6, unitCost: 600,
        });
      });
      await flushToasts();

      const message = toastCalls.map((t) => t.message).join(' ');
      expect(message, 'Le solde de dette doit être signalé').toContain('4');
      expect(message.toLowerCase()).toContain('manque de stock');
    });

    it('⚠️ rejeu → n\'annonce PAS un second approvisionnement', async () => {
      // Sinon le gérant croirait avoir saisi deux livraisons.
      mockReceiveSupply.mockResolvedValue({
        success: true, lot_id: 'lot-1', idempotent_replay: true,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.receiveSupply.mutateAsync({
          ingredientId: 'ing-1', qty: 10, unitCost: 500,
        });
      });
      await flushToasts();

      expect(toastCalls.some((t) => t.type === 'success')).toBe(false);
      expect(toastCalls.map((t) => t.message).join(' ').toLowerCase()).toContain('déjà enregistré');
    });

    it('génère une clé d\'idempotence si l\'appelant n\'en fournit pas', async () => {
      mockReceiveSupply.mockResolvedValue({
        success: true, lot_id: 'lot-1', idempotent_replay: false,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.receiveSupply.mutateAsync({
          ingredientId: 'ing-1', qty: 5, unitCost: 300,
        });
      });

      const passed = mockReceiveSupply.mock.calls[0][0] as { idempotencyKey?: string };
      expect(passed.idempotencyKey).toBeTruthy();
      expect(passed.idempotencyKey!.length).toBeGreaterThan(10);
    });

    it('respecte la clé fournie par l\'appelant', async () => {
      mockReceiveSupply.mockResolvedValue({
        success: true, lot_id: 'lot-1', idempotent_replay: false,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.receiveSupply.mutateAsync({
          ingredientId: 'ing-1', qty: 5, unitCost: 300, idempotencyKey: 'cle-du-formulaire',
        });
      });

      const passed = mockReceiveSupply.mock.calls[0][0] as { idempotencyKey?: string };
      expect(passed.idempotencyKey).toBe('cle-du-formulaire');
    });
  });

  describe('🔥 consumeIngredients', () => {
    it('consommation normale → aucun avertissement', async () => {
      mockConsumeFefo.mockResolvedValue({
        success: true, total_cost: 2000, idempotent_replay: false,
        items: [{ ingredient_id: 'ing-1', qty_consumed: 4, computed_cost: 2000, qty_from_debt: 0 }],
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.consumeIngredients.mutateAsync({
          items: [{ ingredient_id: 'ing-1', qty: 4 }], referenceKey: 'ref-1',
        });
      });
      await flushToasts();

      expect(toastCalls).toHaveLength(0);
    });

    it('⭐ stock insuffisant → AVERTISSEMENT, malgré success: true', async () => {
      // §4.4 : la consommation RÉUSSIT même sans stock (jamais bloquant), une
      // dette est créée. Le stock négatif est silencieux côté base — il doit
      // être VISIBLE côté humain, sinon il s'accumule et le coût matière dérive.
      mockConsumeFefo.mockResolvedValue({
        success: true, total_cost: 2600, idempotent_replay: false,
        items: [{ ingredient_id: 'ing-1', qty_consumed: 5, computed_cost: 2600, qty_from_debt: 2 }],
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.consumeIngredients.mutateAsync({
          items: [{ ingredient_id: 'ing-1', qty: 5 }], referenceKey: 'ref-2',
        });
      });
      await flushToasts();

      const message = toastCalls.map((t) => t.message).join(' ').toLowerCase();
      expect(toastCalls.length, 'Un stock insuffisant doit être signalé').toBeGreaterThan(0);
      expect(message).toContain('stock insuffisant');
    });

    it('rejeu → silencieux', async () => {
      mockConsumeFefo.mockResolvedValue({
        success: true, total_cost: 2000, idempotent_replay: true,
        items: [{ ingredient_id: 'ing-1', qty_consumed: 4, computed_cost: 2000, qty_from_debt: 0 }],
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.consumeIngredients.mutateAsync({
          items: [{ ingredient_id: 'ing-1', qty: 4 }], referenceKey: 'ref-1',
        });
      });
      await flushToasts();

      expect(toastCalls).toHaveLength(0);
    });
  });

  describe('🗑️ discardLot', () => {
    it('sortie de lot → perte annoncée', async () => {
      mockDiscardLot.mockResolvedValue({
        success: true, lot_id: 'lot-1', lost_qty: 4, lost_value: 1200,
        status: 'expired', idempotent_replay: false,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.discardLot.mutateAsync({ lotId: 'lot-1', reason: 'expired' });
      });
      await flushToasts();

      expect(toastCalls.map((t) => t.message).join(' ')).toContain('1200');
    });

    it('⭐ rejeu avec MOTIF DIFFÉRENT → averti que la cause reste inchangée', async () => {
      // Sans cet avertissement, l'utilisateur croirait avoir corrigé la cause.
      // Or c'est la distinction subie/évitable qui fait la valeur de la métrique.
      mockDiscardLot.mockResolvedValue({
        success: true, lot_id: 'lot-1', lost_qty: 4, lost_value: 1200,
        status: 'expired', idempotent_replay: true, reason_mismatch: true,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.discardLot.mutateAsync({ lotId: 'lot-1', reason: 'spoiled' });
      });
      await flushToasts();

      const message = toastCalls.map((t) => t.message).join(' ').toLowerCase();
      expect(message).toContain('autre motif');
      expect(toastCalls.some((t) => t.type === 'success')).toBe(false);
    });

    it('rejeu à motif identique → simple information', async () => {
      mockDiscardLot.mockResolvedValue({
        success: true, lot_id: 'lot-1', lost_qty: 4, lost_value: 1200,
        status: 'expired', idempotent_replay: true, reason_mismatch: false,
      });

      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.discardLot.mutateAsync({ lotId: 'lot-1', reason: 'expired' });
      });
      await flushToasts();

      const message = toastCalls.map((t) => t.message).join(' ').toLowerCase();
      expect(message).toContain('déjà sorti');
      expect(message).not.toContain('autre motif');
    });
  });

  describe('🔄 Invalidation du cache', () => {
    it('⭐ invalide MÊME en cas d\'échec (onSettled, pas onSuccess)', async () => {
      // Une mutation peut réussir CÔTÉ SERVEUR puis échouer côté réseau
      // (timeout après le commit). La base est cohérente — le cache client, lui,
      // afficherait un stock faux. Invalider dans les deux cas coûte un refetch ;
      // ne pas le faire coûte un chiffre faux.
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockReceiveSupply.mockRejectedValue(new Error('Timeout réseau'));

      const { result } = renderHook(() => useIngredientMutations(), { wrapper });

      await act(async () => {
        await expect(
          result.current.receiveSupply.mutateAsync({ ingredientId: 'ing-1', qty: 5, unitCost: 300 })
        ).rejects.toThrow();
      });

      await waitFor(() => {
        expect(
          invalidateSpy,
          'Le cache doit être invalidé même sur échec — sinon il reste périmé'
        ).toHaveBeenCalled();
      });
    });
  });

  describe('⛔ Erreurs', () => {
    it('sans bar sélectionné, la mutation échoue proprement', async () => {
      const { result } = renderHook(() => useIngredientMutations(), { wrapper: createWrapper() });

      mockReceiveSupply.mockRejectedValue(new Error('Stock insuffisant côté serveur'));

      await act(async () => {
        await expect(
          result.current.receiveSupply.mutateAsync({ ingredientId: 'ing-1', qty: 5, unitCost: 300 })
        ).rejects.toThrow();
      });
      await flushToasts();

      await waitFor(() => {
        expect(toastCalls.some((t) => t.type === 'error')).toBe(true);
      });
    });
  });
});

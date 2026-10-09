/**
 * useServerMappings.test.tsx
 * Non-regression du crash du 10/10/2026 : la requete des affectations de
 * comptoir est PERSISTEE (cle `counters`). L'ancien code y mettait un `Set`,
 * que JSON transformait en `{}` : au rechargement, `.has` n'existait plus et
 * toute l'app plantait. Ces tests simulent ce cache corrompu.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import type { ServerNameMapping } from '../../services/supabase/server-mappings.service';

// ===== Mocks des dépendances =====

const mapping = (userId: string, serverName: string): ServerNameMapping => ({
  id: `m-${userId}`,
  barId: 'bar-1',
  userId,
  serverName,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const MAPPINGS = [mapping('u1', 'Awa'), mapping('u2', 'Koffi')];

vi.mock('../../services/supabase/server-mappings.service', () => ({
  ServerMappingsService: {
    getAllMappingsForBar: vi.fn(() => Promise.resolve(MAPPINGS)),
  },
}));

// Affectations renvoyees par `counter_assignments` : seul u1 est au comptoir.
let mockAssignments: { user_id: string }[] = [];
const mockFrom = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args);
      const result = { data: mockAssignments, error: null };
      const chain: Record<string, unknown> = {
        then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      return chain;
    },
  },
}));

import { useServerMappings, counterAssignmentKeys } from '../../hooks/useServerMappings';

const COUNTER_ID = 'counter-1';

// ⚠️ `null` = pas de comptoir actif : `undefined` reprendrait la valeur par defaut.
function setup(seed?: (client: QueryClient) => void, counterId: string | null = COUNTER_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useServerMappings('bar-1', false, counterId ?? undefined), { wrapper });
}

const assignmentCalls = () => mockFrom.mock.calls.filter(([table]) => table === 'counter_assignments').length;

describe('useServerMappings - filtre par comptoir et cache persiste', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockAssignments = [{ user_id: 'u1' }];
  });

  it('ne propose que les serveurs affectes au comptoir actif', async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.serverNames).toEqual(['Awa']));
  });

  it("ne plante pas sur un cache corrompu ({}) et le recharge sans attendre le staleTime", async () => {
    const { result } = setup((client) => {
      // ⚠️ Exactement ce que l'ancien code laissait dans localStorage, avec une
      // date recente : sans `refetchOnMount: 'always'`, la donnee serait jugee
      // fraiche (staleTime 24h) et jamais rechargee.
      client.setQueryData(counterAssignmentKeys.forCounter(COUNTER_ID), {});
    });

    // Pas de crash, et liste complete tant que la donnee n'est pas exploitable
    expect(result.current.serverNames).toBeDefined();

    // Le rechargement force remplace le `{}` : le filtre revient
    await waitFor(() => expect(result.current.serverNames).toEqual(['Awa']));
    expect(assignmentCalls()).toBe(1);
  });

  it('repare aussi le cache corrompu quand le comptoir arrive APRES le montage (demarrage reel)', async () => {
    // ⭐ Le cas vu en navigateur : au demarrage, `counterId` est encore inconnu
    // (liste des comptoirs pas encore restauree), puis il arrive. Ce changement
    // de cle ne consulte QUE la fraicheur : un `refetchOnMount` ne suffisait pas.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(counterAssignmentKeys.forCounter(COUNTER_ID), {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ counterId }: { counterId?: string }) => useServerMappings('bar-1', false, counterId),
      { wrapper, initialProps: { counterId: undefined as string | undefined } }
    );
    await waitFor(() => expect(result.current.serverNames).toEqual(['Awa', 'Koffi']));

    rerender({ counterId: COUNTER_ID });

    await waitFor(() => expect(result.current.serverNames).toEqual(['Awa']));
    expect(assignmentCalls()).toBe(1);
  });

  it("ne refait pas d'appel reseau quand le cache contient deja une liste valide", async () => {
    const { result } = setup((client) => {
      client.setQueryData(counterAssignmentKeys.forCounter(COUNTER_ID), ['u2']);
    });

    await waitFor(() => expect(result.current.serverNames).toEqual(['Koffi']));
    expect(assignmentCalls()).toBe(0);
  });

  it('sans comptoir actif, ne filtre pas et ne lit pas les affectations', async () => {
    const { result } = setup(undefined, null);

    await waitFor(() => expect(result.current.serverNames).toEqual(['Awa', 'Koffi']));
    expect(assignmentCalls()).toBe(0);
  });
});

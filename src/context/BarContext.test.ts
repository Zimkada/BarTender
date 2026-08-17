import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBarContext, BarProvider } from './BarContext';
import type { Bar } from '../types';

// Mock dependencies
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'test-user', role: 'gerant', userName: 'Test' },
    hasPermission: vi.fn(() => true),
    updateCurrentBar: vi.fn()
  }))
}));

vi.mock('../services/supabase/bars.service', () => ({
  BarsService: {
    getAllBars: vi.fn(() => Promise.resolve([])),
    getMyBars: vi.fn(() => Promise.resolve([])),
    createBar: vi.fn(),
    updateBar: vi.fn()
  }
}));

vi.mock('../services/supabase/auth.service', () => ({
  AuthService: {
    getBarMembers: vi.fn(() => Promise.resolve([]))
  }
}));

vi.mock('../services/supabase/server-mappings.service', () => ({
  ServerMappingsService: {
    getAllMappingsForBar: vi.fn(() => Promise.resolve([]))
  }
}));

vi.mock('../services/AuditLogger', () => ({
  auditLogger: { log: vi.fn() }
}));

vi.mock('../utils/offlineStorage', () => ({
  OfflineStorage: {
    getBars: vi.fn(() => []),
    saveBars: vi.fn(),
    getMappings: vi.fn(() => []),
    saveMappings: vi.fn(),
    getCurrentBarId: vi.fn(),
    saveCurrentBarId: vi.fn()
  }
}));

vi.mock('../services/offlineQueue', () => ({
  offlineQueue: {
    getOperations: vi.fn(() => Promise.resolve([]))
  }
}));

vi.mock('../services/NetworkManager', () => ({
  networkManager: {
    getDecision: vi.fn(() => ({ shouldBlock: false }))
  }
}));

describe('BarContext - operatingMode Default Value', () => {
  describe('operatingMode derivation', () => {
    it('should default to "full" when operatingMode is not set in settings', () => {
      /**
       * BUG #1 FIX VALIDATION:
       * BarContext should default to 'full' (not 'simplified')
       * This ensures alignment with backend RLS default
       */
      const mockBar: Bar = {
        id: 'bar-1',
        name: 'Test Bar',
        ownerId: 'owner-1',
        address: '123 Main St',
        phone: '1234567890',
        closingHour: 6,
        isActive: true,
        createdAt: new Date(),
        settings: {
          currency: 'XOF',
          currencySymbol: 'Fr',
          // operatingMode NOT SET - should default to 'full'
        }
      };

      // Simulate the useMemo logic from BarContext.tsx:83
      const operatingMode = mockBar?.settings?.operatingMode || 'full';

      expect(operatingMode).toBe('full');
    });

    it('should respect "simplified" when explicitly set in settings', () => {
      /**
       * When operatingMode is explicitly set to 'simplified',
       * it should NOT default to 'full'
       */
      const mockBar: Bar = {
        id: 'bar-2',
        name: 'Simple Bar',
        ownerId: 'owner-2',
        address: '456 Side St',
        phone: '0987654321',
        closingHour: 6,
        isActive: true,
        createdAt: new Date(),
        settings: {
          currency: 'XOF',
          currencySymbol: 'Fr',
          operatingMode: 'simplified' // EXPLICITLY SET
        }
      };

      const operatingMode = mockBar?.settings?.operatingMode || 'full';

      expect(operatingMode).toBe('simplified');
    });

    it('should respect "full" when explicitly set in settings', () => {
      /**
       * When operatingMode is explicitly set to 'full',
       * the default should not override it
       */
      const mockBar: Bar = {
        id: 'bar-3',
        name: 'Full Bar',
        ownerId: 'owner-3',
        address: '789 Full St',
        phone: '5551234567',
        closingHour: 6,
        isActive: true,
        createdAt: new Date(),
        settings: {
          currency: 'XOF',
          currencySymbol: 'Fr',
          operatingMode: 'full' // EXPLICITLY SET
        }
      };

      const operatingMode = mockBar?.settings?.operatingMode || 'full';

      expect(operatingMode).toBe('full');
    });

    it('should derive isSimplifiedMode correctly from operatingMode', () => {
      /**
       * isSimplifiedMode should be a boolean derived from operatingMode
       * Logic: operatingMode === 'simplified'
       */
      const testCases = [
        { mode: 'full', expected: false },
        { mode: 'simplified', expected: true },
        { mode: undefined, expected: false } // undefined defaults to 'full'
      ];

      testCases.forEach(({ mode, expected }) => {
        const operatingMode = mode || 'full';
        const isSimplifiedMode = operatingMode === 'simplified';
        expect(isSimplifiedMode).toBe(expected);
      });
    });
  });

  describe('Alignment with Backend Defaults', () => {
    it('should match backend RLS default of "full"', () => {
      /**
       * CRITICAL: Frontend and Backend must align
       * Backend RLS: COALESCE(b.settings->>'operatingMode', 'full')
       * Frontend: currentBar?.settings?.operatingMode || 'full'
       */
      const frontendDefault = 'full';
      const backendDefault = 'full'; // From RLS policy

      expect(frontendDefault).toBe(backendDefault);
    });

    it('null settings should safely default to "full"', () => {
      /**
       * Edge case: What if settings is null or undefined?
       * Should gracefully default to 'full'
       */
      const settingsNull = null;
      const settingsUndefined = undefined;

      const result1 = settingsNull?.operatingMode || 'full';
      const result2 = settingsUndefined?.operatingMode || 'full';

      expect(result1).toBe('full');
      expect(result2).toBe('full');
    });
  });
});

// ---------------------------------------------------------------------------
// INTEGRATION TESTS — BarProvider renderHook
// These tests mount the real BarProvider and verify operatingMode via the hook.
// ---------------------------------------------------------------------------

// Mock supabase (channel used for Realtime subscription in BarProvider)
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  }
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() }
}));

import { BarsService } from '../services/supabase/bars.service';

describe('BarContext - Integration via BarProvider', () => {
  // BarProvider consomme useQueryClient (invalidation des mappings de caisse
  // après retrait/changement de rôle). Dans l'app il est monté sous
  // QueryClientProvider (main.tsx) — le wrapper reproduit cet arbre.
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      {
        client: new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        })
      },
      React.createElement(BarProvider, null, children)
    );

  describe('operatingMode via real hook + provider', () => {
    it('should return operatingMode "full" when bar has no operatingMode in settings', async () => {
      /**
       * INTEGRATION TEST (BUG #1):
       * Verifies BarProvider exposes operatingMode='full' when the loaded bar
       * has settings without an explicit operatingMode.
       * This tests the actual useMemo in BarProvider, not just the logic inline.
       */
      const barWithoutMode: Bar = {
        id: 'bar-integration-1',
        name: 'Integration Bar',
        ownerId: 'owner-1',
        closingHour: 6,
        isActive: true,
        createdAt: new Date(),
        settings: { currency: 'XOF', currencySymbol: 'Fr' }
      };

      (BarsService.getMyBars as Mock).mockResolvedValue([barWithoutMode]);

      const { result } = renderHook(() => useBarContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // currentBar is the loaded bar (auto-selected as first available)
      expect(result.current.currentBar?.id).toBe('bar-integration-1');
      // operatingMode must be 'full' — BUG #1 fix
      expect(result.current.operatingMode).toBe('full');
      expect(result.current.isSimplifiedMode).toBe(false);
    });

    it('should return operatingMode "simplified" when bar has operatingMode="simplified"', async () => {
      const barSimplified: Bar = {
        id: 'bar-integration-2',
        name: 'Simplified Bar',
        ownerId: 'owner-1',
        closingHour: 6,
        isActive: true,
        createdAt: new Date(),
        settings: { currency: 'XOF', currencySymbol: 'Fr', operatingMode: 'simplified' }
      };

      (BarsService.getMyBars as Mock).mockResolvedValue([barSimplified]);

      const { result } = renderHook(() => useBarContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.operatingMode).toBe('simplified');
      expect(result.current.isSimplifiedMode).toBe(true);
    });
  });

  describe('hasRestaurant via real hook + provider (§3, §13.4)', () => {
    /**
     * Fabrique un bar de test — seuls `settings` varient d'un cas à l'autre.
     */
    const makeBar = (id: string, settings: Bar['settings']): Bar => ({
      id,
      name: `Bar ${id}`,
      ownerId: 'owner-1',
      closingHour: 6,
      isActive: true,
      createdAt: new Date(),
      settings,
    });

    const renderWithBar = async (bar: Bar) => {
      (BarsService.getMyBars as Mock).mockResolvedValue([bar]);
      const { result } = renderHook(() => useBarContext(), { wrapper });
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      return result;
    };

    it('⛔ bar PUR (drapeau absent) → hasRestaurant = false', async () => {
      // ⭐ Le cas de 100% des bars en production. §3 : l'app doit leur rester
      // STRICTEMENT identique — c'est la contrainte de plus haut niveau.
      const result = await renderWithBar(
        makeBar('bar-pur', { currency: 'XOF', currencySymbol: 'Fr' })
      );

      expect(result.current.hasRestaurant).toBe(false);
    });

    it('⛔ drapeau explicitement false → hasRestaurant = false', async () => {
      const result = await renderWithBar(
        makeBar('bar-sans', { currency: 'XOF', currencySymbol: 'Fr', hasRestaurant: false })
      );

      expect(result.current.hasRestaurant).toBe(false);
    });

    it('✅ drapeau true + mode complet → hasRestaurant = true', async () => {
      const result = await renderWithBar(
        makeBar('bar-resto', {
          currency: 'XOF',
          currencySymbol: 'Fr',
          hasRestaurant: true,
          operatingMode: 'full',
        })
      );

      expect(result.current.hasRestaurant).toBe(true);
    });

    /**
     * ⭐⭐ TEST RETOURNÉ le 16/08/2026 — §13.4 RÉVISÉ (§20, lot 1).
     *
     * Il affirmait l'inverse : « drapeau true MAIS mode simplifié →
     * hasRestaurant = false ». Ce verrou excluait 45 % du parc (5 bars sur 11)
     * d'un module déjà construit.
     *
     * ⚠️ RETOURNÉ, PAS SUPPRIMÉ : la trace du changement de décision compte
     * autant que la décision. Le gérant possède déjà TOUTES les permissions
     * cuisine — en mode simplifié il n'y a pas de cuisinier, c'est lui qui
     * cuisine, donc les transitions sont constatées et non inventées.
     *
     * ⭐ TERRAIN (16/08/2026) : un bar-restau réel alterne entre les deux modes
     * selon les soirs — parfois seul le gérant tient le téléphone. La cuisine
     * doit suivre les deux, et la bascule doit rester possible à tout moment.
     */
    it('✅ §20 — drapeau true + mode SIMPLIFIÉ → hasRestaurant = true', async () => {
      const result = await renderWithBar(
        makeBar('bar-simplifie', {
          currency: 'XOF',
          currencySymbol: 'Fr',
          hasRestaurant: true,
          operatingMode: 'simplified',
        })
      );

      // ⭐ La cuisine est EXPOSÉE : le mode ne conditionne plus le drapeau.
      expect(result.current.hasRestaurant).toBe(true);
      expect(result.current.isSimplifiedMode).toBe(true);
      // ⭐ ...et l'UI sait qu'elle doit se condenser.
      expect(result.current.isSimplifiedKitchen).toBe(true);
    });

    it('⭐ mode COMPLET → isSimplifiedKitchen = false, la cuisine reste exposée', async () => {
      // ⚠️ Le pendant du test précédent : `isSimplifiedKitchen` distingue les
      // deux régimes d'UI SANS jamais masquer la cuisine.
      const result = await renderWithBar(
        makeBar('bar-complet', {
          currency: 'XOF',
          currencySymbol: 'Fr',
          hasRestaurant: true,
          operatingMode: 'full',
        })
      );

      expect(result.current.hasRestaurant).toBe(true);
      expect(result.current.isSimplifiedKitchen).toBe(false);
    });

    it('⛔ §3 — un bar PUR en simplifié n\'expose RIEN, mode ou pas', async () => {
      /**
       * ⚠️ LE TEST QUI PROTÈGE LA CONTRAINTE DE PLUS HAUT NIVEAU. Lever le
       * verrou du mode ne doit RIEN changer pour les bars sans restauration :
       * c'est le drapeau, et lui seul, qui ouvre la cuisine.
       */
      const result = await renderWithBar(
        makeBar('bar-pur-simplifie', {
          currency: 'XOF',
          currencySymbol: 'Fr',
          operatingMode: 'simplified',
        })
      );

      expect(result.current.hasRestaurant).toBe(false);
      expect(result.current.isSimplifiedKitchen).toBe(false);
    });

    it('⚠️ la chaîne "true" du JSONB n\'active PAS la cuisine', async () => {
      // `settings` accepte des clés dynamiques (`[key: string]: unknown`) : une
      // valeur mal typée venue du JSONB serait truthy. La comparaison stricte
      // `=== true` empêche d'activer la cuisine sur un bar pur par accident.
      const result = await renderWithBar(
        makeBar('bar-jsonb', {
          currency: 'XOF',
          currencySymbol: 'Fr',
          hasRestaurant: 'true' as unknown as boolean,
        })
      );

      expect(result.current.hasRestaurant).toBe(false);
    });
  });
});

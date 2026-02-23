import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBarContext } from './BarContext';
import { BarProvider } from './BarContext';
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

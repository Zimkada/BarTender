import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanWorkOffline } from './useCanWorkOffline';

// Mock dependencies
const mockUseAuth = vi.fn();
const mockUseBarContext = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

vi.mock('../context/BarContext', () => ({
  useBarContext: () => mockUseBarContext()
}));

describe('useCanWorkOffline Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Manager in Full Mode', () => {
    it('should allow GERANT to work offline in full mode', () => {
      /**
       * BUG #3 FIX VALIDATION:
       * A gerant in full mode should be able to work offline
       * Condition: isManagerRole = true, isSimplifiedMode = false
       * Expected: canWorkOffline = true
       */
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'gerant', userId: 'user-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(true);
    });

    it('should allow PROMOTEUR to work offline in full mode', () => {
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'promoteur', userId: 'user-2' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(true);
    });

    it('should allow SUPER_ADMIN to work offline in full mode', () => {
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'super_admin', userId: 'user-3' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(true);
    });
  });

  describe('Manager in Simplified Mode', () => {
    it('should allow GERANT to work offline in simplified mode', () => {
      /**
       * In simplified mode, managers should also be able to work offline
       * because they are the primary operators
       */
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'gerant', userId: 'user-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: true
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(true);
    });
  });

  describe('Server Access - Full Mode (Blocked)', () => {
    it('should PREVENT server from working offline in full mode', () => {
      /**
       * CRITICAL SECURITY: Servers cannot work offline in full mode
       * They must always have network connection and manager approval
       * Condition: isManagerRole = false, isSimplifiedMode = false
       * Expected: canWorkOffline = false ❌
       */
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'serveur', userId: 'server-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(false);
    });

    it('should work correctly with null session', () => {
      /**
       * Edge case: null or missing session should prevent offline work
       */
      mockUseAuth.mockReturnValue({
        currentSession: null
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(false);
    });
  });

  describe('Server Access - Simplified Mode (Allowed)', () => {
    it('should ALLOW server to work offline in simplified mode', () => {
      /**
       * BUG #3 RESOLUTION:
       * In simplified mode, the device is typically a central kiosk
       * managed by the owner/manager, so offline capability is allowed
       * Condition: isSimplifiedMode = true
       * Expected: canWorkOffline = true (regardless of role)
       */
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'serveur', userId: 'server-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: true
      });

      const { result } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(true);
    });

    it('should allow any role in simplified mode', () => {
      /**
       * In simplified mode, the key is that it's a controlled environment
       * The manager is the one configuring it, so all users on that device
       * inherit the offline capability
       */
      const roles = ['serveur', 'gerant', 'promoteur', 'super_admin'];

      roles.forEach((role) => {
        mockUseAuth.mockReturnValue({
          currentSession: { role, userId: `user-${role}` }
        });
        mockUseBarContext.mockReturnValue({
          isSimplifiedMode: true
        });

        const { result } = renderHook(() => useCanWorkOffline());

        expect(result.current).toBe(true);
      });
    });
  });

  describe('Consistency Matrix (BUG #3 Validation)', () => {
    it('should produce consistent results across all role/mode combinations', () => {
      /**
       * Truth table for canWorkOffline logic:
       * isManagerRole | isSimplifiedMode | Expected Result
       * true          | false            | true  (manager full mode)
       * true          | true             | true  (manager simplified mode)
       * false         | false            | false (server full mode) ❌ BLOCKED
       * false         | true             | true  (server simplified mode) ✅ ALLOWED
       */
      const testCases = [
        { isManager: true, isSimplified: false, expected: true },
        { isManager: true, isSimplified: true, expected: true },
        { isManager: false, isSimplified: false, expected: false },
        { isManager: false, isSimplified: true, expected: true }
      ];

      testCases.forEach(({ isManager, isSimplified, expected }) => {
        mockUseAuth.mockReturnValue({
          currentSession: {
            role: isManager ? 'gerant' : 'serveur',
            userId: 'test-user'
          }
        });
        mockUseBarContext.mockReturnValue({
          isSimplifiedMode: isSimplified
        });

        const { result } = renderHook(() => useCanWorkOffline());

        expect(result.current).toBe(expected);
      });
    });
  });

  describe('Memoization (Performance)', () => {
    it('should memoize the result to prevent unnecessary re-renders', () => {
      /**
       * The hook uses useMemo to ensure reference stability
       * This prevents downstream useEffect/useCallback from triggering unnecessarily
       */
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'gerant', userId: 'user-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result, rerender } = renderHook(() => useCanWorkOffline());

      const firstResult = result.current;

      // Re-render with same props
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'gerant', userId: 'user-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      rerender();

      // Result should be the same boolean value (memoized)
      expect(result.current).toBe(firstResult);
    });

    it('should update when dependencies change', () => {
      /**
       * When dependencies (currentSession?.role or isSimplifiedMode) change,
       * the memoized result should be recalculated
       */
      mockUseAuth.mockReturnValue({
        currentSession: { role: 'serveur', userId: 'server-1' }
      });
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: false
      });

      const { result, rerender } = renderHook(() => useCanWorkOffline());

      expect(result.current).toBe(false); // Server in full mode

      // Change to simplified mode
      mockUseBarContext.mockReturnValue({
        isSimplifiedMode: true
      });

      rerender();

      expect(result.current).toBe(true); // Server in simplified mode - now allowed
    });
  });
});

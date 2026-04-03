import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlan } from './usePlan';

const mockUseBarContext = vi.fn();

vi.mock('../context/BarContext', () => ({
  useBarContext: () => mockUseBarContext()
}));

describe('usePlan Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMock(plan: string | undefined, memberCount: number, activeFlags?: boolean[]) {
    const barMembers = Array.from({ length: memberCount }, (_, i) => ({
      id: `member-${i}`,
      userId: `user-${i}`,
      barId: 'bar-1',
      role: 'serveur' as const,
      isActive: activeFlags ? activeFlags[i] : true,
    }));

    mockUseBarContext.mockReturnValue({
      currentBar: {
        id: 'bar-1',
        name: 'Test Bar',
        settings: { plan, currency: 'XOF', currencySymbol: 'FCFA' },
      },
      barMembers,
    });
  }

  describe('plan resolution', () => {
    it('defaults to starter when no plan set', () => {
      setupMock(undefined, 0);
      const { result } = renderHook(() => usePlan());
      expect(result.current.plan.id).toBe('starter');
    });

    it('returns pro when plan is pro', () => {
      setupMock('pro', 0);
      const { result } = renderHook(() => usePlan());
      expect(result.current.plan.id).toBe('pro');
    });

    it('returns enterprise when plan is enterprise', () => {
      setupMock('enterprise', 0);
      const { result } = renderHook(() => usePlan());
      expect(result.current.plan.id).toBe('enterprise');
    });
  });

  describe('canAddMember', () => {
    it('allows adding when under limit (starter, 1/2)', () => {
      setupMock('starter', 1);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(true);
      expect(result.current.memberLimitMessage).toBeNull();
    });

    it('blocks adding when at limit (starter, 2/2)', () => {
      setupMock('starter', 2);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(false);
      expect(result.current.memberLimitMessage).toContain('2 membres max');
    });

    it('blocks adding when over limit (starter, 3/2)', () => {
      setupMock('starter', 3);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(false);
    });

    it('allows adding when under limit (pro, 7/8)', () => {
      setupMock('pro', 7);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(true);
    });

    it('allows adding when still below previous threshold (pro, 5/8)', () => {
      setupMock('pro', 5);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(true);
    });

    it('blocks adding when at limit (pro, 8/8)', () => {
      setupMock('pro', 8);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(false);
      expect(result.current.memberLimitMessage).toContain('8 membres max');
    });

    it('blocks adding when over limit (pro, 9/8)', () => {
      setupMock('pro', 9);
      const { result } = renderHook(() => usePlan());
      expect(result.current.canAddMember).toBe(false);
    });

    it('only counts active members', () => {
      // 3 members total but only 1 active → under starter limit of 2
      setupMock('starter', 3, [true, false, false]);
      const { result } = renderHook(() => usePlan());
      expect(result.current.activeMemberCount).toBe(1);
      expect(result.current.canAddMember).toBe(true);
    });
  });

  describe('hasFeature', () => {
    it('starter has no features', () => {
      setupMock('starter', 0);
      const { result } = renderHook(() => usePlan());
      expect(result.current.hasFeature('accounting')).toBe(false);
      expect(result.current.hasFeature('exports')).toBe(false);
      expect(result.current.hasFeature('promotions')).toBe(false);
      expect(result.current.hasFeature('forecasting')).toBe(false);
    });

    it('pro has accounting, exports, promotions', () => {
      setupMock('pro', 0);
      const { result } = renderHook(() => usePlan());
      expect(result.current.hasFeature('accounting')).toBe(true);
      expect(result.current.hasFeature('exports')).toBe(true);
      expect(result.current.hasFeature('promotions')).toBe(true);
      expect(result.current.hasFeature('forecasting')).toBe(false);
    });

    it('enterprise has all features', () => {
      setupMock('enterprise', 0);
      const { result } = renderHook(() => usePlan());
      expect(result.current.hasFeature('accounting')).toBe(true);
      expect(result.current.hasFeature('exports')).toBe(true);
      expect(result.current.hasFeature('promotions')).toBe(true);
      expect(result.current.hasFeature('forecasting')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles null barMembers', () => {
      mockUseBarContext.mockReturnValue({
        currentBar: { id: 'bar-1', settings: { plan: 'pro' } },
        barMembers: null,
      });
      const { result } = renderHook(() => usePlan());
      expect(result.current.activeMemberCount).toBe(0);
      expect(result.current.canAddMember).toBe(true);
    });

    it('handles undefined currentBar', () => {
      mockUseBarContext.mockReturnValue({
        currentBar: null,
        barMembers: [],
      });
      const { result } = renderHook(() => usePlan());
      expect(result.current.plan.id).toBe('starter');
    });
  });
});

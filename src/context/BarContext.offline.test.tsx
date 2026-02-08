
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BarProvider, useBar } from './BarContext';
import { offlineQueue } from '../services/offlineQueue';
import { useAuth } from './AuthContext';
import { BarsService } from '../services/supabase/bars.service';

// Mock dependencies
vi.mock('../services/offlineQueue', () => ({
    offlineQueue: {
        addOperation: vi.fn(),
        getOperations: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('../services/supabase/bars.service', () => ({
    BarsService: {
        updateBar: vi.fn(),
        getUserBars: vi.fn(),
        getMyBars: vi.fn(),
        getBarStats: vi.fn(),
    },
}));

vi.mock('./AuthContext', () => ({
    useAuth: vi.fn(),
}));

// Mock NetworkManager
vi.mock('../services/NetworkManager', () => ({
    networkManager: {
        getDecision: vi.fn(() => ({ shouldBlock: true, reason: 'offline_forced' })),
        isOnline: vi.fn(() => false),
        subscribe: vi.fn(() => () => { }),
    }
}));

// Mock OfflineStorage
vi.mock('../utils/offlineStorage', () => ({
    OfflineStorage: {
        getBars: vi.fn().mockReturnValue([]),
        saveBars: vi.fn(),
        getCurrentBarId: vi.fn(),
        saveCurrentBarId: vi.fn(),
        getMappings: vi.fn().mockReturnValue([]),
        saveMappings: vi.fn(),
    }
}));

describe('BarContext - Offline Resilience', () => {
    const mockUser = { id: 'user-123' };
    const mockBar = {
        id: 'bar-1',
        name: 'Test Bar',
        ownerId: 'user-123',
        closingHour: 23,
        isActive: true,
        createdAt: new Date(),
        settings: { currency: 'EUR', currencySymbol: '€' }
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (useAuth as any).mockReturnValue({
            user: mockUser,
            currentSession: { userId: 'user-123', role: 'promoteur', barId: 'bar-1' },
            loading: false,
            hasPermission: () => true,
            updateCurrentBar: vi.fn(),
        });

        (BarsService.getMyBars as any).mockResolvedValue([mockBar]);
        (offlineQueue.getOperations as any).mockResolvedValue([]);
    });

    it('should queue UPDATE_BAR operation when offline', async () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <BarProvider>{children}</BarProvider>
        );

        const { result } = renderHook(() => useBar(), { wrapper });

        // Wait for context to initialize
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Auto-selection logic logic might need time
        if (!result.current.currentBar) {
            await act(async () => {
                await result.current.switchBar('bar-1');
            });
        }

        const updates = { name: 'Offline Name Update' };

        await act(async () => {
            await result.current.updateBar('bar-1', updates);
        });

        expect(offlineQueue.addOperation).toHaveBeenCalledWith(
            'UPDATE_BAR',
            expect.objectContaining({
                barId: 'bar-1',
                updates: expect.objectContaining({ name: 'Offline Name Update' })
            }),
            'bar-1',
            'user-123'
        );
    });

    it('should queue settings updates correctly (Satisfies Schema)', async () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <BarProvider>{children}</BarProvider>
        );
        const { result } = renderHook(() => useBar(), { wrapper });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        if (!result.current.currentBar) {
            await act(async () => {
                await result.current.switchBar('bar-1');
            });
        }

        const settingsUpdate = { settings: { taxRate: 20 } as any };

        await act(async () => {
            await result.current.updateBar('bar-1', settingsUpdate);
        });

        expect(offlineQueue.addOperation).toHaveBeenCalledWith(
            'UPDATE_BAR',
            expect.objectContaining({
                updates: expect.objectContaining({
                    settings: expect.objectContaining({ taxRate: 20 })
                })
            }),
            'bar-1',
            'user-123'
        );
    });
});

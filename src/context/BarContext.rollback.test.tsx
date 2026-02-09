import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { ReactNode } from 'react';
import { BarProvider, useBarContext } from './BarContext';
import { BarsService } from '../services/supabase/bars.service';
import { OfflineStorage } from '../utils/offlineStorage';
import { networkManager } from '../services/NetworkManager';
import { useAuth } from './AuthContext';

// 1. Mocks de base
vi.mock('./AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('../services/supabase/bars.service', () => ({
    BarsService: {
        updateBar: vi.fn(),
        getMyBars: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('../utils/offlineStorage', () => ({
    OfflineStorage: {
        getBars: vi.fn(),
        saveBars: vi.fn(),
        getCurrentBarId: vi.fn(),
        saveCurrentBarId: vi.fn(),
        getMappings: vi.fn().mockReturnValue([]),
        saveMappings: vi.fn(),
        checkVersionAndMigrate: vi.fn(),
    },
}));

vi.mock('../services/NetworkManager', () => ({
    networkManager: {
        shouldBlockNetworkOps: vi.fn().mockReturnValue(false), // Online par défaut
        getDecision: vi.fn().mockReturnValue({ shouldBlock: false }),
        subscribe: vi.fn().mockReturnValue(() => { }),
        isOnline: vi.fn().mockReturnValue(true),
    },
}));

vi.mock('../services/AuditLogger', () => ({
    auditLogger: {
        log: vi.fn(),
    },
}));

// Wrapper pour fournir les contextes nécessaires
const wrapper = ({ children }: { children: ReactNode }) => (
    <BarProvider>{children} </BarProvider>
);

describe('BarContext - Structural Hardening (Phase 9)', () => {
    const mockUser = { userId: 'user-123', userName: 'Test User', role: 'gerant' };
    const initialBar = {
        id: 'bar-1',
        name: 'Bar Initial',
        ownerId: 'user-123',
        settings: {},
        isActive: true,
        createdAt: new Date()
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup Auth mock
        (useAuth as any).mockReturnValue({
            currentSession: mockUser,
            hasPermission: () => true,
            updateCurrentBar: vi.fn(),
        });

        // Setup OfflineStorage mock
        (OfflineStorage.getBars as any).mockReturnValue([initialBar]);
        (OfflineStorage.getCurrentBarId as any).mockReturnValue('bar-1');
    });

    it('[CRITICAL] Devrait gérer les erreurs lors de updateBar', async () => {
        // 1. Configurer l'échec du serveur
        const serverError = new Error('Database connection failed');
        (BarsService.updateBar as any).mockRejectedValue(serverError);

        const { result } = renderHook(() => useBarContext(), { wrapper });

        // 2. Tenter une mise à jour et vérifier qu'elle rejette
        const updates = { name: 'Nouveau Nom Tentative' };
        let updateError: Error | undefined;

        await act(async () => {
            try {
                await result.current.updateBar('bar-1', updates);
            } catch (e) {
                updateError = e as Error;
            }
        });

        // 3. VÉRIFICATIONS (Le cœur du durcissement Phase 9)

        // A. Vérifier que BarsService.updateBar a été appelé avec les bons paramètres
        expect(BarsService.updateBar).toHaveBeenCalledWith('bar-1', expect.any(Object));

        // B. Vérifier que l'erreur a été propagée
        expect(updateError).toBeDefined();
        expect(updateError?.message).toContain('Database connection failed');

        // C. Vérifier que OfflineStorage.saveBars a été appelé au moins une fois
        expect(OfflineStorage.saveBars).toHaveBeenCalled();

        console.log('✅ Test [Error Handling BarContext] réussi : Erreur gérée correctement.');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { ReactNode } from 'react';
import { BarProvider, useBarContext } from '../BarContext';
import { BarsService } from '../../services/supabase/bars.service';
import { OfflineStorage } from '../../utils/offlineStorage';
import { networkManager } from '../../services/NetworkManager';
import { useAuth } from '../../context/AuthContext';

// 1. Mocks de base
vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('../../services/supabase/bars.service', () => ({
    BarsService: {
        updateBar: vi.fn(),
        getMyBars: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('../../utils/offlineStorage', () => ({
    OfflineStorage: {
        getBars: vi.fn(),
        saveBars: vi.fn(),
        getCurrentBarId: vi.fn(),
        saveCurrentBarId: vi.fn(),
        checkVersionAndMigrate: vi.fn(), // Ajouté en Phase 9
    },
}));

vi.mock('../../services/NetworkManager', () => ({
    networkManager: {
        shouldBlockNetworkOps: vi.fn().mockReturnValue(false), // Online par défaut
        subscribe: vi.fn().mockReturnValue(() => { }),
    },
}));

vi.mock('../../services/AuditLogger', () => ({
    auditLogger: {
        log: vi.fn(),
    },
}));

// Wrapper pour fournir les contextes nécessaires
const wrapper = ({ children }: { children: ReactNode }) => (
    <BarProvider>{ children } </BarProvider>
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

    it('[CRITICAL] Devrait effectuer un rollback si BarsService.updateBar échoue', async () => {
        // 1. Configurer l'échec du serveur
        const serverError = new Error('Database connection failed');
        (BarsService.updateBar as any).mockRejectedValue(serverError);

        const { result } = renderHook(() => useBarContext(), { wrapper });

        // 2. Tenter une mise à jour
        const updates = { name: 'Nouveau Nom Tentative' };

        // On s'attend à ce que l'appel throw car j'ai ajouté un 'throw error' dans le catch révisé
        await act(async () => {
            try {
                await result.current.updateBar('bar-1', updates);
            } catch (e) {
                // Erreur attendue
            }
        });

        // 3. VÉRIFICATIONS (Le cœur du durcissement Phase 9)

        // A. L'état React doit être revenu à 'Bar Initial'
        expect(result.current.currentBar?.name).toBe('Bar Initial');

        // B. OfflineStorage.saveBars doit avoir été appelé pour restaurer le cache
        // Premier appel pour l'update optimiste, deuxième appel pour le rollback
        expect(OfflineStorage.saveBars).toHaveBeenCalledTimes(2);

        // Le dernier appel doit être avec le bar initial (rollback)
        const lastCallArgs = (OfflineStorage.saveBars as any).mock.calls.at(-1)[0];
        expect(lastCallArgs.find((b: any) => b.id === 'bar-1').name).toBe('Bar Initial');

        console.log('✅ Test [Rollback BarContext] réussi : Incohérence évitée.');
    });
});

import { describe, it, expect } from 'vitest';
import { calculateRevenueStats } from '../utils/revenueCalculator';
import type { Sale, Return } from '../types';

describe('revenueCalculator', () => {
    // Helper helpers
    const createSale = (id: string, total: number, idempotencyKey?: string, status: 'validated' = 'validated'): Sale => ({
        id,
        barId: 'bar-1',
        items: [],
        total,
        currency: 'XOF',
        status,
        createdBy: 'user-1',
        soldBy: 'user-1',
        createdAt: new Date(),
        // Normalement businessDate est une Date, mais filterByBusinessDateRange utilise getBusinessDate qui gère string ou Date.
        // On va mettre une date fixe pour les tests.
        businessDate: new Date('2023-01-01T12:00:00Z'),
        idempotencyKey
    } as unknown as Sale); // Cast safely

    const createReturn = (id: string, refundAmount: number): Return => ({
        id,
        barId: 'bar-1',
        refundAmount,
        isRefunded: true,
        status: 'approved',
        returnedBy: 'user-1',
        returnedAt: new Date('2023-01-01T12:00:00Z'),
        businessDate: new Date('2023-01-01T12:00:00Z'),
    } as any);

    it('should calculate basic gross revenue from server sales', () => {
        const sales = [
            createSale('1', 1000),
            createSale('2', 500)
        ];

        const stats = calculateRevenueStats({
            sales,
            returns: [],
            offlineSales: [],
            recentlySyncedKeys: new Map(),
            startDate: '2023-01-01',
            endDate: '2023-01-01',
            closeHour: 6,
            isServerRole: false
        });

        expect(stats.grossRevenue).toBe(1500);
        expect(stats.netRevenue).toBe(1500);
        expect(stats.saleCount).toBe(2);
    });

    it('should add transition revenue from recentlySyncedKeys if NOT in server sales', () => {
        const sales = [createSale('1', 1000)];
        const key = 'uuid-123';
        const recentlySyncedKeys = new Map();
        recentlySyncedKeys.set(key, { total: 500, timestamp: Date.now(), payload: {} });

        const stats = calculateRevenueStats({
            sales,
            returns: [],
            offlineSales: [],
            recentlySyncedKeys,
            startDate: '2023-01-01',
            endDate: '2023-01-01',
            closeHour: 6,
            isServerRole: false
        });

        // 1000 (server) + 500 (transition)
        expect(stats.grossRevenue).toBe(1500);
        expect(stats.saleCount).toBe(2);
    });

    it('should NOT add transition revenue if already in server sales (Deduplication)', () => {
        const key = 'uuid-123';
        // Vente serveur QUI A DÉJÀ la clé (synchro terminée)
        const sales = [createSale('1', 1000, key)];

        const recentlySyncedKeys = new Map();
        // Le buffer contient encore la clé (pas encore expiré du timeout 10s)
        recentlySyncedKeys.set(key, { total: 1000, timestamp: Date.now(), payload: {} });

        const stats = calculateRevenueStats({
            sales,
            returns: [],
            offlineSales: [],
            recentlySyncedKeys,
            startDate: '2023-01-01',
            endDate: '2023-01-01',
            closeHour: 6,
            isServerRole: false
        });

        // Devrait être 1000 (server) et PAS 2000
        expect(stats.grossRevenue).toBe(1000);
        expect(stats.saleCount).toBe(1);
    });

    it('should deduplicate offline queue sales if present in recentlySyncedKeys', () => {
        const key = 'uuid-offline-1';
        const offlineSales = [{ idempotency_key: key, total: 500, sold_by: 'user-1' }];

        const recentlySyncedKeys = new Map();
        // Le buffer a la clé (vient d'être succès RPC)
        recentlySyncedKeys.set(key, { total: 500, timestamp: Date.now(), payload: {} });

        const stats = calculateRevenueStats({
            sales: [], // Rien sur le serveur encore
            returns: [],
            offlineSales,
            recentlySyncedKeys,
            startDate: '2023-01-01',
            endDate: '2023-01-01',
            closeHour: 6,
            isServerRole: false
        });

        // Le calcul:
        // Server: 0
        // Transition: 500 (car buffer contient la clé et server sales NON)
        // Offline: 0 (car offline sale a une clé qui est dans buffer)
        // Total: 500
        expect(stats.grossRevenue).toBe(500);
        expect(stats.saleCount).toBe(1);
    });

    it('should NOT deduplicate offline sale if key is missing from buffer', () => {
        const key = 'uuid-offline-2';
        const offlineSales = [{ idempotency_key: key, total: 200, sold_by: 'user-1' }];
        const recentlySyncedKeys = new Map(); // Buffer vide

        const stats = calculateRevenueStats({
            sales: [],
            returns: [],
            offlineSales,
            recentlySyncedKeys,
            startDate: '2023-01-01',
            endDate: '2023-01-01',
            closeHour: 6,
            isServerRole: false
        });

        // Server: 0
        // Transition: 0
        // Offline: 200
        expect(stats.grossRevenue).toBe(200);
    });
});

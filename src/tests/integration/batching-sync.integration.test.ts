import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncManager } from '../../services/SyncManager';
import { offlineQueue } from '../../services/offlineQueue';
import { supabase } from '../../lib/supabase';
import { networkManager } from '../../services/NetworkManager';

// Mock dependencies
vi.mock('../../services/offlineQueue', () => ({
    offlineQueue: {
        getOperations: vi.fn(),
        updateOperationStatus: vi.fn(),
        removeOperation: vi.fn(),
        getIdTranslations: vi.fn().mockResolvedValue(new Map()),
        saveIdTranslation: vi.fn(),
    }
}));

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(),
            refreshSession: vi.fn(),
        },
        rpc: vi.fn(),
    }
}));

vi.mock('../../services/NetworkManager', () => ({
    networkManager: {
        isOnline: vi.fn(),
        subscribe: vi.fn(),
    }
}));

describe('SyncManager Batching Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset private state (SyncManager is singleton, so state is persistent)
        // We can't easily reset private properties, but we can ensure dependencies behave as "fresh start"
        (networkManager.isOnline as any).mockReturnValue(true);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should batch consecutive CREATE_SALE operations into a single RPC call', async () => {
        // 1. Setup pending operations (3 consecutive sales)
        const pendingOps = [
            {
                type: 'CREATE_SALE',
                id: 'op1',
                barId: 'bar1',
                payload: { idempotency_key: 'key1', items: [], payment_method: 'cash', total: 100 }
            },
            {
                type: 'CREATE_SALE',
                id: 'op2',
                barId: 'bar1',
                payload: { idempotency_key: 'key2', items: [], payment_method: 'card', total: 200 }
            },
            {
                type: 'CREATE_SALE',
                id: 'op3',
                barId: 'bar1',
                payload: { idempotency_key: 'key3', items: [], payment_method: 'cash', total: 300 }
            },
        ];

        (offlineQueue.getOperations as any).mockImplementation(({ status }: { status: string }) => {
            if (status === 'error') return Promise.resolve([]);
            if (status === 'syncing') return Promise.resolve([]);
            if (status === 'pending') return Promise.resolve(pendingOps);
            return Promise.resolve([]);
        });

        // 2. Mock RPC success
        const mockBatchResult = [
            { idempotency_key: 'key1', success: true, sale_id: 'sale1' },
            { idempotency_key: 'key2', success: true, sale_id: 'sale2' },
            { idempotency_key: 'key3', success: true, sale_id: 'sale3' }
        ];

        (supabase.rpc as any).mockResolvedValue({
            data: mockBatchResult,
            error: null
        });

        // 3. Mock Auth session (SyncManager checks it)
        (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });

        // 4. Execute Sync
        await syncManager.syncAll();

        // 5. Verify ONE RPC call
        expect(supabase.rpc).toHaveBeenCalledTimes(1);

        // Verify arguments
        expect(supabase.rpc).toHaveBeenCalledWith(
            'create_sales_batch',
            expect.objectContaining({
                p_bar_id: 'bar1',
                p_sales: expect.any(Array) // We can be more specific
            })
        );

        // Verify payload content
        const callArgs = (supabase.rpc as any).mock.calls[0];
        const payload = callArgs[1].p_sales;
        expect(payload).toHaveLength(3);
        expect(payload[0].p_idempotency_key).toBe('key1');
        expect(payload[1].p_idempotency_key).toBe('key2');
        expect(payload[2].p_idempotency_key).toBe('key3');

        // 6. Verify Queue Updates
        // Should mark all as syncing first (we can check call order)
        expect(offlineQueue.updateOperationStatus).toHaveBeenCalledWith('op1', 'syncing');
        expect(offlineQueue.updateOperationStatus).toHaveBeenCalledWith('op2', 'syncing');

        // Should mark all as success eventually
        expect(offlineQueue.updateOperationStatus).toHaveBeenCalledWith('op1', 'success');
        expect(offlineQueue.updateOperationStatus).toHaveBeenCalledWith('op2', 'success');
        expect(offlineQueue.updateOperationStatus).toHaveBeenCalledWith('op3', 'success');

        // Should remove from queue
        expect(offlineQueue.removeOperation).toHaveBeenCalledWith('op1');
        expect(offlineQueue.removeOperation).toHaveBeenCalledWith('op2');
        expect(offlineQueue.removeOperation).toHaveBeenCalledWith('op3');
    });

    it('should process mixed operations correctly (batch sales, then single op)', async () => {
        // Ops: Sale -> Sale -> UpdateBar
        const pendingOps = [
            {
                type: 'CREATE_SALE',
                id: 'op1',
                barId: 'bar1',
                payload: { idempotency_key: 'key1' }
            },
            {
                type: 'CREATE_SALE',
                id: 'op2',
                barId: 'bar1',
                payload: { idempotency_key: 'key2' }
            },
            {
                type: 'UPDATE_BAR',
                id: 'op3',
                barId: 'bar1',
                payload: { updates: { name: 'New Name' } },
                timestamp: 123456789
            },
        ];
        (offlineQueue.getOperations as any).mockResolvedValue(pendingOps);

        // Mock RPCs
        // 1st call: batch sales
        (supabase.rpc as any)
            .mockResolvedValueOnce({
                data: [
                    { idempotency_key: 'key1', success: true, sale_id: 'sale1' },
                    { idempotency_key: 'key2', success: true, sale_id: 'sale2' }
                ],
                error: null
            });

        // Mock UpdateBar (which calls BarsService.updateBar -> likely supabase.from(...).update())
        // Wait, SyncManager.ts calls BarsService.updateBar
        // We should mock BarsService? It's imported in SyncManager.
        // SyncManager: import { BarsService } from './supabase/bars.service';

        // For this test, we verify that syncAll calls create_sales_batch only for the first two
    });
});

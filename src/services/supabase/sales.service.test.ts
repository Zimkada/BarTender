
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SalesService } from './sales.service';
import { supabase } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import { offlineQueue } from '../offlineQueue';
import { auditLogger } from '../../services/AuditLogger';

// Mocks
vi.mock('../../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
    },
    handleSupabaseError: (err: any) => err.message || 'Error'
}));

vi.mock('../NetworkManager', () => ({
    networkManager: {
        getDecision: vi.fn()
    }
}));

vi.mock('../offlineQueue', () => ({
    offlineQueue: {
        addOperation: vi.fn()
    }
}));

vi.mock('./products.service', () => ({
    ProductsService: {
        incrementStock: vi.fn()
    }
}));

vi.mock('../../services/AuditLogger', () => ({
    auditLogger: {
        log: vi.fn()
    }
}));

describe('SalesService', () => {
    const mockSaleData = {
        bar_id: 'bar-1',
        items: [{
            product_id: 'p1',
            product_name: 'Beer',
            quantity: 2,
            unit_price: 500,
            total_price: 1000
        }],
        payment_method: 'cash' as const,
        sold_by: 'user-1'
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createSale', () => {
        it('should call RPC when online', async () => {
            // Setup Online
            (networkManager.getDecision as any).mockReturnValue({ shouldShowBanner: false });

            // Mock RPC Success
            (supabase.rpc as any).mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: { id: 'sale-123', status: 'validated', total: 1000 },
                    error: null
                })
            });

            const result = await SalesService.createSale(mockSaleData);

            expect(supabase.rpc).toHaveBeenCalledWith(
                'create_sale_idempotent',
                expect.objectContaining({
                    p_bar_id: 'bar-1',
                    p_sold_by: 'user-1'
                })
            );
            expect(result).toHaveProperty('id', 'sale-123');
        });

        it('should fallback to offline queue when network manager validation fails', async () => {
            // Setup Offline
            (networkManager.getDecision as any).mockReturnValue({ shouldShowBanner: true });

            // Mock Queue Success
            (offlineQueue.addOperation as any).mockResolvedValue({ id: 'temp-123' });

            const result = await SalesService.createSale(mockSaleData, { canWorkOffline: true });

            expect(supabase.rpc).not.toHaveBeenCalled();
            expect(offlineQueue.addOperation).toHaveBeenCalledWith(
                'CREATE_SALE',
                expect.anything(),
                'bar-1',
                expect.anything()
            );
            expect(result).toHaveProperty('isOptimistic', true);
        });

        it('should try online first, then fallback to offline on network error', async () => {
            // Setup Online initially
            (networkManager.getDecision as any).mockReturnValue({ shouldShowBanner: false });

            // Mock RPC Failure (Network Error)
            (supabase.rpc as any).mockReturnValue({
                single: vi.fn().mockRejectedValue(new Error('Failed to fetch'))
            });

            // Mock Queue Success
            (offlineQueue.addOperation as any).mockResolvedValue({ id: 'temp-retry-123' });

            const result = await SalesService.createSale(mockSaleData, { canWorkOffline: true });

            expect(supabase.rpc).toHaveBeenCalled();
            expect(offlineQueue.addOperation).toHaveBeenCalled();
            expect(result.id).toBe('temp-retry-123');
        });
    });

    describe('rejectSale', () => {
        it('should call reject_sale RPC', async () => {
            (supabase.rpc as any).mockResolvedValue({
                data: null,
                error: null
            });

            await SalesService.rejectSale('sale-1', 'user-1');

            expect(supabase.rpc).toHaveBeenCalledWith(
                'reject_sale',
                expect.objectContaining({
                    p_sale_id: 'sale-1',
                    p_rejected_by: 'user-1'
                })
            );
        });
    });

    describe('cancelSale', () => {
        it('should call cancel_sale RPC after fetching bar_id', async () => {
            // 1. Mock Fetch bar_id
            const mockSelectChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: { bar_id: 'bar-1' }, error: null })
                    })
                })
            };
            (supabase.from as any).mockReturnValue(mockSelectChain);

            // 2. Mock RPC Success
            (supabase.rpc as any).mockResolvedValue({
                data: { success: true },
                error: null
            });

            await SalesService.cancelSale('sale-1', 'user-1', 'reason');

            expect(supabase.rpc).toHaveBeenCalledWith('cancel_sale', expect.anything());
            expect(auditLogger.log).toHaveBeenCalled();
        });

        it('should throw error if RPC returns success=false', async () => {
            const mockSelectChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: { bar_id: 'bar-1' }, error: null })
                    })
                })
            };
            (supabase.from as any).mockReturnValue(mockSelectChain);

            (supabase.rpc as any).mockResolvedValue({
                data: { success: false, message: 'Blocking condition' },
                error: null
            });

            await expect(SalesService.cancelSale('sale-1', 'user-1', 'reason'))
                .rejects.toThrow('Blocking condition');
        });
    });

    describe('validateSale', () => {
        it('should update status to validated and set validator', async () => {
            (supabase.rpc as any).mockResolvedValue({
                data: null,
                error: null
            });

            await SalesService.validateSale('sale-1', 'user-2');

            expect(supabase.rpc).toHaveBeenCalledWith(
                'validate_sale',
                expect.objectContaining({
                    p_sale_id: 'sale-1',
                    p_validated_by: 'user-2'
                })
            );
        });
    });
});

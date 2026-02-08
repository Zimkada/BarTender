
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SalesService } from './sales.service';
import { supabase } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import { offlineQueue } from '../offlineQueue';
import { ProductsService } from './products.service';
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

    describe('rejectSale (Cancel)', () => {
        it('should increment stock and update status to rejected', async () => {
            // Mock Get Sale
            const mockSale = {
                id: 'sale-1',
                items: [{ product_id: 'p1', quantity: 2 }]
            };

            // Chain 1: Get Sale
            const mockSelectChain1 = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: mockSale, error: null })
                    })
                })
            };

            // Chain 2: Update Sale
            const mockUpdateChain = {
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sale-1', status: 'rejected' }, error: null })
                            })
                        })
                    })
                })
            };

            (supabase.from as any)
                .mockReturnValueOnce(mockSelectChain1)
                .mockReturnValueOnce(mockUpdateChain);

            await SalesService.rejectSale('sale-1', 'admin-1');

            expect(ProductsService.incrementStock).toHaveBeenCalledWith('p1', 2);
            expect(supabase.from).toHaveBeenCalledWith('sales');
        });
    });

    describe('cancelSale', () => {
        it('should check for blocking conditions (returns/consignments)', async () => {
            // 1. Get Sale
            const mockSale = { id: 'sale-1', items: [] };
            const chain1 = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: mockSale, error: null })
                    })
                })
            };

            // 2. Check Returns (Blocking)
            const chain2 = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ count: 1, error: null })
                })
            };

            (supabase.from as any)
                .mockReturnValueOnce(chain1)
                .mockReturnValueOnce(chain2);

            await expect(SalesService.cancelSale('sale-1', 'admin', 'reason'))
                .rejects.toThrow(/Impossible d'annuler cette vente car elle contient des retours/);
        });
    });

    describe('validateSale', () => {
        it('should update status to validated and set validator', async () => {
            const chain = {
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'sale-1', status: 'validated', validated_by: 'user-2' },
                                error: null
                            })
                        })
                    })
                })
            };

            (supabase.from as any).mockReturnValue(chain);

            const result = await SalesService.validateSale('sale-1', 'user-2');

            expect(result.status).toBe('validated');
            expect(result.validated_by).toBe('user-2');
        });
    });
});

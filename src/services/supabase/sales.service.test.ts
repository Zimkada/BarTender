
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
            (networkManager.getDecision as any).mockReturnValue({ shouldBlock: false, shouldShowBanner: false });

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
            (networkManager.getDecision as any).mockReturnValue({ shouldBlock: true, shouldShowBanner: true });

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
            (networkManager.getDecision as any).mockReturnValue({ shouldBlock: false, shouldShowBanner: false });

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

    describe('getSalesByTicketIds', () => {
        // Mock chaîné minimal reproduisant .from().select().eq().in().lt().order().limit()
        interface MockQueryChain {
            select: ReturnType<typeof vi.fn>;
            eq: ReturnType<typeof vi.fn>;
            in: ReturnType<typeof vi.fn>;
            lt: ReturnType<typeof vi.fn>;
            order: ReturnType<typeof vi.fn>;
            limit: ReturnType<typeof vi.fn>;
        }

        const mockQueryResult = (result: { data: unknown[]; error: null }): MockQueryChain => {
            const chain = {} as MockQueryChain;
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.in = vi.fn(() => chain);
            chain.lt = vi.fn(() => chain);
            chain.order = vi.fn(() => chain);
            chain.limit = vi.fn(() => Promise.resolve(result));
            (supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue(chain);
            return chain;
        };

        // 🛡️ Garantie anti-double-comptage (useTickets.ts) : `sales` (fenêtre
        // récente, .gte business_date) et `staleSales` (ce fetch, .lt business_date)
        // doivent rester des ensembles disjoints sur la MÊME colonne/valeur.
        // Ce test vérifie la VRAIE requête Supabase, pas un résultat mocké déjà
        // "propre" — une régression sur la clause .lt ne serait sinon détectée
        // par aucun test (cf. audit du 08/07/2026).
        it('filtre par business_date < beforeDate (pas une autre colonne/opérateur)', async () => {
            const chain = mockQueryResult({ data: [], error: null });

            await SalesService.getSalesByTicketIds(['t1', 't2'], 'bar-1', '2026-07-06');

            expect(supabase.from).toHaveBeenCalledWith('sales');
            expect(chain.eq).toHaveBeenCalledWith('bar_id', 'bar-1');
            expect(chain.in).toHaveBeenCalledWith('ticket_id', ['t1', 't2']);
            expect(chain.lt).toHaveBeenCalledWith('business_date', '2026-07-06');
            expect(chain.limit).toHaveBeenCalledWith(500);
        });

        it('retourne [] sans appeler Supabase si ticketIds est vide', async () => {
            const result = await SalesService.getSalesByTicketIds([], 'bar-1', '2026-07-06');

            expect(result).toEqual([]);
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it('avertit (console.warn) quand le plafond de 500 lignes est atteint', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const fiveHundredRows = Array.from({ length: 500 }, (_, i) => ({ id: `s${i}` }));
            mockQueryResult({ data: fiveHundredRows, error: null });

            await SalesService.getSalesByTicketIds(['t1'], 'bar-1', '2026-07-06');

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Plafond LIMIT=500'));
            warnSpy.mockRestore();
        });

        it('n\'avertit pas quand le résultat est sous le plafond', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            mockQueryResult({ data: [{ id: 's1' }], error: null });

            await SalesService.getSalesByTicketIds(['t1'], 'bar-1', '2026-07-06');

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });
});

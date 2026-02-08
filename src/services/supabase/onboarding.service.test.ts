
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingService } from './onboarding.service';
import { supabase } from '../../lib/supabase';
import { auditLogger } from '../AuditLogger';

// Mock dependencies
vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn(),
    },
    handleSupabaseError: (error: any) => error.message || 'Unknown error',
}));

vi.mock('../AuditLogger', () => ({
    auditLogger: {
        log: vi.fn(),
    },
}));

describe('OnboardingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('verifyManagerExists', () => {
        it('should return true if user exists in users table', async () => {
            const mockSelect = vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: 'user-123' }, error: null }),
                }),
            });
            (supabase.from as any).mockReturnValue({ select: mockSelect });

            const exists = await OnboardingService.verifyManagerExists('user-123');
            expect(exists).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith('users');
        });

        it('should return false if user does not exist or error occurs', async () => {
            const mockSelect = vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                }),
            });
            (supabase.from as any).mockReturnValue({ select: mockSelect });

            const exists = await OnboardingService.verifyManagerExists('user-999');
            expect(exists).toBe(false);
        });
    });

    describe('updateBarMode', () => {
        it('should update operating mode successfully', async () => {
            const mockUpdate = vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                }),
            });
            (supabase.from as any).mockReturnValue({ update: mockUpdate });

            await OnboardingService.updateBarMode('bar-1', 'full', 'user-1');

            expect(supabase.from).toHaveBeenCalledWith('bars');
            expect(mockUpdate).toHaveBeenCalledWith({ operating_mode: 'full' });
            expect(auditLogger.log).toHaveBeenCalled();
        });

        it('should throw error if update fails', async () => {
            const mockUpdate = vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
                }),
            });
            (supabase.from as any).mockReturnValue({ update: mockUpdate });

            await expect(OnboardingService.updateBarMode('bar-1', 'full', 'user-1'))
                .rejects.toThrow('Failed to update mode: Update failed');
        });
    });

    describe('verifyBarReady', () => {
        it('should return isReady=true when all checks pass', async () => {
            // 1. Mock Bar Details
            const mockBar = { id: 'bar-1', name: 'Ready Bar', address: '123 St', closing_hour: 23, settings: {} };
            const barChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: mockBar, error: null })
                    })
                })
            };

            // 2. Mock Products
            const productsChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null })
                })
            };

            // 3. Mock Stock
            const stockChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ count: 5, error: null })
                })
            };

            (supabase.from as any)
                .mockReturnValueOnce(barChain)      // bars
                .mockReturnValueOnce(productsChain) // bar_products
                .mockReturnValueOnce(stockChain);   // supplies

            const result = await OnboardingService.verifyBarReady('bar-1');
            expect(result.isReady).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return errors if bar details incomplete', async () => {
            // 1. Mock Incomplete Bar
            const mockBar = { id: 'bar-1', name: null, address: null, closing_hour: null };
            const barChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: mockBar, error: null })
                    })
                })
            };
            // Assume subsequent calls might happen or not depending on implementation, 
            // but usually validation continues to collect all errors or stops early.
            // Based on code: it continues checks.

            const productsChain = {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null })
                })
            };

            (supabase.from as any)
                .mockReturnValueOnce(barChain)
                .mockReturnValueOnce(productsChain);

            const result = await OnboardingService.verifyBarReady('bar-1');
            expect(result.isReady).toBe(false);
            expect(result.errors).toContain('Bar details incomplete');
            expect(result.errors).toContain('Closing hour not set');
        });
    });

    describe('completeBarOnboardingAtomic', () => {
        it('should return success when RPC call succeeds and Zod validates', async () => {
            (supabase.rpc as any).mockResolvedValue({
                data: { success: true, completed_at: '2024-01-01T00:00:00Z' },
                error: null
            });

            const result = await OnboardingService.completeBarOnboardingAtomic('bar-1', 'owner-1', 'full');

            expect(result.success).toBe(true);
            expect(result.completedAt).toBeDefined();
            expect(auditLogger.log).toHaveBeenCalled();
        });

        it('should handle RPC error', async () => {
            (supabase.rpc as any).mockResolvedValue({
                data: null,
                error: { message: 'RPC Error' }
            });

            const result = await OnboardingService.completeBarOnboardingAtomic('bar-1', 'owner-1');

            expect(result.success).toBe(false);
            expect(result.error).toContain('RPC failed');
        });

        it('should handle Zod validation failure (Invalid Shape)', async () => {
            (supabase.rpc as any).mockResolvedValue({
                data: { success: true }, // Missing 'completed_at' is optional, but if shape is totally wrong?
                // Schema: success: boolean.
                error: null
            });
            // Let's return invalid type for success
            (supabase.rpc as any).mockResolvedValueOnce({
                data: { success: "yes" }, // String instead of boolean
                error: null
            });

            const result = await OnboardingService.completeBarOnboardingAtomic('bar-1', 'owner-1');

            expect(result.success).toBe(false);
            // Error should come from Zod catch block
        });
    });
});

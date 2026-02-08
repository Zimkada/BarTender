
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BarsService } from './bars.service';
import { supabase } from '../../lib/supabase';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
        })),
        rpc: vi.fn(),
    },
    handleSupabaseError: vi.fn((err: any) => err.message || 'Error'),
}));

describe('BarsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('addMemberExisting (Critical: Zod Validation)', () => {
        it('should return success when RPC returns valid successful response', async () => {
            // Mock RPC success
            (supabase.rpc as any).mockResolvedValue({
                data: { success: true, message: 'User added' },
                error: null,
            });

            const result = await BarsService.addMemberExisting(
                'bar-1',
                { email: 'test@example.com' },
                'serveur'
            );

            expect(result.success).toBe(true);
            expect(result.message).toBe('User added');
            expect(supabase.rpc).toHaveBeenCalledWith('add_bar_member_existing', expect.any(Object));
        });

        it('should return failure when RPC returns valid error response', async () => {
            // Mock RPC business error
            (supabase.rpc as any).mockResolvedValue({
                data: { success: false, error: 'User already exists' },
                error: null,
            });

            const result = await BarsService.addMemberExisting(
                'bar-1',
                { email: 'exists@example.com' },
                'serveur'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('User already exists');
        });

        it('should throw error when RPC fails at network level', async () => {
            // Mock RPC network error
            (supabase.rpc as any).mockResolvedValue({
                data: null,
                error: { message: 'Network Error' },
            });

            const result = await BarsService.addMemberExisting(
                'bar-1',
                { email: 'fail@example.com' },
                'serveur'
            );

            // Implementation catches error and returns object with success: false
            expect(result.success).toBe(false);
            expect(result.error).toBe('Network Error');
        });

        it('should handle Zod validation error (Invalid response shape)', async () => {
            // Mock RPC returning invalid shape (missing success field)
            (supabase.rpc as any).mockResolvedValue({
                data: { invalid_field: 'wtf' }, // Missing success
                error: null,
            });

            // The service catches the Zod error and returns a formatted error
            const result = await BarsService.addMemberExisting(
                'bar-1',
                { email: 'test@example.com' },
                'serveur'
            );

            expect(result.success).toBe(false);
            // Zod error message usually contains details about missing field
            expect(result.error).toBeDefined();
        });
    });

    describe('updateBar (Critical: JSONB Handling)', () => {
        it('should correctly cast settings to Json during update', async () => {
            const barId = 'bar-123';
            const updates = {
                name: 'Updated Bar',
                settings: { taxRate: 20 }
            };

            const mockUpdatedBar = {
                id: barId,
                name: 'Updated Bar',
                settings: { taxRate: 20 },
                is_active: true,
                created_at: new Date().toISOString()
            };

            // Mock update call
            const updateMock = vi.fn().mockReturnThis();
            const eqMock = vi.fn().mockResolvedValue({ error: null });

            (supabase.from as any).mockReturnValue({
                update: updateMock,
                // update().eq() returns a Promise-like object (thennable) that resolves to { error }
                eq: vi.fn(() => ({
                    then: vi.fn((cb) => cb({ error: null }))
                })),
                // select() chain is separate for the second call
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({ data: mockUpdatedBar, error: null })
                    }))
                }))
            });

            await BarsService.updateBar(barId, updates);

            // Verify update was called with settings
            expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Updated Bar',
                settings: { taxRate: 20 }
            }));
        });
    });

    describe('createBar', () => {
        it('should create bar and assign owner', async () => {
            const barData = { name: 'New Bar', owner_id: 'owner-1' };
            const mockBar = { id: 'new-bar', name: 'New Bar', owner_id: 'owner-1' };

            // Mock insert bar
            const insertBarMock = vi.fn().mockReturnThis();
            (supabase.from as any).mockReturnValueOnce({
                insert: insertBarMock,
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: mockBar, error: null })
            });

            // Mock insert member (owner)
            const insertMemberMock = vi.fn().mockResolvedValue({ error: null });
            (supabase.from as any).mockReturnValueOnce({
                insert: insertMemberMock
            });

            await BarsService.createBar(barData);

            expect(insertBarMock).toHaveBeenCalled();
            // Expect insert member to be called with correct role
            expect(insertMemberMock).toHaveBeenCalledWith(expect.objectContaining({
                role: 'promoteur',
                user_id: 'owner-1'
            }));
        });

        it('should rollback bar creation if member assignment fails', async () => {
            const barData = { name: 'Fail Bar', owner_id: 'owner-1' };
            const mockBar = { id: 'fail-bar' };

            // 1. Bar creation success
            (supabase.from as any).mockReturnValueOnce({
                insert: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: mockBar, error: null })
            });

            // 2. Member assignment fails
            (supabase.from as any).mockReturnValueOnce({
                insert: vi.fn().mockResolvedValue({ error: { message: 'Member Error' } })
            });

            // 3. Rollback delete
            const deleteMock = vi.fn().mockReturnThis();
            const eqMock = vi.fn().mockResolvedValue({ error: null }); // Delete success
            (supabase.from as any).mockReturnValueOnce({
                delete: deleteMock,
                eq: eqMock
            });

            await expect(BarsService.createBar(barData)).rejects.toThrow('Erreur lors de l\'assignation du propriétaire');

            // Verify delete was called
            expect(deleteMock).toHaveBeenCalled();
            expect(eqMock).toHaveBeenCalledWith('id', 'fail-bar');
        });
    });
});

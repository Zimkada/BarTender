
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

    describe('addMemberExisting (Critical: Lookup & V2)', () => {
        it('should return success when RPC returns valid successful response', async () => {
            // Mock RPC success
            (supabase.rpc as any).mockResolvedValue({
                data: { success: true, member_id: 'new-mem-1' },
                error: null,
            });

            const result = await BarsService.addMemberExisting(
                'bar-1',
                { email: 'test@example.com' },
                'serveur',
                'admin-1'
            );

            expect(result.success).toBe(true);
            expect(result.message).toBe('Membre ajouté avec succès');
            expect(supabase.rpc).toHaveBeenCalledWith('add_bar_member_lookup', {
                p_bar_id: 'bar-1',
                p_email: 'test@example.com',
                p_role: 'serveur',
                p_assigned_by_id: 'admin-1',
                p_user_id: undefined
            });
        });

        it('should return failure when RPC returns business error', async () => {
            // Mock RPC status failure
            (supabase.rpc as any).mockResolvedValue({
                data: { success: false, error: 'Utilisateur introuvable' },
                error: null,
            });

            const result = await BarsService.addMemberExisting(
                'bar-1',
                { email: 'unknown@example.com' },
                'serveur',
                'admin-1'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Utilisateur introuvable');
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
                'serveur',
                'admin-1'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network Error');
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
        const mockBarData: any = {
            name: 'New Bar',
            owner_id: 'owner-123',
            address: '123 Street',
            phone: '1234567890',
            logo_url: 'http://example.com/logo.png',
            settings: { theme: 'dark' },
        };

        describe('createBar', () => {
            const mockBarData: any = {
                name: 'New Bar',
                owner_id: 'owner-123',
                address: '123 Street',
                phone: '1234567890',
                logo_url: 'http://example.com/logo.png',
                settings: { theme: 'dark' },
            };

            it('should create a bar successfully using atomic RPC (no secondary fetch)', async () => {
                // Mock RPC returning FULL bar object (as per Phase 2 refactor)
                const mockRpcResult = {
                    success: true,
                    id: 'new-bar-123',
                    name: 'New Bar',
                    owner_id: 'owner-123',
                    address: '123 Street',
                    phone: '1234567890',
                    is_active: true,
                    closing_hour: 6,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    settings: { theme: 'dark' }
                };

                // Mock RPC call
                (supabase.rpc as any).mockResolvedValue({
                    data: mockRpcResult,
                    error: null,
                });

                // Ensure NO fetch is called
                const selectMock = vi.fn();
                (supabase.from as any).mockReturnValue({ select: selectMock });

                const result = await BarsService.createBar(mockBarData);

                // Verify RPC arguments (especially JSON settings)
                expect(supabase.rpc).toHaveBeenCalledWith('setup_promoter_bar', expect.objectContaining({
                    p_owner_id: mockBarData.owner_id,
                    p_bar_name: mockBarData.name,
                    // Settings should be passed (logic handles JSON.parse/stringify)
                }));

                // Verify result mapping
                expect(result).toEqual(expect.objectContaining({
                    id: 'new-bar-123',
                    name: 'New Bar',
                    settings: { theme: 'dark' }
                }));

                // Verify NO secondary fetch
                expect(selectMock).not.toHaveBeenCalled();
            });

            it('should throw error when RPC returns failure', async () => {
                (supabase.rpc as any).mockResolvedValue({
                    data: null,
                    error: { message: 'RPC Error' },
                });

                await expect(BarsService.createBar(mockBarData)).rejects.toThrow('RPC Error');
            });

            it('should throw "duplicate key" error as user friendly message', async () => {
                (supabase.rpc as any).mockResolvedValue({
                    data: null,
                    error: { message: 'duplicate key value violates unique constraint' },
                });

                await expect(BarsService.createBar(mockBarData)).rejects.toThrow('Un bar avec ce nom existe déjà.');
            });
        });
    });

    describe('Member Management (New RPCs)', () => {

        describe('addMember', () => {
            it('should successfully add a member via RPC', async () => {
                const mockResponse = { success: true, member_id: 'mem-123' };
                (supabase.rpc as any).mockResolvedValue({ data: mockResponse, error: null });

                const result = await BarsService.addMember('bar-1', 'user-1', 'serveur', 'admin-1');

                expect(result).toEqual({ success: true, memberId: 'mem-123' });
                expect(supabase.rpc).toHaveBeenCalledWith('add_bar_member_v2', {
                    p_bar_id: 'bar-1',
                    p_user_id: 'user-1',
                    p_role: 'serveur',
                    p_assigned_by_id: 'admin-1'
                });
            });

            it('should handle business logic error from RPC', async () => {
                const mockResponse = { success: false, error: 'Collision de nom' };
                (supabase.rpc as any).mockResolvedValue({ data: mockResponse, error: null });

                const result = await BarsService.addMember('bar-1', 'user-1', 'serveur', 'admin-1');

                expect(result).toEqual({ success: false, error: 'Collision de nom' });
            });

            it('should handle network error', async () => {
                (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'Network fails' } });

                const result = await BarsService.addMember('bar-1', 'user-1', 'serveur', 'admin-1');

                expect(result.success).toBe(false);
                expect(result.error).toContain('Network fails');
            });
        });

        describe('removeMember', () => {
            it('should successfully remove a member via RPC', async () => {
                const mockResponse = { success: true };
                (supabase.rpc as any).mockResolvedValue({ data: mockResponse, error: null });

                const result = await BarsService.removeMember('bar-1', 'user-1', 'admin-1');

                expect(result).toEqual({ success: true });
                expect(supabase.rpc).toHaveBeenCalledWith('remove_bar_member_v2', {
                    p_bar_id: 'bar-1',
                    p_user_id_to_remove: 'user-1',
                    p_removed_by_id: 'admin-1'
                });
            });

            it('should handle permission error from RPC', async () => {
                const mockResponse = { success: false, error: 'Permission denied' };
                (supabase.rpc as any).mockResolvedValue({ data: mockResponse, error: null });

                const result = await BarsService.removeMember('bar-1', 'user-1', 'admin-1');

                expect(result).toEqual({ success: false, error: 'Permission denied' });
            });
        });

        describe('canManageMembers', () => {
            it('should return true when RPC returns true', async () => {
                (supabase.rpc as any).mockResolvedValue({ data: true, error: null });

                const result = await BarsService.canManageMembers('bar-1', 'user-1', 'create_server');

                expect(result).toBe(true);
                expect(supabase.rpc).toHaveBeenCalledWith('check_user_can_manage_members', {
                    p_bar_id: 'bar-1',
                    p_user_id: 'user-1',
                    p_action: 'create_server'
                });
            });

            it('should return false when RPC returns false', async () => {
                (supabase.rpc as any).mockResolvedValue({ data: false, error: null });

                const result = await BarsService.canManageMembers('bar-1', 'user-1', 'create_manager');

                expect(result).toBe(false);
            });

            it('should return false on RPC error', async () => {
                (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'Error' } });

                const result = await BarsService.canManageMembers('bar-1', 'user-1', 'create_server');

                expect(result).toBe(false);
            });
        });
    });
});

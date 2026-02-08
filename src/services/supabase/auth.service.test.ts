import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { supabase } from '../../lib/supabase';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: vi.fn(),
            getSession: vi.fn(),
            signOut: vi.fn(),
            mfa: {
                challengeAndVerify: vi.fn(),
            },
        },
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
        })),
        rpc: vi.fn(() => ({
            then: vi.fn((cb) => cb({ data: null, error: null })),
            single: vi.fn().mockReturnThis(),
        })),
        functions: {
            invoke: vi.fn(),
        },
    },
    handleSupabaseError: vi.fn((err: any) => err.message || 'Error'),
}));

describe('AuthService - Non-regression', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should login successfully with valid credentials', async () => {
        const mockUser = { id: 'user-123', email: 'test@example.com' };
        const mockProfile = {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            username: 'testuser'
        };
        const mockMembership = [
            {
                role: 'gerant',
                bar_id: 'bar-1',
                bars: { name: 'Test Bar' }
            }
        ];

        // Mock sign in
        (supabase.auth.signInWithPassword as any).mockResolvedValue({
            data: { user: mockUser, session: { access_token: 'token' } },
            error: null,
        });

        // Mock profile and membership fetches (sequential calls in fetchUserProfileAndMembership)
        const fromSpy = vi.spyOn(supabase, 'from');

        // First call: users
        fromSpy.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
        } as any);

        // Second call: bar_members
        fromSpy.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            // Since it uses .eq().eq().order(), we need to mock accordingly
            // Simplified: return memberships
            then: vi.fn((cb) => cb({ data: mockMembership, error: null })),
        } as any);

        const result = await AuthService.login({
            email: 'test@example.com',
            password: 'password123'
        });

        expect(result.user).toBeDefined();
        expect(result.user?.role).toBe('gerant');
        expect(result.user?.barName).toBe('Test Bar');
        expect(localStorage.getItem('auth_user')).toBeDefined();
    });

    it('should return error for invalid credentials', async () => {
        (supabase.auth.signInWithPassword as any).mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'Invalid credentials' },
        });

        const result = await AuthService.login({
            email: 'wrong@example.com',
            password: 'wrong'
        });

        expect(result.error).toBe('Invalid credentials');
        expect(result.user).toBeUndefined();
    });

    it('should handle MFA required status', async () => {
        const mockUser = { id: 'user-mfa', factors: [{ id: 'factor-1', factor_type: 'totp' }] };

        (supabase.auth.signInWithPassword as any).mockResolvedValue({
            data: { user: mockUser, session: null },
            error: { message: 'A multi-factor authentication challenge is required' },
        });

        const result = await AuthService.login({
            email: 'mfa@example.com',
            password: 'password'
        });

        expect(result.mfaRequired).toBe(true);
        expect(result.mfaFactorId).toBe('factor-1');
    });

    it('should fetch profile correctly in fetchUserProfileAndMembership', async () => {
        // This is private, but login calls it. I'll test it through initializeSession.
        const mockUser = { id: 'user-123' };
        const mockProfile = { id: 'user-123', name: 'Test User' };
        const mockMembership = [{ role: 'serveur', bar_id: 'bar-2', bars: { name: 'Server Bar' } }];

        (supabase.auth.getSession as any).mockResolvedValue({
            data: { session: { user: mockUser } },
            error: null,
        });

        const fromSpy = vi.spyOn(supabase, 'from');
        fromSpy.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
        } as any);

        fromSpy.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: (cb: any) => cb({ data: mockMembership, error: null }),
        } as any);

        const user = await AuthService.initializeSession();
        expect(user).toBeDefined();
        expect(user?.role).toBe('serveur');
    });

    it('should logout and clear localStorage', async () => {
        localStorage.setItem('auth_user', JSON.stringify({ id: '123' }));

        (supabase.auth.signOut as any).mockResolvedValue({ error: null });

        await AuthService.logout();

        expect(supabase.auth.signOut).toHaveBeenCalled();
        expect(localStorage.getItem('auth_user')).toBeNull();
    });

    it('should signup successfully via Edge Function', async () => {
        (supabase.auth.getSession as any).mockResolvedValue({
            data: { session: { access_token: 'valid-token' } },
            error: null,
        });

        (supabase.functions.invoke as any).mockResolvedValue({
            data: { success: true, user: { id: 'new-user', name: 'New' } },
            error: null,
        });

        const result = await AuthService.signup(
            { email: 'new@example.com', password: 'pass', name: 'New', phone: '123' },
            'bar-1',
            'serveur'
        );

        expect(result.id).toBe('new-user');
        expect(supabase.functions.invoke).toHaveBeenCalledWith('create-bar-member', expect.any(Object));
    });
});

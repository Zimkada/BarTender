/**
 * Mock Supabase Client for Testing
 * Provides predictable responses without network calls
 */

export const mockSupabaseResponse = {
  data: null,
  error: null,
};

export const createMockSupabaseClient = () => {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(mockSupabaseResponse),
      maybeSingle: vi.fn().mockResolvedValue(mockSupabaseResponse),
    })),
    rpc: vi.fn().mockResolvedValue(mockSupabaseResponse),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    realtime: {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockResolvedValue({ status: 'SUBSCRIBED' }),
      unsubscribe: vi.fn().mockResolvedValue({ status: 'UNSUBSCRIBED' }),
    },
  };
};

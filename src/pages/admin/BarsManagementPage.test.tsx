import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BarsManagementPage from './BarsManagementPage';

const mockGetPaginatedBars = vi.fn();
const mockGetAllBarMembers = vi.fn();
const mockUpdateBar = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'admin-1', role: 'super_admin', userName: 'Admin' },
  }),
}));

vi.mock('../../services/supabase/admin.service', () => ({
  AdminService: {
    getPaginatedBars: (...args: unknown[]) => mockGetPaginatedBars(...args),
  },
}));

vi.mock('../../services/supabase/auth.service', () => ({
  AuthService: {
    getAllBarMembers: (...args: unknown[]) => mockGetAllBarMembers(...args),
  },
}));

vi.mock('../../services/supabase/bar.service', () => ({
  BarService: {
    updateBar: (...args: unknown[]) => mockUpdateBar(...args),
  },
}));

vi.mock('../../components/admin/BarAuditLogsViewer', () => ({
  BarAuditLogsModal: () => <div>Audit modal</div>,
}));

vi.mock('../../components/BarCard', () => ({
  BarCard: ({ bar, onPlanChange }: { bar: any; onPlanChange?: (barId: string, newPlan: 'starter' | 'pro' | 'enterprise') => Promise<void> }) => (
    <div>
      <span>{bar.name}</span>
      <button onClick={() => onPlanChange?.(bar.id, 'enterprise')}>Upgrade Plan</button>
    </div>
  ),
}));

describe('BarsManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPaginatedBars.mockResolvedValue({
      bars: [
        {
          id: 'bar-1',
          name: 'Bar A',
          address: '123 Rue',
          phone: '123',
          ownerId: 'owner-1',
          createdAt: new Date('2026-01-01T10:00:00Z'),
          isActive: true,
          closingHour: 6,
          settings: { plan: 'pro', dataTier: 'balanced' },
        },
      ],
      totalCount: 1,
    });
    mockGetAllBarMembers.mockResolvedValue([]);
    mockUpdateBar.mockResolvedValue(undefined);
  });

  it('updates plan and keeps dataTier unified (balanced) when admin changes a bar plan', async () => {
    render(<BarsManagementPage />);

    expect(await screen.findByText('Bar A')).toBeTruthy();

    fireEvent.click(screen.getByText('Upgrade Plan'));

    await waitFor(() => {
      expect(mockUpdateBar).toHaveBeenCalledWith(
        'bar-1',
        expect.objectContaining({
          settings: expect.objectContaining({
            plan: 'enterprise',
            dataTier: 'balanced',
          }),
        })
      );
    });
  });
});

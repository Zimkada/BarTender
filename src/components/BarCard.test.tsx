import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BarCard } from './BarCard';

vi.mock('./BarActionButtons', () => ({
  BarActionButtons: () => <div>Actions</div>,
}));

const baseBar = {
  id: 'bar-1',
  name: 'Test Bar',
  address: '123 Rue',
  ownerId: 'owner-1',
  createdAt: new Date('2026-01-01T10:00:00Z'),
  isActive: true,
  settings: { plan: 'pro' as const },
};

const ownerUser = {
  id: 'owner-1',
  username: 'owner',
  name: 'Owner Name',
  email: 'owner@example.com',
  phone: '000',
  role: 'promoteur' as const,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  isActive: true,
  firstLogin: false,
};

const makeMember = (id: string, isActive = true) => ({
  id: `member-${id}`,
  userId: id,
  barId: 'bar-1',
  role: id === 'owner-1' ? ('promoteur' as const) : ('serveur' as const),
  assignedBy: 'owner-1',
  assignedAt: new Date('2026-01-01T10:00:00Z'),
  isActive,
  user: id === 'owner-1'
    ? ownerUser
    : {
        ...ownerUser,
        id,
        username: id,
        name: `User ${id}`,
        email: `${id}@example.com`,
        role: 'serveur' as const,
      },
});

describe('BarCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('calls onPlanChange immediately when new plan is compatible', async () => {
    const onPlanChange = vi.fn().mockResolvedValue(undefined);

    render(
      <BarCard
        bar={baseBar as any}
        members={[makeMember('owner-1'), makeMember('user-2'), makeMember('user-3')]}
        onToggleStatus={vi.fn()}
        onPlanChange={onPlanChange}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'enterprise' } });

    await waitFor(() => {
      expect(onPlanChange).toHaveBeenCalledWith('bar-1', 'enterprise');
    });
    expect(globalThis.confirm).not.toHaveBeenCalled();
  });

  it('asks for confirmation before an incompatible downgrade', async () => {
    const onPlanChange = vi.fn().mockResolvedValue(undefined);

    render(
      <BarCard
        bar={baseBar as any}
        members={[
          makeMember('owner-1'),
          makeMember('user-2'),
          makeMember('user-3'),
          makeMember('user-4'),
          makeMember('user-5'),
          makeMember('user-6'),
          makeMember('user-7'),
          makeMember('user-8'),
          makeMember('user-9'),
        ]}
        onToggleStatus={vi.fn()}
        onPlanChange={onPlanChange}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'starter' } });

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalled();
    });
    expect(onPlanChange).toHaveBeenCalledWith('bar-1', 'starter');
  });
});

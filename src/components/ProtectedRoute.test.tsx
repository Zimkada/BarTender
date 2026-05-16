import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from './ProtectedRoute';

const mockUseAuth = vi.fn();
const mockUsePlan = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/usePlan', () => ({
  usePlan: () => mockUsePlan(),
}));

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/auth/login" element={<div>Login</div>} />
        <Route path="/protected" element={<ProtectedRoute permission="canViewAccounting" feature="accounting" />}>
          <Route index element={<div>Secret</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasPermission: vi.fn(() => true),
    });
    mockUsePlan.mockReturnValue({
      hasFeature: vi.fn(() => true),
    });
  });

  it('renders child route when auth, permission and feature are allowed', () => {
    renderProtectedRoute();
    expect(screen.getByText('Secret')).toBeTruthy();
  });

  it('redirects to login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      hasPermission: vi.fn(),
    });

    renderProtectedRoute();
    expect(screen.getByText('Login')).toBeTruthy();
  });

  it('redirects to home when permission is missing', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasPermission: vi.fn(() => false),
    });

    renderProtectedRoute();
    expect(screen.getByText('Home')).toBeTruthy();
  });

  it('redirects to home when plan feature is disabled', () => {
    mockUsePlan.mockReturnValue({
      hasFeature: vi.fn(() => false),
    });

    renderProtectedRoute();
    expect(screen.getByText('Home')).toBeTruthy();
  });
});

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

// ⭐ Ajouté avec la garde `requiresRestaurant` (§3) : ProtectedRoute lit
// désormais hasRestaurant. Par défaut `false` — les routes existantes ne
// portent pas cette garde, leur comportement est donc inchangé.
const mockUseBarContext = vi.fn(() => ({ hasRestaurant: false }));
vi.mock('../context/BarContext', () => ({
  useBarContext: () => mockUseBarContext(),
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

/** Route portant la garde `requiresRestaurant` (§3). */
function renderRestaurantRoute() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/auth/login" element={<div>Login</div>} />
        <Route path="/protected" element={<ProtectedRoute requiresRestaurant />}>
          <Route index element={<div>Cuisine</div>} />
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
    mockUseBarContext.mockReturnValue({ hasRestaurant: false });
  });

  describe('⭐ Garde restauration (§3)', () => {
    it('⛔ un bar PUR est renvoyé à l\'accueil, même par URL directe', () => {
      // §3 : « un bar sans cuisine doit être STRICTEMENT identique ». Une page
      // cuisine atteinte par un lien ou un signet ne doit pas s'afficher.
      mockUseBarContext.mockReturnValue({ hasRestaurant: false });

      renderRestaurantRoute();
      expect(screen.getByText('Home')).toBeTruthy();
      expect(screen.queryByText('Cuisine')).toBeNull();
    });

    it('✅ un bar avec cuisine accède à la page', () => {
      mockUseBarContext.mockReturnValue({ hasRestaurant: true });

      renderRestaurantRoute();
      expect(screen.getByText('Cuisine')).toBeTruthy();
    });

    it('⚠️ les routes SANS cette garde ne sont pas affectées', () => {
      // Le point qui compte pour la non-régression : ajouter `requiresRestaurant`
      // à ProtectedRoute ne doit rien changer aux routes existantes.
      mockUseBarContext.mockReturnValue({ hasRestaurant: false });

      renderProtectedRoute();
      expect(screen.getByText('Secret')).toBeTruthy();
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

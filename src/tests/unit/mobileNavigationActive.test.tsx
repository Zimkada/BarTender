/**
 * mobileNavigationActive.test.tsx
 *
 * ⭐ Audit UI/UX du 10/10/2026 : la barre du bas n'indiquait pas la page
 * courante. L'onglet actif porte `aria-current="page"` ; ces tests le
 * vérifient sur le VRAI composant, route par route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ===== Mocks des dépendances (mêmes que kitchenMenuVisibility.test.tsx) =====

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentSession: { userId: 'u-1', role: 'promoteur', userName: 'Test' }, logout: vi.fn() }),
}));

vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({ hasRestaurant: false }),
}));

vi.mock('../../components/Notifications', () => ({
  useNotifications: () => ({ showNotification: vi.fn() }),
}));

vi.mock('../../hooks/useViewport', () => ({
  useViewport: () => ({ isMobile: true }),
}));

vi.mock('../../services/NetworkManager', () => ({
  networkManager: {
    isOnline: () => true,
    subscribe: () => () => {},
  },
}));

import { MobileNavigation } from '../../components/MobileNavigation';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNavigation onShowQuickSale={vi.fn()} />
    </MemoryRouter>
  );

const activeLabels = () =>
  screen.getAllByRole('button')
    .filter((b) => b.getAttribute('aria-current') === 'page')
    .map((b) => b.getAttribute('aria-label'));

describe('MobileNavigation - onglet courant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marque Dashboard comme page courante sur /dashboard, et lui seul', () => {
    renderAt('/dashboard');
    expect(activeLabels()).toEqual(['Dashboard']);
  });

  it('garde Historique actif sur une page de détail (/sales/:saleId)', () => {
    renderAt('/sales/abc-123');
    expect(activeLabels()).toEqual(['Historique']);
  });

  it("n'active aucun onglet sur l'accueil : « Vente » est une action, pas une page", () => {
    renderAt('/');
    expect(activeLabels()).toEqual([]);
  });

  it("n'active pas un onglet dont le chemin n'est qu'un préfixe textuel (/salesfoo)", () => {
    // ⚠️ `startsWith('/sales')` seul aurait activé Historique ici.
    renderAt('/salesfoo');
    expect(activeLabels()).toEqual([]);
  });
});

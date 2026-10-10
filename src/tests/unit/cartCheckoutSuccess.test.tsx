/**
 * cartCheckoutSuccess.test.tsx
 *
 * ⭐ Revue de code du lot 2 (10/10/2026) : `addSale` renvoie `null` sans rien
 * enregistrer quand la session ou le bar manquent. Le panier affichait alors
 * quand même le moment « Vente encaissée ». Ce test vérifie le vrai `Cart` ;
 * seul le tiroir est remplacé par un bouton qui appelle `onCheckout`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ===== Mocks des dépendances =====

const mockAddSale = vi.fn();
const mockToastError = vi.fn();

vi.mock('react-hot-toast', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    cart: [{ product: { id: 'p1', name: 'Castel', volume: '50cl', price: 600 }, quantity: 2 }],
    updateCartQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    addSale: mockAddSale,
    clearCart: vi.fn(),
    kitchenItems: [],
    updateKitchenQuantity: vi.fn(),
    removeDish: vi.fn(),
    clearKitchenCart: vi.fn(),
    kitchenTotal: 0,
    kitchenItemCount: 0,
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'u-1', userName: 'Gérant', role: 'gerant' },
    hasPermission: () => true,
  }),
}));

vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({ currentBar: { id: 'bar-1', closingHour: 6 }, isSimplifiedMode: false }),
}));

vi.mock('../../context/CounterContext', () => ({
  useCounterContext: () => ({ currentCounterId: null }),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: () => ({ setLoading: vi.fn(), isLoading: () => false, cartCleared: vi.fn() }),
}));

vi.mock('../../hooks/useViewport', () => ({ useViewport: () => ({ isMobile: true }) }));

vi.mock('../../hooks/useServerMappings', () => ({
  useServerMappings: () => ({ serverNames: [], mappings: [] }),
}));

vi.mock('../../hooks/useCartLogic', () => ({
  useCartLogic: () => ({
    total: 1200,
    totalItems: 2,
    calculatedItems: [{
      product: { id: 'p1', name: 'Castel', volume: '50cl', price: 600 },
      quantity: 2, unit_price: 600, total_price: 1200, original_unit_price: 600, discount_amount: 0,
    }],
  }),
}));

vi.mock('../../hooks/queries/useTickets', () => ({
  useTickets: () => ({ tickets: [], refetchTickets: vi.fn() }),
}));

vi.mock('../../context/hooks/useStock', () => ({
  useStock: () => ({ getProductStockInfo: () => ({ availableStock: 10 }) }),
}));

vi.mock('../../services/NetworkManager', () => ({
  networkManager: { getDecision: () => ({ shouldBlock: false }) },
}));

vi.mock('../../hooks/mutations/useKitchenMutations', () => ({
  useKitchenMutations: () => ({ createOrder: { mutateAsync: vi.fn() } }),
}));

vi.mock('../../hooks/useBeninCurrency', () => ({
  useCurrencyFormatter: () => ({ formatPrice: (n: number) => `${n} FCFA` }),
}));

vi.mock('../../services/supabase/server-mappings.service', () => ({ ServerMappingsService: {} }));
vi.mock('../../services/supabase/tickets.service', () => ({ TicketsService: {} }));

// Le tiroir est remplacé : on teste la logique de validation de Cart, pas son UI.
vi.mock('../../components/cart/CartDrawer', () => ({
  CartDrawer: ({ onCheckout }: { onCheckout: () => Promise<boolean> }) => (
    <button type="button" onClick={() => { void onCheckout(); }}>valider</button>
  ),
}));

import { Cart } from '../../components/Cart';

const renderCart = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Cart isOpen={true} onToggle={vi.fn()} />
    </MemoryRouter>
  );

describe('Cart - moment « vente validée »', () => {
  beforeEach(() => vi.clearAllMocks());

  it('⛔ addSale renvoie null : aucun « Vente encaissée », une erreur explicite', async () => {
    mockAddSale.mockResolvedValue(null);
    renderCart();

    fireEvent.click(screen.getByText('valider'));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("La vente n'a pas été enregistrée. Réessayez.")
    );
    expect(screen.queryByText('Vente encaissée')).toBeNull();
  });

  it('vente enregistrée : le moment « Vente encaissée » s’affiche avec le montant', async () => {
    mockAddSale.mockResolvedValue({ id: 'sale-1', status: 'validated' });
    renderCart();

    fireEvent.click(screen.getByText('valider'));

    expect(await screen.findByText('Vente encaissée')).toBeTruthy();
    // ⚠️ Dans l'overlay seulement : la barre collante affiche aussi le total
    // (le panier simulé ne se vide pas).
    expect(within(screen.getByRole('status')).getByText('1200 FCFA')).toBeTruthy();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

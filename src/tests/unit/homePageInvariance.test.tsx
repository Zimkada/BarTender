/**
 * homePageInvariance.test.tsx
 *
 * ⭐⭐ §3 SUR L'ÉCRAN LE PLUS UTILISÉ DU PARC.
 *
 * HomePage est ouverte à chaque service, par tous les bars, tous les jours.
 * Une régression ici ne toucherait pas « les bars-restos » mais l'intégralité
 * du parc — et sur l'écran où elle se verrait le plus vite.
 *
 * §3 : « un bar pur ne doit pas être PRESQUE inchangé : il doit être
 * STRICTEMENT identique. "Presque" est le mot qui autorise les petites
 * dégradations cumulatives — un onglet vide, un compteur à 0. »
 *
 * ⚠️ On monte la VRAIE page et on interroge le DOM. Répliquer la règle
 * `hasRestaurant` dans le test la rendrait aveugle à un changement de la page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ⭐ Frontière RÉSEAU : si une de ces fonctions est appelée sur un bar pur,
// une requête serait partie en conditions réelles.
const mockGetDishes = vi.fn(() => Promise.resolve([]));
const mockGetDishCategories = vi.fn(() => Promise.resolve([]));

vi.mock('../../services/supabase/dishes.service', () => ({
  DishesService: {
    getDishes: (...a: unknown[]) => mockGetDishes(...(a as [])),
    getDishRecipe: vi.fn(() => Promise.resolve([])),
    getDishCost: vi.fn(() => Promise.resolve({ success: true })),
    getAllDishCosts: vi.fn(() => Promise.resolve([])),
    getDailyScopeTotals: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

vi.mock('../../services/supabase/categories.service', () => ({
  CategoriesService: {
    getDishCategories: (...a: unknown[]) => mockGetDishCategories(...(a as [])),
  },
}));

let mockHasRestaurant = false;
vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', name: 'Bar Test', closingHour: 6 },
    operatingMode: 'full',
    isSimplifiedMode: false,
    hasRestaurant: mockHasRestaurant,
  }),
}));

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    addToCart: vi.fn(),
    cart: [],
    addDish: vi.fn(),
    kitchenQuantities: {},
  }),
}));

vi.mock('../../context/hooks/useStock', () => ({
  useStock: () => ({
    products: [
      {
        id: 'p-1',
        barId: 'bar-123',
        name: 'Béninoise',
        volume: '65cl',
        price: 1000,
        stock: 24,
        categoryId: 'cat-1',
      },
    ],
    categories: [
      { id: 'cat-1', barId: 'bar-123', name: 'Bières', color: '#f00', createdAt: new Date() },
    ],
    getProductStockInfo: () => ({ availableStock: 24 }),
    isLoading: false,
  }),
}));

// ⚠️ Consommés par les composants enfants (CategoryFilter, ProductGrid), pas
// par HomePage elle-même — d'où des mocks minimaux.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'u-1', role: 'promoteur' },
    hasPermission: () => true,
  }),
}));

vi.mock('../../components/Notifications', () => ({
  useNotifications: () => ({ showNotification: vi.fn() }),
}));

vi.mock('../../hooks/useCategoryManagement', () => ({
  useCategoryManagement: () => ({
    isCategoryModalOpen: false,
    editingCategory: null,
    deleteCategoryModalOpen: false,
    categoryToDelete: null,
    closeAddEditModal: vi.fn(),
    closeDeleteModal: vi.fn(),
    handleAddCategory: vi.fn(),
    handleEditCategory: vi.fn(),
    handleDeleteCategory: vi.fn(),
    handleSaveCategory: vi.fn(),
    handleLinkGlobalCategory: vi.fn(),
    handleConfirmDeleteCategory: vi.fn(),
  }),
}));

import HomePage from '../../pages/HomePage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const renderHome = () => render(<HomePage />, { wrapper: createWrapper() });
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('HomePage — invariance des bars purs (§3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('⛔ Bar PUR — rien ne change', () => {
    beforeEach(() => {
      mockHasRestaurant = false;
    });

    it('⭐⭐ n\'émet AUCUNE requête plats', async () => {
      // ⚠️ Le §3 identifie le niveau RÉSEAU comme « le plus insidieux » : une
      // requête partant sur tous les bars ne se remarquerait « pas avant la
      // facture Supabase ».
      renderHome();
      await settle();

      expect(
        mockGetDishes,
        'Une requête plats est partie depuis l\'écran le plus ouvert du parc (§3)'
      ).not.toHaveBeenCalled();
      expect(mockGetDishCategories).not.toHaveBeenCalled();
    });

    it('n\'affiche AUCUN sélecteur de portée', () => {
      renderHome();

      expect(screen.queryByText('Boissons')).toBeNull();
      expect(screen.queryByText('Plats')).toBeNull();
    });

    it('⭐ le compteur dit « produits », pas « articles »', () => {
      // Le mot changerait sur TOUS les bars si la condition était mal écrite.
      renderHome();

      expect(screen.getByText(/produits/i)).toBeTruthy();
      expect(screen.queryByText(/articles/i)).toBeNull();
    });

    it('⭐ la recherche garde son libellé d\'origine', () => {
      renderHome();

      expect(screen.getByPlaceholderText('Rechercher un produit...')).toBeTruthy();
    });

    it('affiche bien la grille produits', () => {
      // ⚠️ Volet indispensable : sans lui, une page qui ne rendrait RIEN
      // passerait toutes les assertions « ne doit pas être présent ».
      renderHome();

      expect(screen.getByText('Béninoise')).toBeTruthy();
    });
  });

  describe('✅ Bar AVEC cuisine — le sélecteur apparaît', () => {
    beforeEach(() => {
      mockHasRestaurant = true;
    });

    // ⚠️ Ce volet empêche les tests précédents d'être trivialement verts :
    // sans lui, un `hasRestaurant` codé en dur à `false` passerait tout.
    it('émet les requêtes plats', async () => {
      renderHome();
      await settle();

      expect(
        mockGetDishes,
        'Aucune requête sur un bar AVEC cuisine — la garde §3 est trop restrictive'
      ).toHaveBeenCalledWith('bar-123');
    });

    it('affiche le sélecteur de portée', () => {
      renderHome();

      expect(screen.getByText('Boissons')).toBeTruthy();
      expect(screen.getByText('Plats')).toBeTruthy();
    });

    it('⭐ la grille produits reste affichée par défaut', () => {
      // La portée par défaut est « Tout » : les boissons ne disparaissent pas
      // parce que le bar a ouvert une cuisine.
      renderHome();

      expect(screen.getByText('Béninoise')).toBeTruthy();
    });
  });

  describe('⭐⭐ Sections vides — aucune ne s\'affiche pour rien', () => {
    beforeEach(() => {
      mockHasRestaurant = true;
    });

    it('⛔ filtrer une catégorie de PLATS masque la section boissons', async () => {
      /**
       * Signalé en test terrain le 04/08/2026 : « pourquoi j'ai boisson quand
       * je filtre sur plats ? »
       *
       * ⛔ Le défaut PRÉEXISTAIT — le bloc testait `products.length === 0`,
       * le catalogue COMPLET, au lieu du résultat FILTRÉ. Il ne se manifestait
       * jamais tant que chaque catégorie contenait des produits ; le module
       * restauration l'a rendu atteignable.
       */
      renderHome();
      await settle();

      // Une recherche qui ne matche aucun produit ni aucun plat.
      const search = screen.getByPlaceholderText(/rechercher/i);
      fireEvent.change(search, { target: { value: 'zzzzz-introuvable' } });

      /**
       * ⚠️ On cible le MESSAGE SECONDAIRE de `EmptyProductsState`, seul
       * élément qui distingue le bloc boissons de l'état vide global.
       *
       * ⛔ DEUX tentatives précédentes ne discriminaient RIEN, constaté par
       * certification par injection :
       *   · `queryByText('Béninoise')` — le produit disparaît de toute façon
       *     quand la liste est filtrée à zéro.
       *   · `queryByRole('button', ...)` — `HomePage` ne passe pas `onAction`,
       *     ce bouton n'existe donc jamais.
       * Le TITRE ne convient pas non plus : « Aucun produit trouvé » est
       * identique dans les deux composants.
       */
      expect(
        screen.queryByText(/cette liste est vide pour le moment/i),
        'La grille boissons reste montée avec son état vide alors que le filtre porte sur les plats'
      ).toBeNull();
    });

    it('⭐ un état vide GLOBAL prend le relais, jamais un écran blanc', async () => {
      // ⚠️ Le correctif précédent pouvait réintroduire l'écran vide : masquer
      // les deux sections sans rien mettre à la place.
      renderHome();
      await settle();

      const search = screen.getByPlaceholderText(/rechercher/i);
      fireEvent.change(search, { target: { value: 'zzzzz-introuvable' } });

      expect(
        screen.getByText(/aucun résultat pour/i),
        'Écran blanc — les deux sections sont masquées sans message'
      ).toBeTruthy();
    });
  });

  describe('⭐⭐ La cuisine disparaît en cours de route', () => {
    it('⛔ l\'écran ne devient JAMAIS vide', async () => {
      /**
       * Défaut trouvé à la code review du 04/08/2026 : avec la portée sur
       * « Restau » et `hasRestaurant` repassé à `false`, `showProducts` ET
       * `showDishes` valaient `false` — écran ENTIÈREMENT VIDE, sans
       * explication.
       *
       * ⚠️ Le cas n'est pas théorique : changer de bar via le sélecteur
       * d'en-tête suffit à le produire, et c'est un geste quotidien pour un
       * promoteur multi-bars.
       */
      mockHasRestaurant = true;
      const { rerender } = renderHome();

      // Le promoteur bascule sur « Restau »…
      const dishesTab = screen.getByText('Plats');
      dishesTab.click();

      // …puis change pour un bar SANS cuisine.
      mockHasRestaurant = false;
      rerender(<HomePage />);

      expect(
        screen.getByText('Béninoise'),
        'Écran vide après disparition de la cuisine — la portée est restée bloquée sur Restau'
      ).toBeTruthy();
    });
  });
});

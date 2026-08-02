/**
 * kitchenMenuVisibility.test.tsx
 *
 * ⭐ §3 AU NIVEAU VISUEL : sur un bar pur, l'entrée « Cuisine » ne doit pas
 * exister. Pas grisée, pas vide — ABSENTE.
 *
 * §3 : « Un bar pur ne doit pas être PRESQUE inchangé : il doit être
 * STRICTEMENT identique. "Presque" est le mot qui autorise les petites
 * dégradations cumulatives — un onglet vide, un compteur à 0. »
 *
 * ⚠️ On monte le VRAI MobileSidebar et on cherche l'entrée dans le DOM.
 * Répliquer la règle `isVisible` dans le test la rendrait aveugle à un
 * changement du composant — le piège déjà rencontré sur hasRestaurant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '../../types';

// ===== Mocks des dépendances =====

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseBarContext = vi.fn();
vi.mock('../../context/BarContext', () => ({
  useBarContext: () => mockUseBarContext(),
}));

vi.mock('../../hooks/usePlan', () => ({
  usePlan: () => ({ hasFeature: () => true }),
}));

vi.mock('../../components/Notifications', () => ({
  useNotifications: () => ({ showNotification: vi.fn() }),
}));

// MobileNavigation ne se rend qu'en mobile.
vi.mock('../../hooks/useViewport', () => ({
  useViewport: () => ({ isMobile: true }),
}));

vi.mock('../../services/NetworkManager', () => ({
  networkManager: {
    getDecision: () => ({ shouldBlock: false, shouldShowBanner: false, reason: 'online' }),
    isOnline: () => true,
    shouldBlockNetworkOps: () => false,
    // MobileSidebar s'abonne aux changements de réseau : le mock doit rendre
    // une fonction de désabonnement, sinon le cleanup de l'effet échoue.
    subscribe: () => () => {},
  },
}));

import { MobileSidebar } from '../../components/MobileSidebar';
import { MobileNavigation } from '../../components/MobileNavigation';

/**
 * ⚠️ `currentMenu` pilote l'auto-ouverture du groupe actif.
 *
 * Promoteur et gérant obtiennent des TIROIRS repliés : le libellé d'une entrée
 * n'est PAS dans le DOM tant que son groupe est fermé. On ouvre donc le groupe
 * « Produits et stock » via `currentMenu='inventory'` — sinon le test
 * mesurerait l'état des tiroirs et non la règle de visibilité.
 *
 * Le cuisinier, lui, a une liste PLATE (isGrouped = false).
 */
const renderSidebar = (role: UserRole, hasRestaurant: boolean, currentMenu = 'inventory') => {
  mockUseAuth.mockReturnValue({
    currentSession: { userId: 'u-1', role, userName: 'Test' },
    logout: vi.fn(),
  });
  mockUseBarContext.mockReturnValue({ hasRestaurant });

  return render(
    <MemoryRouter>
      <MobileSidebar
        isOpen
        onClose={vi.fn()}
        currentMenu={currentMenu}
        onShowQuickSale={vi.fn()}
      />
    </MemoryRouter>
  );
};

/** L'entrée Cuisine est-elle présente dans le DOM ? */
const kitchenEntry = () => screen.queryByText('Cuisine');

describe('Entrée de menu « Cuisine » (§3, §9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('⛔ Bar PUR — l\'entrée n\'existe pas', () => {
    it.each<UserRole>(['promoteur', 'gerant', 'cuisinier'])(
      'absente pour %s quand hasRestaurant = false',
      (role) => {
        renderSidebar(role, false);

        expect(
          kitchenEntry(),
          `L'entrée Cuisine ne doit PAS apparaître pour ${role} sur un bar sans cuisine`
        ).toBeNull();
      }
    );

    it('⚠️ les entrées EXISTANTES ne sont pas affectées', () => {
      // Non-régression : ajouter `requiresRestaurant` au type ne doit rien
      // changer aux items qui ne le portent pas.
      renderSidebar('promoteur', false);

      expect(screen.queryByText('Inventaire')).not.toBeNull();
      expect(screen.queryByText('Retours')).not.toBeNull();
    });
  });

  describe('✅ Bar avec cuisine', () => {
    it.each<UserRole>(['promoteur', 'gerant'])('présente pour %s', (role) => {
      renderSidebar(role, true);
      expect(kitchenEntry()).not.toBeNull();
    });

    it('présente pour le cuisinier', () => {
      // ⚠️ Le cuisinier n'est ni promoteur ni gérant : il obtient une liste
      // PLATE (isGrouped = false), pas des tiroirs. L'entrée doit rester
      // visible dans ce mode aussi.
      renderSidebar('cuisinier', true);
      expect(kitchenEntry()).not.toBeNull();
    });
  });

  describe('⭐ Le SERVEUR n\'a PAS d\'entrée cuisine', () => {
    it('absente même avec la cuisine active', () => {
      // §9 : « Le serveur ne gère pas la cuisine, il vend des plats : lui
      // ajouter un menu serait une erreur. » Les plats arriveront dans son
      // écran de vente, pas dans un menu séparé.
      renderSidebar('serveur', true);
      expect(kitchenEntry()).toBeNull();
    });

    it('mais garde ses entrées habituelles', () => {
      renderSidebar('serveur', true);
      expect(screen.queryByText('Retours')).not.toBeNull();
    });
  });
});

// ===== Navigation mobile (barre du bas) =====

const renderMobileNav = (role: UserRole, hasRestaurant: boolean) => {
  mockUseAuth.mockReturnValue({
    currentSession: { userId: 'u-1', role, userName: 'Test' },
    logout: vi.fn(),
  });
  mockUseBarContext.mockReturnValue({ hasRestaurant });

  return render(
    <MemoryRouter>
      <MobileNavigation onShowQuickSale={vi.fn()} />
    </MemoryRouter>
  );
};

describe('MobileNavigation — le cuisinier n\'a pas une barre vide (§9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('⛔ le cuisinier a AU MOINS une entrée', () => {
    // ⭐ Le défaut trouvé à l'audit : `roles` était typé
    // `'promoteur' | 'gerant' | 'serveur'` et le filtre passait par un cast
    // `as readonly string[]` — le compilateur ne signalait RIEN. Un cuisinier
    // obtenait une barre VIDE : un bandeau de 64 px sans aucun bouton.
    renderMobileNav('cuisinier', true);

    expect(
      screen.queryByLabelText('Ingrédients'),
      'Le cuisinier doit avoir au moins une entrée — sinon la barre est un bandeau vide'
    ).not.toBeNull();
  });

  it('⛔ sur un bar PUR, le cuisinier ne voit pas l\'entrée cuisine', () => {
    renderMobileNav('cuisinier', false);
    expect(screen.queryByLabelText('Ingrédients')).toBeNull();
  });

  it('⚠️ les autres rôles n\'ont RIEN de nouveau (§9, plafond atteint)', () => {
    // §9 : « Autres rôles : ne rien ajouter, plafond atteint. La Cuisine reste
    // au menu latéral. » La barre ne rend que 5 entrées.
    renderMobileNav('promoteur', true);
    expect(screen.queryByLabelText('Ingrédients')).toBeNull();

    renderMobileNav('serveur', true);
    expect(screen.queryByLabelText('Ingrédients')).toBeNull();
  });

  it('les entrées existantes du serveur sont intactes', () => {
    renderMobileNav('serveur', true);
    expect(screen.queryByLabelText('Retours')).not.toBeNull();
  });
});

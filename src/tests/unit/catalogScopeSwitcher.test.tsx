/**
 * catalogScopeSwitcher.test.tsx
 *
 * ⭐⭐ §3 — LE POINT LE PLUS EXPOSÉ DU MODULE JUSQU'ICI.
 *
 * Contrairement aux écrans cuisine (atteignables uniquement si `hasRestaurant`),
 * ce sélecteur vit dans l'Inventaire — un écran que TOUS les bars utilisent,
 * tous les jours. Une régression ici ne toucherait pas « les bars-restos », mais
 * l'intégralité du parc.
 *
 * §3 : « un bar pur ne doit pas être PRESQUE inchangé : il doit être
 * STRICTEMENT identique. "Presque" est le mot qui autorise les petites
 * dégradations cumulatives — un onglet vide, un compteur à 0. »
 *
 * ⚠️ On monte le VRAI composant et on interroge le DOM. Répliquer la règle
 * `if (!hasRestaurant) return null` dans le test la rendrait aveugle à un
 * changement du composant — le piège déjà rencontré sur hasRestaurant.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CatalogScopeSwitcher,
  type CatalogScope,
} from '../../components/inventory/CatalogScopeSwitcher';

const renderSwitcher = (
  hasRestaurant: boolean,
  scope: CatalogScope = 'all',
  onScopeChange = vi.fn()
) =>
  render(
    <CatalogScopeSwitcher
      scope={scope}
      onScopeChange={onScopeChange}
      hasRestaurant={hasRestaurant}
      productCount={12}
      dishCount={3}
    />
  );

describe('CatalogScopeSwitcher — invariance des bars purs (§3)', () => {
  describe('⛔ Bar PUR — le sélecteur n\'existe pas', () => {
    it('ne rend AUCUN élément', () => {
      const { container } = renderSwitcher(false);

      expect(
        container.innerHTML,
        'Le sélecteur ne doit rien rendre sur un bar sans cuisine — pas même un conteneur vide (§3)'
      ).toBe('');
    });

    it('⛔ aucune des trois portées n\'est atteignable', () => {
      renderSwitcher(false);

      // Ni le libellé « Plats » (qui trahirait la cuisine), ni même « Tout »
      // ou « Boissons » : sur un bar pur, l'écran est celui d'AVANT le module.
      expect(screen.queryByText('Plats')).toBeNull();
      expect(screen.queryByText('Boissons')).toBeNull();
      expect(screen.queryByText('Tout')).toBeNull();
      expect(screen.queryByRole('radiogroup')).toBeNull();
    });
  });

  describe('✅ Bar avec cuisine — les trois portées', () => {
    it('affiche les trois positions', () => {
      renderSwitcher(true);

      expect(screen.getByText('Tout')).toBeTruthy();
      expect(screen.getByText('Boissons')).toBeTruthy();
      expect(screen.getByText('Plats')).toBeTruthy();
    });

    it('⭐ TROIS positions, jamais deux', () => {
      // §9 : « un basculeur binaire obligerait le promoteur à faire l'addition
      // mentalement ». La position « Tout » n'est pas un confort, c'est la
      // raison d'être du composant.
      renderSwitcher(true);

      expect(screen.getAllByRole('radio')).toHaveLength(3);
    });

    it('marque la portée active, et elle SEULE', () => {
      renderSwitcher(true, 'dishes');

      const radios = screen.getAllByRole('radio');
      const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');

      expect(checked).toHaveLength(1);
      expect(checked[0].textContent).toContain('Plats');
    });

    it('remonte le changement de portée', async () => {
      const onScopeChange = vi.fn();
      renderSwitcher(true, 'all', onScopeChange);

      await userEvent.click(screen.getByText('Plats'));

      expect(onScopeChange).toHaveBeenCalledWith('dishes');
    });

    it('affiche les compteurs par portée', () => {
      // ⭐ « Tout » porte la SOMME : c'est ce qui évite au promoteur de faire
      // l'addition lui-même.
      renderSwitcher(true);

      const radios = screen.getAllByRole('radio');
      expect(radios[0].textContent).toContain('15'); // 12 + 3
      expect(radios[1].textContent).toContain('12');
      expect(radios[2].textContent).toContain('3');
    });
  });

  describe('⚠️ Compteurs absents — pas de pastille menteuse', () => {
    it('n\'affiche aucun compteur si aucun n\'est fourni', () => {
      // Un « 0 » affiché alors que la donnée n'est pas chargée ferait croire à
      // un catalogue vide.
      render(
        <CatalogScopeSwitcher
          scope="all"
          onScopeChange={vi.fn()}
          hasRestaurant
        />
      );

      const radios = screen.getAllByRole('radio');
      expect(radios[0].textContent).toBe('Tout');
      expect(radios[2].textContent).toBe('Plats');
    });
  });
});

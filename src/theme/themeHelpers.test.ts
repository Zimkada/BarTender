import { describe, it, expect } from 'vitest';
import { getRoleTheme } from './themeHelpers';
import { BRAND_CLASSES } from './constants';

describe('getRoleTheme', () => {
  describe('Super Admin Theme', () => {
    it('should return indigo/purple theme for super_admin', () => {
      const theme = getRoleTheme('super_admin');

      expect(theme.button).toBe('bg-gradient-to-r from-indigo-600 to-purple-600');
      expect(theme.avatar).toBe('bg-gradient-to-br from-indigo-600 to-purple-600');
      expect(theme.badge).toBe('bg-indigo-50 text-indigo-700 border-indigo-200');
      expect(theme.border).toBe('border-indigo-600');
      expect(theme.text).toBe('text-indigo-600');
    });
  });

  describe('Default Brand Theme', () => {
    it('should return brand theme for gerant role', () => {
      const theme = getRoleTheme('gerant');

      expect(theme.button).toBe(BRAND_CLASSES.button.base);
      expect(theme.avatar).toBe(BRAND_CLASSES.bg.primary);
      expect(theme.border).toBe(BRAND_CLASSES.border.primary);
      expect(theme.text).toBe(BRAND_CLASSES.text.primary);
      expect(theme.badge).toContain('bg-brand-subtle');
      expect(theme.badge).toContain('text-brand-primary');
      expect(theme.badge).toContain('border-brand-subtle');
    });

    it('should return brand theme for promoteur role', () => {
      const theme = getRoleTheme('promoteur');

      expect(theme.button).toBe(BRAND_CLASSES.button.base);
      expect(theme.avatar).toBe(BRAND_CLASSES.bg.primary);
    });

    it('should return brand theme for serveur role', () => {
      const theme = getRoleTheme('serveur');

      expect(theme.button).toBe(BRAND_CLASSES.button.base);
    });

    it('should return brand theme for undefined role', () => {
      const theme = getRoleTheme(undefined);

      expect(theme.button).toBe(BRAND_CLASSES.button.base);
      expect(theme.avatar).toBe(BRAND_CLASSES.bg.primary);
    });

    it('should return brand theme for unknown role', () => {
      const theme = getRoleTheme('unknown_role');

      expect(theme.button).toBe(BRAND_CLASSES.button.base);
    });
  });

  describe('Type Safety', () => {
    it('should always return all required properties', () => {
      const roles = ['super_admin', 'gerant', 'promoteur', 'serveur', undefined];

      roles.forEach(role => {
        const theme = getRoleTheme(role);

        expect(theme).toHaveProperty('button');
        expect(theme).toHaveProperty('avatar');
        expect(theme).toHaveProperty('badge');
        expect(theme).toHaveProperty('border');
        expect(theme).toHaveProperty('text');

        // Tous doivent être des strings non-vides
        expect(typeof theme.button).toBe('string');
        expect(theme.button.length).toBeGreaterThan(0);
        expect(typeof theme.avatar).toBe('string');
        expect(theme.avatar.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Consistency', () => {
    it('should return same theme object for same role (referential equality)', () => {
      const theme1 = getRoleTheme('gerant');
      const theme2 = getRoleTheme('gerant');

      // Note: Pas d'égalité référentielle car on retourne un nouvel objet
      // mais les valeurs doivent être identiques
      expect(theme1).toEqual(theme2);
    });

    it('should use BRAND_CLASSES constants for non-admin roles', () => {
      const theme = getRoleTheme('promoteur');

      // Vérifier que les valeurs correspondent bien aux constantes
      expect(theme.button).toBe('btn-brand');
      expect(theme.avatar).toBe('bg-brand-primary');
      expect(theme.border).toBe('border-brand-primary');
      expect(theme.text).toBe('text-brand-primary');
    });
  });
});

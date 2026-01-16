/**
 * utils/productNormalization.test.ts
 * Tests unitaires pour les fonctions de normalisation
 */

import { ProductNormalization } from './productNormalization';

describe('ProductNormalization', () => {
  describe('normalizeVolume', () => {
    it('should convert ml to cl', () => {
      expect(ProductNormalization.normalizeVolume('330ml')).toBe('33cl');
      expect(ProductNormalization.normalizeVolume('500ml')).toBe('50cl');
    });

    it('should convert liters to cl', () => {
      expect(ProductNormalization.normalizeVolume('1.5L')).toBe('150cl');
      expect(ProductNormalization.normalizeVolume('0.33L')).toBe('33cl');
    });

    it('should handle spaces and lowercase', () => {
      expect(ProductNormalization.normalizeVolume('33 cl')).toBe('33cl');
      expect(ProductNormalization.normalizeVolume('33 CL')).toBe('33cl');
    });

    it('should return unchanged for non-standard formats', () => {
      expect(ProductNormalization.normalizeVolume('Grande bouteille')).toBe(
        'Grande bouteille'
      );
      expect(ProductNormalization.normalizeVolume('Autre')).toBe('Autre');
    });
  });

  describe('normalizeName', () => {
    it('should lowercase and remove accents', () => {
      expect(ProductNormalization.normalizeName('Café Crème')).toBe(
        'cafe creme'
      );
      expect(ProductNormalization.normalizeName('BIÈRE')).toBe('biere');
    });

    it('should remove punctuation', () => {
      expect(ProductNormalization.normalizeName('Coca-Cola')).toBe('coca cola');
      expect(ProductNormalization.normalizeName("L'Espresso")).toBe('lespresso');
    });

    it('should normalize spaces', () => {
      expect(ProductNormalization.normalizeName('Coca   Cola')).toBe(
        'coca cola'
      );
      expect(ProductNormalization.normalizeName('  Heineken  ')).toBe(
        'heineken'
      );
    });
  });

  describe('areSimilar', () => {
    it('should detect exact matches after normalization', () => {
      expect(
        ProductNormalization.areSimilar('Coca-Cola', 'coca cola')
      ).toBe(true);
      expect(ProductNormalization.areSimilar('HEINEKEN', 'heineken')).toBe(true);
    });

    it('should detect inclusion', () => {
      expect(
        ProductNormalization.areSimilar('Coca', 'Coca Cola')
      ).toBe(true);
      expect(ProductNormalization.areSimilar('Coca Cola', 'Coca')).toBe(true);
    });

    it('should detect word-start similarity', () => {
      expect(
        ProductNormalization.areSimilar('Coca Cola', 'Coca Cola Light')
      ).toBe(true);
    });

    it('should return false for unrelated products', () => {
      expect(ProductNormalization.areSimilar('Bière', 'Vin')).toBe(false);
      expect(ProductNormalization.areSimilar('Heineken', 'Guiness')).toBe(false);
    });
  });

  describe('calculateSuggestedPriceRange', () => {
    it('should calculate price range with default margin', () => {
      const result = ProductNormalization.calculateSuggestedPriceRange(1000);
      expect(result.min).toBe(800);
      expect(result.max).toBe(1200);
    });

    it('should respect custom margin', () => {
      const result = ProductNormalization.calculateSuggestedPriceRange(1000, 0.3);
      expect(result.min).toBe(700);
      expect(result.max).toBe(1300);
    });

    it('should handle edge cases', () => {
      const result = ProductNormalization.calculateSuggestedPriceRange(100, 0.1);
      expect(result.min).toBe(90);
      expect(result.max).toBe(110);
    });
  });
});

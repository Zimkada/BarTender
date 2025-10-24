import { BeninCurrencyService } from './BeninCurrencyService';

describe('BeninCurrencyService', () => {
  describe('formatPrice', () => {
    it('should format price with symbol by default', () => {
      const result = BeninCurrencyService.formatPrice(1000);
      expect(result).toContain('1');
      expect(result).toContain('000');
      expect(result).toContain('FCFA');
    });

    it('should format price without thousand separator', () => {
      expect(BeninCurrencyService.formatPrice(1000, { useThousandsSeparator: false }))
        .toBe('1000 FCFA');
    });

    it('should format price without symbol', () => {
      const result = BeninCurrencyService.formatPrice(1000, { showSymbol: false });
      expect(result).toContain('1');
      expect(result).toContain('000');
      expect(result).not.toContain('FCFA');
    });

    it('should round decimals correctly', () => {
      const result1 = BeninCurrencyService.formatPrice(1234.56);
      expect(result1).toContain('1');
      expect(result1).toContain('235');
      expect(result1).toContain('FCFA');

      const result2 = BeninCurrencyService.formatPrice(1234.49);
      expect(result2).toContain('1');
      expect(result2).toContain('234');
      expect(result2).toContain('FCFA');
    });

    it('should format zero', () => {
      expect(BeninCurrencyService.formatPrice(0)).toBe('0 FCFA');
    });

    it('should format large amounts', () => {
      const result = BeninCurrencyService.formatPrice(1234567);
      expect(result).toContain('1');
      expect(result).toContain('234');
      expect(result).toContain('567');
      expect(result).toContain('FCFA');
    });
  });

  describe('parsePrice', () => {
    it('should parse formatted price string', () => {
      expect(BeninCurrencyService.parsePrice('1 000 FCFA')).toBe(1000);
    });

    it('should parse price without separator', () => {
      expect(BeninCurrencyService.parsePrice('1000')).toBe(1000);
    });

    it('should parse price with only numbers', () => {
      expect(BeninCurrencyService.parsePrice('5000')).toBe(5000);
    });

    it('should handle empty string', () => {
      expect(BeninCurrencyService.parsePrice('')).toBe(0);
    });

    it('should handle non-numeric characters', () => {
      expect(BeninCurrencyService.parsePrice('abc')).toBe(0);
    });

    it('should parse complex formatted string', () => {
      expect(BeninCurrencyService.parsePrice('1 234 567 FCFA')).toBe(1234567);
    });
  });

  describe('validateAmount', () => {
    it('should validate positive amount', () => {
      const result = BeninCurrencyService.validateAmount(1000);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative amount', () => {
      const result = BeninCurrencyService.validateAmount(-100);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le montant ne peut pas être négatif');
    });

    it('should reject non-finite number', () => {
      const result = BeninCurrencyService.validateAmount(NaN);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le montant doit être un nombre valide');
    });

    it('should warn on very high amount', () => {
      const result = BeninCurrencyService.validateAmount(150000000);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Montant très élevé');
    });

    it('should validate zero', () => {
      const result = BeninCurrencyService.validateAmount(0);
      expect(result.isValid).toBe(true);
    });
  });

  describe('calculateChangeComplexity', () => {
    it('should calculate simple change (1 bill)', () => {
      const result = BeninCurrencyService.calculateChangeComplexity(5000);
      expect(result.complexity).toBe(1);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0]).toEqual({ denomination: 5000, count: 1 });
    });

    it('should calculate complex change', () => {
      const result = BeninCurrencyService.calculateChangeComplexity(6789);
      expect(result.complexity).toBeGreaterThan(1);
      expect(result.breakdown.length).toBeGreaterThan(1);
    });

    it('should suggest rounding for complex change', () => {
      const result = BeninCurrencyService.calculateChangeComplexity(6789);
      if (result.complexity > 5) {
        expect(result.suggestion).toContain('arrondir');
      }
    });

    it('should handle zero', () => {
      const result = BeninCurrencyService.calculateChangeComplexity(0);
      expect(result.complexity).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });
  });

  describe('getRoundingOptions', () => {
    it('should return exact price as first option', () => {
      const options = BeninCurrencyService.getRoundingOptions(1234);
      expect(options[0].value).toBe(1234);
      expect(options[0].label).toBe('Prix exact');
      expect(options[0].changeAmount).toBe(0);
    });

    it('should include 5 FCFA rounding option', () => {
      const options = BeninCurrencyService.getRoundingOptions(1232);
      const rounded5 = options.find(o => o.label.includes('5 FCFA'));
      expect(rounded5).toBeDefined();
      expect(rounded5?.value).toBe(1230); // 1232 arrondi au 5 le plus proche
    });

    it('should include 10 FCFA rounding option', () => {
      const options = BeninCurrencyService.getRoundingOptions(1234);
      const rounded10 = options.find(o => o.label.includes('10 FCFA'));
      expect(rounded10).toBeDefined();
      expect(rounded10?.value).toBe(1230); // 1234 arrondi au 10 le plus proche
    });

    it('should calculate change amount correctly', () => {
      const options = BeninCurrencyService.getRoundingOptions(1234);
      const rounded5 = options.find(o => o.label.includes('5 FCFA'));
      expect(rounded5?.changeAmount).toBe(1235 - 1234); // 1 FCFA de différence
    });

    it('should calculate change percentage correctly', () => {
      const options = BeninCurrencyService.getRoundingOptions(1000);
      const rounded = options.find(o => o.changeAmount !== 0);
      if (rounded) {
        expect(rounded.changePercentage).toBeCloseTo((rounded.changeAmount / 1000) * 100, 2);
      }
    });
  });

  describe('isMobileMoneyCompatible', () => {
    it('should accept positive integer', () => {
      expect(BeninCurrencyService.isMobileMoneyCompatible(1000)).toBe(true);
    });

    it('should reject decimal', () => {
      expect(BeninCurrencyService.isMobileMoneyCompatible(1000.5)).toBe(false);
    });

    it('should reject negative', () => {
      expect(BeninCurrencyService.isMobileMoneyCompatible(-100)).toBe(false);
    });

    it('should reject zero', () => {
      expect(BeninCurrencyService.isMobileMoneyCompatible(0)).toBe(false);
    });
  });

  describe('calculateRoundingImpact', () => {
    it('should calculate margin impact correctly', () => {
      const result = BeninCurrencyService.calculateRoundingImpact(
        1000,  // original price
        1100,  // rounded price
        600    // cost price
      );

      expect(result.originalMargin).toBe(400);  // 1000 - 600
      expect(result.newMargin).toBe(500);        // 1100 - 600
      expect(result.marginChange).toBe(100);     // 500 - 400
      expect(result.marginChangePercentage).toBe(25); // (100 / 400) * 100
    });

    it('should provide appropriate recommendations', () => {
      // Impact significatif (>5%)
      const highImpact = BeninCurrencyService.calculateRoundingImpact(1000, 1100, 600);
      expect(highImpact.recommendation).toContain('significatif');

      // Impact minimal (<2%) - ajuster pour être vraiment <2%
      const lowImpact = BeninCurrencyService.calculateRoundingImpact(1000, 1005, 600);
      expect(lowImpact.recommendation).toContain('minimal');
    });

    it('should handle zero margin', () => {
      const result = BeninCurrencyService.calculateRoundingImpact(1000, 1100, 1000);
      expect(result.originalMargin).toBe(0);
      expect(result.marginChangePercentage).toBe(0);
    });
  });

  describe('getSuggestedPrices', () => {
    it('should return array of suggested prices', () => {
      const suggestions = BeninCurrencyService.getSuggestedPrices(523);
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include psychological price endings', () => {
      const suggestions = BeninCurrencyService.getSuggestedPrices(523);
      // Devrait inclure des prix comme 500, 525, 550, etc.
      expect(suggestions).toContain(500);
      expect(suggestions).toContain(525);
    });

    it('should sort suggestions in ascending order', () => {
      const suggestions = BeninCurrencyService.getSuggestedPrices(523);
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i]).toBeGreaterThanOrEqual(suggestions[i - 1]);
      }
    });

    it('should only suggest prices within 20% range', () => {
      const basePrice = 1000;
      const suggestions = BeninCurrencyService.getSuggestedPrices(basePrice);

      suggestions.forEach(suggested => {
        const difference = Math.abs(suggested - basePrice);
        const percentage = difference / basePrice;
        expect(percentage).toBeLessThanOrEqual(0.2);
      });
    });
  });

  describe('formatForReport', () => {
    it('should format basic report price', () => {
      const result = BeninCurrencyService.formatForReport(1000);
      expect(result).toContain('1');
      expect(result).toContain('000');
      expect(result).toContain('FCFA');
    });

    it('should include EUR reference when requested', () => {
      const result = BeninCurrencyService.formatForReport(1000, {
        includeReference: true,
        currency: 'EUR'
      });
      expect(result).toContain('FCFA');
      expect(result).toContain('€');
      expect(result).toContain('≈');
    });

    it('should include USD reference when requested', () => {
      const result = BeninCurrencyService.formatForReport(1000, {
        includeReference: true,
        currency: 'USD'
      });
      expect(result).toContain('FCFA');
      expect(result).toContain('$');
    });

    it('should convert to EUR correctly (approximation)', () => {
      const result = BeninCurrencyService.formatForReport(10000, {
        includeReference: true,
        currency: 'EUR'
      });
      // 10,000 FCFA ≈ 15.2 EUR
      expect(result).toContain('15.20');
    });
  });
});

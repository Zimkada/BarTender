// Service monétaire Bénin - Précision comptable exacte
// Pas d'arrondi automatique pour éviter biais financiers

export interface BeninCurrencyConfig {
  code: 'XOF';
  name: 'Franc CFA (BCEAO)';
  symbol: ' FCFA';
  symbolPosition: 'after';
  decimalPlaces: 0;
  thousandsSeparator: ' ';
  precision: 1; // 1 FCFA précision
  locale: 'fr-BJ';
}

export interface PriceDisplayOptions {
  showSymbol: boolean;
  useThousandsSeparator: boolean;
  roundingStrategy?: 'none' | 'nearest_5' | 'nearest_10';
  showRoundingSuggestion?: boolean;
}

export interface RoundingOption {
  value: number;
  label: string;
  description: string;
  changeAmount: number;
  changePercentage: number;
}

export class BeninCurrencyService {
  private static readonly config: BeninCurrencyConfig = {
    code: 'XOF',
    name: 'Franc CFA (BCEAO)',
    symbol: ' FCFA',
    symbolPosition: 'after',
    decimalPlaces: 0,
    thousandsSeparator: ' ',
    precision: 1,
    locale: 'fr-BJ'
  };

  // Format exact (pas d'arrondi automatique)
  static formatPrice(
    amount: number,
    options: Partial<PriceDisplayOptions> = {}
  ): string {
    const {
      showSymbol = true,
      useThousandsSeparator = true,
    } = options;

    // Seulement supprimer les décimales (pas d'arrondi arbitraire)
    const exactAmount = Math.round(amount);

    let formatted: string;

    if (useThousandsSeparator) {
      formatted = new Intl.NumberFormat(this.config.locale, {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true
      }).format(exactAmount);
    } else {
      formatted = exactAmount.toString();
    }

    return showSymbol ? formatted + this.config.symbol : formatted;
  }

  // Parse string vers number
  static parsePrice(priceString: string): number {
    // Nettoyer la chaîne (garder seulement les chiffres)
    const cleanString = priceString
      .replace(/[^\d]/g, '')  // Supprimer tout sauf chiffres
      .trim();

    const parsed = parseInt(cleanString, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Validation d'un montant
  static validateAmount(amount: number): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validations de base
    if (!Number.isFinite(amount)) {
      errors.push('Le montant doit être un nombre valide');
    }

    if (amount < 0) {
      errors.push('Le montant ne peut pas être négatif');
    }

    if (amount > 100000000) { // 100M FCFA limite raisonnable
      warnings.push('Montant très élevé, vérifiez la saisie');
    }

    // Vérification monnaie disponible
    const changeNeeded = this.calculateChangeComplexity(amount);
    if (changeNeeded.complexity > 3) {
      warnings.push(`Rendu monnaie complexe (${changeNeeded.complexity} pièces/billets)`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Calcul complexité du rendu de monnaie
  static calculateChangeComplexity(amount: number): {
    complexity: number;
    breakdown: { denomination: number; count: number }[];
    suggestion: string;
  } {
    const denominations = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];
    const breakdown: { denomination: number; count: number }[] = [];

    let remaining = Math.round(amount);
    let totalPieces = 0;

    for (const denom of denominations) {
      if (remaining >= denom) {
        const count = Math.floor(remaining / denom);
        breakdown.push({ denomination: denom, count });
        remaining -= count * denom;
        totalPieces += count;
      }
    }

    let suggestion = '';
    if (totalPieces > 5) {
      suggestion = `Considérer arrondir pour simplifier le rendu`;
    }

    return {
      complexity: totalPieces,
      breakdown,
      suggestion
    };
  }

  // Options d'arrondi (choix utilisateur)
  static getRoundingOptions(amount: number): RoundingOption[] {
    const exactAmount = Math.round(amount);
    const options: RoundingOption[] = [];

    // Option 1: Garder exact
    options.push({
      value: exactAmount,
      label: 'Prix exact',
      description: 'Garder le prix calculé exactement',
      changeAmount: 0,
      changePercentage: 0
    });

    // Option 2: Arrondi au 5 FCFA
    const rounded5 = Math.round(exactAmount / 5) * 5;
    if (rounded5 !== exactAmount) {
      const change = rounded5 - exactAmount;
      options.push({
        value: rounded5,
        label: `Arrondi au 5 FCFA`,
        description: `Facilite le rendu de monnaie`,
        changeAmount: change,
        changePercentage: (change / exactAmount) * 100
      });
    }

    // Option 3: Arrondi au 10 FCFA
    const rounded10 = Math.round(exactAmount / 10) * 10;
    if (rounded10 !== exactAmount && rounded10 !== rounded5) {
      const change = rounded10 - exactAmount;
      options.push({
        value: rounded10,
        label: `Arrondi au 10 FCFA`,
        description: `Très facile pour la monnaie`,
        changeAmount: change,
        changePercentage: (change / exactAmount) * 100
      });
    }

    // Option 4: Arrondi au 25 FCFA (pièce commune)
    const rounded25 = Math.round(exactAmount / 25) * 25;
    if (rounded25 !== exactAmount && Math.abs(rounded25 - exactAmount) <= 15) {
      const change = rounded25 - exactAmount;
      options.push({
        value: rounded25,
        label: `Arrondi au 25 FCFA`,
        description: `Pièce de 25 FCFA courante`,
        changeAmount: change,
        changePercentage: (change / exactAmount) * 100
      });
    }

    return options;
  }

  // Calcul impact arrondi sur marge
  static calculateRoundingImpact(
    originalPrice: number,
    roundedPrice: number,
    costPrice: number
  ): {
    originalMargin: number;
    newMargin: number;
    marginChange: number;
    marginChangePercentage: number;
    recommendation: string;
  } {
    const originalMargin = originalPrice - costPrice;
    const newMargin = roundedPrice - costPrice;
    const marginChange = newMargin - originalMargin;
    const marginChangePercentage = originalMargin > 0
      ? (marginChange / originalMargin) * 100
      : 0;

    let recommendation = '';
    if (Math.abs(marginChangePercentage) > 5) {
      recommendation = `Attention: Impact significatif sur la marge (${marginChangePercentage.toFixed(1)}%)`;
    } else if (Math.abs(marginChangePercentage) > 2) {
      recommendation = `Impact modéré sur la marge (${marginChangePercentage.toFixed(1)}%)`;
    } else {
      recommendation = `Impact minimal sur la marge`;
    }

    return {
      originalMargin,
      newMargin,
      marginChange,
      marginChangePercentage,
      recommendation
    };
  }

  // Validation pour mobile money (exactitude requise)
  static isMobileMoneyCompatible(amount: number): boolean {
    // Mobile Money accepte n'importe quel montant exact en FCFA
    return Number.isInteger(amount) && amount > 0;
  }

  // Suggestions de prix psychologiques
  static getSuggestedPrices(basePrice: number): number[] {
    const suggestions: number[] = [];
    const base = Math.round(basePrice);

    // Prix psychologiques courants au Bénin
    const psychologicalEndings = [0, 5, 25, 50, 75, 95];

    for (const ending of psychologicalEndings) {
      const hundreds = Math.floor(base / 100) * 100;
      const suggested = hundreds + ending;

      // Seulement si proche du prix de base (±20%)
      if (Math.abs(suggested - base) / base <= 0.2 && suggested > 0) {
        suggestions.push(suggested);
      }
    }

    // Ajouter prix ronds proches
    const roundPrices = [
      Math.floor(base / 100) * 100,     // Ex: 523 → 500
      Math.ceil(base / 100) * 100,      // Ex: 523 → 600
      Math.round(base / 50) * 50,       // Ex: 523 → 525 ou 550
      Math.round(base / 25) * 25        // Ex: 523 → 525
    ];

    for (const price of roundPrices) {
      if (price > 0 && !suggestions.includes(price)) {
        suggestions.push(price);
      }
    }

    return [...new Set(suggestions)].sort((a, b) => a - b);
  }

  // Configuration par défaut
  static getDefaultConfig(): BeninCurrencyConfig {
    return { ...this.config };
  }

  // Conversion vers autres devises (pour référence)
  static convertToReference(amountXOF: number, targetCurrency: 'EUR' | 'USD'): number {
    // Taux approximatifs pour référence (non temps réel)
    const rates = {
      EUR: 0.00152,  // 1 FCFA ≈ 0.00152 EUR
      USD: 0.00164   // 1 FCFA ≈ 0.00164 USD
    };

    return amountXOF * rates[targetCurrency];
  }

  // Formatage pour rapports
  static formatForReport(
    amount: number,
    options: { includeReference?: boolean; currency?: 'EUR' | 'USD' } = {}
  ): string {
    const formatted = this.formatPrice(amount);

    if (options.includeReference && options.currency) {
      const converted = this.convertToReference(amount, options.currency);
      const symbol = options.currency === 'EUR' ? '€' : '$';
      return `${formatted} (≈ ${converted.toFixed(2)} ${symbol})`;
    }

    return formatted;
  }
}

// Export des types et du service
export { BeninCurrencyService as default };
export type { BeninCurrencyConfig, PriceDisplayOptions, RoundingOption };
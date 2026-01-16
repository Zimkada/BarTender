/**
 * utils/productNormalization.ts
 * Fonctions de normalisation pour les produits
 * Assure la cohérence des données avant création/promotion
 */

/**
 * Normalise un volume pour assurer la cohérence
 * "33 cl" → "33cl"
 * "330ml" → "33cl"
 * "0.33L" → "33cl"
 * "Grande bouteille" → "Grande bouteille" (aucune transformation)
 */
export class ProductNormalization {
  /**
   * Normalise un volume en format standardisé
   * Accepte ml, cl, L et retourne en cl par défaut
   */
  static normalizeVolume(input: string): string {
    const cleaned = input.toLowerCase().trim().replace(/\s+/g, '');

    // Conversion ml → cl
    const mlMatch = cleaned.match(/^(\d+)ml$/);
    if (mlMatch) {
      const ml = parseInt(mlMatch[1]);
      const cl = Math.round(ml / 10);
      return `${cl}cl`;
    }

    // Conversion L → cl
    const lMatch = cleaned.match(/^(\d+(?:\.\d+)?)l$/);
    if (lMatch) {
      const liters = parseFloat(lMatch[1]);
      const cl = Math.round(liters * 100);
      return `${cl}cl`;
    }

    // Format déjà en cl (avec ou sans espace)
    const clMatch = cleaned.match(/^(\d+)cl$/);
    if (clMatch) {
      return cleaned; // "33cl"
    }

    // Retour tel quel si format non reconnu
    return input;
  }

  /**
   * Normalise un nom de produit pour comparaison
   * Élimine ponctuation, accents, espaces multiples
   * "Coca-Cola" → "coca cola"
   * "Café Crème" → "cafe creme"
   * "Coca  Cola" → "coca cola"
   */
  static normalizeName(name: string): string {
    return (
      name
        .toLowerCase()
        .trim()
        // Élimine les accents (é → e, ç → c, etc)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Élimine ponctuation (-, ', ", etc)
        .replace(/[^\w\s]/g, '')
        // Normalise espaces multiples
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * Vérifie si deux noms de produit sont similaires
   * Utilise normalisation + inclusion de texte
   */
  static areSimilar(name1: string, name2: string): boolean {
    const norm1 = this.normalizeName(name1);
    const norm2 = this.normalizeName(name2);

    // Identique après normalisation
    if (norm1 === norm2) {
      return true;
    }

    // L'un est inclus dans l'autre (ex: "coca" vs "coca cola")
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return true;
    }

    // Début identique (ex: "coca cola" vs "coca cola light")
    const words1 = norm1.split(' ');
    const words2 = norm2.split(' ');
    const minLength = Math.min(words1.length, words2.length);

    if (minLength >= 2) {
      const firstWordsMatch = words1
        .slice(0, minLength)
        .every((w, i) => w === words2[i]);
      if (firstWordsMatch) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calcule une fourchette de prix suggéré basée sur le prix local
   * Par défaut : ±20% du prix
   */
  static calculateSuggestedPriceRange(localPrice: number, margin: number = 0.2) {
    return {
      min: Math.floor(localPrice * (1 - margin)),
      max: Math.ceil(localPrice * (1 + margin))
    };
  }
}

/**
 * Tests unitaires
 */
export const productNormalizationTests = {
  testVolumeNormalization: () => {
    const tests = [
      { input: '33 cl', expected: '33cl' },
      { input: '330ml', expected: '33cl' },
      { input: '0.33L', expected: '33cl' },
      { input: '33cl', expected: '33cl' },
      { input: 'Grande bouteille', expected: 'Grande bouteille' },
      { input: '1.5L', expected: '150cl' }
    ];

    return tests.map(t => ({
      input: t.input,
      result: ProductNormalization.normalizeVolume(t.input),
      passed: ProductNormalization.normalizeVolume(t.input) === t.expected
    }));
  },

  testNameNormalization: () => {
    const tests = [
      { input: 'Coca-Cola', expected: 'coca cola' },
      { input: 'café crème', expected: 'cafe creme' },
      { input: 'Coca  Cola', expected: 'coca cola' },
      { input: 'HEINEKEN', expected: 'heineken' },
      { input: "L'Espresso", expected: 'lespresso' }
    ];

    return tests.map(t => ({
      input: t.input,
      result: ProductNormalization.normalizeName(t.input),
      passed: ProductNormalization.normalizeName(t.input) === t.expected
    }));
  },

  testSimilarity: () => {
    const tests = [
      { name1: 'Coca-Cola', name2: 'coca cola', expected: true },
      { name1: 'Coca Cola', name2: 'Coca Cola Light', expected: true },
      { name1: 'Heineken', name2: 'Heineken 33cl', expected: true },
      { name1: 'Coca', name2: 'Coca Cola', expected: true },
      { name1: 'Bière Locale', name2: 'Biere', expected: false }
    ];

    return tests.map(t => ({
      name1: t.name1,
      name2: t.name2,
      result: ProductNormalization.areSimilar(t.name1, t.name2),
      passed: ProductNormalization.areSimilar(t.name1, t.name2) === t.expected
    }));
  }
};

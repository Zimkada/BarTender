/**
 * utils/categorySuggestion.ts
 * Système de suggestion automatique de catégorie pour produits enrichis
 * Analyse les propriétés du produit local et propose la meilleure catégorie globale
 */

export interface CategorySuggestion {
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const GLOBAL_CATEGORIES = [
  'Alcools',
  'Bière',
  'Spiritueux',
  'Vin',
  'Cocktails',
  'Softs',
  'Jus',
  'Eau',
  'Café',
  'Thé',
  'Petit-déjeuner',
  'Snacks',
  'Autres'
];

// Mapping de mots-clés à catégories avec poids
const KEYWORD_MAPPING: Record<string, { category: string; weight: number }[]> = {
  biere: [{ category: 'Bière', weight: 100 }],
  bière: [{ category: 'Bière', weight: 100 }],
  lager: [{ category: 'Bière', weight: 95 }],
  stout: [{ category: 'Bière', weight: 95 }],
  ipa: [{ category: 'Bière', weight: 95 }],

  vodka: [{ category: 'Spiritueux', weight: 100 }],
  rhum: [{ category: 'Spiritueux', weight: 100 }],
  whisky: [{ category: 'Spiritueux', weight: 100 }],
  rum: [{ category: 'Spiritueux', weight: 100 }],
  gin: [{ category: 'Spiritueux', weight: 100 }],

  vin: [{ category: 'Vin', weight: 100 }],
  wine: [{ category: 'Vin', weight: 100 }],

  cocktail: [{ category: 'Cocktails', weight: 100 }],

  jus: [{ category: 'Jus', weight: 100 }],
  juice: [{ category: 'Jus', weight: 100 }],

  eau: [{ category: 'Eau', weight: 100 }],
  water: [{ category: 'Eau', weight: 100 }],

  cafe: [{ category: 'Café', weight: 100 }],
  café: [{ category: 'Café', weight: 100 }],
  coffee: [{ category: 'Café', weight: 100 }],

  the: [{ category: 'Thé', weight: 100 }],
  thé: [{ category: 'Thé', weight: 100 }],
  tea: [{ category: 'Thé', weight: 100 }],

  petit: [{ category: 'Petit-déjeuner', weight: 50 }],
  dejeuner: [{ category: 'Petit-déjeuner', weight: 50 }],
  breakfast: [{ category: 'Petit-déjeuner', weight: 75 }],

  snack: [{ category: 'Snacks', weight: 100 }],
  chips: [{ category: 'Snacks', weight: 95 }],
  nuts: [{ category: 'Snacks', weight: 95 }],

  // Catégorie par défaut pour alcools génériques
  alcool: [{ category: 'Alcools', weight: 80 }],
  alcohol: [{ category: 'Alcools', weight: 80 }],

  // Catégorie Softs pour boissons non alcoolisées
  coca: [{ category: 'Softs', weight: 95 }],
  sprite: [{ category: 'Softs', weight: 95 }],
  fanta: [{ category: 'Softs', weight: 95 }],
  soda: [{ category: 'Softs', weight: 95 }],
  energetique: [{ category: 'Softs', weight: 80 }],
  energy: [{ category: 'Softs', weight: 80 }]
};

/**
 * Suggère une catégorie basée sur le nom et la catégorie locale du produit
 */
export function suggestCategory(
  productName: string,
  localCategoryName?: string,
  volume?: string
): CategorySuggestion {
  const scores: Record<string, number> = {};

  // Initialiser tous les scores à 0
  GLOBAL_CATEGORIES.forEach(cat => {
    scores[cat] = 0;
  });

  // Analyser le nom du produit
  const nameLower = productName.toLowerCase().trim();
  const nameTokens = nameLower.split(/[\s\-_,\.]+/).filter(t => t.length > 0);

  // Score basé sur les tokens du nom
  nameTokens.forEach(token => {
    // Chercher des correspondances exactes
    if (KEYWORD_MAPPING[token]) {
      KEYWORD_MAPPING[token].forEach(({ category, weight }) => {
        scores[category] += weight;
      });
    }
    // Chercher des correspondances partielles (substring)
    Object.entries(KEYWORD_MAPPING).forEach(([keyword, suggestions]) => {
      if (token.includes(keyword) || keyword.includes(token)) {
        suggestions.forEach(({ category, weight }) => {
          scores[category] += weight * 0.7; // Poids réduit pour substring match
        });
      }
    });
  });

  // Analyser la catégorie locale si disponible
  if (localCategoryName) {
    const localCatLower = localCategoryName.toLowerCase().trim();
    const localTokens = localCatLower.split(/[\s\-_,\.]+/).filter(t => t.length > 0);

    localTokens.forEach(token => {
      if (KEYWORD_MAPPING[token]) {
        KEYWORD_MAPPING[token].forEach(({ category, weight }) => {
          scores[category] += weight * 0.5; // Poids réduit pour catégorie locale
        });
      }
    });
  }

  // Analyser le volume pour des indices supplémentaires
  if (volume) {
    const volumeLower = volume.toLowerCase();
    // Les bières sont souvent en 33cl, 50cl
    if ((volumeLower.includes('33') || volumeLower.includes('50')) &&
        (scores['Bière'] > 0 || scores['Alcools'] > 0)) {
      scores['Bière'] += 20;
    }
    // Les spiritueux sont souvent en 70cl, 1L
    if ((volumeLower.includes('70') || volumeLower.includes('1')) &&
        (scores['Spiritueux'] > 0 || scores['Alcools'] > 0)) {
      scores['Spiritueux'] += 15;
    }
  }

  // Trouver la catégorie avec le score le plus élevé
  let bestCategory = 'Autres';
  let bestScore = 0;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let reason = 'Catégorie par défaut';

  Object.entries(scores).forEach(([category, score]) => {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  });

  // Déterminer le niveau de confiance
  if (bestScore > 80) {
    confidence = 'high';
    reason = `Produit identifié comme "${bestCategory}" (score: ${Math.round(bestScore)}/100)`;
  } else if (bestScore > 40) {
    confidence = 'medium';
    reason = `Suggestion basée sur les mots-clés (score: ${Math.round(bestScore)}/100)`;
  } else {
    // Si aucune correspondance trouvée, appliquer une logique par défaut
    confidence = 'low';
    reason = 'Aucune catégorie claire détectée, catégorie "Autres" proposée';
    bestCategory = 'Autres';
  }

  return {
    suggestedCategory: bestCategory,
    confidence,
    reason
  };
}

/**
 * Retourne tous les scores de catégorie pour debug
 */
export function debugCategorySuggestion(
  productName: string,
  localCategoryName?: string,
  volume?: string
): Record<string, { score: number; confidence: string }> {
  const scores: Record<string, number> = {};

  GLOBAL_CATEGORIES.forEach(cat => {
    scores[cat] = 0;
  });

  const nameLower = productName.toLowerCase().trim();
  const nameTokens = nameLower.split(/[\s\-_,\.]+/).filter(t => t.length > 0);

  nameTokens.forEach(token => {
    if (KEYWORD_MAPPING[token]) {
      KEYWORD_MAPPING[token].forEach(({ category, weight }) => {
        scores[category] += weight;
      });
    }
    Object.entries(KEYWORD_MAPPING).forEach(([keyword, suggestions]) => {
      if (token.includes(keyword) || keyword.includes(token)) {
        suggestions.forEach(({ category, weight }) => {
          scores[category] += weight * 0.7;
        });
      }
    });
  });

  if (localCategoryName) {
    const localCatLower = localCategoryName.toLowerCase().trim();
    const localTokens = localCatLower.split(/[\s\-_,\.]+/).filter(t => t.length > 0);

    localTokens.forEach(token => {
      if (KEYWORD_MAPPING[token]) {
        KEYWORD_MAPPING[token].forEach(({ category, weight }) => {
          scores[category] += weight * 0.5;
        });
      }
    });
  }

  if (volume) {
    const volumeLower = volume.toLowerCase();
    if ((volumeLower.includes('33') || volumeLower.includes('50')) &&
        (scores['Bière'] > 0 || scores['Alcools'] > 0)) {
      scores['Bière'] += 20;
    }
    if ((volumeLower.includes('70') || volumeLower.includes('1')) &&
        (scores['Spiritueux'] > 0 || scores['Alcools'] > 0)) {
      scores['Spiritueux'] += 15;
    }
  }

  const result: Record<string, { score: number; confidence: string }> = {};
  Object.entries(scores).forEach(([category, score]) => {
    let confidence = 'low';
    if (score > 80) confidence = 'high';
    else if (score > 40) confidence = 'medium';

    if (score > 0) {
      result[category] = { score, confidence };
    }
  });

  return result;
}

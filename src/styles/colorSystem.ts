/**
 * BarTender Pro - Système de Couleurs Officiel
 *
 * RÈGLE STRICTE: 3 couleurs sémantiques maximum
 *
 * 1. ORANGE/AMBER: Brand principal, actions standards, états actifs
 * 2. VERT/ÉMERAUDE: Argent/revenus, succès, validations
 * 3. ROUGE/ROSE: Danger, erreurs, retours, alertes
 *
 * Tout le reste utilise GRIS/BLANC/NOIR pour maintenir cohérence professionnelle
 *
 * @usage
 * import { COLORS, COMPONENTS, WIDGETS } from '@/styles/colorSystem';
 * <div className={`bg-gradient-to-r ${COLORS.brand.gradient}`}>
 */

export const COLORS = {
  // === BRAND: ORANGE/AMBER (Identité BarTender) ===
  brand: {
    // Gradients
    gradient: 'from-amber-500 to-amber-500',           // Headers, boutons primaires
    gradientLight: 'from-amber-100 to-amber-100',     // Widgets, cards backgrounds
    gradientSubtle: 'from-amber-50 to-amber-50',      // Containers légers

    // Solides
    solid: 'bg-amber-500',
    solidLight: 'bg-amber-100',

    // Texte
    text: 'text-amber-600',
    textLight: 'text-amber-500',
    textDark: 'text-amber-700',

    // Bordures
    border: 'border-amber-200',
    borderDark: 'border-amber-300',

    // Hover states
    hover: 'hover:bg-amber-600',
    hoverLight: 'hover:bg-amber-50',
  },

  // === SUCCESS/MONEY: VERT/ÉMERAUDE (Argent, profits, validations) ===
  success: {
    // Gradients
    gradient: 'from-green-500 to-emerald-500',
    gradientLight: 'from-green-100 to-emerald-100',

    // Solides
    solid: 'bg-green-500',
    solidLight: 'bg-green-100',

    // Texte
    text: 'text-green-600',
    textLight: 'text-green-500',

    // Bordures
    border: 'border-green-200',
  },

  // === DANGER: ROUGE/ROSE (Erreurs, suppressions, retours) ===
  danger: {
    // Gradients
    gradient: 'from-red-500 to-pink-500',
    gradientLight: 'from-red-100 to-pink-100',

    // Solides
    solid: 'bg-red-500',
    solidLight: 'bg-red-100',

    // Texte
    text: 'text-red-600',
    textLight: 'text-red-500',

    // Bordures
    border: 'border-red-200',
  },

  // === NEUTRAL: GRIS (États secondaires, backgrounds neutres) ===
  neutral: {
    bg: 'bg-gray-100',
    bgDark: 'bg-gray-200',
    bgLight: 'bg-gray-50',
    text: 'text-gray-600',
    textDark: 'text-gray-800',
    textLight: 'text-gray-500',
    border: 'border-gray-200',
    borderDark: 'border-gray-300',
  },
} as const;

// === COMPOSANTS STANDARDS (Styles réutilisables) ===
export const COMPONENTS = {
  // === MODAL HEADERS ===
  // TOUJOURS utiliser gradient orange pour cohérence visuelle
  modalHeader: `bg-gradient-to-r ${COLORS.brand.gradient} text-white`,
  modalHeaderIcon: 'w-8 h-8 text-white',
  modalHeaderSubtitle: 'text-amber-100 text-sm',
  modalCloseButton: 'p-2 hover:bg-white/20 rounded-lg transition-colors',

  // === TABS NAVIGATION ===
  // Style underline moderne (pattern standard)
  tabActive: `${COLORS.brand.text} border-b-2 border-amber-600 bg-white font-medium`,
  tabInactive: `${COLORS.neutral.text} hover:${COLORS.brand.textLight} hover:bg-amber-50 transition-colors`,

  // === FOCUS RINGS ===
  // TOUJOURS orange pour uniformité
  focusRing: 'focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none',

  // === BADGES STATUTS ===
  badgePending: `${COLORS.brand.solidLight} ${COLORS.brand.textDark} border ${COLORS.brand.border} px-3 py-1 rounded-full text-xs font-medium`,
  badgeSuccess: `${COLORS.success.solid} text-white px-3 py-1 rounded-full text-xs font-medium`,
  badgeDanger: `${COLORS.danger.solid} text-white px-3 py-1 rounded-full text-xs font-medium`,
  badgeNeutral: `bg-gray-400 text-white px-3 py-1 rounded-full text-xs font-medium`,

  // === CARDS ===
  cardBase: `bg-white rounded-xl shadow-lg border ${COLORS.neutral.border}`,
  cardHover: 'hover:shadow-xl transition-shadow duration-200',

  // === BUTTONS (via EnhancedButton) ===
  buttonPrimary: `bg-gradient-to-r ${COLORS.brand.gradient} text-white ${COLORS.brand.hover}`,
  buttonSuccess: `bg-gradient-to-r ${COLORS.success.gradient} text-white hover:bg-green-600`,
  buttonDanger: `bg-gradient-to-r ${COLORS.danger.gradient} text-white hover:bg-red-600`,
  buttonSecondary: `${COLORS.neutral.bg} ${COLORS.neutral.textDark} hover:${COLORS.neutral.bgDark}`,
} as const;

// === WIDGETS DASHBOARD (6 widgets) ===
export const WIDGETS = {
  revenue: {
    gradient: COLORS.success.gradientLight,  // Vert (argent/CA)
    icon: 'text-green-600',
    border: COLORS.success.border,
  },
  sales: {
    gradient: COLORS.brand.gradientLight,    // Orange (ventes)
    icon: COLORS.brand.text,
    border: COLORS.brand.border,
  },
  items: {
    gradient: COLORS.brand.gradientLight,    // Orange (articles)
    icon: COLORS.brand.text,
    border: COLORS.brand.border,
  },
  average: {
    gradient: COLORS.brand.gradientLight,    // Orange (moyenne)
    icon: COLORS.brand.text,
    border: COLORS.brand.border,
  },
  returns: {
    gradient: COLORS.danger.gradientLight,   // Rouge (retours)
    icon: COLORS.danger.text,
    border: COLORS.danger.border,
  },
  consignments: {
    gradient: COLORS.brand.gradientLight,    // Orange (consignations)
    icon: COLORS.brand.text,
    border: COLORS.brand.border,
  },
} as const;

// === RETURN REASONS (Motifs de retour) ===
export const RETURN_REASONS = {
  defective: {
    bg: COLORS.danger.solidLight,
    text: COLORS.danger.textDark,
    border: COLORS.danger.border,
    label: 'Défectueux',
  },
  wrong_item: {
    bg: COLORS.brand.solidLight,
    text: COLORS.brand.textDark,
    border: COLORS.brand.border,
    label: 'Mauvais article',
  },
  customer_change: {
    bg: COLORS.brand.solidLight,
    text: COLORS.brand.textDark,
    border: COLORS.brand.border,
    label: 'Changement d\'avis',
  },
  expired: {
    bg: COLORS.danger.solidLight,
    text: COLORS.danger.textDark,
    border: COLORS.danger.border,
    label: 'Expiré',
  },
  other: {
    bg: COLORS.neutral.bg,
    text: COLORS.neutral.textDark,
    border: COLORS.neutral.border,
    label: 'Autre raison',
  },
} as const;

// === STATUS BADGES (Statuts génériques) ===
export const STATUS = {
  pending: {
    className: COMPONENTS.badgePending,
    label: 'En attente',
  },
  approved: {
    className: `${COLORS.brand.solid} text-white px-3 py-1 rounded-full text-xs font-medium`,
    label: 'Approuvé',
  },
  restocked: {
    className: COMPONENTS.badgeSuccess,
    label: 'Remis en stock',
  },
  rejected: {
    className: COMPONENTS.badgeDanger,
    label: 'Rejeté',
  },
  active: {
    className: COMPONENTS.badgePending,
    label: 'Actif',
  },
  claimed: {
    className: COMPONENTS.badgeSuccess,
    label: 'Récupéré',
  },
  expired: {
    className: COMPONENTS.badgeNeutral,
    label: 'Expiré',
  },
  forfeited: {
    className: COMPONENTS.badgeDanger,
    label: 'Confisqué',
  },
} as const;

// === HELPER: Obtenir classe de gradient par contexte ===
export const getGradient = (context: 'brand' | 'success' | 'danger', level: 'solid' | 'light' | 'subtle' = 'solid') => {
  const levelMap = {
    solid: 'gradient',
    light: 'gradientLight',
    subtle: 'gradientSubtle',
  } as const;

  return COLORS[context][levelMap[level]];
};

// === HELPER: Obtenir classe de texte par contexte ===
export const getTextColor = (context: 'brand' | 'success' | 'danger', level: 'normal' | 'light' | 'dark' = 'normal') => {
  const levelMap = {
    normal: 'text',
    light: 'textLight',
    dark: 'textDark',
  } as const;

  return COLORS[context][levelMap[level]];
};

// === TYPE EXPORTS (pour TypeScript) ===
export type ColorContext = 'brand' | 'success' | 'danger' | 'neutral';
export type GradientLevel = 'solid' | 'light' | 'subtle';
export type TextLevel = 'normal' | 'light' | 'dark';

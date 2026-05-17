export type ThemePreset = 'amber' | 'blue' | 'emerald' | 'rose' | 'purple' | 'slate' | 'bordeaux' | 'sky' | 'mojito' | 'midnight' | 'custom';

export interface ThemeColors {
    primary: string;
    secondary: string;
    accent: string;
}

export interface ThemeConfig {
    preset: ThemePreset;
    customColors?: ThemeColors;
}

export const THEME_PRESETS: Record<Exclude<ThemePreset, 'custom'>, ThemeColors> = {
    amber: {
        primary: '#bc6d2a', // HSL(28, 65, 45) - Ambre Nocturne
        secondary: '#d98d4a', // HSL(28, 65, 55)
        accent: '#f1dec8' // HSL(28, 65, 85)
    },
    bordeaux: {
        primary: '#991b1b', // Bordeaux profond — robe d'un grand cru
        secondary: '#7f1d1d', // Rouge profond — décanteur
        accent: '#fbbf24' // Or chaud — étiquette luxe
    },
    sky: {
        primary: '#0ea5e9', // Sky-500 (Azur Vif)
        secondary: '#0284c7', // Sky-600 (Océan Clair)
        accent: '#7dd3fc' // Sky-300 (Nuage)
    },
    mojito: {
        primary: '#65a30d', // Lime-600 (Citron Vert)
        secondary: '#3f6212', // Lime-800 (Menthe Sombre)
        accent: '#bef264' // Lime-300 (Zest)
    },
    midnight: {
        primary: '#3730a3', // Indigo-800 — profondeur royale
        secondary: '#1e1b4b', // Indigo-950 — nuit absolue
        accent: '#a5b4fc' // Indigo-300 — éclat lunaire (conservé pour contraste)
    },
    blue: {
        primary: '#2563eb', // blue-600 — bleu profond
        secondary: '#1d4ed8', // blue-700 — océan
        accent: '#93c5fd' // blue-300 — ciel léger (conservé)
    },
    emerald: {
        primary: '#10b981', // emerald-500
        secondary: '#34d399', // emerald-400
        accent: '#6ee7b7' // emerald-300
    },
    rose: {
        primary: '#d6304c', // Rose mature — moins fluo que rose-500
        secondary: '#b91c3d', // Rose profond — bordure de pétale
        accent: '#fda4af' // rose-300 — touche douce (conservée)
    },
    purple: {
        primary: '#8b3fd6', // Violet profond — premium, moins éclatant
        secondary: '#7c2cd0', // Violet royal — solide
        accent: '#e9d5ff' // purple-300 — voile clair (conservé)
    },
    slate: {
        primary: '#475569', // slate-600
        secondary: '#64748b', // slate-500
        accent: '#94a3b8' // slate-400
    }
};

export const PRESET_LABELS: Record<ThemePreset, string> = {
    amber: 'Ambre Nocturne',
    bordeaux: 'Bordeaux Vin Rouge',
    sky: 'Ciel d\'Été',
    mojito: 'Mojito Frais',
    midnight: 'Minuit Élégant',
    blue: 'Bleu Prestige',
    emerald: 'Vert Émeraude',
    rose: 'Rose Passion',
    purple: 'Violet Royal',
    slate: 'Ardoise Premium',
    custom: 'Personnalisé'
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
    preset: 'amber'
};

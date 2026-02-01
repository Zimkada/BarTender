export type ThemePreset = 'amber' | 'blue' | 'emerald' | 'rose' | 'purple' | 'slate' | 'sunset' | 'sky' | 'mojito' | 'midnight' | 'custom';

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
    sunset: {
        primary: '#f97316', // Orange-500 (Vif et Solaire)
        secondary: '#ea580c', // Orange-600 (Profond mais pas rouge)
        accent: '#fbbf24' // Amber-400 (Or Doré)
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
        primary: '#4f46e5', // Indigo-600 (Électrique)
        secondary: '#312e81', // Indigo-900 (Nuit Profonde)
        accent: '#a5b4fc' // Indigo-300 (Lune)
    },
    blue: {
        primary: '#3b82f6', // blue-500
        secondary: '#60a5fa', // blue-400
        accent: '#93c5fd' // blue-300
    },
    emerald: {
        primary: '#10b981', // emerald-500
        secondary: '#34d399', // emerald-400
        accent: '#6ee7b7' // emerald-300
    },
    rose: {
        primary: '#f43f5e', // rose-500
        secondary: '#fb7185', // rose-400
        accent: '#fda4af' // rose-300
    },
    purple: {
        primary: '#a855f7', // purple-500
        secondary: '#c084fc', // purple-400
        accent: '#e9d5ff' // purple-300
    },
    slate: {
        primary: '#475569', // slate-600
        secondary: '#64748b', // slate-500
        accent: '#94a3b8' // slate-400
    }
};

export const PRESET_LABELS: Record<ThemePreset, string> = {
    amber: 'Ambre Nocturne',
    sunset: 'Coucher de Soleil',
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

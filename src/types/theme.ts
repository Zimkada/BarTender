export type ThemePreset = 'amber' | 'blue' | 'emerald' | 'rose' | 'purple' | 'custom';

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
        primary: '#f59e0b', // amber-500
        secondary: '#fb923c', // orange-400
        accent: '#fbbf24' // amber-400
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
    }
};

export const PRESET_LABELS: Record<ThemePreset, string> = {
    amber: 'Or & Ambre',
    blue: 'Bleu Océan',
    emerald: 'Vert Émeraude',
    rose: 'Rose Passion',
    purple: 'Violet Royal',
    custom: 'Personnalisé'
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
    preset: 'amber'
};

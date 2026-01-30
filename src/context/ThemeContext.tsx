import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useBarContext } from './BarContext';
import { useAuth } from './AuthContext';
import { ThemeConfig, DEFAULT_THEME_CONFIG, THEME_PRESETS } from '../types/theme';
import { ThemeService } from '../services/theme.service';

interface ThemeContextValue {
    themeConfig: ThemeConfig;
    updateTheme: (config: ThemeConfig) => Promise<void>;
    previewTheme: (config: ThemeConfig) => void;
    resetPreview: () => void;
    isPreviewMode: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { currentBar, updateBar } = useBarContext();
    const { currentSession } = useAuth(); // Pour vérifier le rôle SuperAdmin
    const [previewConfig, setPreviewConfig] = useState<ThemeConfig | null>(null);

    // 1. Calculer la configuration active
    // Priorité : Preview > SuperAdmin(Force Indigo) > DB > Default
    const activeThemeConfig = useMemo(() => {
        // A. Mode Preview actif (sauf si SuperAdmin, voir effet ci-dessous)
        if (previewConfig) return previewConfig;

        // B. Récupération depuis le Bar actuel
        if (currentBar?.theme_config) {
            try {
                return JSON.parse(currentBar.theme_config) as ThemeConfig;
            } catch (e) {
                console.error('Invalid theme_config JSON, falling back to default:', e);
                return DEFAULT_THEME_CONFIG;
            }
        }

        // C. Fallback par défaut
        return DEFAULT_THEME_CONFIG;
    }, [currentBar?.theme_config, previewConfig]);

    // 2. Injection CSS dans le DOM (Side Effect)
    useEffect(() => {
        // Exception SuperAdmin: Force Indigo TOUJOURS, peu importe le bar ou le preview
        const isSuperAdmin = currentSession?.role === 'super_admin';

        let colors;

        if (isSuperAdmin) {
            // Force Indigo
            colors = THEME_PRESETS.purple; // Using purple/indigo preset logic for admin
            // Overrides spécifiques pour Admin si nécessaire
            document.documentElement.style.setProperty('--brand-primary', '#6366f1'); // Indigo-500 specific
            document.documentElement.style.setProperty('--brand-secondary', '#818cf8');
            document.documentElement.style.setProperty('--brand-accent', '#c7d2fe');
        } else {
            // Logique normale
            colors = ThemeService.getColors(activeThemeConfig);
            document.documentElement.style.setProperty('--brand-primary', colors.primary);
            document.documentElement.style.setProperty('--brand-secondary', colors.secondary);
            document.documentElement.style.setProperty('--brand-accent', colors.accent);
        }

        // Variables dérivées (communes)
        // Shadow: Primary color with 25% opacity
        document.documentElement.style.setProperty('--brand-shadow', `${colors.primary}40`);

        // Gradient: Linear from Primary to Secondary
        document.documentElement.style.setProperty(
            '--brand-gradient',
            `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`
        );

    }, [activeThemeConfig, currentSession?.role]);

    const updateTheme = async (config: ThemeConfig) => {
        if (!currentBar) throw new Error('No bar selected');

        // Validation et Sauvegarde
        await ThemeService.updateBarTheme(currentBar.id, config);

        // Mise à jour optimiste du context Bar (pour éviter un reload)
        // Note: updateBar fait déjà un refresh normalement, mais ici on s'assure de l'UI instantanée
        setPreviewConfig(null);
    };

    const previewTheme = (config: ThemeConfig) => {
        setPreviewConfig(config);
    };

    const resetPreview = () => {
        setPreviewConfig(null);
    };

    const value = {
        themeConfig: activeThemeConfig,
        updateTheme,
        previewTheme,
        resetPreview,
        isPreviewMode: previewConfig !== null,
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

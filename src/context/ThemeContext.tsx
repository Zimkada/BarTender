import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useBarContext } from './BarContext';
import { useAuth } from './AuthContext';
import { ThemeConfig, DEFAULT_THEME_CONFIG, THEME_PRESETS } from '../types/theme';
import { ThemeService } from '../services/theme.service';
import { hexToHSL } from '../utils/colorUtils';

interface ThemeContextValue {
    themeConfig: ThemeConfig;
    updateTheme: (config: ThemeConfig) => Promise<void>;
    previewTheme: (config: ThemeConfig) => void;
    resetPreview: () => void;
    isPreviewMode: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// FIX: Import direct du Context pour éviter le throw automatique
import { BarContext } from './BarContext';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // 🛡️ SAFE CONTEXT ACCESS
    // On accède au contexte directement pour éviter l'erreur fatale "must be used within"
    // si le BarProvider a crashé (exemple: erreur IDB) ou n'est pas encore monté.
    const barContext = useContext(BarContext);

    // Si le contexte est absent, on continue en mode dégradé (Default Theme)
    // Cela permet d'afficher les erreurs (ErrorFallback) correctement stylisées au lieu de crasher blanc.
    const currentBar = barContext?.currentBar;
    const updateBar = barContext?.updateBar || (async () => { });

    const { currentSession } = useAuth(); // Pour vérifier le rôle SuperAdmin
    const [previewConfig, setPreviewConfig] = useState<ThemeConfig | null>(null);

    // 1. Calculer la configuration active
    // Priorité : Preview > SuperAdmin(Force Indigo) > DB > Default
    // 1. Calculer la configuration active
    // Priorité : Preview > SuperAdmin(Force Indigo) > DB (currentBar) > Cache Offline (Initial Load) > Default
    const activeThemeConfig = useMemo(() => {
        // A. Mode Preview actif (sauf si SuperAdmin, voir effet ci-dessous)
        if (previewConfig) return previewConfig;

        // B. Récupération depuis le Bar actuel (État React Live)
        if (currentBar?.theme_config) {
            try {
                const config = typeof currentBar.theme_config === 'string'
                    ? JSON.parse(currentBar.theme_config)
                    : currentBar.theme_config;
                return config as ThemeConfig;
            } catch (e) {
                console.error('Invalid theme_config JSON, falling back to default:', e);
                return DEFAULT_THEME_CONFIG;
            }
        }

        // C. Fallback Optimiste : Cache Offline (Pour éviter le FOUC au chargement)
        // Stratégie "Device-First" : On regarde le cache dédié V2 en premier car il survit au logout
        if (typeof window !== 'undefined') {
            try {
                // 1. Essayer le cache léger dédié (V2) - Le plus fiable pour login/logout
                const simpleCache = localStorage.getItem('bartender_theme_cache');
                if (simpleCache) {
                    const cacheData = JSON.parse(simpleCache);
                    // Si on a le nom du preset, on peut reconstruire une config valide
                    // Fix TS error: explicit cast or check key existence safely
                    const presetKey = cacheData.preset as string;
                    if (presetKey && Object.keys(THEME_PRESETS).includes(presetKey)) {
                        return { preset: presetKey as any } as ThemeConfig;
                    }
                }

                // 2. Fallback Legacy : Essayer de parser le gros cache (V1)
                // (Ce cache est souvent vidé au logout, donc moins fiable pour la page login)
                const rawBars = localStorage.getItem('bartender_bars');
                const rawCurrentBarId = localStorage.getItem('bartender_current_bar_id');

                if (rawBars && rawCurrentBarId) {
                    const bars = JSON.parse(rawBars);
                    const cachedBar = bars.find((b: any) => b.id === rawCurrentBarId);
                    if (cachedBar?.theme_config) {
                        return (typeof cachedBar.theme_config === 'string'
                            ? JSON.parse(cachedBar.theme_config)
                            : cachedBar.theme_config) as ThemeConfig;
                    }
                }
            } catch (e) {
                // Ignore silent parsing errors
            }
        }

        // D. Fallback Ultime
        return DEFAULT_THEME_CONFIG;
    }, [currentBar?.theme_config, previewConfig]);

    // 2. Injection CSS dans le DOM (Side Effect)
    useEffect(() => {
        // Exception SuperAdmin: Force Indigo TOUJOURS, peu importe le bar ou le preview
        const isSuperAdmin = currentSession?.role === 'super_admin';

        let colors;
        let primaryColor: string;

        if (isSuperAdmin) {
            // Force Indigo
            colors = THEME_PRESETS.purple; // Using purple/indigo preset logic for admin
            primaryColor = '#6366f1'; // Indigo-500 specific
            // Overrides spécifiques pour Admin
            document.documentElement.style.setProperty('--brand-primary', primaryColor);
            document.documentElement.style.setProperty('--brand-secondary', '#818cf8');
            document.documentElement.style.setProperty('--brand-accent', '#c7d2fe');
        } else {
            // Logique normale
            colors = ThemeService.getColors(activeThemeConfig);
            primaryColor = colors.primary;
            document.documentElement.style.setProperty('--brand-primary', colors.primary);
            document.documentElement.style.setProperty('--brand-secondary', colors.secondary);
            document.documentElement.style.setProperty('--brand-accent', colors.accent);
        }

        // 🎨 Injecter les variables HSL pour le design system CSS
        // Cela permet aux bordures, gradients, ombres de s'adapter dynamiquement
        const { hue, saturation, lightness } = hexToHSL(primaryColor);
        document.documentElement.style.setProperty('--brand-hue', hue.toString());
        document.documentElement.style.setProperty('--brand-saturation', `${saturation}%`);

        // 🧠 SAUVEGARDE CACHE SIMPLE POUR LE SCRIPT DE BLOCAGE (Index.html)
        // Permet au "Theme Loader" de connaître la couleur AVANT le chargement de React
        try {
            // FIX: Ne jamais écraser le cache si on est en train de se déconnecter (currentBar devient null)
            // On ne sauvegarde que si on a un bar actif ou une preview explicite.
            if (currentBar || previewConfig) {
                // On sauvegarde aussi le 'preset' pour permettre la reconstruction complète dans le Fallback C
                const simpleCache = {
                    hue: hue.toString(),
                    saturation: `${saturation}%`,
                    lightness: `${lightness}%`,
                    preset: activeThemeConfig.preset // Ajout crucial pour le contexte React
                };
                localStorage.setItem('bartender_theme_cache', JSON.stringify(simpleCache));
            }
        } catch (e) {
            console.error('Failed to save theme cache', e);
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

        // 1. Validation stricte avant sauvegarde
        const validatedConfig = ThemeService.validate(config);

        // 2. Utiliser updateBar() pour synchroniser automatiquement:
        //    - Base de données (via BarsService)
        //    - État local (currentBar dans BarContext)
        //    - Cache offline (OfflineStorage)
        // Cela évite la désynchronisation et le "flash" visuel à l'actualisation
        await updateBar(currentBar.id, {
            theme_config: validatedConfig
        });

        // 3. Désactiver le mode preview après un court délai pour laisser le temps à React de mettre à jour currentBar
        setTimeout(() => {
            setPreviewConfig(null);
        }, 100);
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

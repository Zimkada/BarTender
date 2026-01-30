import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { ThemeConfig, THEME_PRESETS, DEFAULT_THEME_CONFIG } from '../types/theme';

// Validation Schema
export const ThemeConfigSchema = z.object({
    preset: z.enum(['amber', 'blue', 'emerald', 'rose', 'purple', 'custom']),
    customColors: z.object({
        primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
        secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
        accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
    }).optional(),
}).refine(data => {
    if (data.preset === 'custom' && !data.customColors) {
        return false;
    }
    return true;
}, {
    message: "Custom colors are required when preset is 'custom'",
    path: ['customColors']
});

export const ThemeService = {
    /**
     * Valide une configuration de thème
     * @throws ZodError si invalide
     */
    validate(config: unknown): ThemeConfig {
        return ThemeConfigSchema.parse(config);
    },

    /**
     * Met à jour le thème d'un bar (Sécurisé)
     */
    async updateBarTheme(barId: string, config: ThemeConfig): Promise<void> {
        // 1. Validation stricte avant d'appeler Supabase
        const validatedConfig = this.validate(config);

        // 2. Update DB
        const { error } = await supabase
            .from('bars')
            .update({ theme_config: JSON.stringify(validatedConfig) })
            .eq('id', barId);

        if (error) throw error;
    },

    /**
     * Helper pour récupérer les couleurs actives
     */
    getColors(config: ThemeConfig) {
        if (config.preset === 'custom' && config.customColors) {
            return config.customColors;
        }
        // Fallback safe si preset inconnu (ne devrait pas arriver avec Zod)
        return THEME_PRESETS[config.preset as keyof typeof THEME_PRESETS] || THEME_PRESETS.amber;
    }
};

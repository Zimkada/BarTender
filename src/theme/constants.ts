/**
 * Constantes de Thème - Vision 2026
 * 
 * Ce fichier centralise les classes CSS utilitaires du Design System
 * pour garantir un usage type-safe et faciliter la maintenance.
 */

export const BRAND_CLASSES = {
    // Boutons
    button: {
        base: 'btn-brand',
        large: 'btn-brand-lg',
        glass: 'glass-button-2026',
        action: 'glass-action-button-2026',
        activeAction: 'glass-action-button-active-2026',
    },

    // Headers
    header: {
        main: 'liquid-gold-header',
        page: 'glass-page-header',
        icon: 'glass-page-icon',
    },

    // Textes
    text: {
        primary: 'text-brand-primary',
        dark: 'text-brand-dark',
    },

    // Backgrounds
    bg: {
        primary: 'bg-brand-primary',
        subtle: 'bg-brand-subtle',
        gradient: 'bg-brand-gradient',
    },

    // Borders
    border: {
        primary: 'border-brand-primary',
        subtle: 'border-brand-subtle',
    },

    // Ombres
    shadow: {
        subtle: 'shadow-brand-subtle',
        default: 'shadow-brand',
    },
} as const;

// Type dérivé pour autocomplétion
export type BrandClassCategory = keyof typeof BRAND_CLASSES;
export type BrandButtonClass = keyof typeof BRAND_CLASSES.button;

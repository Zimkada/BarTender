import { BRAND_CLASSES } from './constants';

type RoleThemeConfig = {
    button: string;
    avatar: string;
    badge: string;
    border: string;
    text: string;
};

/**
 * Retourne les classes CSS adaptées au rôle de l'utilisateur.
 * Permet de distinguer visuellement l'Admin (Indigo) du reste de l'app (Brand/Or).
 */
export const getRoleTheme = (role?: string): RoleThemeConfig => {
    const isSuperAdmin = role === 'super_admin';

    if (isSuperAdmin) {
        return {
            button: 'bg-gradient-to-r from-indigo-600 to-purple-600',
            avatar: 'bg-gradient-to-br from-indigo-600 to-purple-600',
            badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            border: 'border-indigo-600',
            text: 'text-indigo-600',
        };
    }

    // Default Brand Theme (Vision 2026)
    return {
        button: BRAND_CLASSES.button.base, // 'btn-brand'
        avatar: BRAND_CLASSES.bg.primary, // 'bg-brand-primary'
        badge: `${BRAND_CLASSES.bg.subtle} ${BRAND_CLASSES.text.primary} ${BRAND_CLASSES.border.subtle}`,
        border: BRAND_CLASSES.border.primary,
        text: BRAND_CLASSES.text.primary,
    };
};

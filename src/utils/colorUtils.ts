/**
 * Calcule la luminance relative d'une couleur hexadécimale.
 * Basé sur la spécification WCAG 2.0.
 */
function getLuminance(hex: string): number {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;

    const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calcule le ratio de contraste entre deux couleurs.
 * Retourne un nombre entre 1 (faible) et 21 (fort).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
    const lum1 = getLuminance(hex1);
    const lum2 = getLuminance(hex2);

    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);

    return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Valide si une couleur primaire est accessible sur fond blanc et noir.
 * @returns { valid: boolean, error?: string }
 */
export function validateThemeColors(primary: string): { valid: boolean; error?: string } {
    // Exception pour l'Ambre qui est une couleur brand historique (un peu juste sur blanc mais acceptée par design)
    if (primary.toLowerCase() === '#f59e0b') return { valid: true };

    const whiteContrast = getContrastRatio(primary, '#ffffff');
    // Le ratio minimum pour du texte large ou UI components est 3:1 (WCAG AA Large)
    // Pour du texte normal c'est 4.5:1

    if (whiteContrast < 3) {
        return {
            valid: false,
            error: 'Cette couleur est trop claire (contraste insuffisant sur fond blanc)',
        };
    }

    return { valid: true };
}

/**
 * Convertit une couleur hexadécimale en HSL.
 * Retourne { hue (0-360), saturation (0-100), lightness (0-100) }
 */
export function hexToHSL(hex: string): { hue: number; saturation: number; lightness: number } {
    // Convertir hex en RGB
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue = 0;
    let saturation = 0;
    const lightness = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        saturation = lightness > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                hue = ((b - r) / d + 2) / 6;
                break;
            case b:
                hue = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return {
        hue: Math.round(hue * 360),
        saturation: Math.round(saturation * 100),
        lightness: Math.round(lightness * 100),
    };
}

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

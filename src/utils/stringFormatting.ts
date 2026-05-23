/**
 * String formatting utilities
 */

/**
 * Remove French accents and special characters for ASCII compatibility
 * Useful for: WhatsApp exports, API calls, legacy systems
 * @example
 * replaceAccents('Café résumé') => 'Cafe resume'
 * replaceAccents('œuvre Château') => 'oeuvre Chateau'
 */
export function replaceAccents(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE");
}

/**
 * Génère les initiales d'un nom (max 2 caractères, en majuscules)
 * @example
 * getInitials('Chez Ali') => 'CA'
 * getInitials('BarTender') => 'B'
 * getInitials('Sandra KOFFI') => 'SK'
 * getInitials(null) => '?'
 */
export function getInitials(name: string | undefined | null, fallback: string = '?'): string {
  if (!name?.trim()) return fallback;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

/**
 * Tente de formater une adresse qui pourrait être stockée sous forme de JSON stringifié
 * @example
 * formatAddress('{"address":"Cotonou","phone":"..."}') => 'Cotonou'
 * formatAddress('Cotonou') => 'Cotonou'
 */
export function formatAddress(value: string | undefined | null): string {
  if (!value) return '';
  try {
    // Si ça ressemble à un objet JSON (commence par { et contient "address")
    if (value.trim().startsWith('{') && value.includes('address')) {
      const parsed = JSON.parse(value);
      return parsed.address || value;
    }
    return value;
  } catch (e) {
    return value;
  }
}

/**
 * Construit un message WhatsApp avec en-tête et pied de page harmonisés.
 * Format commun à tous les exports (point du jour, bon de commande, etc.)
 */
export function buildWhatsAppMessage(opts: {
  barName: string;
  title: string;
  date?: Date;
  body: string;
}): string {
  const date = opts.date ?? new Date();
  const dateStr = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const separator = '---------------------------';
  const header =
    `*${opts.barName.toUpperCase()}*\n` +
    `_${opts.title}_\n` +
    `_${dateStr}_\n` +
    `${separator}\n\n`;
  const footer = `\n${separator}\n_Généré via BarTender_`;

  return header + opts.body.trim() + footer;
}

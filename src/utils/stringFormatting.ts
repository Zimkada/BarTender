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

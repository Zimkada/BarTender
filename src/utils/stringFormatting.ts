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

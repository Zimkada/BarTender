import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

/**
 * ⚠️ LOGIQUE CRITIQUE : Doit être IDENTIQUE au trigger SQL
 * 
 * Référence SQL (migration 067_add_business_date.sql) :
 * NEW.business_date := DATE(v_source_date - (v_closing_hour || ' hours')::INTERVAL);
 * 
 * Équivalent JavaScript :
 * if (hour < closeHour) { date.setDate(date.getDate() - 1); }
 * 
 * @param date - Date source (created_at, returned_at, etc.)
 * @param closeHour - Heure de clôture du bar (0-23)
 * @returns Date commerciale (normalisée à minuit)
 */
export function calculateBusinessDate(
    date: Date,
    closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): Date {
    // ⚠️ LOGIQUE CRITIQUE: Doit être IDENTIQUE au trigger SQL
    // SQL: DATE(source_date - (closeHour || ' hours')::INTERVAL)
    //
    // Exemple avec closeHour = 6:
    // - 10h du jour N: (N 10h - 6h) = N 04h → jour N ✓
    // - 5h du jour N:  (N 05h - 6h) = N-1 23h → jour N-1 ✓
    // - 6h du jour N:  (N 06h - 6h) = N 00h → jour N ✓
    // - 1h du jour N:  (N 01h - 6h) = N-1 19h → jour N-1 ✓

    const businessDate = new Date(date);

    // Soustraire closeHour heures de la date
    businessDate.setHours(businessDate.getHours() - closeHour);

    // Normaliser à minuit (00:00:00.000)
    businessDate.setHours(0, 0, 0, 0);

    return businessDate;
}

/**
 * Convertit une Date en string YYYY-MM-DD
 */
export function dateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Obtient la business_date d'un item (Sale, Return, Consignment)
 * 
 * Priorité :
 * 1. businessDate (si déjà calculée)
 * 2. Calcul manuel depuis createdAt/validatedAt (fallback legacy)
 * 
 * @param item - Objet avec businessDate et/ou createdAt
 * @param closeHour - Heure de clôture du bar
 * @returns String YYYY-MM-DD
 */
export function getBusinessDate(
    item: {
        businessDate?: Date | string;
        createdAt?: Date | string;
        validatedAt?: Date | string;
        returnedAt?: Date | string;
    },
    closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): string {
    // Priorité 1 : businessDate (calculée par backend OU frontend)
    if (item.businessDate) {
        const date = typeof item.businessDate === 'string'
            ? new Date(item.businessDate)
            : item.businessDate;
        return dateToYYYYMMDD(date);
    }

    // Fallback : Calculer manuellement (données legacy sans businessDate)
    // console.warn('businessDate manquante, calcul manuel (legacy data)', item);

    const sourceDate = item.validatedAt || item.createdAt || item.returnedAt;
    if (!sourceDate) {
        throw new Error('Item must have businessDate, validatedAt, createdAt, or returnedAt');
    }

    const date = typeof sourceDate === 'string' ? new Date(sourceDate) : sourceDate;
    const businessDate = calculateBusinessDate(date, closeHour);
    return dateToYYYYMMDD(businessDate);
}

/**
 * Filtre un tableau d'items par plage de dates commerciales
 * 
 * @param items - Tableau d'objets avec businessDate
 * @param startDate - Date de début (YYYY-MM-DD)
 * @param endDate - Date de fin (YYYY-MM-DD)
 * @param closeHour - Heure de clôture du bar
 * @returns Tableau filtré
 */
export function filterByBusinessDateRange<T extends {
    businessDate?: Date | string;
    createdAt?: Date | string;
    validatedAt?: Date | string;
    returnedAt?: Date | string;
}>(
    items: T[],
    startDate: string, // YYYY-MM-DD
    endDate: string,   // YYYY-MM-DD
    closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): T[] {
    return items.filter(item => {
        const itemDate = getBusinessDate(item, closeHour);
        return itemDate >= startDate && itemDate <= endDate;
    });
}

/**
 * Retourne la date commerciale actuelle (YYYY-MM-DD)
 * 
 * @param closeHour - Heure de clôture du bar
 * @returns String YYYY-MM-DD
 */
export function getCurrentBusinessDateString(closeHour: number = BUSINESS_DAY_CLOSE_HOUR): string {
    const now = new Date();
    const businessDate = calculateBusinessDate(now, closeHour);
    return dateToYYYYMMDD(businessDate);
}

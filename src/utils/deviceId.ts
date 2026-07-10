import { generateUUID } from './crypto';

/**
 * Identifiant stable de l'appareil (tablette/navigateur), persisté en localStorage.
 *
 * Utilisé par le système Heartbeat (log_heartbeat) pour distinguer les appareils
 * d'un même bar. Généré une fois puis réutilisé — survit aux rechargements, pas à
 * un vidage du localStorage ni à un autre navigateur (comportement voulu : un
 * nouveau contexte = un nouvel appareil).
 */
const DEVICE_ID_KEY = 'bartender_device_id';

export function getDeviceId(): string {
    try {
        const existing = localStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;

        const deviceId = generateUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
        return deviceId;
    } catch {
        // localStorage indisponible (mode privé strict, quota) → ID éphémère de session.
        // Le heartbeat reste fonctionnel ; l'appareil apparaîtra juste comme "nouveau"
        // à chaque rechargement dans ce cas dégradé rare.
        return generateUUID();
    }
}

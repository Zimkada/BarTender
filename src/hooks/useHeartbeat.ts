import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { offlineQueue } from '../services/offlineQueue';
import { getDeviceId } from '../utils/deviceId';
import { networkManager } from '../services/NetworkManager';
import { getAppVersion } from '../utils/appVersion';

/** Intervalle d'émission du heartbeat (5 min — le RPC classe online < 15 min, warning < 60 min). */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Émet un heartbeat périodique (RPC log_heartbeat) pour alimenter le dashboard
 * "Santé des Bars" du SuperAdmin.
 *
 * Monté dans RootLayout (pas dans App.tsx) car RLS exige un utilisateur
 * authentifié membre du bar : le RPC est un upsert (une ligne par bar_id +
 * device_id), donc coût egress négligeable et pas d'accumulation en base.
 *
 * Garde-fous :
 * - N'émet que si un bar est actif ET que le réseau n'est pas bloqué (offline
 *   confirmé) — inutile de tenter un appel voué à échouer hors-ligne.
 * - Guard anti-concurrence : jamais deux envois simultanés.
 * - Émet au montage, à chaque tick, et au retour de visibilité de l'onglet
 *   (une tablette réveillée doit repasser "online" sans attendre le prochain tick).
 * - Interval et listeners nettoyés au démontage (déconnexion, changement de bar).
 */
export function useHeartbeat(barId: string | undefined) {
    // Ref pour éviter que le changement de barId ne recrée la fonction d'envoi
    // dans les deps de l'effet — l'effet ne dépend que de barId (primitive stable).
    const isSendingRef = useRef(false);

    useEffect(() => {
        if (!barId) return;

        let intervalId: number | null = null;
        let cancelled = false;

        const sendHeartbeat = async () => {
            // Guard anti-concurrence
            if (isSendingRef.current || cancelled) return;

            // Garde offline (offline confirmé, pas 'unstable'/'checking') — skip
            // silencieux voulu : le prochain tick (5 min) ou le listener online
            // du NetworkManager déclenchera un nouvel essai, pas besoin de log
            // à chaque tick pendant une coupure réseau prolongée.
            if (networkManager.getDecision().shouldBlock) {
                console.log('[useHeartbeat] Skipped (network offline)');
                return;
            }

            // Onglet caché → pas d'émission (budget requêtes ; cohérent avec
            // NetworkManager qui coupe aussi ses checks en arrière-plan). Le
            // listener visibilitychange ré-émet dès le retour au premier plan.
            if (document.visibilityState === 'hidden') return;

            isSendingRef.current = true;
            try {
                const stats = await offlineQueue.getStats(barId);
                const appVersion = await getAppVersion();

                if (cancelled) return;

                const { error } = await supabase.rpc('log_heartbeat', {
                    p_bar_id: barId,
                    p_device_id: getDeviceId(),
                    p_app_version: appVersion,
                    p_unsynced_count: stats.pendingCount,
                    // battery_level : optionnel côté RPC. La Battery Status API est
                    // dépréciée/absente sur la plupart des navigateurs mobiles → omis.
                });

                if (error) {
                    // Non bloquant : le heartbeat est de l'observabilité, jamais du chemin critique.
                    console.warn('[useHeartbeat] log_heartbeat failed (non-blocking):', error.message);
                }
            } catch (err) {
                console.warn('[useHeartbeat] heartbeat error (non-blocking):', err);
            } finally {
                isSendingRef.current = false;
            }
        };

        // Émission immédiate au montage (peut no-op si le réseau est encore en
        // 'checking'/'unstable' à ce stade précoce — rattrapé par le subscribe ci-dessous)
        sendHeartbeat();

        // Émission périodique
        intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

        // Réveil au retour de visibilité (tablette rallumée / onglet refocus)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') sendHeartbeat();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Réveil au retour réseau — couvre le cas où l'émission au montage a été
        // skippée (NetworkManager encore en 'checking' à ce moment précoce) et
        // le cas d'une vraie coupure réseau prolongée qui se termine.
        const unsubscribeNetwork = networkManager.subscribe((status) => {
            if (status === 'online') sendHeartbeat();
        });

        return () => {
            cancelled = true;
            if (intervalId !== null) clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibility);
            unsubscribeNetwork();
        };
    }, [barId]);
}

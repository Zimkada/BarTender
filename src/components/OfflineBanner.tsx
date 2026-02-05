import React, { useEffect, useState } from 'react';
import { WifiOff, X, Clock } from 'lucide-react';
import { networkManager } from '../services/NetworkManager';
import { offlineQueue } from '../services/offlineQueue';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';

export const OfflineBanner: React.FC = () => {
    const [isOffline, setIsOffline] = useState(networkManager.isOffline());
    const [isVisible, setIsVisible] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const { isSimplifiedMode, currentBar } = useBarContext();
    const { currentSession } = useAuth();

    useEffect(() => {
        // Subscribe to network updates
        const unsubscribe = networkManager.subscribe((status) => {
            const offline = status === 'offline';
            setIsOffline(offline);
            if (offline) setIsVisible(true); // Re-show if we go offline again
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        let isMounted = true;

        // Load queue stats initially
        const loadQueueStats = async () => {
            if (currentBar?.id) {
                try {
                    const stats = await offlineQueue.getStats(currentBar.id);
                    // ⭐ FIX: Only update state if component still mounted
                    if (isMounted) {
                        setPendingCount(stats.pendingCount);
                    }
                } catch (error) {
                    console.error('[OfflineBanner] Failed to load queue stats:', error);
                }
            }
        };

        loadQueueStats();

        // Subscribe to queue updates
        const handleQueueUpdate = () => {
            loadQueueStats();
        };

        window.addEventListener('queue-updated', handleQueueUpdate);

        return () => {
            isMounted = false;
            window.removeEventListener('queue-updated', handleQueueUpdate);
        };
    }, [currentBar?.id]);

    if (!isOffline || !isVisible) return null;

    const role = currentSession?.role;
    const canWorkOffline = isSimplifiedMode && ['gerant', 'promoteur'].includes(role || '');

    return (
        <div className={`text-white px-4 py-3 shadow-lg relative z-[9999] transition-colors duration-300 ${
            canWorkOffline ? 'bg-blue-600' : 'bg-red-600'
        }`}>
            <div className="container mx-auto flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="text-sm font-medium">
                        <p className="font-bold mb-1">
                            {canWorkOffline ? 'ℹ️ Mode Hors Ligne' : '⚠️ Connexion Perdue'}
                        </p>

                        {canWorkOffline ? (
                            <>
                                <p>
                                    Vous pouvez continuer à encaisser en mode hors ligne.
                                    Les ventes seront synchronisées automatiquement au retour de la connexion.
                                </p>
                                {pendingCount > 0 && (
                                    <div className="mt-2 flex items-center gap-2 text-white/90">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-xs font-semibold">
                                            {pendingCount} vente{pendingCount > 1 ? 's' : ''} en attente de synchronisation
                                        </span>
                                    </div>
                                )}
                            </>
                        ) : isSimplifiedMode ? (
                            <p>
                                Rétablissez votre connexion Internet pour continuer à encaisser.
                            </p>
                        ) : (
                            <p>
                                L'application nécessite Internet en mode complet.
                                Rétablissez votre connexion ou demandez au Gérant de passer en{' '}
                                <span className="font-bold underline">Mode Simplifié</span> (Paramètres &gt; Opérationnel).
                            </p>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setIsVisible(false)}
                    className="text-white/80 hover:text-white transition-colors p-1"
                    aria-label="Fermer"
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};

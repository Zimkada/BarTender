import React, { useEffect, useState } from 'react';
import { Clock, ChevronDown, ChevronUp, Zap, RotateCw } from 'lucide-react';
import { networkManager } from '../services/NetworkManager';
import { offlineQueue } from '../services/offlineQueue';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useCanWorkOffline } from '../hooks/useCanWorkOffline';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import type { NetworkStatus } from '../types/sync';

export const OfflineBanner: React.FC = () => {
    const [isOffline, setIsOffline] = useState(networkManager.shouldShowOfflineBanner());
    const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(networkManager.getStatus());
    const [pendingCount, setPendingCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isRetryingErrors, setIsRetryingErrors] = useState(false);
    const { isSimplifiedMode, currentBar } = useBarContext();
    const { currentSession } = useAuth();
    const { hasPending, isSyncing, forceNetworkCheck, retryAll, syncProgress } = useSyncStatus();

    // Track if we've just reconnected to show a success toast
    const [wasOffline, setWasOffline] = useState(false);

    // Track pending items for sync notification
    const maxPendingCountRef = React.useRef(0);

    useEffect(() => {
        if (isOffline) {
            // Keep track of the peak pending count while offline
            maxPendingCountRef.current = Math.max(maxPendingCountRef.current, pendingCount);
        } else {
            // Reset when online
            maxPendingCountRef.current = 0;
        }
    }, [isOffline, pendingCount]);

    useEffect(() => {
        const unsubscribe = networkManager.subscribe(() => {
            const offline = networkManager.shouldShowOfflineBanner();
            const status = networkManager.getStatus();
            setIsOffline(offline);
            setNetworkStatus(status);

            if (!offline && wasOffline) {
                const count = maxPendingCountRef.current;
                const message = count > 0
                    ? `Connexion rétablie • ${count} ${count > 1 ? 'éléments synchronisés' : 'élément synchronisé'}`
                    : "Connexion rétablie • Synchronisé";

                toast.success(
                    message,
                    { icon: '🟢', style: { background: '#1a1a1a', color: '#fff' }, duration: 4000 }
                );
            }
            setWasOffline(offline);
        });
        return unsubscribe;
    }, [wasOffline]);

    useEffect(() => {
        let isMounted = true;
        const loadQueueStats = async () => {
            if (currentBar?.id) {
                try {
                    const stats = await offlineQueue.getStats(currentBar.id);
                    if (isMounted) {
                        setPendingCount(stats.pendingCount);
                        setErrorCount(stats.errorCount);
                    }
                } catch (error) {
                    console.error('[OfflineBanner] Stats error:', error);
                }
            }
        };

        loadQueueStats();
        window.addEventListener('queue-updated', loadQueueStats);
        return () => {
            isMounted = false;
            window.removeEventListener('queue-updated', loadQueueStats);
        };
    }, [currentBar?.id]);

    const canWorkOffline = useCanWorkOffline();
    const isManagerRole = ['gerant', 'promoteur', 'super_admin'].includes(currentSession?.role || '');

    /**
     * Réessayer les opérations en erreur
     * Reset leur status à 'pending' pour une nouvelle tentative
     */
    const retryErrorOperations = async () => {
        if (!currentBar?.id || errorCount === 0) return;

        setIsRetryingErrors(true);
        try {
            const errorOps = await offlineQueue.getErrorOperations(currentBar.id);
            for (const op of errorOps) {
                await offlineQueue.resetRetries(op.id);
            }
            // Déclencher une synchro immédiate
            forceNetworkCheck();
            retryAll();
            // Wording selon état réseau : online = retry immédiat, offline = mis en file
            const isNetworkAvailable = !networkManager.shouldBlockNetworkOps();
            const n = errorOps.length;
            const message = isNetworkAvailable
                ? `${n} ${n > 1 ? 'opérations réessayées' : 'opération réessayée'}`
                : `${n} ${n > 1 ? 'opérations mises en file d\'attente' : 'opération mise en file d\'attente'}`;
            toast.success(
                message,
                { icon: isNetworkAvailable ? '🔄' : '⏳', style: { background: '#1a1a1a', color: '#fff' } }
            );
        } catch (error) {
            console.error('[OfflineBanner] Error retrying operations:', error);
            toast.error('Impossible de réessayer les opérations', { style: { background: '#1a1a1a', color: '#fff' } });
        } finally {
            setIsRetryingErrors(false);
        }
    };

    // Show unstable connection indicator (amber pill) when connection is unstable but not fully offline
    if (networkStatus === 'unstable' && !isOffline) {
        return (
            <div className="fixed top-4 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="pointer-events-auto flex items-center gap-2 px-4 h-10 rounded-full bg-amber-500/90 backdrop-blur-xl border border-amber-400/30 shadow-lg"
                >
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    >
                        <Zap size={14} className="text-white" />
                    </motion.div>
                    <span className="text-xs font-medium text-white tracking-wide">
                        Connexion instable — Les ventes sont sauvegardées
                    </span>
                </motion.div>
            </div>
        );
    }

    if (!isOffline) return null;

    // DYNAMIC ISLAND VARIANTS
    const islandVariants = {
        collapsed: { width: 'auto', borderRadius: 30, height: 48 },
        expanded: { width: 'min(90vw, 400px)', borderRadius: 24, height: 'auto' }
    };

    return (
        <div className="fixed top-4 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
            <motion.div
                initial="collapsed"
                animate={isExpanded ? "expanded" : "collapsed"}
                variants={islandVariants}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className={`pointer-events-auto shadow-2xl backdrop-blur-xl border border-white/10 overflow-hidden
                    ${canWorkOffline
                        ? 'bg-slate-900/90 shadow-blue-900/20'
                        : 'bg-red-950/90 shadow-red-900/20'
                    }`}
            >
                {/* COMPACT STATE (Always Visible) */}
                <div
                    className="flex items-center justify-between px-4 h-12 cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className={`w-2 h-2 rounded-full ${canWorkOffline ? 'bg-amber-500' : 'bg-red-500'}`}
                        />
                        <span className="text-white font-bold text-sm tracking-wide">
                            {canWorkOffline ? 'Mode Hors Ligne' : 'Connexion Perdue'}
                        </span>
                        {(pendingCount + errorCount > 0) && !isExpanded && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono
                                ${errorCount > 0
                                    ? 'bg-red-500/25 text-red-300'
                                    : 'bg-white/10 text-white/80'
                                }`}>
                                {pendingCount + errorCount}
                            </span>
                        )}
                    </div>
                    <div className="text-white/50 ml-4">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>

                {/* EXPANDED CONTENT */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="px-5 pb-5 pt-1"
                        >
                            {/* STATUS DETAILS */}
                            <div className="mb-4 text-sm text-gray-300 border-t border-white/10 pt-3 mt-1">
                                {isManagerRole ? (
                                    <div className="space-y-3">
                                        <p className="font-bold text-amber-400">Action Requise pour le Gérant :</p>
                                        <ol className="space-y-2 text-xs text-gray-400 list-decimal pl-4">
                                            <li>
                                                <span className="text-gray-200">Vérifiez votre connexion</span> (Wi-Fi/4G).
                                            </li>
                                            {!isSimplifiedMode && (
                                                <li>
                                                    Si le problème persiste, <span className="text-amber-400 font-semibold underline">passez immédiatement en Mode Simplifié</span> (Paramètres {'>'} Opérationnel).
                                                </li>
                                            )}
                                            <li>
                                                <span className="text-red-400 font-bold">Centralisez toutes les opérations sur UN SEUL appareil gérant unique</span> pour éviter les conflits de synchronisation.
                                            </li>
                                        </ol>
                                        {canWorkOffline && (
                                            <div className="bg-amber-500/10 p-2 rounded border border-amber-500/20 text-[10px] text-amber-200/80 italic">
                                                Les ventes locales sur cet appareil seront synchronisées au retour du réseau.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <p className="mb-2 text-red-300">Connexion Internet requise.</p>
                                        <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20 mb-2">
                                            <p className="text-xs text-red-200 font-medium">
                                                🚨 Votre rôle de Serveur nécessite une connexion active pour garantir l'intégrité des opérations.
                                            </p>
                                        </div>
                                        <p className="text-[10px] text-gray-400 italic text-center">
                                            Vérifiez votre Wi-Fi/4G ou contactez un gérant.
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* FORCE SYNC BUTTON */}
                            {hasPending && (
                                <div className="mb-4">
                                    <button
                                        onClick={() => {
                                            forceNetworkCheck();
                                            retryAll();
                                        }}
                                        disabled={isSyncing}
                                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all
                                            ${isSyncing
                                                ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 active:scale-95'
                                            }`}
                                    >
                                        <motion.div
                                            animate={isSyncing ? { rotate: 360 } : {}}
                                            transition={isSyncing ? { repeat: Infinity, duration: 1.5, ease: 'linear' } : {}}
                                        >
                                            <RotateCw size={14} />
                                        </motion.div>
                                        {isSyncing
                                            ? (syncProgress
                                                ? `Synchronisation ${syncProgress.current}/${syncProgress.total}...`
                                                : 'Synchronisation...')
                                            : `Forcer synchro (${pendingCount})`}
                                    </button>
                                </div>
                            )}

                            {/* QUEUE STATUS */}
                            {pendingCount > 0 && (
                                <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 mb-3">
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-amber-400" />
                                        <span className="text-xs font-medium text-gray-300">
                                            En attente de synchro
                                        </span>
                                    </div>
                                    <span className="text-sm font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">
                                        {pendingCount}
                                    </span>
                                </div>
                            )}

                            {/* ERROR OPERATIONS STATUS (P1a) */}
                            {errorCount > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between bg-red-500/10 p-3 rounded-xl border border-red-500/30">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-red-400">⚠️</span>
                                            <span className="text-xs font-medium text-red-300">
                                                Opération(s) échouée(s)
                                            </span>
                                        </div>
                                        <span className="text-sm font-bold text-white bg-red-500/20 px-2 py-0.5 rounded-md">
                                            {errorCount}
                                        </span>
                                    </div>
                                    <button
                                        onClick={retryErrorOperations}
                                        disabled={isRetryingErrors || isSyncing}
                                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all
                                            ${isRetryingErrors || isSyncing
                                                ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                                                : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 active:scale-95'
                                            }`}
                                    >
                                        <motion.div
                                            animate={isRetryingErrors ? { rotate: 360 } : {}}
                                            transition={isRetryingErrors ? { repeat: Infinity, duration: 1.5, ease: 'linear' } : {}}
                                        >
                                            <RotateCw size={14} />
                                        </motion.div>
                                        {isRetryingErrors ? 'Réessai en cours...' : `Réessayer (${errorCount})`}
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

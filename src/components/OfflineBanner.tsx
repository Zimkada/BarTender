import React, { useEffect, useState } from 'react';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { networkManager } from '../services/NetworkManager';
import { offlineQueue } from '../services/offlineQueue';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

export const OfflineBanner: React.FC = () => {
    const [isOffline, setIsOffline] = useState(networkManager.shouldShowOfflineBanner());
    const [pendingCount, setPendingCount] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const { isSimplifiedMode, currentBar } = useBarContext();
    const { currentSession } = useAuth();

    // Track if we've just reconnected to show a success toast
    const [wasOffline, setWasOffline] = useState(false);

    useEffect(() => {
        const unsubscribe = networkManager.subscribe(() => {
            const offline = networkManager.shouldShowOfflineBanner();
            setIsOffline(offline);

            if (!offline && wasOffline) {
                toast.success(
                    "Connexion rétablie • Synchronisé",
                    { icon: '🟢', style: { background: '#1a1a1a', color: '#fff' } }
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
                    if (isMounted) setPendingCount(stats.pendingCount);
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

    const role = currentSession?.role;
    // Managers/Promoters can work in simplified mode offline
    const isManagerRole = ['gerant', 'promoteur'].includes(role || '');
    const canWorkOffline = isSimplifiedMode && isManagerRole;

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
                        {pendingCount > 0 && !isExpanded && (
                            <span className="bg-white/10 px-2 py-0.5 rounded-full text-[10px] text-white/80 font-mono">
                                {pendingCount}
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

                            {/* QUEUE STATUS */}
                            {pendingCount > 0 && (
                                <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
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
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

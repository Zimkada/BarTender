import { useState } from 'react';
import { AlertOctagon, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useStalePendingSales } from '../../hooks/queries/useStalePendingSales';
import { useSalesMutations } from '../../hooks/mutations/useSalesMutations';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

import toast from 'react-hot-toast';
import { getErrorMessage } from '../../utils/errorHandler';

interface Props {
    barId: string;
}

export function StaleSalesCleanupBanner({ barId }: Props) {
    const { data: staleSales = [] } = useStalePendingSales(barId);
    const { rejectMultipleSales } = useSalesMutations(barId);
    const { currentSession } = useAuth();
    const [isConfirming, setIsConfirming] = useState(false);

    if (staleSales.length === 0) return null;

    const handleCleanup = async () => {
        if (!currentSession?.userId) return;

        try {
            await rejectMultipleSales.mutateAsync({
                saleIds: staleSales.map(s => s.id),
                rejectorId: currentSession.userId,
                reason: '[SYSTÈME] Rejet automatique (Vente hors délai)'
            });
            setIsConfirming(false);
        } catch (error) {
            console.error('Erreur lors du nettoyage:', error);
            const errorMsg = getErrorMessage(error);
            toast.error(`Nettoyage échoué: ${errorMsg}`);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                className="mb-6"
            >
                <div className="bg-orange-50 rounded-2xl p-4 border-2 border-orange-200/60 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg text-orange-600 shrink-0 mt-0.5">
                            <AlertOctagon size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="font-bold text-orange-900 leading-tight">
                                Stock bloqué par des ventes orphelines
                            </h3>
                            <p className="text-sm text-orange-800/80 mt-1 max-w-xl">
                                {staleSales.length} ventes en attente datant des jours précédents bloquent indûment votre stock.
                                Un nettoyage automatique est recommandé pour corriger vos inventaires.
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                        {!isConfirming ? (
                            <button
                                onClick={() => setIsConfirming(true)}
                                className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-orange-600/20 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} />
                                Nettoyer le stock
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => setIsConfirming(false)}
                                    className="px-4 py-2.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-bold rounded-xl transition-colors"
                                    disabled={rejectMultipleSales.isPending}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleCleanup}
                                    disabled={rejectMultipleSales.isPending}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {rejectMultipleSales.isPending ? (
                                        <RefreshCw size={16} className="animate-spin" />
                                    ) : (
                                        <CheckCircle2 size={16} />
                                    )}
                                    Confirmer la libération
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

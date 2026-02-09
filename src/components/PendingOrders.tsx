import { Clock, Check, X, User, ShoppingBag, AlertCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { Sale, SaleItem } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { EnhancedButton } from './EnhancedButton';
import { getCurrentBusinessDateString, getBusinessDate } from '../utils/businessDateHelpers';
import { useBarContext } from '../context/BarContext';

interface PendingOrdersProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper pour mapper l'ID de l'utilisateur à son nom
const getUserName = (userId: string, users: any[]): string => {
  const user = users.find(u => u.id === userId);
  return user ? user.name : 'Inconnu';
};

// Helper pour vérifier si une vente est récente (< 10 minutes)
const isSaleRecent = (createdAt: Date): boolean => {
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const now = new Date().getTime();
  const saleTime = new Date(createdAt).getTime();
  return (now - saleTime) < TEN_MINUTES_MS;
};

// Helper pour calculer le temps restant pour annulation
const getTimeRemaining = (createdAt: Date): string => {
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const now = new Date().getTime();
  const saleTime = new Date(createdAt).getTime();
  const remaining = TEN_MINUTES_MS - (now - saleTime);

  if (remaining <= 0) return '';

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function PendingOrders({ isOpen, onClose }: PendingOrdersProps) {
  const {
    sales,
    users,
    validateSale,
    rejectSale,
  } = useAppContext();

  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();

  if (!currentSession) return null;

  const { currentBar } = useBarContext();
  const closeHour = currentBar?.closingHour ?? 6;
  const currentBusinessDate = getCurrentBusinessDateString(closeHour);

  // Déterminer si l'utilisateur est gérant/promoteur
  const isManager = currentSession.role === 'gerant' || currentSession.role === 'promoteur' || currentSession.role === 'super_admin';
  const isServer = currentSession.role === 'serveur';

  // Filtrer les ventes en attente selon le rôle
  const pendingSales = sales.filter((sale: Sale) => {
    if (sale.status !== 'pending') return false;

    // ✅ Règle de la journée commerciale : on ne montre que les ventes du jour actuel
    // Cela masque automatiquement les reliquats oubliés des jours précédents (pollution)
    const saleBusinessDate = getBusinessDate(sale, closeHour);
    const isCurrentDay = saleBusinessDate === currentBusinessDate;

    if (!isCurrentDay) return false;

    // Gérant/Admin voit toutes les ventes de la journée
    if (isManager) return true;

    // Serveur voit uniquement ses propres ventes de la journée
    if (isServer) {
      return sale.soldBy === currentSession.userId;
    }

    return false;
  });

  const handleValidate = async (saleId: string) => {
    if (!currentSession) return;
    await validateSale(saleId, currentSession.userId);
  };

  const handleReject = async (saleId: string) => {
    if (!currentSession) return;
    await rejectSale(saleId, currentSession.userId);
  };

  // Déterminer si un serveur peut annuler une vente spécifique
  const canServerCancel = (sale: Sale): boolean => {
    if (!isServer) return false;
    return sale.soldBy === currentSession.userId && isSaleRecent(sale.createdAt);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-gray-50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-white">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                <Clock size={24} className="text-amber-500" />
                {isManager ? 'Ventes en attente de validation' : 'Mes ventes en attente'}
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-600 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {pendingSales.length === 0 ? (
                <div className="text-center py-20">
                  <Check size={48} className="text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">Aucune vente en attente</h3>
                  <p className="text-gray-500">Tout est à jour. Excellent travail !</p>
                </div>
              ) : (
                pendingSales.map((sale: Sale) => (
                  <motion.div
                    key={sale.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-white rounded-xl p-4 shadow-md border border-gray-100 hover:border-amber-300 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                          <User className="text-amber-500" size={24} />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-800">
                            {getUserName(sale.createdBy, users)}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {new Date(sale.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {` • ${sale.items.length} type(s) d'article`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {/* Timer pour serveurs */}
                        {isServer && canServerCancel(sale) && (
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle size={12} />
                            <span>Annulation possible: {getTimeRemaining(sale.createdAt)}</span>
                          </div>
                        )}

                        {/* Boutons d'action */}
                        <div className="flex items-center gap-2">
                          {/* Bouton Annuler - Visible pour: manager OU serveur (si c'est sa vente < 10min) */}
                          {(isManager || canServerCancel(sale)) && (
                            <EnhancedButton
                              onClick={() => handleReject(sale.id)}
                              className="bg-red-100 text-red-700 hover:bg-red-200"
                              size="sm"
                              icon={<X size={16} />}
                            >
                              Annuler
                            </EnhancedButton>
                          )}

                          {/* Bouton Valider - Uniquement pour managers */}
                          {isManager && (
                            <EnhancedButton
                              onClick={() => handleValidate(sale.id)}
                              className="bg-green-100 text-green-700 hover:bg-green-200"
                              size="sm"
                              icon={<Check size={16} />}
                            >
                              Valider
                            </EnhancedButton>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4 pl-4 border-l-2 border-amber-200">
                      {sale.items.map((item: SaleItem, index: number) => (
                        <div key={index} className="flex items-center justify-between text-sm ml-4">
                          <div className="flex items-center gap-2">
                            <ShoppingBag size={14} className="text-gray-600" />
                            <span className="font-medium text-gray-700">{item.quantity}x</span>
                            <span>{item.product_name} ({item.product_volume})</span>
                          </div>
                          <span className="font-semibold text-gray-800">
                            {formatPrice(item.total_price)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-3">
                      <span className="text-gray-800 font-bold text-lg">Total à encaisser:</span>
                      <span className="text-amber-600 font-bold text-xl">
                        {formatPrice(sale.total)}
                      </span>
                    </div>
                  </motion.div>
                )))
              }
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
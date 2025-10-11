import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  Share,
  Lock,
  //Calendar,
  //Clock,
  //ArrowUp,
  //ArrowDown,
  Eye,
  EyeOff,
  RotateCcw,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConsignments } from '../hooks/useConsignments';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { AnimatedCounter } from './AnimatedCounter';

interface DailyDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DailyDashboard({ isOpen, onClose }: DailyDashboardProps) {
  const {
    getTodaySales,
    getTodayTotal,
    getTodayOrders,
    //products,
    getLowStockProducts,
    returns
  } = useAppContext();
  const { getActiveConsignments } = useConsignments();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError, setLoading, isLoading } = useFeedback();
  
  const [showDetails, setShowDetails] = useState(false);
  const [cashClosed, setCashClosed] = useState(false);

  const todaySales = getTodaySales();
  const todayTotal = getTodayTotal();
  const todayOrders = getTodayOrders();
  const lowStockProducts = getLowStockProducts();
  
  // Calculs des statistiques
  const totalItems = todaySales.reduce((sum, sale) => 
    sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
  );
  
  const avgSaleValue = todaySales.length > 0 ? todayTotal / todaySales.length : 0;
  
  const topProducts = todaySales
    .flatMap(sale => sale.items)
    .reduce((acc, item) => {
      const key = `${item.product.name}-${item.product.volume}`;
      acc[key] = (acc[key] || 0) + item.quantity;
      return acc;
    }, {} as Record<string, number>);
    
  const topProductsList = Object.entries(topProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Statistiques des retours du jour
  const todayReturns = returns.filter(r => {
    const returnDate = new Date(r.returnedAt);
    const today = new Date();
    return returnDate.toDateString() === today.toDateString();
  });

  const todayReturnsCount = todayReturns.length;
  const todayReturnsRefunded = todayReturns
    .filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
    .reduce((sum, r) => sum + r.refundAmount, 0);

  // Statistiques des consignations actives
  const activeConsignments = getActiveConsignments();
  const activeConsignmentsCount = activeConsignments.length;
  const activeConsignmentsValue = activeConsignments.reduce((sum, c) => sum + c.totalAmount, 0);
  const todayReturnsPending = todayReturns.filter(r => r.status === 'pending').length;

  // Export WhatsApp
  const exportToWhatsApp = () => {
    const date = new Date().toLocaleDateString('fr-FR');
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    let message = `🏪 *Rapport de caisse - ${date}*\n`;
    message += `⏰ Heure: ${time}\n`;
    message += `👤 ${currentSession?.role}: ${currentSession?.userName}\n\n`;
    
    message += `💰 *RÉSUMÉ FINANCIER*\n`;
    message += `• Total des ventes: *${formatPrice(todayTotal)}*\n`;
    message += `• Nombre de ventes: ${todaySales.length}\n`;
    message += `• Articles vendus: ${totalItems}\n`;
    message += `• Panier moyen: ${formatPrice(avgSaleValue)}\n\n`;
    
    if (topProductsList.length > 0) {
      message += `🏆 *TOP PRODUITS*\n`;
      topProductsList.forEach(([product, qty], index) => {
        message += `${index + 1}. ${product}: ${qty} vendus\n`;
      });
      message += `\n`;
    }
    
    if (lowStockProducts.length > 0) {
      message += `⚠️ *ALERTES STOCK*\n`;
      lowStockProducts.slice(0, 5).forEach(product => {
        message += `• ${product.name} (${product.volume}): ${product.stock} restants\n`;
      });
      message += `\n`;
    }
    
    message += `📱 Envoyé depuis BarTender Pro`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    showSuccess('📱 Rapport exporté vers WhatsApp');
  };

  // Fermeture de caisse
  const closeCash = async () => {
    if (!confirm('Confirmer la fermeture de caisse ? Cette action est définitive.')) {
      return;
    }

    setLoading('closeCash', true);
    
    try {
      // Simuler l'enregistrement
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setCashClosed(true);
      showSuccess('✅ Caisse fermée avec succès');
      
      // Export automatique après fermeture
      setTimeout(() => {
        exportToWhatsApp();
      }, 1000);
      
    } catch {
      showError('❌ Erreur lors de la fermeture');
    } finally {
      setLoading('closeCash', false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-2xl w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-orange-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center">
                  <TrendingUp size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Argent du jour</h2>
                  <p className="text-sm text-gray-600">
                    {new Date().toLocaleDateString('fr-FR', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long' 
                    })}
                  </p>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Main Stats Grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
              {/* Total des ventes */}
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-4 border border-green-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="w-8 h-8 text-green-600" />
                  <span className="text-green-600 text-sm font-medium">Total</span>
                </div>
                <AnimatedCounter
                  value={todayTotal}
                  prefix=""
                  suffix=""
                  className="text-2xl font-bold text-gray-800"
                />
                <p className="text-xs text-gray-600 mt-1">{formatPrice(todayTotal)}</p>
              </motion.div>

              {/* Nombre de ventes */}
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl p-4 border border-blue-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <ShoppingCart className="w-8 h-8 text-blue-600" />
                  <span className="text-blue-600 text-sm font-medium">Ventes</span>
                </div>
                <AnimatedCounter
                  value={todaySales.length}
                  className="text-2xl font-bold text-gray-800"
                />
                <p className="text-xs text-gray-600 mt-1">
                  {todayOrders.length} commandes
                </p>
              </motion.div>

              {/* Articles vendus */}
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-purple-100 to-violet-100 rounded-xl p-4 border border-purple-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <Package className="w-8 h-8 text-purple-600" />
                  <span className="text-purple-600 text-sm font-medium">Articles</span>
                </div>
                <AnimatedCounter
                  value={totalItems}
                  className="text-2xl font-bold text-gray-800"
                />
                <p className="text-xs text-gray-600 mt-1">vendus aujourd'hui</p>
              </motion.div>

              {/* Panier moyen */}
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-orange-100 to-amber-100 rounded-xl p-4 border border-orange-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-8 h-8 text-orange-600" />
                  <span className="text-orange-600 text-sm font-medium">Moyenne</span>
                </div>
                <AnimatedCounter
                  value={Math.round(avgSaleValue)}
                  className="text-2xl font-bold text-gray-800"
                />
                <p className="text-xs text-gray-600 mt-1">{formatPrice(avgSaleValue)}</p>
              </motion.div>

              {/* Retours */}
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-red-100 to-pink-100 rounded-xl p-4 border border-red-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <RotateCcw className="w-8 h-8 text-red-600" />
                  <span className="text-red-600 text-sm font-medium">Retours</span>
                </div>
                <AnimatedCounter
                  value={todayReturnsCount}
                  className="text-2xl font-bold text-gray-800"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-600">
                    {todayReturnsPending > 0 && `${todayReturnsPending} en attente`}
                  </p>
                  {todayReturnsRefunded > 0 && (
                    <p className="text-xs text-red-600 font-medium">
                      -{formatPrice(todayReturnsRefunded).replace(/\s/g, '')}
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Consignations */}
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl p-4 border border-indigo-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <Archive className="w-8 h-8 text-indigo-600" />
                  <span className="text-indigo-600 text-sm font-medium">Consignations</span>
                </div>
                <AnimatedCounter
                  value={activeConsignmentsCount}
                  className="text-2xl font-bold text-gray-800"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-600">
                    {activeConsignmentsCount > 0 ? `actives` : `aucune`}
                  </p>
                  {activeConsignmentsValue > 0 && (
                    <p className="text-xs text-indigo-600 font-medium">
                      {formatPrice(activeConsignmentsValue).replace(/\s/g, '')}
                    </p>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Détails expandables */}
            <div className="px-6 mb-6">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                {showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
                <span className="font-medium">
                  {showDetails ? 'Masquer' : 'Voir'} les détails
                </span>
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6"
                  >
                    {/* Top produits */}
                    <div className="bg-white rounded-xl p-4 border border-orange-100">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        🏆 Top produits
                      </h3>
                      <div className="space-y-2">
                        {topProductsList.map(([product, qty], index) => (
                          <div key={product} className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">
                              {index + 1}. {product}
                            </span>
                            <span className="text-sm font-medium text-orange-600">
                              {qty} vendus
                            </span>
                          </div>
                        ))}
                        {topProductsList.length === 0 && (
                          <p className="text-sm text-gray-500">Aucune vente aujourd'hui</p>
                        )}
                      </div>
                    </div>

                    {/* Alertes stock */}
                    <div className="bg-white rounded-xl p-4 border border-red-100">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        ⚠️ Alertes stock
                      </h3>
                      <div className="space-y-2">
                        {lowStockProducts.slice(0, 5).map(product => (
                          <div key={product.id} className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">
                              {product.name} ({product.volume})
                            </span>
                            <span className="text-sm font-medium text-red-600">
                              {product.stock} restants
                            </span>
                          </div>
                        ))}
                        {lowStockProducts.length === 0 && (
                          <p className="text-sm text-green-600">✅ Tous les stocks sont OK</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions Footer */}
            <div className="p-6 border-t border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex flex-wrap gap-3 justify-center">
                {/* Export WhatsApp */}
                <EnhancedButton
                  onClick={exportToWhatsApp}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 shadow-lg"
                >
                  <Share size={18} />
                  Exporter WhatsApp
                </EnhancedButton>

                {/* Fermeture de caisse */}
                {!cashClosed ? (
                  <EnhancedButton
                    onClick={closeCash}
                    loading={isLoading('closeCash')}
                    className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 shadow-lg"
                  >
                    <Lock size={18} />
                    Fermer la caisse
                  </EnhancedButton>
                ) : (
                  <div className="flex items-center gap-2 px-6 py-3 bg-gray-500 text-white rounded-xl font-medium opacity-75">
                    <Lock size={18} />
                    Caisse fermée
                  </div>
                )}

                {/* Fermer le dashboard */}
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300"
                >
                  Fermer
                </button>
              </div>

              {cashClosed && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-green-100 border border-green-200 rounded-lg p-3 text-center"
                >
                  <p className="text-green-700 font-medium">
                    ✅ Caisse fermée - Rapport automatiquement exporté
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
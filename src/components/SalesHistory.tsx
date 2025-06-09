import React from 'react';
import { X, Calendar, TrendingUp } from 'lucide-react';
import { useSales } from '../hooks/useSales';
import { useSettings } from '../hooks/useSettings';
import { motion, AnimatePresence } from 'framer-motion';

interface SalesHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SalesHistory({ isOpen, onClose }: SalesHistoryProps) {
  const { getTodaySales, getTodayTotal } = useSales();
  const { formatPrice } = useSettings();
  
  const todaySales = getTodaySales();
  const todayTotal = getTodayTotal();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-orange-100">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <TrendingUp size={20} className="text-orange-500" />
                Historique des ventes
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </motion.button>
            </div>

            <div className="p-6">
              <div className="bg-gradient-to-r from-orange-100 to-amber-100 border border-orange-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={20} className="text-orange-500" />
                    <span className="text-gray-800 font-medium">Ventes du jour</span>
                  </div>
                  <span className="text-orange-600 font-bold text-xl">{formatPrice(todayTotal)}</span>
                </div>
                <p className="text-gray-600 text-sm mt-1">
                  {todaySales.length} vente(s) aujourd'hui
                </p>
              </div>

              {todaySales.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp size={48} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune vente aujourd'hui</h3>
                  <p className="text-gray-500">Les ventes apparaîtront ici une fois effectuées</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {todaySales.map((sale) => (
                    <motion.div 
                      key={sale.id} 
                      whileHover={{ y: -2 }}
                      className="bg-white rounded-xl p-4 shadow-sm border border-orange-100"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-gray-500">
                          {new Date(sale.date).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-orange-600 font-semibold">
                          {formatPrice(sale.total)}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {sale.items.map((item, index) => (
                          <div key={index} className="flex items-center justify-between text-sm bg-orange-50 rounded-lg p-2">
                            <span className="text-gray-700">
                              {item.quantity}x {item.product.name} ({item.product.volume})
                            </span>
                            <span className="text-gray-600">
                              {formatPrice(item.product.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
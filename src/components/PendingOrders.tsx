//import React from 'react';
import { X, Clock, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { CartItem, Order} from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface PendingOrdersProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PendingOrders({ isOpen, onClose }: PendingOrdersProps) {
  const {
    getPendingOrders,
    updateOrderStatus,
    returnOrderItem,
    addSale,
    increaseStock,
    decreaseStock
  } = useAppContext();
  const formatPrice = useCurrencyFormatter();

  const pendingOrders = getPendingOrders();

  const completeOrder = (order: Order) => {
    order.items.forEach((item: CartItem) => {
      const effectiveQuantity = item.quantity - (item.returned || 0);
      if (effectiveQuantity > 0) {
        decreaseStock(item.product.id, effectiveQuantity);
      }
    });

    const saleItems = order.items
      .filter((item: CartItem) => (item.quantity - (item.returned || 0)) > 0)
      .map((item: CartItem) => ({
        product: item.product,
        quantity: item.quantity - (item.returned || 0),
      }));

    if (saleItems.length > 0) {
      addSale({
        items: saleItems,
        total: order.total,
        currency: order.currency,
        orderId: order.id,
      });
    }

    updateOrderStatus(order.id, 'servi');
  };

  const cancelOrder = (order: Order) => {
    updateOrderStatus(order.id, 'annulé');
  };

  const handleReturn = (orderId: string, productId: string) => {
    const quantity = prompt('Quantité à retourner:');
    if (quantity && parseInt(quantity) > 0) {
      returnOrderItem(orderId, productId, parseInt(quantity));
      increaseStock(productId, parseInt(quantity));
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
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-lg w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-orange-100">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <Clock size={20} className="text-orange-500" />
                Commandes en attente ({pendingOrders.length})
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
              {pendingOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Clock size={48} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune commande en attente</h3>
                  <p className="text-gray-500">Les nouvelles commandes apparaîtront ici</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingOrders.map((order) => (
                    <motion.div 
                      key={order.id} 
                      whileHover={{ y: -2 }}
                      className="bg-white rounded-xl p-4 shadow-sm border border-orange-100"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <h3 className="text-gray-800 font-medium">
                              Commande #{order.id.slice(-6)}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {new Date(order.date).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {order.tableNumber && ` • ${order.tableNumber}`}
                              {order.createdBy && ` • ${order.createdBy}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.button
                            onClick={() => cancelOrder(order)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="p-2 text-red-500 hover:text-red-600 transition-colors"
                            title="Annuler la commande"
                          >
                            <XCircle size={20} />
                          </motion.button>
                          <motion.button
                            onClick={() => completeOrder(order)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="p-2 text-green-500 hover:text-green-600 transition-colors"
                            title="Terminer la commande"
                          >
                            <CheckCircle size={20} />
                          </motion.button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        {order.items.map((item: CartItem, index: number) => {
                          const effectiveQuantity = item.quantity - (item.returned || 0);
                          return (
                            <div key={index} className="flex items-center justify-between text-sm bg-orange-50 rounded-lg p-2">
                              <div className="flex-1">
                                <span className="text-gray-700">
                                  {effectiveQuantity}x {item.product.name} ({item.product.volume})
                                </span>
                                {(item.returned ?? 0) > 0 && (
                                  <span className="text-red-500 ml-2">
                                    ({item.returned} retourné{(item.returned ?? 0) > 1 ? 's' : ''})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">
                                  {formatPrice(item.product.price * effectiveQuantity)}
                                </span>
                                {effectiveQuantity > 0 && (
                                  <motion.button
                                    onClick={() => handleReturn(order.id, item.product.id)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-1 text-orange-500 hover:text-orange-600 transition-colors"
                                    title="Retourner des articles"
                                  >
                                    <RotateCcw size={16} />
                                  </motion.button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-orange-100">
                        <span className="text-gray-800 font-medium">Total:</span>
                        <span className="text-orange-600 font-semibold text-lg">
                          {formatPrice(order.total)}
                        </span>
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
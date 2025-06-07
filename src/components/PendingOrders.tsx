import React from 'react';
import { X, Clock, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { useProducts } from '../hooks/useProducts';
import { useSales } from '../hooks/useSales';
import { useSettings } from '../hooks/useSettings';

interface PendingOrdersProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PendingOrders({ isOpen, onClose }: PendingOrdersProps) {
  const { getPendingOrders, updateOrderStatus, returnOrderItem } = useOrders();
  const { decreaseStock, increaseStock } = useProducts();
  const { addSale } = useSales();
  const { formatPrice } = useSettings();
  
  const pendingOrders = getPendingOrders();

  const completeOrder = (order: any) => {
    // Décompter le stock pour chaque item (en tenant compte des retours)
    order.items.forEach((item: any) => {
      const effectiveQuantity = item.quantity - (item.returned || 0);
      if (effectiveQuantity > 0) {
        decreaseStock(item.product.id, effectiveQuantity);
      }
    });

    // Ajouter la vente
    const saleItems = order.items
      .filter((item: any) => (item.quantity - (item.returned || 0)) > 0)
      .map((item: any) => ({
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

    // Marquer la commande comme terminée
    updateOrderStatus(order.id, 'completed');
  };

  const cancelOrder = (order: any) => {
    updateOrderStatus(order.id, 'cancelled');
  };

  const handleReturn = (orderId: string, productId: string) => {
    const quantity = prompt('Quantité à retourner:');
    if (quantity && parseInt(quantity) > 0) {
      returnOrderItem(orderId, productId, parseInt(quantity));
      // Remettre en stock
      increaseStock(productId, parseInt(quantity));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Clock size={20} />
            Commandes en attente ({pendingOrders.length})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-12">
              <Clock size={48} className="text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">Aucune commande en attente</h3>
              <p className="text-gray-500">Les nouvelles commandes apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingOrders.map((order) => (
                <div key={order.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="text-white font-medium">
                          Commande #{order.id.slice(-6)}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {new Date(order.date).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {order.tableNumber && ` • ${order.tableNumber}`}
                          {order.serverName && ` • ${order.serverName}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => cancelOrder(order)}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                        title="Annuler la commande"
                      >
                        <XCircle size={20} />
                      </button>
                      <button
                        onClick={() => completeOrder(order)}
                        className="p-2 text-green-400 hover:text-green-300 transition-colors"
                        title="Terminer la commande"
                      >
                        <CheckCircle size={20} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    {order.items.map((item: any, index: number) => {
                      const effectiveQuantity = item.quantity - (item.returned || 0);
                      return (
                        <div key={index} className="flex items-center justify-between text-sm bg-gray-700 rounded p-2">
                          <div className="flex-1">
                            <span className="text-gray-300">
                              {effectiveQuantity}x {item.product.name} ({item.product.volume})
                            </span>
                            {item.returned > 0 && (
                              <span className="text-red-400 ml-2">
                                ({item.returned} retourné{item.returned > 1 ? 's' : ''})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">
                              {formatPrice(item.product.price * effectiveQuantity)}
                            </span>
                            {effectiveQuantity > 0 && (
                              <button
                                onClick={() => handleReturn(order.id, item.product.id)}
                                className="p-1 text-orange-400 hover:text-orange-300 transition-colors"
                                title="Retourner des articles"
                              >
                                <RotateCcw size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                    <span className="text-white font-medium">Total:</span>
                    <span className="text-teal-400 font-semibold text-lg">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
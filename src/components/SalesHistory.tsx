import React from 'react';
import { X, Calendar, TrendingUp } from 'lucide-react';
import { useSales } from '../hooks/useSales';
import { useSettings } from '../hooks/useSettings';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TrendingUp size={20} />
            Historique des ventes
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-teal-600/20 border border-teal-600/30 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-teal-400" />
                <span className="text-white font-medium">Ventes du jour</span>
              </div>
              <span className="text-teal-400 font-bold text-xl">{formatPrice(todayTotal)}</span>
            </div>
            <p className="text-gray-300 text-sm mt-1">
              {todaySales.length} vente(s) aujourd'hui
            </p>
          </div>

          {todaySales.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp size={48} className="text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">Aucune vente aujourd'hui</h3>
              <p className="text-gray-500">Les ventes apparaîtront ici une fois effectuées</p>
            </div>
          ) : (
            <div className="space-y-4">
              {todaySales.map((sale) => (
                <div key={sale.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-400">
                      {new Date(sale.date).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-teal-400 font-semibold">
                      {formatPrice(sale.total)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {sale.items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">
                          {item.quantity}x {item.product.name} ({item.product.volume})
                        </span>
                        <span className="text-gray-400">
                          {formatPrice(item.product.price * item.quantity)}
                        </span>
                      </div>
                    ))}
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
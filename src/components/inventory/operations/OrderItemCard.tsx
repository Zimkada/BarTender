import { Trash2, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { OrderItem } from '../../../hooks/useOrderCart';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';

interface OrderItemCardProps {
    item: OrderItem;
    onUpdate: (updates: Partial<OrderItem>) => void;
    onRemove: () => void;
}

export function OrderItemCard({ item, onUpdate, onRemove }: OrderItemCardProps) {
    const { formatPrice } = useCurrencyFormatter();

    // Calculs en temps réel
    const totalLots = Math.floor(item.quantity / item.lotSize);
    const totalCost = totalLots * item.lotPrice;
    const costPerUnit = item.quantity > 0 ? totalCost / item.quantity : 0;
    const remainderUnits = item.quantity % item.lotSize;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white rounded-2xl p-4 border-2 border-gray-100 hover:border-brand-primary/30 transition-all"
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900 truncate">{item.productName}</h4>
                        {item.isAiSuggestion && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[9px] font-black uppercase">
                                ✨ IA
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">{item.productVolume}</p>
                </div>
                <button
                    onClick={onRemove}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="Retirer du panier"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Formulaire éditable */}
            <div className="space-y-3">
                {/* Ligne 1: Quantité et Lot */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Quantité totale
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => onUpdate({ quantity: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:border-brand-primary focus:ring-2 focus:ring-brand-subtle outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Unités/lot
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={item.lotSize}
                            onChange={(e) => onUpdate({ lotSize: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:border-brand-primary focus:ring-2 focus:ring-brand-subtle outline-none"
                        />
                    </div>
                </div>

                {/* Ligne 2: Prix et Fournisseur */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Prix/lot (FCFA)
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={item.lotPrice}
                            onChange={(e) => onUpdate({ lotPrice: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:border-brand-primary focus:ring-2 focus:ring-brand-subtle outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Fournisseur
                        </label>
                        <input
                            type="text"
                            value={item.supplier}
                            onChange={(e) => onUpdate({ supplier: e.target.value })}
                            placeholder="SOBEBRA..."
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:border-brand-primary focus:ring-2 focus:ring-brand-subtle outline-none"
                        />
                    </div>
                </div>

                {/* Résumé des calculs */}
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-gradient-to-br from-brand-bg-subtle to-white rounded-xl p-3 border border-brand-border"
                >
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <p className="text-[9px] font-black uppercase text-gray-400">Lots</p>
                            <p className="text-lg font-black text-brand-primary">{totalLots}</p>
                            {remainderUnits > 0 && (
                                <p className="text-[8px] text-orange-500">+{remainderUnits} unités</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase text-gray-400">Coût total</p>
                            <p className="text-sm font-black text-gray-900">{formatPrice(totalCost)}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase text-gray-400">Coût/unité</p>
                            <p className="text-sm font-medium text-gray-700">{formatPrice(costPerUnit)}</p>
                        </div>
                    </div>
                </motion.div>

                {/* Badge suggestion IA */}
                {item.isAiSuggestion && item.suggestedQuantity && (
                    <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 p-2 rounded-lg">
                        <TrendingUp size={14} />
                        <span>Suggestion IA : {item.suggestedQuantity} unités</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

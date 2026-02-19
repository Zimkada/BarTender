import React from 'react';
import { Edit, BarChart3, Trash2, History, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { Product, ProductStockInfo } from '../../types';
import { Button } from '../ui/Button';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { ProductWithAnomaly } from '../../hooks/useInventoryFilter';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface InventoryCardProps {
    product: ProductWithAnomaly; // ✨ Use enriched type
    stockInfo: ProductStockInfo | null;
    avgCost: number;
    margin: number;
    categoryName: string;
    onEdit: (product: Product) => void;
    onAdjust: (product: Product) => void;
    onDelete: (product: Product) => void;
    onHistory: (product: Product) => void;
}

export function InventoryCard({
    product,
    stockInfo,
    avgCost,
    margin,
    categoryName,
    onEdit,
    onAdjust,
    onDelete,
    onHistory
}: InventoryCardProps) {
    const [showAnomalyDetail, setShowAnomalyDetail] = React.useState(false);
    const { formatPrice } = useCurrencyFormatter();
    const currentStock = stockInfo?.physicalStock ?? 0;
    const availableStock = stockInfo?.availableStock ?? product.stock;
    const isLowStock = availableStock <= product.alertThreshold;

    const anomaly = product.anomaly; // ✨ Anomaly info

    return (
        <div className={cn(
            "bg-white rounded-xl border shadow-sm transition-all duration-200 relative",
            anomaly ? (
                anomaly.severity === 'red' ? "border-red-300 bg-red-50/10 shadow-red-50" :
                    anomaly.severity === 'orange' ? "border-orange-300 bg-orange-50/10" :
                        "border-yellow-300 bg-yellow-50/10"
            ) : "border-gray-200 hover:border-amber-200"
        )}>
            <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-gray-900 truncate">{product.name}</h2>
                            {/* ✨ Diagnostic d'Anomalie Compact Réactif au Clic */}
                            {anomaly && (
                                <div className="relative flex-shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAnomalyDetail(!showAnomalyDetail);
                                        }}
                                        className={cn(
                                            "transition-transform active:scale-90 p-1 -m-1 rounded-full hover:bg-black/5",
                                            anomaly.severity === 'red' ? "text-red-600" :
                                                anomaly.severity === 'orange' ? "text-orange-600" :
                                                    "text-amber-600"
                                        )}
                                    >
                                        {anomaly.severity === 'red' ? <ShieldAlert className="w-4 h-4" /> :
                                            anomaly.severity === 'orange' ? <AlertTriangle className="w-4 h-4" /> :
                                                <Info className="w-4 h-4" />}
                                    </button>

                                    {/* Tooltip flottant (Affiché au clic) */}
                                    <AnimatePresence>
                                        {showAnomalyDetail && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                                className="absolute right-0 bottom-full mb-2 z-[60] origin-bottom-right"
                                            >
                                                <div className="bg-gray-900/95 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-2 rounded-xl shadow-2xl whitespace-nowrap flex items-center gap-2 border border-white/10">
                                                    {anomaly.severity === 'red' ? <ShieldAlert className="w-3 h-3 text-red-400" /> :
                                                        anomaly.severity === 'orange' ? <AlertTriangle className="w-3 h-3 text-orange-400" /> :
                                                            <Info className="w-3 h-3 text-amber-400" />}
                                                    {anomaly.label}
                                                </div>
                                                {/* Flèche */}
                                                <div className="w-2 h-2 bg-gray-900 rotate-45 absolute -bottom-1 right-3 border-r border-b border-white/10" />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{product.volume || 'Format non spécifié'}</p>
                        <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded uppercase tracking-wider">
                            {categoryName}
                        </span>
                    </div>

                    <div className="text-right">
                        <div className={`text-lg font-black ${isLowStock ? 'text-red-500' : 'text-gray-900'}`}>
                            {availableStock}
                        </div>
                        <div className="text-[10px] text-accessible-gray font-bold uppercase leading-tight">
                            Disponible
                        </div>
                        {currentStock !== availableStock && (
                            <div className="text-[10px] text-blue-500 font-medium mt-0.5">
                                Physique: {currentStock}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50">
                    <div className="text-center">
                        <div className="text-xs text-accessible-gray font-bold uppercase mb-1">Prix</div>
                        <div className="text-xs font-bold text-amber-600">{formatPrice(product.price)}</div>
                    </div>
                    <div className="text-center border-x border-gray-50">
                        <div className="text-xs text-accessible-gray font-bold uppercase mb-1">Coût</div>
                        <div className="text-xs font-bold text-gray-700">{avgCost > 0 ? formatPrice(avgCost) : '-'}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-accessible-gray font-bold uppercase mb-1">Marge</div>
                        <div className={`text-xs font-bold ${margin > 40 ? 'text-green-600' : margin > 20 ? 'text-amber-600' : 'text-red-500'}`}>
                            {margin > 0 ? `${margin.toFixed(0)}%` : '-'}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={() => onEdit(product)}
                        variant="secondary"
                        size="sm"
                        className="flex-1 bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                    >
                        <Edit size={14} className="mr-1.5" />
                        Modifier
                    </Button>
                    <Button
                        onClick={() => onAdjust(product)}
                        variant="secondary"
                        size="sm"
                        className="flex-1 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
                    >
                        <BarChart3 size={14} className="mr-1.5" />
                        Ajuster
                    </Button>
                    <Button
                        onClick={() => onHistory(product)}
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title="Voir historique"
                        data-guide="inventory-history-btn"
                    >
                        <History size={16} />
                    </Button>
                    <Button
                        onClick={() => onDelete(product)}
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                    >
                        <Trash2 size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

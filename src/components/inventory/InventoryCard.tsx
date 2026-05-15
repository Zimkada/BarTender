import React from 'react';
import { Edit, BarChart3, Trash2, History, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { Product, ProductStockInfo } from '../../types';
import { Button } from '../ui/Button';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { ProductWithAnomaly } from '../../hooks/useInventoryFilter';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getCostSourceLabel, type DisplayCost } from '../../utils/costResolution';

interface InventoryCardProps {
    product: ProductWithAnomaly;
    stockInfo: ProductStockInfo | null;
    displayCost: DisplayCost;
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
    displayCost,
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
            "bg-card rounded-xl border shadow-sm transition-all duration-200 relative",
            anomaly ? (
                anomaly.severity === 'red' ? "border-red-300 dark:border-red-900/40 bg-red-50/10 dark:bg-red-950/10 shadow-red-50 dark:shadow-none" :
                    anomaly.severity === 'orange' ? "border-orange-300 dark:border-orange-900/40 bg-orange-50/10 dark:bg-orange-950/10" :
                        "border-yellow-300 dark:border-yellow-900/40 bg-yellow-50/10 dark:bg-yellow-950/10"
            ) : "border-border hover:border-brand-primary/40"
        )}>
            <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-h3 text-foreground truncate">{product.name}</h2>
                            {/* ✨ Diagnostic d'Anomalie Compact Réactif au Clic */}
                            {anomaly && (
                                <div className="flex-shrink-0">
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

                                    {/* Tooltip large (Ancré à la CARTE via l'absence de relative ici) */}
                                    <AnimatePresence>
                                        {showAnomalyDetail && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                                className="absolute left-4 right-4 bottom-full mb-2 z-[60]"
                                            >
                                                <div className="bg-gray-900/95 backdrop-blur-sm text-white text-caption font-medium px-4 py-2.5 rounded-xl shadow-2xl flex items-center justify-center text-center gap-2 border border-white/10 whitespace-normal leading-tight">
                                                    {anomaly.severity === 'red' ? <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" /> :
                                                        anomaly.severity === 'orange' ? <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" /> :
                                                            <Info className="w-4 h-4 text-amber-400 shrink-0" />}
                                                    <span>{anomaly.label}</span>
                                                </div>
                                                {/* Flèche centrée sur la carte */}
                                                <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-white/10" />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                        <p className="text-body-sm text-muted-foreground mt-1">{product.volume || 'Format non spécifié'}</p>
                        <span className="inline-block mt-2 px-2 py-0.5 bg-muted text-foreground/70 text-caption font-medium rounded">
                            {categoryName}
                        </span>
                    </div>

                    <div className="text-right">
                        <div className={cn(
                            "text-h2 font-semibold tabular-nums leading-none",
                            isLowStock ? 'text-red-500' : 'text-foreground'
                        )}>
                            {availableStock}
                        </div>
                        <div className="text-micro text-muted-foreground mt-1">
                            Disponible
                        </div>
                        {currentStock !== availableStock && (
                            <div className="text-caption text-muted-foreground mt-0.5">
                                Physique : <span className="tabular-nums">{currentStock}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-border">
                    <div className="text-center">
                        <div className="text-micro text-muted-foreground mb-1">Prix</div>
                        <div className="text-caption font-semibold text-foreground tabular-nums">{formatPrice(product.price)}</div>
                    </div>
                    <div className="text-center border-x border-border">
                        <div className="text-micro text-muted-foreground mb-1">Coût</div>
                        <div className="text-caption font-semibold text-foreground/80 tabular-nums">{displayCost.cost > 0 ? formatPrice(displayCost.cost) : '—'}</div>
                        {displayCost.source !== 'none' && displayCost.source !== 'cump' && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{getCostSourceLabel(displayCost.source)}</div>
                        )}
                    </div>
                    <div className="text-center">
                        <div className="text-micro text-muted-foreground mb-1">Marge</div>
                        <div className={cn(
                            "text-caption font-semibold tabular-nums",
                            margin > 40 ? 'text-green-600 dark:text-green-400' : margin > 20 ? 'text-brand-primary' : 'text-red-500'
                        )}>
                            {margin > 0 ? `${margin.toFixed(0)}%` : '—'}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={() => onEdit(product)}
                        variant="default"
                        size="sm"
                        className="flex-1"
                    >
                        <Edit size={14} className="mr-1.5" />
                        Modifier
                    </Button>
                    <Button
                        onClick={() => onAdjust(product)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                    >
                        <BarChart3 size={14} className="mr-1.5" />
                        Ajuster
                    </Button>
                    <Button
                        onClick={() => onHistory(product)}
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-brand-primary hover:bg-brand-subtle"
                        title="Voir historique"
                        data-guide="inventory-history-btn"
                    >
                        <History size={16} />
                    </Button>
                    <Button
                        onClick={() => onDelete(product)}
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Supprimer"
                    >
                        <Trash2 size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

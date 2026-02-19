import { useState, useEffect, useMemo } from 'react';
import {
    Check,
    Search,
    Plus,
    Minus,
    Sparkles,
    LayoutGrid,
    AlertTriangle,
    ShoppingCart
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { useBarContext } from '../../../context/BarContext';
import { useFeedback } from '../../../hooks/useFeedback';
import { useUnifiedStock } from '../../../hooks/pivots/useUnifiedStock';
import { useOrderDraft } from '../../../hooks/useOrderDraft'; // Nouveau Hook
import { useLastSuppliesMap } from '../../../hooks/queries/useStockQueries';
import { ForecastingService, ProductSalesStats } from '../../../services/supabase/forecasting.service';
import { BackButton } from '../../ui/BackButton';
import { Button } from '../../ui/Button'; // Design System
import { cn } from '../../../lib/utils';

// StockAlert Type Definition
interface StockAlert {
    id: string;
    productId: string;
    productName: string;
    productVolume: string;
    currentStock: number;
    threshold: number;
    severity: 'critical' | 'warning' | 'info';
    createdAt: Date;
    status: 'new' | 'read' | 'resolved';
    predictedRunout?: Date;
    suggestedOrder?: number;
}

interface OrderPreparationProps {
    onBack: () => void;
    onGoToFinalization: () => void; // Nouvelle prop de navigation
}

export function OrderPreparation({ onBack, onGoToFinalization }: OrderPreparationProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { currentBar } = useBarContext();
    const { showError } = useFeedback();
    const { getProductStockInfo } = useUnifiedStock(currentBar?.id);

    // Draft System Interconnection
    const { items: draftItems, addItem, updateItem, removeItem, totals } = useOrderDraft();
    const { data: lastSupplies } = useLastSuppliesMap(currentBar?.id);

    const [alerts, setAlerts] = useState<StockAlert[]>([]);
    const [productStats, setProductStats] = useState<ProductSalesStats[]>([]);
    // const [isLoading, setIsLoading] = useState(false); // Supprimé car inutilisé dans le render
    const [viewMode, setViewMode] = useState<'alerts' | 'suggestions' | 'catalog'>('suggestions');
    const [searchTerm, setSearchTerm] = useState('');

    // Chargement des données (inchangé ou simplifié)
    const loadStats = async () => {
        if (!currentBar) return;
        try {
            // setIsLoading(true);
            // Utiliser getAllProductsWithStats pour avoir le catalogue complet
            const stats = await ForecastingService.getAllProductsWithStats(currentBar.id);
            setProductStats(stats);

            // Calcul des alertes basé sur le stock unifié
            const newAlerts: StockAlert[] = stats
                .map((stat) => {
                    const stockInfo = getProductStockInfo(stat.product_id);
                    const availableStock = stockInfo?.availableStock ?? stat.current_stock;
                    return { ...stat, availableStock };
                })
                .filter(stat => stat.availableStock <= stat.alert_threshold)
                .map(stat => {
                    const severity: StockAlert['severity'] =
                        stat.availableStock === 0 ? 'critical' :
                            stat.availableStock <= stat.alert_threshold / 2 ? 'critical' :
                                'warning';

                    return {
                        id: `alert_${stat.product_id}`,
                        productId: stat.product_id,
                        productName: stat.product_name,
                        productVolume: stat.product_volume,
                        currentStock: stat.availableStock,
                        threshold: stat.alert_threshold,
                        severity,
                        createdAt: new Date(),
                        status: 'new',
                        predictedRunout: stat.daily_average > 0
                            ? new Date(Date.now() + (stat.availableStock / stat.daily_average) * 86400000)
                            : undefined
                    };
                });

            setAlerts(newAlerts);
        } catch (error) {
            console.error('Error loading forecasting stats:', error);
            showError('Erreur chargement prévisions');
        } finally {
            // setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentBar) loadStats();
    }, [currentBar]);

    // Helpers pour le draft
    const getDraftQuantity = (productId: string) => {
        return draftItems.find(i => i.productId === productId)?.quantity || 0;
    };

    const handleIncrement = (product: any, suggestion?: number) => {
        const currentQty = getDraftQuantity(product.productId || product.product_id);
        // const increment = product.packSize || 1; // Par défaut 1, ou taille du pack si connue

        if (currentQty === 0) {
            // Premier ajout : pré-remplir avec le dernier approvisionnement connu
            const pid = product.productId || product.product_id;
            const lastSupply = lastSupplies?.[pid];
            addItem({
                productId: pid,
                productName: product.productName || product.product_name,
                productVolume: product.product_volume,
                quantity: suggestion || 1,
                unitPrice: lastSupply?.unitPrice ?? product.cost_price ?? 0,
                lotSize: lastSupply?.lotSize,
                lotPrice: lastSupply?.lotPrice,
                supplier: lastSupply?.supplier,
            });
        } else {
            updateItem(product.productId || product.product_id, { quantity: currentQty + 1 });
        }
    };

    const handleDecrement = (productId: string) => {
        const currentQty = getDraftQuantity(productId);
        if (currentQty <= 1) {
            removeItem(productId);
        } else {
            updateItem(productId, { quantity: currentQty - 1 });
        }
    };

    const coverageDays = currentBar?.settings?.supplyFrequency ?? 7;

    // Filtrage visuel
    const displayItems = useMemo(() => {
        // Fonction helper pour obtenir le stock unifié
        const getStock = (p: ProductSalesStats) =>
            getProductStockInfo(p.product_id)?.availableStock ?? p.current_stock;

        let filtered = productStats;

        // 1. Filtrage par mode
        switch (viewMode) {
            case 'alerts':
                filtered = filtered.filter(p => getStock(p) <= p.alert_threshold);
                break;
            case 'suggestions':
                filtered = filtered.filter(p => {
                    const stock = getStock(p);
                    const suggestion = ForecastingService.calculateOrderSuggestion(p, coverageDays, stock);
                    return suggestion.suggestedQuantity > 0;
                });
                break;
            case 'catalog':
            default:
                // Pas de filtre spécial, on affiche tout
                break;
        }

        // 2. Filtrage par recherche (Applicable à tous les modes)
        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.product_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        return filtered;
    }, [viewMode, searchTerm, productStats, getProductStockInfo, coverageDays]);

    return (
        <div className="space-y-4 pb-40">
            {/* Unified Header & Navigation */}
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex flex-col gap-4">
                    {/* Top Row: Back & Title */}
                    <div className="flex items-center gap-3">
                        <BackButton onClick={onBack} />
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Nouvelle Commande</h2>
                            <p className="text-xs text-gray-500">Optimisez votre stock</p>
                        </div>
                    </div>

                    {/* Segmented Control */}
                    <div className="flex p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
                        <button
                            onClick={() => setViewMode('suggestions')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                                viewMode === 'suggestions'
                                    ? "bg-white text-brand-primary shadow-sm ring-1 ring-black/5"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                        >
                            <Sparkles className={cn("w-4 h-4", viewMode === 'suggestions' && "fill-brand-primary/20")} />
                            Suggestions
                        </button>
                        <button
                            onClick={() => setViewMode('alerts')}
                            className={cn(
                                "hidden sm:flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                                viewMode === 'alerts'
                                    ? "bg-white text-red-600 shadow-sm ring-1 ring-black/5"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                        >
                            <AlertTriangle className={cn("w-4 h-4", viewMode === 'alerts' && "fill-current")} />
                            Alertes
                            {alerts.length > 0 && (
                                <span className={cn(
                                    "ml-1 px-1.5 py-0.5 rounded-md text-[10px] uppercase font-black",
                                    viewMode === 'alerts' ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-600"
                                )}>
                                    {alerts.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setViewMode('catalog')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                                viewMode === 'catalog'
                                    ? "bg-white text-brand-primary shadow-sm ring-1 ring-black/5"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                        >
                            <LayoutGrid className={cn("w-4 h-4", viewMode === 'catalog' && "fill-brand-primary/20")} />
                            Catalogue
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-3xl border border-gray-100 min-h-[500px] flex flex-col">
                {/* Search Bar (Catalog Mode) */}
                {viewMode === 'catalog' && (
                    <div className="p-4 border-b border-gray-50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Rechercher un produit..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>
                )}

                {/* Grid */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1 content-start">
                    {displayItems.map((item) => {
                        // Mapping explicite des IDs pour éviter confusion entre stats et produits bruts
                        const pid = item.product_id;
                        const pname = item.product_name;
                        const pvol = item.product_volume;
                        const pstock = item.current_stock;

                        const qty = getDraftQuantity(pid);
                        const isSelected = qty > 0;

                        const stockInfo = getProductStockInfo(pid);
                        const availableStock = stockInfo?.availableStock ?? pstock;
                        const suggestion = ForecastingService.calculateOrderSuggestion(item, coverageDays, availableStock);
                        const hasSuggestion = suggestion.suggestedQuantity > 0;

                        return (
                            <motion.div
                                layout
                                key={pid}
                                className={cn(
                                    "p-4 rounded-2xl border-2 transition-all relative overflow-hidden group backdrop-blur-md",
                                    isSelected
                                        ? "border-brand-primary bg-gradient-to-br from-brand-subtle/20 via-brand-subtle/10 to-white/50 shadow-lg shadow-brand-primary/20 ring-1 ring-brand-primary/20 hover:shadow-xl"
                                        : "border-gray-200 bg-gradient-to-br from-white via-gray-50/50 to-gray-100/30 shadow-md shadow-gray-300/20 ring-1 ring-white/60 hover:shadow-lg hover:shadow-gray-400/30 hover:border-gray-300"
                                )}
                            >
                                {isSelected && (
                                    <div className="absolute top-0 right-0 p-1.5 bg-brand-primary rounded-bl-xl z-10">
                                        <Check size={12} className="text-white" />
                                    </div>
                                )}

                                <div className="mb-3">
                                    <h4 className="font-bold text-gray-900 line-clamp-1">{pname}</h4>
                                    <p className="text-xs text-gray-500">{pvol}</p>
                                </div>

                                {/* Suggestion Badge */}
                                {hasSuggestion && (
                                    <div className="mb-3 flex items-center gap-2">
                                        <div className="px-2 py-1 rounded-lg bg-orange-50 border border-orange-100 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                            <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wide">
                                                Suggéré : {suggestion.suggestedQuantity}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-gray-400">Stock</p>
                                        <p className={cn(
                                            "text-sm font-black",
                                            availableStock <= 0 ? "text-red-500" : "text-gray-700"
                                        )}>
                                            {availableStock}
                                        </p>
                                    </div>

                                    {/* Action Stepper */}
                                    <div className={cn(
                                        "flex items-center gap-1 bg-gray-50 rounded-lg p-1 transition-colors",
                                        isSelected && "bg-white shadow-sm ring-1 ring-brand-primary/20"
                                    )}>
                                        {isSelected ? (
                                            <>
                                                <button
                                                    onClick={() => handleDecrement(pid)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 active:scale-95 transition-transform"
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span className="w-6 text-center font-bold text-brand-primary text-sm">{qty}</span>
                                                <button
                                                    onClick={() => handleIncrement(item)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md bg-brand-primary text-white hover:bg-brand-primary/90 active:scale-95 transition-transform"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleIncrement(item, suggestion.suggestedQuantity)}
                                                className="h-7 w-full text-xs font-bold text-brand-primary hover:bg-brand-subtle"
                                            >
                                                Ajouter {hasSuggestion && suggestion.suggestedQuantity > 1 ? `(${suggestion.suggestedQuantity})` : ''}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Floating Footer (Aller à la commande) */}
            {/* Floating Footer (Aller à la commande) */}
            {totals.itemsCount > 0 && (
                <div className="fixed bottom-[80px] md:bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-xl z-40 pb-safe">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

                        {/* Ligne 1 : Infos (Mobile) / Gauche (Desktop) */}
                        <div className="flex flex-row w-full md:w-auto justify-between md:justify-start items-center gap-4">
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Votre commande</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-brand-primary">{formatPrice(totals.totalCost)}</span>
                                    <span className="text-sm font-bold text-gray-400">({totals.itemsCount} articles)</span>
                                </div>
                            </div>
                        </div>

                        {/* Ligne 2 : Bouton (Mobile) / Droite (Desktop) */}
                        <Button
                            size="lg"
                            onClick={onGoToFinalization}
                            className="w-full md:w-auto rounded-xl shadow-lg shadow-brand-primary/20 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold px-8 h-12"
                        >
                            Finaliser la commande
                            <ShoppingCart className="ml-2 w-5 h-5" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

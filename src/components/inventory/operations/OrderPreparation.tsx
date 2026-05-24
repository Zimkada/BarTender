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

    // Saisie directe au clavier — accepte une valeur arbitraire, clamp à [0, 9999]
    // Si l'utilisateur vide le champ ou tape 0, on retire le produit du brouillon.
    const handleSetQuantity = (productId: string, rawValue: string) => {
        const parsed = parseInt(rawValue, 10);
        if (isNaN(parsed) || parsed <= 0) {
            removeItem(productId);
            return;
        }
        const clamped = Math.min(parsed, 9999);
        updateItem(productId, { quantity: clamped });
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
            {/* Header — Back + titre, pas de Card englobante (cohérence avec onglet parent) */}
            <div className="flex items-center gap-3">
                <BackButton onClick={onBack} />
                <div className="min-w-0">
                    <h2 className="text-h3 text-foreground">Nouvelle commande</h2>
                    <p className="text-body-sm text-muted-foreground">Optimisez votre stock</p>
                </div>
            </div>

            {/* Segmented Control */}
            <div
                role="radiogroup"
                aria-label="Mode d'affichage"
                className="flex p-0.5 bg-muted rounded-full border border-border"
            >
                <button
                    role="radio"
                    aria-checked={viewMode === 'suggestions'}
                    onClick={() => setViewMode('suggestions')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-caption transition-all whitespace-nowrap",
                        viewMode === 'suggestions'
                            ? "bg-card text-brand-primary shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground font-medium"
                    )}
                >
                    <Sparkles size={14} />
                    Suggestions
                </button>
                <button
                    role="radio"
                    aria-checked={viewMode === 'alerts'}
                    onClick={() => setViewMode('alerts')}
                    className={cn(
                        "hidden sm:flex flex-1 items-center justify-center gap-2 px-3 py-1.5 rounded-full text-caption transition-all whitespace-nowrap",
                        viewMode === 'alerts'
                            ? "bg-card text-red-600 dark:text-red-400 shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground font-medium"
                    )}
                >
                    <AlertTriangle size={14} />
                    Alertes
                    {alerts.length > 0 && (
                        <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums",
                            viewMode === 'alerts' ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400" : "bg-border text-foreground/70"
                        )}>
                            {alerts.length}
                        </span>
                    )}
                </button>
                <button
                    role="radio"
                    aria-checked={viewMode === 'catalog'}
                    onClick={() => setViewMode('catalog')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-caption transition-all whitespace-nowrap",
                        viewMode === 'catalog'
                            ? "bg-card text-brand-primary shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground font-medium"
                    )}
                >
                    <LayoutGrid size={14} />
                    Catalogue
                </button>
            </div>

            {/* Search Bar (Catalog Mode) */}
            {viewMode === 'catalog' && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Rechercher un produit..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-body-sm text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                    />
                </div>
            )}

            {/* Grid produits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
                {displayItems.map((item) => {
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
                                "p-4 rounded-2xl border transition-all relative bg-card",
                                isSelected
                                    ? "border-brand-primary shadow-md"
                                    : "border-border shadow-sm hover:border-brand-primary/40 hover:shadow-md"
                            )}
                        >
                            {isSelected && (
                                <div className="absolute top-0 right-0 p-1.5 bg-brand-primary rounded-bl-xl rounded-tr-2xl">
                                    <Check size={12} className="text-white" />
                                </div>
                            )}

                            <div className="mb-3 pr-6">
                                <h4 className="text-body font-semibold text-foreground line-clamp-1">{pname}</h4>
                                <p className="text-caption text-muted-foreground">{pvol}</p>
                            </div>

                            {/* Suggestion Badge */}
                            {hasSuggestion && (
                                <div className="mb-3">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-subtle border border-brand-primary/20 text-caption font-medium text-brand-primary">
                                        <Sparkles size={11} />
                                        Suggéré <span className="font-semibold tabular-nums">{suggestion.suggestedQuantity}</span>
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-micro text-muted-foreground">Stock</p>
                                    <p className={cn(
                                        "text-body font-semibold tabular-nums",
                                        availableStock <= 0 ? "text-red-500" : "text-foreground"
                                    )}>
                                        {availableStock}
                                    </p>
                                </div>

                                {/* Action Stepper */}
                                {isSelected ? (
                                    <div className="flex items-center gap-1 bg-card rounded-full border border-brand-primary/30 p-0.5">
                                        <button
                                            onClick={() => handleDecrement(pid)}
                                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted text-foreground/70 active:scale-95 transition-transform"
                                            aria-label="Diminuer"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={9999}
                                            value={qty}
                                            onChange={(e) => handleSetQuantity(pid, e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            className="w-12 text-center font-semibold text-brand-primary text-body-sm tabular-nums bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-brand-primary/40 rounded-md [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            aria-label="Quantité"
                                        />
                                        <button
                                            onClick={() => handleIncrement(item)}
                                            className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-primary text-white hover:opacity-90 active:scale-95 transition-transform"
                                            aria-label="Augmenter"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleIncrement(item, suggestion.suggestedQuantity)}
                                        className="h-8 text-caption font-semibold text-brand-primary hover:bg-brand-subtle"
                                    >
                                        Ajouter {hasSuggestion && suggestion.suggestedQuantity > 1 ? `(${suggestion.suggestedQuantity})` : ''}
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Footer flottant — Récap + CTA finalisation */}
            {totals.itemsCount > 0 && (
                <div className="fixed bottom-[80px] md:bottom-0 left-0 right-0 p-4 bg-card border-t border-border shadow-xl z-40 pb-safe">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

                        <div className="flex flex-col w-full md:w-auto">
                            <span className="text-micro text-muted-foreground">Votre commande</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-h2 font-semibold text-brand-primary tabular-nums">{formatPrice(totals.totalCost)}</span>
                                <span className="text-body-sm text-muted-foreground tabular-nums">
                                    ({totals.itemsCount} {totals.itemsCount > 1 ? 'articles' : 'article'})
                                </span>
                            </div>
                        </div>

                        <Button
                            size="lg"
                            onClick={onGoToFinalization}
                            className="w-full md:w-auto"
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

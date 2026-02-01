import { useState, useEffect, useMemo } from 'react';
import {
    AlertTriangle,
    Bell,
    Package,
    ShoppingCart,
    TrendingDown,
    Check,
    Download,
    X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { useViewport } from '../../../hooks/useViewport';
import { useBarContext } from '../../../context/BarContext';
import { useFeedback } from '../../../hooks/useFeedback';
import { useStockManagement } from '../../../hooks/useStockManagement';
import { EnhancedButton } from '../../EnhancedButton';
import { ForecastingService, ProductSalesStats, OrderSuggestion } from '../../../services/supabase/forecasting.service';
import { BackButton } from '../../ui/BackButton';
import { Button } from '../../ui/Button';

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
    onSupplyClick: (product: ProductSalesStats, quantity: number) => void;
}

export function OrderPreparation({ onBack, onSupplyClick }: OrderPreparationProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();
    const { currentBar } = useBarContext();
    const { showError } = useFeedback();
    const { products, allProductsStockInfo } = useStockManagement();

    const [alerts, setAlerts] = useState<StockAlert[]>([]);
    const [productStats, setProductStats] = useState<ProductSalesStats[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'resolved'>('all');
    const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);

    const coverageDays = currentBar?.settings?.supplyFrequency ?? 7;

    const loadStats = async () => {
        if (!currentBar) return;

        try {
            setIsLoading(true);
            const stats = await ForecastingService.getProductSalesStats(currentBar.id);
            setProductStats(stats);

            const newAlerts: StockAlert[] = stats
                .map((stat: ProductSalesStats) => {
                    const availableStock = (allProductsStockInfo as any)[stat.product_id]?.availableStock ?? stat.current_stock;
                    return { ...stat, availableStock };
                })
                .filter(stat => stat.availableStock <= stat.alert_threshold)
                .map(stat => {
                    const severity: StockAlert['severity'] =
                        stat.availableStock === 0 ? 'critical' :
                            stat.availableStock <= stat.alert_threshold / 2 ? 'critical' :
                                'warning';

                    const suggestion = ForecastingService.calculateOrderSuggestion(stat, coverageDays, stat.availableStock);

                    return {
                        id: `alert_${stat.product_id}_${new Date().toISOString().split('T')[0]}`,
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
                            : undefined,
                        suggestedOrder: suggestion.suggestedQuantity
                    };
                });

            setAlerts(prev => {
                const existingMap = new Map(prev.map(a => [a.productId, a]));
                return newAlerts.map(newAlert => {
                    const existing = existingMap.get(newAlert.productId);
                    if (existing && existing.status !== 'new') {
                        return { ...newAlert, status: existing.status, id: existing.id };
                    }
                    return newAlert;
                });
            });

        } catch (error) {
            console.error('Error loading forecasting stats:', error);
            showError('Erreur lors du chargement des prévisions');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentBar) {
            loadStats();
        }
    }, [currentBar, products]);

    const orderSuggestions = useMemo(() => {
        return productStats
            .map((stat: ProductSalesStats) => {
                const availableStock = (allProductsStockInfo as any)[stat.product_id]?.availableStock ?? stat.current_stock;
                return ForecastingService.calculateOrderSuggestion(stat, coverageDays, availableStock);
            })
            .filter(suggestion => suggestion.suggestedQuantity > 0)
            .sort((a, b) => {
                const urgencyScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
                if (urgencyScore[a.urgency] !== urgencyScore[b.urgency]) {
                    return urgencyScore[b.urgency] - urgencyScore[a.urgency];
                }
                return b.estimatedCost - a.estimatedCost;
            });
    }, [productStats, coverageDays, allProductsStockInfo]);



    const markAsResolved = (alertId: string) => {
        setAlerts(prev => prev.map(alert =>
            alert.id === alertId ? { ...alert, status: 'resolved' } : alert
        ));
    };

    const deleteAlert = (alertId: string) => {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
    };

    const filteredAlerts = alerts.filter(alert => {
        if (filterStatus === 'all') return true;
        return alert.status === filterStatus;
    });

    const statsCount = {
        total: alerts.length,
        new: alerts.filter(a => a.status === 'new').length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        totalOrderValue: orderSuggestions.reduce((sum, s) => sum + s.estimatedCost, 0)
    };

    const exportOrderList = async () => {
        const XLSX = await import('xlsx');
        const exportData = orderSuggestions.map(suggestion => ({
            'Produit': suggestion.productName,
            'Volume': suggestion.productVolume,
            'Stock actuel': suggestion.currentStock,
            'Quantité suggérée': suggestion.suggestedQuantity,
            'Coût estimé (FCFA)': suggestion.estimatedCost,
            'Urgence': suggestion.urgency === 'high' ? 'Haute' : suggestion.urgency === 'medium' ? 'Moyenne' : 'Faible',
            'Raison': suggestion.reasoning
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [
            { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 40 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Commande Suggérée");
        XLSX.writeFile(wb, `bon_commande_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-6 border-b border-gray-50 pb-4">
                <div className="flex items-center gap-3">
                    <BackButton
                        onClick={onBack}
                    />
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Préparation Commandes</h2>
                        <p className="text-xs text-gray-500">Intelligence de stocks et suggestions d'achat</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {isMobile ? (
                            <div className="flex flex-col gap-4">
                                <div className="bg-brand-subtle p-3 rounded-xl">
                                    <button
                                        onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
                                        className={`w-full px-4 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors mb-3 ${showOrderSuggestions
                                            ? 'bg-white text-brand-primary border-2 border-brand-primary'
                                            : 'bg-brand-primary text-white'
                                            }`}
                                    >
                                        <ShoppingCart size={18} />
                                        {showOrderSuggestions ? 'Voir alertes stock' : `Suggestions de commande (${orderSuggestions.length})`}
                                    </button>

                                    {!showOrderSuggestions && (
                                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                            {[
                                                { value: 'all', label: 'Toutes' },
                                                { value: 'new', label: 'Nouvelles' },
                                                { value: 'resolved', label: 'Ignorées' }
                                            ].map(filter => (
                                                <button
                                                    key={filter.value}
                                                    onClick={() => setFilterStatus(filter.value as any)}
                                                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${filterStatus === filter.value
                                                        ? 'bg-brand-primary text-white'
                                                        : 'bg-white text-gray-700'
                                                        }`}
                                                >
                                                    {filter.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    {!showOrderSuggestions ? (
                                        filteredAlerts.length === 0 ? (
                                            <EmptyAlertsState filter={filterStatus} />
                                        ) : (
                                            filteredAlerts.map(alert => (
                                                <AlertCard
                                                    key={alert.id}
                                                    alert={alert}
                                                    onIgnore={() => markAsResolved(alert.id)}
                                                    onDelete={() => deleteAlert(alert.id)}
                                                    onViewSuggestion={() => setShowOrderSuggestions(true)}
                                                />
                                            ))
                                        )
                                    ) : (
                                        orderSuggestions.length === 0 ? (
                                            <EmptySuggestionsState />
                                        ) : (
                                            <>
                                                <div className="flex justify-end mb-2">
                                                    <EnhancedButton
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={exportOrderList}
                                                        icon={<Download size={14} />}
                                                        className="text-xs px-3 py-1.5"
                                                    >
                                                        Exporter XLS
                                                    </EnhancedButton>
                                                </div>
                                                {orderSuggestions.map(suggestion => (
                                                    <OrderSuggestionCard
                                                        key={suggestion.productId}
                                                        suggestion={suggestion}
                                                        formatPrice={formatPrice}
                                                        onSupply={() => onSupplyClick({ ...suggestion, daily_average: 0, sale_velocity: 0, last_sale_date: new Date().toISOString(), alert_threshold: 0, current_stock: suggestion.currentStock, product_id: suggestion.productId, product_name: suggestion.productName, product_volume: suggestion.productVolume }, suggestion.suggestedQuantity)}
                                                        onBackToAlert={() => setShowOrderSuggestions(false)}
                                                    />
                                                ))}
                                            </>
                                        )
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-6 h-full min-h-[500px]">
                                {/* Sidebar Desktop */}
                                <div className="w-64 flex-shrink-0 space-y-6">
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Vue d'ensemble</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100">
                                                <span className="text-xs font-medium text-gray-500">Critiques</span>
                                                <span className="font-black text-red-600">{statsCount.critical}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100">
                                                <span className="text-xs font-medium text-gray-500">Investissement</span>
                                                <span className="font-black text-brand-primary">{formatPrice(statsCount.totalOrderValue)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Affichage</h3>
                                        <div className="space-y-2">
                                            <button
                                                onClick={() => setShowOrderSuggestions(false)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all ${!showOrderSuggestions ? 'bg-brand-primary text-white shadow-md shadow-brand-subtle' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                                            >
                                                <AlertTriangle size={18} />
                                                Alertes Stock
                                            </button>
                                            <button
                                                onClick={() => setShowOrderSuggestions(true)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all ${showOrderSuggestions ? 'bg-brand-primary text-white shadow-md shadow-brand-subtle' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                                            >
                                                <ShoppingCart size={18} />
                                                Suggestions d'achat
                                            </button>
                                        </div>
                                    </div>

                                    {showOrderSuggestions && orderSuggestions.length > 0 && (
                                        <EnhancedButton
                                            variant="primary"
                                            onClick={exportOrderList}
                                            icon={<Download size={18} />}
                                            className="w-full py-6 rounded-2xl font-black shadow-lg shadow-brand-subtle"
                                        >
                                            Export Excel
                                        </EnhancedButton>
                                    )}
                                </div>

                                {/* Content Desktop */}
                                <div className="flex-1 bg-gray-50/50 rounded-3xl p-6 border border-gray-100 overflow-y-auto">
                                    {!showOrderSuggestions ? (
                                        <div className="space-y-4 max-w-2xl">
                                            {filteredAlerts.length === 0 ? (
                                                <EmptyAlertsState filter={filterStatus} />
                                            ) : (
                                                filteredAlerts.map(alert => (
                                                    <AlertCard
                                                        key={alert.id}
                                                        alert={alert}
                                                        onIgnore={() => markAsResolved(alert.id)}
                                                        onDelete={() => deleteAlert(alert.id)}
                                                        onViewSuggestion={() => setShowOrderSuggestions(true)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {orderSuggestions.length === 0 ? (
                                                <EmptySuggestionsState />
                                            ) : (
                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                    {orderSuggestions.map(suggestion => (
                                                        <OrderSuggestionCard
                                                            key={suggestion.productId}
                                                            suggestion={suggestion}
                                                            formatPrice={formatPrice}
                                                            onSupply={() => onSupplyClick({ ...suggestion, daily_average: 0, sale_velocity: 0, last_sale_date: new Date().toISOString(), alert_threshold: 0, current_stock: suggestion.currentStock, product_id: suggestion.productId, product_name: suggestion.productName, product_volume: suggestion.productVolume }, suggestion.suggestedQuantity)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyAlertsState({ filter }: { filter: 'all' | 'new' | 'resolved' }) {
    const config = {
        all: {
            icon: Package,
            title: "Aucune alerte",
            desc: "Votre historique d'alertes est vide."
        },
        new: {
            icon: Check,
            title: "Stock impeccable",
            desc: "Aucun produit n'est actuellement sous son seuil d'alerte."
        },
        resolved: {
            icon: Bell,
            title: "Aucune alerte ignorée",
            desc: "Vous traitez toutes vos alertes de stock, bravo !"
        }
    };

    const current = config[filter];
    const Icon = current.icon;

    return (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">{current.title}</h3>
            <p className="text-gray-500 text-sm">{current.desc}</p>
        </div>
    );
}

function EmptySuggestionsState() {
    return (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Aucun achat suggéré</h3>
            <p className="text-gray-500 text-sm">Vos stocks actuels couvrent largement vos besoins prévisionnels.</p>
        </div>
    );
}

function AlertCard({
    alert,
    onIgnore,
    onDelete,
    onViewSuggestion
}: {
    alert: StockAlert;
    onIgnore: () => void;
    onDelete: () => void;
    onViewSuggestion: () => void;
}) {
    const getSeverityStyle = (severity: StockAlert['severity']) => {
        switch (severity) {
            case 'critical': return 'border-red-200 bg-white';
            case 'warning': return 'border-yellow-200 bg-white';
            case 'info': return 'border-blue-200 bg-white';
        }
    };

    const getSeverityIcon = (severity: StockAlert['severity']) => {
        switch (severity) {
            case 'critical': return <AlertTriangle className="text-red-500" size={24} />;
            case 'warning': return <TrendingDown className="text-yellow-500" size={24} />;
            case 'info': return <Package className="text-blue-500" size={24} />;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-5 border shadow-sm transition-all ${getSeverityStyle(alert.severity)} ${alert.status === 'new' ? 'border-l-4 border-l-brand-primary' : 'opacity-80'}`}
        >
            <div className="flex items-start gap-4">
                <div className="p-2 bg-gray-50 rounded-xl shrink-0">
                    {getSeverityIcon(alert.severity)}
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-gray-800 truncate mb-1">{alert.productName}</h4>
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-gray-500 text-xs font-medium truncate">{alert.productVolume}</p>
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${alert.status === 'new' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                            {alert.status === 'new' ? 'Nouveau' : alert.status === 'read' ? 'Lu' : 'Ignoré'}
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm font-medium">
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">Stock Actuel</span>
                            <span className={`${alert.currentStock === 0 ? 'text-red-600' : 'text-gray-700'}`}>{alert.currentStock} unités</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">Préd. Rupture</span>
                            <span className="text-brand-primary font-bold">
                                {alert.predictedRunout ? alert.predictedRunout.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Indéterminé'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onViewSuggestion}
                    className="h-8 px-3 text-brand-primary hover:bg-brand-subtle flex items-center gap-1.5 font-bold text-xs"
                >
                    <ShoppingCart size={14} /> Voir suggestion
                </Button>

                <div className="flex items-center gap-1">
                    {alert.status !== 'resolved' && (
                        <Button variant="ghost" size="sm" onClick={onIgnore} className="h-8 px-3 text-gray-500 hover:bg-gray-50 flex items-center gap-1 font-medium text-xs">
                            Ignorer
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 w-8 p-0 text-gray-600 hover:text-red-500 hover:bg-red-50">
                        <X size={16} />
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}

function OrderSuggestionCard({
    suggestion,
    formatPrice,
    onSupply,
    onBackToAlert
}: {
    suggestion: OrderSuggestion;
    formatPrice: (price: number) => string;
    onSupply: () => void;
    onBackToAlert?: () => void;
}) {
    const getUrgencyConfig = (urgency: OrderSuggestion['urgency']) => {
        switch (urgency) {
            case 'high': return { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', label: 'Urgent' };
            case 'medium': return { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', label: 'Modéré' };
            default: return { bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700', label: 'Standard' };
        }
    };

    const cfg = getUrgencyConfig(suggestion.urgency);

    return (
        <div className={`p-5 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow`}>
            <div className="mb-4">
                <div className="flex justify-between items-start mb-1 gap-2">
                    <h4 className="font-bold text-gray-900 truncate flex-1">{suggestion.productName}</h4>
                    {onBackToAlert && (
                        <button
                            onClick={onBackToAlert}
                            className="text-[10px] font-bold text-gray-400 hover:text-brand-primary underline decoration-gray-300 hover:decoration-brand-primary transition-colors whitespace-nowrap pt-1"
                        >
                            Voir alerte
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-400 text-xs font-medium truncate">{suggestion.productVolume}</span>
                    <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        {cfg.label}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50/50 p-2.5 rounded-xl text-center">
                    <span className="block text-gray-400 text-[9px] uppercase font-black mb-0.5">Stock</span>
                    <span className="text-base font-bold text-gray-800">{suggestion.currentStock}</span>
                </div>
                <div className="bg-brand-subtle p-2.5 rounded-xl border border-brand-subtle text-center">
                    <span className="block text-brand-primary text-[9px] uppercase font-black mb-0.5">Besoin</span>
                    <span className="text-xl font-black text-brand-primary">+{suggestion.suggestedQuantity}</span>
                </div>
            </div>

            <div className="pt-3 border-t border-gray-50 flex items-center justify-between gap-2">
                <div className="shrink-0 flex flex-col">
                    <span className="block text-gray-400 text-[9px] uppercase font-black mb-0.5">Coût estimé</span>
                    <span className="font-bold text-gray-900 text-sm">{formatPrice(suggestion.estimatedCost)}</span>
                </div>

                <div className="flex-1 flex justify-end">
                    <EnhancedButton
                        variant="primary"
                        onClick={onSupply}
                        size="sm"
                        className="text-xs px-4 py-1.5 h-8 bg-brand-primary hover:bg-brand-primary/90 text-white shadow-sm font-bold w-full sm:w-auto"
                    >
                        Approvisionner
                    </EnhancedButton>
                </div>
            </div>

            <p className="mt-3 text-[10px] text-gray-500 italic leading-tight line-clamp-2 w-full text-center bg-gray-50/50 p-1.5 rounded-lg border border-gray-100">
                "{suggestion.reasoning}"
            </p>
        </div>
    );
}

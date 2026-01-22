import { useState, useEffect, useMemo } from 'react';
import {
    AlertTriangle,
    Bell,
    Package,
    ShoppingCart,
    TrendingDown,
    Calendar,
    X,
    Check,
    Download
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
}

export function OrderPreparation({ onBack }: OrderPreparationProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();
    const { currentBar } = useBarContext();
    const { showError, showSuccess } = useFeedback();
    const { products, allProductsStockInfo } = useStockManagement();

    const [alerts, setAlerts] = useState<StockAlert[]>([]);
    const [productStats, setProductStats] = useState<ProductSalesStats[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'read' | 'resolved'>('all');
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

    const markAsRead = (alertId: string) => {
        setAlerts(prev => prev.map(alert =>
            alert.id === alertId ? { ...alert, status: 'read' } : alert
        ));
    };

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
                        iconType="chevron"
                        className="text-gray-500 hover:text-gray-900"
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
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {isMobile ? (
                            <div className="flex flex-col gap-4">
                                <div className="bg-amber-50 p-3 rounded-xl">
                                    <button
                                        onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
                                        className={`w-full px-4 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors mb-3 ${showOrderSuggestions
                                            ? 'bg-white text-amber-600 border-2 border-amber-600'
                                            : 'bg-amber-500 text-white'
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
                                                { value: 'read', label: 'Lues' },
                                                { value: 'resolved', label: 'Résolues' }
                                            ].map(filter => (
                                                <button
                                                    key={filter.value}
                                                    onClick={() => setFilterStatus(filter.value as any)}
                                                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${filterStatus === filter.value
                                                        ? 'bg-amber-500 text-white'
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
                                            <EmptyAlertsState />
                                        ) : (
                                            filteredAlerts.map(alert => (
                                                <AlertCard
                                                    key={alert.id}
                                                    alert={alert}
                                                    onMarkAsRead={() => markAsRead(alert.id)}
                                                    onMarkAsResolved={() => markAsResolved(alert.id)}
                                                    onDelete={() => deleteAlert(alert.id)}
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
                                                <span className="font-black text-amber-600">{formatPrice(statsCount.totalOrderValue)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Affichage</h3>
                                        <div className="space-y-2">
                                            <button
                                                onClick={() => setShowOrderSuggestions(false)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all ${!showOrderSuggestions ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                                            >
                                                <AlertTriangle size={18} />
                                                Alertes Stock
                                            </button>
                                            <button
                                                onClick={() => setShowOrderSuggestions(true)}
                                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all ${showOrderSuggestions ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
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
                                            className="w-full py-6 rounded-2xl font-black shadow-lg shadow-amber-100"
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
                                                <EmptyAlertsState />
                                            ) : (
                                                filteredAlerts.map(alert => (
                                                    <AlertCard
                                                        key={alert.id}
                                                        alert={alert}
                                                        onMarkAsRead={() => markAsRead(alert.id)}
                                                        onMarkAsResolved={() => markAsResolved(alert.id)}
                                                        onDelete={() => deleteAlert(alert.id)}
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

function EmptyAlertsState() {
    return (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Stock impeccable</h3>
            <p className="text-gray-500 text-sm">Aucun produit n'est actuellement sous son seuil d'alerte.</p>
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
    onMarkAsRead,
    onMarkAsResolved,
    onDelete
}: {
    alert: StockAlert;
    onMarkAsRead: () => void;
    onMarkAsResolved: () => void;
    onDelete: () => void;
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
            className={`rounded-2xl p-5 border shadow-sm transition-all ${getSeverityStyle(alert.severity)} ${alert.status === 'new' ? 'border-l-4 border-l-amber-500' : 'opacity-80'}`}
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
                            {alert.status === 'new' ? 'Nouveau' : alert.status === 'read' ? 'Lu' : 'Résolu'}
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm font-medium">
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">Stock Actuel</span>
                            <span className={`${alert.currentStock === 0 ? 'text-red-600' : 'text-gray-700'}`}>{alert.currentStock} unités</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">Préd. Rupture</span>
                            <span className="text-amber-600 font-bold">
                                {alert.predictedRunout ? alert.predictedRunout.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Indéterminé'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-end gap-1">
                {alert.status === 'new' && (
                    <Button variant="ghost" size="sm" onClick={onMarkAsRead} className="h-9 w-9 p-0 text-amber-600 hover:bg-amber-50">
                        <Check size={18} />
                    </Button>
                )}
                {alert.status !== 'resolved' && (
                    <Button variant="ghost" size="sm" onClick={onMarkAsResolved} className="h-9 px-3 text-green-600 hover:bg-green-50 flex items-center gap-1 font-bold">
                        <Check size={16} /> Résoudre
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onDelete} className="h-9 w-9 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50">
                    <X size={18} />
                </Button>
            </div>
        </motion.div>
    );
}

function OrderSuggestionCard({
    suggestion,
    formatPrice
}: {
    suggestion: OrderSuggestion;
    formatPrice: (price: number) => string;
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
                <h4 className="font-bold text-gray-900 mb-1 truncate">{suggestion.productName}</h4>
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
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100 text-center">
                    <span className="block text-amber-500 text-[9px] uppercase font-black mb-0.5">Besoin</span>
                    <span className="text-xl font-black text-amber-600">+{suggestion.suggestedQuantity}</span>
                </div>
            </div>

            <div className="pt-3 border-t border-gray-50 flex items-center justify-between gap-2">
                <div className="shrink-0">
                    <span className="block text-gray-400 text-[9px] uppercase font-black mb-0.5">Coût estimé</span>
                    <span className="font-bold text-gray-900 text-sm">{formatPrice(suggestion.estimatedCost)}</span>
                </div>
                <p className="text-[10px] text-gray-500 italic leading-tight flex-1 text-right line-clamp-2">
                    "{suggestion.reasoning}"
                </p>
            </div>
        </div>
    );
}

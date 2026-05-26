import { useNavigate } from 'react-router-dom';
import {
    TrendingUp, DollarSign, ShoppingCart, Package,
    AlertTriangle, RotateCcw, Archive, MessageCircle
} from 'lucide-react';
import { DataFreshnessIndicatorCompact } from '../../DataFreshnessIndicator';
import { AnimatedCounter } from '../../AnimatedCounter';
import { EnhancedButton } from '../../EnhancedButton';
import { Bar, Product, ProductStockInfo } from '../../../types';
import { StaleSalesCleanupBanner } from '../StaleSalesCleanupBanner';

interface DashboardSummaryProps {
    // Data
    currentBar: Bar | null;
    todayTotal: number;
    salesCount: number;
    pendingSalesCount: number;
    totalItems: number;
    returnsCount: number;
    pendingReturnsCount: number;
    consignmentsCount: number;
    lowStockProducts: Product[];
    topProductsList: { name: string; qty: number }[];
    allProductsStockInfo: Record<string, ProductStockInfo>;
    isServerRole: boolean;


    // Helpers
    formatPrice: (amount: number) => string;

    // Actions & States
    onRefresh: () => Promise<void>;
    onExportWhatsApp: () => void;
}

export function DashboardSummary({
    currentBar,
    todayTotal,
    salesCount,
    pendingSalesCount,
    totalItems,
    returnsCount,
    pendingReturnsCount,
    consignmentsCount,
    lowStockProducts,
    topProductsList,
    allProductsStockInfo,
    isServerRole,
    formatPrice,
    onRefresh,
    onExportWhatsApp,
}: DashboardSummaryProps) {
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            {!isServerRole && currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                <StaleSalesCleanupBanner barId={currentBar.id} />
            )}

            {/* Header section */}
            <div className="flex items-center justify-between">
                <h2 className="text-h3 text-foreground">Indicateurs clés</h2>
                {currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                    <DataFreshnessIndicatorCompact
                        viewName="daily_sales_summary"
                        onRefreshComplete={onRefresh}
                    />
                )}
            </div>

            {/* KPI Grid — cards plates avec accent brand uniforme, hors-norme = sémantique */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-guide="revenue-stats">
                {/* Revenus — KPI principal, légèrement accentué */}
                <div className="bg-card rounded-2xl p-4 shadow-sm border border-brand-primary/30 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <DollarSign size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Revenus</span>
                    </div>
                    <AnimatedCounter value={todayTotal} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground truncate mt-1 tabular-nums">{formatPrice(todayTotal)} net</p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <ShoppingCart size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Ventes</span>
                    </div>
                    <AnimatedCounter value={salesCount} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground mt-1 tabular-nums">{pendingSalesCount} en attente</p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <Package size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Articles</span>
                    </div>
                    <AnimatedCounter value={totalItems} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground mt-1">Total vendus</p>
                </div>

                {/* Alertes — sémantique rouge préservée (signal universel), avec variantes dark */}
                <div className="bg-card rounded-2xl p-4 shadow-sm border border-red-200 dark:border-red-900/40 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                            <AlertTriangle size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Alertes</span>
                    </div>
                    <div className="text-h2 font-semibold text-red-600 dark:text-red-400 tabular-nums">{lowStockProducts.length}</div>
                    <p className="text-caption text-muted-foreground mt-1">Stock critique</p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <RotateCcw size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Retours</span>
                    </div>
                    <AnimatedCounter value={returnsCount} className="text-h2 font-semibold text-foreground tabular-nums" />
                    <p className="text-caption text-muted-foreground mt-1 tabular-nums">{pendingReturnsCount} en attente</p>
                </div>

                <div className="bg-card rounded-2xl p-4 shadow-sm border border-border hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <Archive size={18} />
                        </div>
                        <span className="text-micro text-muted-foreground">Consign.</span>
                    </div>
                    <div className="text-h2 font-semibold text-foreground tabular-nums">{consignmentsCount}</div>
                    <p className="text-caption text-muted-foreground mt-1">Fiches actives</p>
                </div>
            </div>

            {/* Insights — 2 panneaux compagnons (top produits + stock à surveiller) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <TrendingUp size={18} />
                        </div>
                        <h3 className="text-h3 text-foreground">Top produits vendus</h3>
                    </div>
                    {topProductsList.length > 0 ? (
                        <div className="space-y-2.5">
                            {topProductsList.map((p, i) => (
                                <div key={i} className="flex justify-between items-center py-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-subtle text-brand-primary text-caption font-semibold flex-shrink-0">
                                            {i + 1}
                                        </span>
                                        <span className="text-body-sm text-foreground/80 truncate">{p.name}</span>
                                    </div>
                                    <span className="text-body-sm font-semibold text-foreground tabular-nums flex-shrink-0 ml-2">
                                        {p.qty} <span className="text-caption text-muted-foreground font-normal">unités</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-muted rounded-xl border border-dashed border-border">
                            <p className="text-body-sm text-muted-foreground">Aucune vente enregistrée pour le moment</p>
                        </div>
                    )}
                </div>

                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                            <AlertTriangle size={18} />
                        </div>
                        <h3 className="text-h3 text-foreground">Points de vigilance stock</h3>
                    </div>
                    {lowStockProducts.length > 0 ? (
                        <div className="space-y-2.5">
                            {lowStockProducts.slice(0, 5).map(p => (
                                <div key={p.id} className="flex justify-between items-center py-1">
                                    <span className="text-body-sm text-foreground/80 truncate min-w-0">{p.name}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <span className="text-caption text-muted-foreground">Restant</span>
                                        <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-caption font-semibold tabular-nums">
                                            {allProductsStockInfo[p.id]?.availableStock ?? p.stock}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {lowStockProducts.length > 5 && (
                                <button
                                    onClick={() => navigate('/inventory')}
                                    className="w-full mt-2 text-caption text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
                                >
                                    Voir les {lowStockProducts.length - 5} autres alertes →
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-green-50 dark:bg-green-950/30 rounded-xl border border-dashed border-green-200 dark:border-green-900/40">
                            <p className="text-body-sm text-green-700 dark:text-green-400 font-medium">Tous vos stocks sont au-dessus des seuils ✓</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Partage du rapport */}
            <div className="bg-card rounded-2xl p-5 border border-border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h4 className="text-h3 text-foreground">Partager le rapport du jour</h4>
                    <p className="text-body-sm text-muted-foreground mt-0.5">Envoyez le résumé des ventes à votre équipe via WhatsApp</p>
                </div>

                <div className="flex flex-row gap-2 w-full sm:w-auto">
                    <EnhancedButton
                        onClick={onExportWhatsApp}
                        variant="success"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 text-white rounded-lg text-body-sm font-semibold shadow-sm active:scale-[0.98] transition-all"
                    >
                        <MessageCircle size={16} />
                        WhatsApp
                    </EnhancedButton>
                </div>
            </div>
        </div>
    );
}

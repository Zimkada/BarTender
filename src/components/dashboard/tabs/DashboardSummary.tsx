import { useNavigate } from 'react-router-dom';
import {
    TrendingUp, DollarSign, ShoppingCart, Package, Lock,
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
    onCloseCash: () => void;
    cashClosed: boolean;
    isClosingCash: boolean;
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
    onCloseCash,
    cashClosed,
    isClosingCash
}: DashboardSummaryProps) {
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            {!isServerRole && currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                <StaleSalesCleanupBanner barId={currentBar.id} />
            )}

            {/* Header section */}
            <div className="flex items-center justify-between">
                <h2 className="text-h3 text-gray-900">Indicateurs clés</h2>
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
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-primary/30 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <DollarSign size={18} />
                        </div>
                        <span className="text-micro text-gray-500">Revenus</span>
                    </div>
                    <AnimatedCounter value={todayTotal} className="text-h2 font-semibold text-gray-900 tabular-nums" />
                    <p className="text-caption text-gray-500 truncate mt-1 tabular-nums">{formatPrice(todayTotal)} net</p>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <ShoppingCart size={18} />
                        </div>
                        <span className="text-micro text-gray-500">Ventes</span>
                    </div>
                    <AnimatedCounter value={salesCount} className="text-h2 font-semibold text-gray-900 tabular-nums" />
                    <p className="text-caption text-gray-500 mt-1 tabular-nums">{pendingSalesCount} en attente</p>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <Package size={18} />
                        </div>
                        <span className="text-micro text-gray-500">Articles</span>
                    </div>
                    <AnimatedCounter value={totalItems} className="text-h2 font-semibold text-gray-900 tabular-nums" />
                    <p className="text-caption text-gray-500 mt-1">Total vendus</p>
                </div>

                {/* Alertes — sémantique rouge préservée (signal universel) */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-red-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                            <AlertTriangle size={18} />
                        </div>
                        <span className="text-micro text-gray-500">Alertes</span>
                    </div>
                    <div className="text-h2 font-semibold text-red-600 tabular-nums">{lowStockProducts.length}</div>
                    <p className="text-caption text-gray-500 mt-1">Stock critique</p>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <RotateCcw size={18} />
                        </div>
                        <span className="text-micro text-gray-500">Retours</span>
                    </div>
                    <AnimatedCounter value={returnsCount} className="text-h2 font-semibold text-gray-900 tabular-nums" />
                    <p className="text-caption text-gray-500 mt-1 tabular-nums">{pendingReturnsCount} en attente</p>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <Archive size={18} />
                        </div>
                        <span className="text-micro text-gray-500">Consign.</span>
                    </div>
                    <div className="text-h2 font-semibold text-gray-900 tabular-nums">{consignmentsCount}</div>
                    <p className="text-caption text-gray-500 mt-1">Fiches actives</p>
                </div>
            </div>

            {/* Insights — 2 panneaux compagnons (top produits + stock à surveiller) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <TrendingUp size={18} />
                        </div>
                        <h3 className="text-h3 text-gray-900">Top produits vendus</h3>
                    </div>
                    {topProductsList.length > 0 ? (
                        <div className="space-y-2.5">
                            {topProductsList.map((p, i) => (
                                <div key={i} className="flex justify-between items-center py-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-subtle text-brand-primary text-caption font-semibold flex-shrink-0">
                                            {i + 1}
                                        </span>
                                        <span className="text-body-sm text-gray-700 truncate">{p.name}</span>
                                    </div>
                                    <span className="text-body-sm font-semibold text-gray-900 tabular-nums flex-shrink-0 ml-2">
                                        {p.qty} <span className="text-caption text-gray-400 font-normal">unités</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <p className="text-body-sm text-gray-400">Aucune vente enregistrée pour le moment</p>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                            <AlertTriangle size={18} />
                        </div>
                        <h3 className="text-h3 text-gray-900">Points de vigilance stock</h3>
                    </div>
                    {lowStockProducts.length > 0 ? (
                        <div className="space-y-2.5">
                            {lowStockProducts.slice(0, 5).map(p => (
                                <div key={p.id} className="flex justify-between items-center py-1">
                                    <span className="text-body-sm text-gray-700 truncate min-w-0">{p.name}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <span className="text-caption text-gray-400">Restant</span>
                                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-caption font-semibold tabular-nums">
                                            {allProductsStockInfo[p.id]?.availableStock ?? p.stock}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {lowStockProducts.length > 5 && (
                                <button
                                    onClick={() => navigate('/inventory')}
                                    className="w-full mt-2 text-caption text-red-500 hover:text-red-700 font-medium transition-colors"
                                >
                                    Voir les {lowStockProducts.length - 5} autres alertes →
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-green-50 rounded-xl border border-dashed border-green-200">
                            <p className="text-body-sm text-green-700 font-medium">Tous vos stocks sont au-dessus des seuils ✓</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Actions de fin de journée */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h4 className="text-h3 text-gray-900">Actions de fin de journée</h4>
                    <p className="text-body-sm text-gray-500 mt-0.5">Rapport de vente et clôture sécurisée</p>
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

                    {!isServerRole && (
                        !cashClosed ? (
                            <EnhancedButton
                                onClick={onCloseCash}
                                loading={isClosingCash}
                                variant="danger"
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 text-white rounded-lg text-body-sm font-semibold shadow-sm active:scale-[0.98] transition-all"
                            >
                                <Lock size={16} />
                                Fermer caisse
                            </EnhancedButton>
                        ) : (
                            <div className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gray-100 text-gray-400 rounded-lg text-body-sm font-medium border border-gray-200 cursor-not-allowed">
                                <Lock size={16} />
                                Caisse fermée
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

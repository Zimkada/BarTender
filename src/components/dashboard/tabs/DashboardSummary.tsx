import { useNavigate } from 'react-router-dom';
import {
    TrendingUp, DollarSign, ShoppingCart, Package, Share, Lock,
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

            {/* Stats Grid avec design amélioré */}
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-gray-900">Indicateurs clés</h2>
                {currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                    <DataFreshnessIndicatorCompact
                        viewName="daily_sales_summary"
                        onRefreshComplete={onRefresh}
                    />
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" data-guide="revenue-stats">
                <div className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <DollarSign size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Revenus</span>
                    </div>
                    <AnimatedCounter value={todayTotal} className="text-xl font-black text-gray-900" />
                    <p className="text-[10px] text-gray-500 font-medium truncate mt-1">{formatPrice(todayTotal)} net</p>
                </div>

                <div className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <ShoppingCart size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Ventes</span>
                    </div>
                    <AnimatedCounter value={salesCount} className="text-xl font-black text-gray-900" />
                    <p className="text-[10px] text-gray-500 font-medium mt-1">{pendingSalesCount} en attente</p>
                </div>

                <div className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                            <Package size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Articles</span>
                    </div>
                    <AnimatedCounter value={totalItems} className="text-xl font-black text-gray-900" />
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Total vendus</p>
                </div>

                <div className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-red-500/60 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-red-50 rounded-lg text-red-600">
                            <AlertTriangle size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Alertes</span>
                    </div>
                    <div className="text-xl font-black text-red-600">{lowStockProducts.length}</div>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Stock critique</p>
                </div>

                <div className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                            <RotateCcw size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Retours</span>
                    </div>
                    <AnimatedCounter value={returnsCount} className="text-xl font-black text-gray-900" />
                    <p className="text-[10px] text-gray-500 font-medium mt-1">{pendingReturnsCount} en attente</p>
                </div>

                <div className="bg-white rounded-[2rem] p-4 shadow-sm border-2 border-brand-primary/60 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Archive size={20} />
                        </div>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Consign.</span>
                    </div>
                    <div className="text-xl font-black text-gray-900">{consignmentsCount}</div>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">Fiches actives</p>
                </div>
            </div>

            {/* Insights Intégrés - Design Premium */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-brand-subtle/5 border-2 border-brand-primary">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                            <TrendingUp size={20} />
                        </div>
                        <h3 className="font-bold text-gray-900">Top produits vendus</h3>
                    </div>
                    {topProductsList.length > 0 ? (
                        <div className="space-y-3">
                            {topProductsList.map((p, i) => (
                                <div key={i} className="flex justify-between items-center group">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold">
                                            {i + 1}
                                        </span>
                                        <span className="text-sm text-gray-700 group-hover:text-amber-600 transition-colors">{p.name}</span>
                                    </div>
                                    <span className="text-sm font-black text-gray-900">
                                        {p.qty} <span className="text-[10px] text-gray-400 font-medium">unités</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <p className="text-sm text-gray-400">Aucune vente enregistrée pour le moment</p>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-red-500/5 border-2 border-red-500/80">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-50 rounded-lg text-red-600">
                            <AlertTriangle size={20} />
                        </div>
                        <h3 className="font-bold text-gray-900">Points de vigilance stock</h3>
                    </div>
                    {lowStockProducts.length > 0 ? (
                        <div className="space-y-3">
                            {lowStockProducts.slice(0, 5).map(p => (
                                <div key={p.id} className="flex justify-between items-center group">
                                    <span className="text-sm text-gray-700 group-hover:text-red-600 transition-colors">{p.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">Restant :</span>
                                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-black">
                                            {allProductsStockInfo[p.id]?.availableStock ?? p.stock}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {lowStockProducts.length > 5 && (
                                <button
                                    onClick={() => navigate('/inventory')}
                                    className="w-full mt-2 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                                >
                                    Voir les {lowStockProducts.length - 5} autres alertes...
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-8 text-center bg-green-50 rounded-xl border border-dashed border-green-200">
                            <p className="text-sm text-green-600 font-medium">✅ Tous vos stocks sont au-dessus des seuils</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Actions rapides - Vision 2026 Premium */}
            <div className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-6 border-2 border-brand-primary shadow-xl shadow-brand-subtle/10 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />

                <div className="relative z-10 text-center md:text-left">
                    <h4 className="text-xl font-black text-brand-dark uppercase tracking-tighter mb-1">Actions de fin de journée</h4>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest opacity-80">Rapport de vente & Clôture sécurisée</p>
                </div>

                <div className="flex flex-row gap-2 sm:gap-3 w-full md:w-auto relative z-10">
                    <EnhancedButton
                        onClick={onExportWhatsApp}
                        variant="success"
                        className="flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-8 py-3 sm:py-4 text-white rounded-2xl font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all border-none uppercase tracking-wider sm:tracking-widest text-[8px] sm:text-[10px]"
                    >
                        <MessageCircle size={14} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                        WhatsApp
                    </EnhancedButton>

                    {!isServerRole && (
                        !cashClosed ? (
                            <EnhancedButton
                                onClick={onCloseCash}
                                loading={isClosingCash}
                                variant="danger"
                                className="flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-8 py-3 sm:py-4 text-white rounded-2xl font-black shadow-lg shadow-red-500/20 active:scale-95 transition-all border-none uppercase tracking-wider sm:tracking-widest text-[8px] sm:text-[10px]"
                            >
                                <Lock size={14} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                                Fermer caisse
                            </EnhancedButton>
                        ) : (
                            <div className="flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-8 py-3 sm:py-4 bg-gray-100 text-gray-400 rounded-2xl font-black border-2 border-gray-200/50 uppercase tracking-wider sm:tracking-widest text-[8px] sm:text-[10px] cursor-not-allowed">
                                <Lock size={14} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                                Caisse fermée
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

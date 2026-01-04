import { useState, useEffect } from 'react';
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingBag,
    ArrowUpRight,
    ArrowDownRight,
    Tag
} from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { useViewport } from '../../hooks/useViewport';
import { PromotionsService } from '../../services/supabase/promotions.service';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { PROMOTIONS_FILTERS, TIME_RANGE_CONFIGS } from '../../config/dateFilters';

export function PromotionsAnalytics() {
    const { currentBar } = useBarContext();
    const { isMobile } = useViewport();
    const { formatPrice } = useCurrencyFormatter();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);

    // ✨ Utiliser le hook de filtrage temporel
    const {
        timeRange,
        setTimeRange,
        startDate,
        endDate,
        periodLabel,
        customRange,
        updateCustomRange,
        isCustom,
        comparison
    } = useDateRangeFilter({
        defaultRange: 'last_30days',
        enableComparison: true  // Pour calculer croissance
    });

    // Charger les stats à chaque changement de période
    useEffect(() => {
        if (currentBar) {
            loadStats();
        }
    }, [currentBar, startDate, endDate]);

    const loadStats = async () => {
        if (!currentBar) return;
        setIsLoading(true);
        try {
            // Période actuelle
            const [globalStats, performanceStats] = await Promise.all([
                PromotionsService.getGlobalStats(currentBar.id, startDate, endDate),
                PromotionsService.getPromotionsPerformance(currentBar.id, startDate, endDate)
            ]);

            // Période précédente (pour comparaison)
            let previousGlobalStats = null;
            if (comparison) {
                previousGlobalStats = await PromotionsService.getGlobalStats(
                    currentBar.id,
                    comparison.previous.startDate,
                    comparison.previous.endDate
                );
            }

            setStats({
                ...globalStats,
                totalUses: globalStats.totalApplications,
                topPromotions: performanceStats,
                // Croissances
                revenueGrowth: calculateGrowth(globalStats.totalRevenue, previousGlobalStats?.totalRevenue),
                usesGrowth: calculateGrowth(globalStats.totalApplications, previousGlobalStats?.totalApplications)
            });
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Calculer le pourcentage de croissance
    const calculateGrowth = (current: number, previous?: number): number => {
        if (!previous || previous === 0) return 0;
        return Math.round(((current - previous) / previous) * 100);
    };

    if (isLoading) {
        return (
            <div className="space-y-6 p-6">
                {/* Header skeleton */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="h-6 w-48 bg-gray-200 rounded-lg animate-pulse mb-2"></div>
                        <div className="h-4 w-32 bg-gray-100 rounded-lg animate-pulse"></div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-9 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
                        ))}
                    </div>
                </div>

                {/* KPI Cards Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
                                <div className="w-12 h-6 bg-gray-100 rounded-full animate-pulse"></div>
                            </div>
                            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-2"></div>
                            <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                    ))}
                </div>

                {/* Table/Cards Skeleton */}
                <div className="bg-white rounded-xl border border-amber-100 shadow-sm">
                    <div className="p-4 border-b border-gray-100">
                        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className={!isMobile ? "overflow-x-auto" : ""}>
                        {!isMobile ? (
                            // Desktop table skeleton
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <th key={i} className="p-4">
                                                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {[1, 2, 3, 4, 5].map((row) => (
                                        <tr key={row}>
                                            {[1, 2, 3, 4, 5].map((col) => (
                                                <td key={col} className="p-4">
                                                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse"></div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            // Mobile cards skeleton
                            <div className="divide-y divide-gray-100">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="p-4 bg-gray-50">
                                        <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-3"></div>
                                        <div className="space-y-2">
                                            {[1, 2, 3, 4].map((j) => (
                                                <div key={j} className="flex justify-between">
                                                    <div className="h-4 w-20 bg-gray-100 rounded animate-pulse"></div>
                                                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse"></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header & Filters */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <BarChart3 className="text-amber-600" />
                        Performance des Promotions
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{periodLabel}</p>
                </div>

                {/* Filtres Pills (comme SalesHistory) */}
                <div className="flex gap-2 overflow-x-auto w-full max-w-full">
                    {PROMOTIONS_FILTERS.map(filter => (
                        <button
                            key={filter}
                            onClick={() => setTimeRange(filter)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${timeRange === filter
                                    ? 'bg-amber-500 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            {TIME_RANGE_CONFIGS[filter].label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Date range personnalisée */}
            {isCustom && (
                <div className="flex gap-2">
                    <input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => updateCustomRange('start', e.target.value)}
                        className="flex-1 p-2 border border-amber-200 rounded-lg bg-white text-sm"
                    />
                    <input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => updateCustomRange('end', e.target.value)}
                        className="flex-1 p-2 border border-amber-200 rounded-lg bg-white text-sm"
                    />
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* CA Généré */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <DollarSign size={20} />
                        </div>
                        {stats?.revenueGrowth !== undefined && stats.revenueGrowth !== 0 && (
                            <GrowthBadge value={stats.revenueGrowth} />
                        )}
                    </div>
                    <p className="text-sm text-gray-500">CA Généré</p>
                    <h4 className="text-2xl font-bold text-gray-800">{formatPrice(stats?.totalRevenue || 0)}</h4>
                </div>

                {/* Utilisations */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <ShoppingBag size={20} />
                        </div>
                        {stats?.usesGrowth !== undefined && stats.usesGrowth !== 0 && (
                            <GrowthBadge value={stats.usesGrowth} />
                        )}
                    </div>
                    <p className="text-sm text-gray-500">Utilisations</p>
                    <h4 className="text-2xl font-bold text-gray-800">{stats?.totalUses || 0}</h4>
                </div>

                {/* Réductions */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-red-50 rounded-lg text-red-600">
                            <Tag size={20} />
                        </div>
                        <span className="text-xs text-gray-400">Total</span>
                    </div>
                    <p className="text-sm text-gray-500">Réductions offertes</p>
                    <h4 className="text-2xl font-bold text-gray-800">{formatPrice(stats?.totalDiscount || 0)}</h4>
                </div>

                {/* Profit Réalisé */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-xs text-gray-400">Net</span>
                    </div>
                    <p className="text-sm text-gray-500">Profit Réalisé</p>
                    <h4 className="text-2xl font-bold text-gray-800">{formatPrice((stats?.totalRevenue || 0) - (stats?.totalDiscount || 0))}</h4>
                </div>

                {/* ROI */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                            <TrendingUp size={20} />
                        </div>
                        <span className="flex items-center text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            ROI
                        </span>
                    </div>
                    <p className="text-sm text-gray-500">Retour sur Invest.</p>
                    <h4 className="text-2xl font-bold text-gray-800">{stats?.roi || 0}%</h4>
                </div>
            </div>

            {/* Top Promotions - Table (Desktop) or Cards (Mobile) */}
            <div className="bg-white rounded-xl border border-amber-100 shadow-sm">
                <div className="p-4 border-b border-gray-100">
                    <h4 className="font-bold text-gray-800">Top Promotions</h4>
                </div>

                {stats?.topPromotions?.length > 0 ? (
                    !isMobile ? (
                        // Desktop Table Layout
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="p-4 font-medium">Promotion</th>
                                        <th className="p-4 font-medium">Utilisations</th>
                                        <th className="p-4 font-medium">CA Généré</th>
                                        <th className="p-4 font-medium">Coût (Réductions)</th>
                                        <th className="p-4 font-medium">Performance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.topPromotions.map((promo: any, index: number) => (
                                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 font-medium text-gray-800">{promo.name}</td>
                                            <td className="p-4 text-gray-600">{promo.uses}</td>
                                            <td className="p-4 text-green-600 font-medium">{formatPrice(promo.revenue)}</td>
                                            <td className="p-4 text-red-500">{formatPrice(promo.discount)}</td>
                                            <td className="p-4">
                                                <div className="w-full bg-gray-100 rounded-full h-2 max-w-[100px]">
                                                    <div
                                                        className="bg-amber-500 h-2 rounded-full"
                                                        style={{ width: `${Math.min(100, (promo.revenue / (stats.totalRevenue || 1)) * 100)}%` }}
                                                    ></div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        // Mobile Card Layout
                        <div className="divide-y divide-gray-100">
                            {stats.topPromotions.map((promo: any, index: number) => (
                                <div key={index} className="p-4 bg-gray-50 border-b border-gray-100 last:border-b-0">
                                    <h5 className="font-bold text-gray-800 mb-3 truncate">{promo.name}</h5>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Utilisations:</span>
                                            <span className="font-semibold text-gray-800">{promo.uses}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">CA Généré:</span>
                                            <span className="font-semibold text-green-600">{formatPrice(promo.revenue)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Coût (Réductions):</span>
                                            <span className="font-semibold text-red-500">{formatPrice(promo.discount)}</span>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-gray-200">
                                            <span className="text-gray-600 text-xs">Performance</span>
                                            <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                                                <div
                                                    className="bg-amber-500 h-2 rounded-full"
                                                    style={{ width: `${Math.min(100, (promo.revenue / (stats.totalRevenue || 1)) * 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    // Empty State
                    <div className="p-8 sm:p-12 text-center">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Tag size={32} className="text-amber-500" />
                        </div>
                        <h5 className="text-lg font-bold text-gray-800 mb-2">Aucune donnée de promotion</h5>
                        <p className="text-gray-500 text-sm mb-1">Aucune promotion n'a généré de ventes</p>
                        <p className="text-gray-400 text-xs">pendant la période {periodLabel.toLowerCase()}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Badge de croissance (+ ou -)
 */
function GrowthBadge({ value }: { value: number }) {
    const isPositive = value > 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const colorClass = isPositive ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';

    return (
        <span className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${colorClass}`}>
            <Icon size={12} className="mr-1" />
            {isPositive ? '+' : ''}{value}%
        </span>
    );
}

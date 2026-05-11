import { useState, useEffect } from 'react';
import {
    BarChart3,
    TrendingUp,
    DollarSign,
    ShoppingBag,
    ArrowUpRight,
    ArrowDownRight,
    Target,
    Zap
} from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { PromotionsService } from '../../services/supabase/promotions.service';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useDateRangeFilter } from '../../hooks/useDateRangeFilter';
import { PROMOTIONS_FILTERS } from '../../config/dateFilters';
import { PeriodFilter } from '../common/filters/PeriodFilter';
import { motion } from 'framer-motion';
import { PromotionsAnalyticsSkeleton } from '../skeletons';

export function PromotionsAnalytics() {
    const { currentBar } = useBarContext();
    const { formatPrice } = useCurrencyFormatter();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);

    const {
        timeRange,
        setTimeRange,
        startDate,
        endDate,
        periodLabel,
        customRange,
        updateCustomRange,
        comparison
    } = useDateRangeFilter({
        defaultRange: 'today',
        enableComparison: true
    });

    useEffect(() => {
        if (currentBar) {
            loadStats();
        }
    }, [currentBar, startDate, endDate]);

    const loadStats = async () => {
        if (!currentBar) return;
        setIsLoading(true);
        try {
            const [globalStats, performanceStats] = await Promise.all([
                PromotionsService.getGlobalStats(currentBar.id, startDate, endDate),
                PromotionsService.getPromotionsPerformance(currentBar.id, startDate, endDate)
            ]);

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
                revenueGrowth: calculateGrowth(globalStats.totalRevenue, previousGlobalStats?.totalRevenue),
                usesGrowth: calculateGrowth(globalStats.totalApplications, previousGlobalStats?.totalApplications)
            });
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const calculateGrowth = (current: number, previous?: number): number => {
        if (!previous || previous === 0) return 0;
        return Math.round(((current - previous) / previous) * 100);
    };

    if (isLoading) {
        return (
            <div className="p-0">
                <PromotionsAnalyticsSkeleton />
            </div>
        );
    }

    const kpis = [
        {
            label: 'Chiffre d\'affaires',
            value: formatPrice(stats?.totalRevenue || 0),
            growth: stats?.revenueGrowth,
            icon: <DollarSign size={20} />,
        },
        {
            label: 'Utilisations',
            value: stats?.totalUses || 0,
            growth: stats?.usesGrowth,
            icon: <ShoppingBag size={20} />,
        },
        {
            label: 'Profit réalisé',
            value: formatPrice(stats?.netProfit || 0),
            subValue: `Marge : ${stats?.marginPercentage || 0}%`,
            icon: <TrendingUp size={20} />,
        },
        {
            label: 'Retour sur invest.',
            value: `${stats?.roi || 0}%`,
            subValue: `Coût : ${formatPrice(stats?.totalCostOfGoods || 0)}`,
            icon: <Target size={20} />,
        }
    ];

    return (
        <div className="space-y-6 p-5 sm:p-8">
            {/* Header & Filter */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-brand-subtle rounded-xl text-brand-primary flex items-center justify-center">
                        <BarChart3 size={18} />
                    </div>
                    <div>
                        <h3 className="text-h3 text-gray-900">Analyse des promotions</h3>
                        <p className="text-caption text-gray-500">{periodLabel}</p>
                    </div>
                </div>

                <div className="w-full lg:w-auto" data-guide="promotions-filters">
                    <PeriodFilter
                        timeRange={timeRange}
                        setTimeRange={setTimeRange}
                        availableFilters={PROMOTIONS_FILTERS}
                        customRange={customRange}
                        updateCustomRange={updateCustomRange}
                        className="w-full lg:w-auto border-none shadow-none space-y-0"
                    />
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.map((kpi, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3"
                    >
                        <div className="w-9 h-9 bg-brand-subtle text-brand-primary rounded-lg flex items-center justify-center flex-shrink-0">
                            {kpi.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-micro text-gray-500">{kpi.label}</p>
                                {kpi.growth !== undefined && <GrowthBadge value={kpi.growth} />}
                            </div>
                            <p className="text-body font-semibold text-gray-900 tabular-nums">{kpi.value}</p>
                            {kpi.subValue && (
                                <p className="text-caption text-brand-primary">{kpi.subValue}</p>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Performance Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h4 className="text-h3 text-gray-900 flex items-center gap-2">
                            <Zap className="text-brand-primary" size={16} />
                            Classement des offres
                        </h4>
                        <p className="text-caption text-gray-500 mt-0.5">Comparaison par rentabilité directe</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {stats?.topPromotions?.length > 0 ? (
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-5 py-3 text-micro text-gray-400">Promotion</th>
                                    <th className="px-5 py-3 text-micro text-gray-400 text-center">Score</th>
                                    <th className="px-5 py-3 text-micro text-gray-400">CA généré</th>
                                    <th className="px-5 py-3 text-micro text-gray-400">Profit net</th>
                                    <th className="px-5 py-3 text-micro text-gray-400">Efficacité</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {stats.topPromotions.map((promo: any, index: number) => (
                                    <tr key={index} className={`transition-colors ${promo.netProfit < 0 ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-gray-50/50'}`}>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-body-sm font-semibold tabular-nums ${promo.netProfit < 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <div className={`text-body-sm font-semibold ${promo.netProfit < 0 ? 'text-red-600' : 'text-gray-900'}`}>{promo.name}</div>
                                                    <div className="text-caption text-gray-400">
                                                        {promo.uses} utilisations{promo.netProfit < 0 && ' · Déficitaire'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full border-2 text-body-sm font-semibold tabular-nums ${promo.netProfit < 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-100 text-gray-900'}`}>
                                                {promo.roi}%
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="text-body-sm font-semibold text-green-600 tabular-nums">{formatPrice(promo.revenue)}</div>
                                            <div className="text-caption text-gray-400 tabular-nums">Coût : {formatPrice(promo.costOfGoods || 0)}</div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className={`text-body-sm font-semibold tabular-nums ${promo.netProfit < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                {formatPrice(promo.netProfit || 0)}
                                            </div>
                                            <div className={`text-caption ${promo.netProfit < 0 ? 'text-red-400' : 'text-brand-primary'}`}>
                                                {promo.netProfit < 0 ? 'Perte' : 'Profit'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(100, Math.max(0, promo.marginPercentage))}%` }}
                                                    className={`h-full rounded-full ${promo.netProfit < 0 ? 'bg-red-400' : 'bg-brand-primary'}`}
                                                />
                                            </div>
                                            <div className={`text-caption ${promo.netProfit < 0 ? 'text-red-500' : 'text-gray-400'} tabular-nums`}>
                                                {Math.round(promo.marginPercentage)}% marge
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="py-16 text-center flex flex-col items-center gap-4">
                            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center border border-dashed border-gray-200">
                                <BarChart3 size={24} className="text-gray-300" />
                            </div>
                            <div>
                                <p className="text-body-sm font-medium text-gray-400">Aucune donnée pour cette période</p>
                                <p className="text-caption text-gray-400 mt-1">Lancez une promotion pour voir les performances ici.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function GrowthBadge({ value }: { value: number }) {
    const isPositive = value > 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const colorClass = isPositive ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200';

    return (
        <span className={`flex items-center gap-0.5 text-caption font-semibold px-2 py-0.5 rounded-full border ${colorClass} tabular-nums`}>
            <Icon size={12} />
            {isPositive ? '+' : ''}{value}%
        </span>
    );
}

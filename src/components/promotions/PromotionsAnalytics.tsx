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
            label: 'Chiffre d\'Affaires',
            value: formatPrice(stats?.totalRevenue || 0),
            growth: stats?.revenueGrowth,
            icon: <DollarSign size={24} />,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            gradient: 'from-emerald-500 to-teal-600'
        },
        {
            label: 'Utilisations',
            value: stats?.totalUses || 0,
            growth: stats?.usesGrowth,
            icon: <ShoppingBag size={24} />,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            gradient: 'from-blue-500 to-indigo-600'
        },
        {
            label: 'Profit Réalisé',
            value: formatPrice(stats?.netProfit || 0),
            subValue: `Marge: ${stats?.marginPercentage || 0}%`,
            icon: <TrendingUp size={24} />,
            color: 'text-brand-primary',
            bg: 'bg-brand-subtle',
            gradient: 'var(--brand-gradient)'
        },
        {
            label: 'Retour sur Invest.',
            value: `${stats?.roi || 0}%`,
            subValue: `Coût: ${formatPrice(stats?.totalCostOfGoods || 0)}`,
            icon: <Target size={24} />,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            gradient: 'from-purple-500 to-fuchsia-600'
        }
    ];

    return (
        <div className="space-y-8 p-6 sm:p-10 bg-slate-50/30">
            {/* Header & Filter Section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-brand-subtle rounded-2xl text-brand-primary border border-brand-subtle shadow-sm">
                            <BarChart3 size={28} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none">Intelligence</h3>
                            <h4 className="text-2xl font-black text-brand-primary uppercase tracking-tighter leading-tight">Promotions</h4>
                        </div>
                    </div>
                    <p className="text-gray-500 font-medium flex items-center flex-wrap gap-2">
                        Analyse des performances pour la période :
                        <span className="px-3 py-1 bg-brand-subtle text-brand-primary rounded-full font-bold text-xs border border-brand-subtle shadow-sm">
                            {periodLabel}
                        </span>
                    </p>
                </div>

                <div className="w-full lg:w-auto bg-white/40 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-brand-subtle" data-guide="promotions-filters">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpis.map((kpi, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative"
                    >
                        {/* Background Decoration */}
                        <div className={`absolute -right-4 -bottom-4 w-24 h-24 ${kpi.bg} opacity-20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500`}></div>

                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <div className={`p-3 ${kpi.bg} ${kpi.color} rounded-2xl group-hover:scale-110 transition-transform transform rotate-3`}>
                                {kpi.icon}
                            </div>
                            {kpi.growth !== undefined && (
                                <GrowthBadge value={kpi.growth} />
                            )}
                        </div>

                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{kpi.label}</p>
                            <h4 className="text-2xl font-black text-gray-900 leading-none mb-2">{kpi.value}</h4>
                            {kpi.subValue && (
                                <p className="text-xs font-bold text-brand-primary/60 uppercase">{kpi.subValue}</p>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Performance Details Card */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl overflow-hidden relative">
                {/* Header Decoration */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--brand-gradient)]"></div>

                <div className="p-8 sm:p-10 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h4 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
                            <Zap className="text-brand-primary" size={20} />
                            Classement des Offres
                        </h4>
                        <p className="text-sm text-gray-400 font-medium mt-1">Comparaison détaillée par rentabilité directe</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Analyse en temps réel</span>
                    </div>
                </div>

                <div className="p-2 sm:p-6">
                    {stats?.topPromotions?.length > 0 ? (
                        <div className="overflow-x-auto ring-1 ring-gray-50 rounded-3xl">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/50 text-gray-400">
                                    <tr>
                                        <th className="p-5 font-black uppercase tracking-widest text-[10px]">Promotion</th>
                                        <th className="p-5 font-black uppercase tracking-widest text-[10px] text-center">Score</th>
                                        <th className="p-5 font-black uppercase tracking-widest text-[10px]">CA Généré</th>
                                        <th className="p-5 font-black uppercase tracking-widest text-[10px]">Profit Net</th>
                                        <th className="p-5 font-black uppercase tracking-widest text-[10px]">Efficacité</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {stats.topPromotions.map((promo: any, index: number) => (
                                        <tr key={index} className="hover:bg-brand-subtle transition-colors group">
                                            <td className="p-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-bold text-gray-400 group-hover:bg-brand-primary group-hover:text-white transition-all">
                                                        {index + 1}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-gray-900 uppercase tracking-tight">{promo.name}</div>
                                                        <div className="text-[10px] text-gray-400 font-bold uppercase">{promo.uses} utilisations</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5 text-center">
                                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-slate-50 font-black text-gray-900 group-hover:border-brand-subtle group-hover:text-brand-primary transition-all">
                                                    {Math.min(99, Math.round((promo.marginPercentage + (promo.uses / 10)) * 1.5))}
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="font-black text-emerald-600 tracking-tight">{formatPrice(promo.revenue)}</div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase">Coût: {formatPrice(promo.costOfGoods || 0)}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="font-black text-gray-900 tracking-tight">{formatPrice(promo.netProfit || 0)}</div>
                                                <div className="flex items-center gap-1 text-[10px] font-black text-brand-primary/60 uppercase">
                                                    ROI {Math.round((promo.netProfit / (promo.costOfGoods || 1)) * 100)}%
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${promo.marginPercentage}%` }}
                                                        className={`h-full bg-gradient-to-r ${promo.marginPercentage >= 30 ? 'from-green-500 to-emerald-600' : 'from-brand-primary to-brand-primary-dark'} rounded-full`}
                                                    ></motion.div>
                                                </div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5">{promo.marginPercentage}% Marge</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-20 text-center flex flex-col items-center gap-6">
                            <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center border-4 border-dashed border-slate-100 text-slate-200">
                                <BarChart3 size={64} />
                            </div>
                            <div>
                                <h5 className="text-xl font-black text-gray-300 uppercase tracking-widest">Le silence règne ici</h5>
                                <p className="text-gray-400 font-medium max-w-xs mx-auto mt-2">Aucune donnée trouvée pour les filtres sélectionnés. Il est temps de lancer une promotion !</p>
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
    const colorClass = isPositive ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100';

    return (
        <span className={`flex items-center text-[10px] font-black px-3 py-1.5 rounded-xl border ${colorClass} shadow-sm uppercase tracking-tighter`}>
            <Icon size={14} className="mr-1" />
            {isPositive ? '+' : ''}{value}%
        </span>
    );
}

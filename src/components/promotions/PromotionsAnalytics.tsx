import { useState, useEffect } from 'react';
import {
    BarChart3,
    TrendingUp,
    DollarSign,
    ShoppingBag,
    ArrowUpRight
} from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { PromotionsService } from '../../services/supabase/promotions.service';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';

export function PromotionsAnalytics() {
    const { currentBar } = useBarContext();
    const { formatPrice } = useCurrencyFormatter();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');

    useEffect(() => {
        if (currentBar) {
            loadStats();
        }
    }, [currentBar, timeRange]);

    const loadStats = async () => {
        if (!currentBar) return;
        setIsLoading(true);
        try {
            const [globalStats, performanceStats] = await Promise.all([
                PromotionsService.getGlobalStats(currentBar.id),
                PromotionsService.getPromotionsPerformance(currentBar.id)
            ]);

            setStats({
                ...globalStats,
                totalUses: globalStats.totalApplications,
                topPromotions: performanceStats
            });
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header & Filters */}
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <BarChart3 className="text-amber-600" />
                    Performance des Promotions
                </h3>
                <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setTimeRange('week')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${timeRange === 'week' ? 'bg-white shadow text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Semaine
                    </button>
                    <button
                        onClick={() => setTimeRange('month')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${timeRange === 'month' ? 'bg-white shadow text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Mois
                    </button>
                    <button
                        onClick={() => setTimeRange('year')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${timeRange === 'year' ? 'bg-white shadow text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Année
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <DollarSign size={20} />
                        </div>
                        <span className="flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                            <ArrowUpRight size={12} className="mr-1" />
                            +12%
                        </span>
                    </div>
                    <p className="text-sm text-gray-500">CA Généré</p>
                    <h4 className="text-2xl font-bold text-gray-800">{formatPrice(stats?.totalRevenue || 0)}</h4>
                </div>

                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <ShoppingBag size={20} />
                        </div>
                        <span className="flex items-center text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                            <ArrowUpRight size={12} className="mr-1" />
                            +8%
                        </span>
                    </div>
                    <p className="text-sm text-gray-500">Utilisations</p>
                    <h4 className="text-2xl font-bold text-gray-800">{stats?.totalUses || 0}</h4>
                </div>

                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-red-50 rounded-lg text-red-600">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-xs text-gray-400">Total</span>
                    </div>
                    <p className="text-sm text-gray-500">Réductions offertes</p>
                    <h4 className="text-2xl font-bold text-gray-800">{formatPrice(stats?.totalDiscount || 0)}</h4>
                </div>

                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                            <BarChart3 size={20} />
                        </div>
                        <span className="flex items-center text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            ROI
                        </span>
                    </div>
                    <p className="text-sm text-gray-500">Retour sur Invest.</p>
                    <h4 className="text-2xl font-bold text-gray-800">{stats?.roi || 0}%</h4>
                </div>
            </div>

            {/* Top Promotions Table */}
            <div className="bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <h4 className="font-bold text-gray-800">Top Promotions</h4>
                </div>
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
                            {stats?.topPromotions?.map((promo: any, index: number) => (
                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-medium text-gray-800">{promo.name}</td>
                                    <td className="p-4 text-gray-600">{promo.uses}</td>
                                    <td className="p-4 text-green-600 font-medium">{formatPrice(promo.revenue)}</td>
                                    <td className="p-4 text-red-500">{formatPrice(promo.discount)}</td>
                                    <td className="p-4">
                                        <div className="w-full bg-gray-100 rounded-full h-2 max-w-[100px]">
                                            <div
                                                className="bg-amber-500 h-2 rounded-full"
                                                style={{ width: `${Math.min(100, (promo.revenue / (stats.totalRevenue || 1)) * 100 * 2)}%` }}
                                            ></div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

import { useState, useMemo } from 'react';
import { DollarSign, Search, ArrowDownToLine, HandCoins, Smartphone, CreditCard } from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useDailyAnalytics } from '../hooks/queries/useAnalyticsQueries';
import { useViewport } from '../hooks/useViewport';
import { PeriodFilter } from './common/filters/PeriodFilter';
import { ACCOUNTING_FILTERS, ACCOUNTING_FILTERS_MOBILE } from '../config/dateFilters';
import type { AccountingPeriodProps } from '../types/dateFilters';

interface RevenueManagerProps {
    period: AccountingPeriodProps;
}

export function RevenueManager({ period }: RevenueManagerProps) {
    const { currentBar } = useBarContext();
    const { isMobile } = useViewport();
    const [searchTerm, setSearchTerm] = useState('');

    // Format price inline to avoid import issues
    const formatPrice = (price: number, hideCurrency: boolean = false) => {
        if (hideCurrency) {
            return new Intl.NumberFormat('fr-FR').format(price);
        }
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(price);
    };

    // Période reçue depuis AccountingPage (source unique de vérité)
    const {
        timeRange,
        setTimeRange,
        startDate,
        endDate,
        periodLabel,
        customRange,
        updateCustomRange
    } = period;

    const { data: rawDailyData, isLoading } = useDailyAnalytics(
        currentBar?.id,
        startDate,
        endDate
    );

    // useDailyAnalytics returns an array of DailySalesSummaryRow
    const dailyDataArray = useMemo(() => {
        if (!rawDailyData) return [];
        return [...rawDailyData].sort((a: any, b: any) =>
            new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()
        );
    }, [rawDailyData]);

    const filteredDays = useMemo(() => {
        if (!searchTerm) return dailyDataArray;
        return dailyDataArray.filter((day: any) => {
            if (!day.sale_date) return false;
            // Convert YYYY-MM-DD to DD-MM-YYYY for intuitive searching
            const [y, m, d] = day.sale_date.split('-');
            const displayDate = `${d}-${m}-${y}`;
            return displayDate.includes(searchTerm);
        });
    }, [dailyDataArray, searchTerm]);

    const totals = useMemo(() => {
        return filteredDays.reduce((acc: any, day: any) => {
            const dayRevenue = day.net_revenue || day.gross_revenue || 0;
            const dayCash = day.cash_revenue || 0;
            const dayMobile = day.mobile_revenue || 0;
            const dayOthers = dayRevenue - dayCash - dayMobile;

            return {
                revenue: acc.revenue + dayRevenue,
                cash: acc.cash + dayCash,
                mobile: acc.mobile + dayMobile,
                card: acc.card + Math.max(0, dayOthers),
            };
        }, { revenue: 0, cash: 0, mobile: 0, card: 0 });
    }, [filteredDays]);

    return (
        <div className="space-y-6">
            {/* Date Filter & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-start">
                <PeriodFilter
                    timeRange={timeRange}
                    setTimeRange={setTimeRange}
                    availableFilters={ACCOUNTING_FILTERS}
                    customRange={customRange}
                    updateCustomRange={updateCustomRange}
                    justify="start"
                    className="flex-none"
                />
                <div className="relative w-full md:flex-1 md:max-w-lg mt-2 md:mt-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher une date (JJ-MM-AAAA)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-brand-subtle rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Recettes', value: totals.revenue, icon: ArrowDownToLine, color: 'text-brand-primary', bg: 'bg-brand-primary/10' },
                    { label: 'Espèces', value: totals.cash, icon: HandCoins, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: 'Mobile Money', value: totals.mobile, icon: Smartphone, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                    { label: 'Carte & Autres', value: totals.card, icon: CreditCard, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                ].map((kpi, idx) => (
                    <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4 hover:-translate-y-1 transition-transform">
                        <div className={`p-3 rounded-xl ${kpi.bg} ${kpi.color}`}>
                            <kpi.icon size={20} />
                        </div>
                        <div>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{kpi.label}</p>
                                {periodLabel && (
                                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                                        {periodLabel}
                                    </p>
                                )}
                            </div>
                            <p className={`text-lg font-bold ${kpi.color === 'text-brand-primary' ? 'text-gray-900' : 'text-gray-700'}`}>
                                {formatPrice(kpi.value)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-accent/20 text-brand-accent rounded-xl">
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Journal des Recettes</h2>
                            <p className="text-sm text-gray-500">Consultez vos revenus détaillés jour par jour</p>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center h-48">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-accent"></div>
                    </div>
                ) : filteredDays.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <DollarSign size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-lg font-medium">Aucune recette sur cette période</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                                    <th className="pb-4 font-medium">Date</th>
                                    <th className="pb-4 font-medium text-center">Espèces</th>
                                    <th className="pb-4 font-medium text-center hidden sm:table-cell">Mobile Money</th>
                                    <th className="pb-4 font-medium text-center hidden sm:table-cell">Carte & Autres</th>
                                    <th className="pb-4 font-medium text-center sm:hidden">Autres moyens</th>
                                    <th className="pb-4 font-medium text-center text-brand-primary">Total Jour</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredDays.map((day: any, idx: number) => (
                                    <tr key={day.sale_date || idx} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="py-2 md:py-4 text-xs md:text-sm font-medium text-gray-900">
                                            {day.sale_date?.split('-').reverse().join('-')}
                                        </td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-gray-600 text-center">{formatPrice(day.cash_revenue || 0, isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-gray-600 text-center hidden sm:table-cell">{formatPrice(day.mobile_revenue || 0, isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-gray-600 text-center hidden sm:table-cell">{formatPrice(Math.max(0, (day.net_revenue || day.gross_revenue || 0) - (day.cash_revenue || 0) - (day.mobile_revenue || 0)), isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-gray-600 text-center sm:hidden">{formatPrice(Math.max(0, (day.net_revenue || day.gross_revenue || 0) - (day.cash_revenue || 0)), isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm font-bold text-gray-900 text-center">{formatPrice(day.net_revenue || day.gross_revenue || 0, false)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

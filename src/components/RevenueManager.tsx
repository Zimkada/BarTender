import { useState, useMemo, useEffect } from 'react';
import { DollarSign, Search, ArrowDownToLine, HandCoins, Smartphone, CreditCard, ChevronDown } from 'lucide-react';
import { useRevenueStats } from '../hooks/useRevenueStats';
import type { RevenueDayBreakdown } from '../hooks/useRevenueStats';
import { useViewport } from '../hooks/useViewport';
import { PeriodFilter } from './common/filters/PeriodFilter';
import { ACCOUNTING_FILTERS } from '../config/dateFilters';
import type { AccountingPeriodProps } from '../types/dateFilters';
import { dateToYYYYMMDD } from '../utils/businessDateHelpers';

interface RevenueManagerProps {
    period: AccountingPeriodProps;
}

export function RevenueManager({ period }: RevenueManagerProps) {
    const { isMobile } = useViewport();
    const [searchTerm, setSearchTerm] = useState('');
    const PAGE_SIZE = 100;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

    // 🔄 V12: Source directe (table sales) au lieu de la vue matérialisée daily_sales_summary
    // Avantage : toujours frais, pas de dépendance au refresh de la mat view
    const {
        netRevenue,
        cashRevenue,
        mobileRevenue,
        cardRevenue,
        days,
        isLoading,
    } = useRevenueStats({
        startDate: dateToYYYYMMDD(startDate),
        endDate: dateToYYYYMMDD(endDate),
    });

    // Reset pagination quand les filtres changent
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchTerm, timeRange, startDate, endDate]);

    const filteredDays = useMemo(() => {
        if (!searchTerm) return days;
        return days.filter((day: RevenueDayBreakdown) => {
            if (!day.sale_date) return false;
            // Convert YYYY-MM-DD to DD-MM-YYYY for intuitive searching
            const [y, m, d] = day.sale_date.split('-');
            const displayDate = `${d}-${m}-${y}`;
            return displayDate.includes(searchTerm);
        });
    }, [days, searchTerm]);

    const totals = useMemo(() => {
        // Si pas de recherche active, utiliser les totaux agrégés (plus précis, inclut offline+transition)
        if (!searchTerm) {
            return {
                revenue: netRevenue,
                cash: cashRevenue,
                mobile: mobileRevenue,
                card: cardRevenue,
            };
        }
        // Sinon, recalculer depuis les jours filtrés
        return filteredDays.reduce((acc, day) => ({
            revenue: acc.revenue + day.net_revenue,
            cash: acc.cash + day.cash_revenue,
            mobile: acc.mobile + day.mobile_revenue,
            card: acc.card + day.card_revenue,
        }), { revenue: 0, cash: 0, mobile: 0, card: 0 });
    }, [searchTerm, filteredDays, netRevenue, cashRevenue, mobileRevenue, cardRevenue]);

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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher une date (JJ-MM-AAAA)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-card border border-brand-subtle rounded-xl text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* KPIs — couleurs brand uniforme + sémantique préservée pour Total Recettes */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total Recettes', value: totals.revenue, icon: ArrowDownToLine, accent: true },
                    { label: 'Espèces', value: totals.cash, icon: HandCoins },
                    { label: 'Mobile Money', value: totals.mobile, icon: Smartphone },
                    { label: 'Carte & Autres', value: totals.card, icon: CreditCard },
                ].map((kpi, idx) => (
                    <div key={idx} className={`bg-card rounded-2xl p-4 shadow-sm border flex items-center gap-3 hover:shadow-md transition-shadow ${kpi.accent ? 'border-brand-primary/30' : 'border-border'}`}>
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center flex-shrink-0">
                            <kpi.icon size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-micro text-muted-foreground">{kpi.label}</p>
                            {periodLabel && (
                                <p className="text-[10px] text-muted-foreground mb-0.5">{periodLabel}</p>
                            )}
                            <p className="text-body font-semibold text-foreground tabular-nums truncate">
                                {formatPrice(kpi.value)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center">
                            <DollarSign size={18} />
                        </div>
                        <div>
                            <h2 className="text-h3 text-foreground">Journal des recettes</h2>
                            <p className="text-body-sm text-muted-foreground">Vos revenus détaillés jour par jour</p>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center h-48">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                    </div>
                ) : filteredDays.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <DollarSign size={48} className="mx-auto text-muted-foreground/40 mb-4" />
                        <p className="text-body-sm">Aucune recette sur cette période</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-micro text-muted-foreground border-b border-border">
                                    <th className="pb-4">Date</th>
                                    <th className="pb-4 text-center">Espèces</th>
                                    <th className="pb-4 text-center hidden sm:table-cell">Mobile Money</th>
                                    <th className="pb-4 text-center hidden sm:table-cell">Carte & Autres</th>
                                    <th className="pb-4 text-center sm:hidden">Autres moyens</th>
                                    <th className="pb-4 text-center text-brand-primary">Total jour</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredDays.slice(0, visibleCount).map((day, idx) => (
                                    <tr key={day.sale_date || idx} className="hover:bg-muted/50 transition-colors group">
                                        <td className="py-2 md:py-4 text-xs md:text-sm font-medium text-foreground">
                                            {day.sale_date?.split('-').reverse().join('-')}
                                        </td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-foreground/70 text-center">{formatPrice(day.cash_revenue, isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-foreground/70 text-center hidden sm:table-cell">{formatPrice(day.mobile_revenue, isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-foreground/70 text-center hidden sm:table-cell">{formatPrice(day.card_revenue, isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm text-foreground/70 text-center sm:hidden">{formatPrice(day.mobile_revenue + day.card_revenue, isMobile)}</td>
                                        <td className="py-2 md:py-4 text-xs md:text-sm font-bold text-foreground text-center">{formatPrice(day.net_revenue, false)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredDays.length > visibleCount && (
                            <div className="flex justify-center pt-4 pb-2">
                                <button
                                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-medium text-foreground/80 hover:bg-muted hover:border-brand-primary/40 transition-all shadow-sm"
                                >
                                    <ChevronDown size={16} />
                                    Voir plus ({filteredDays.length - visibleCount} jours restants)
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

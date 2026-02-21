import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Receipt, Calendar } from 'lucide-react';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { useViewport } from '../../../hooks/useViewport';

interface AccountingKPIsProps {
    viewMode: 'tresorerie' | 'analytique';
    periodLabel?: string;
    data: {
        totalRevenue: number;
        totalOperatingCosts: number;
        operatingProfit: number;
        operatingProfitMargin: number;
        investments: number;
        investmentRate: number;
        // Analytique specific
        previousBalance?: number;
        previousBalanceDetails?: {
            initialBalance: number;
            capitalContributions: number;
            activityResult: number;
        };
        finalBalance?: number;
        totalCosts?: number;
        // Extra KPIs
        revenueGrowth?: number;
        revenuePerServer?: number;
        cashRunway?: number;
    };
}

export const AccountingKPIs: React.FC<AccountingKPIsProps> = ({ viewMode, periodLabel, data }) => {
    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();

    if (viewMode === 'tresorerie') {
        return (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                {/* Operating Profit */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group`}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg transition-transform group-hover:scale-110 ${data.operatingProfit >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                {data.operatingProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                            </div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Bénéfice Opérationnel
                            </h3>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className={`font-mono font-bold tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'} ${data.operatingProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatPrice(data.operatingProfit)}
                        </p>
                        <div className="flex items-center mt-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.operatingProfit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                Marge: {data.operatingProfitMargin.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Total Revenue */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group`}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg group-hover:scale-110 transition-transform">
                                <DollarSign size={20} />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Revenus
                                </h3>
                                {periodLabel && (
                                    <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">
                                        {periodLabel}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className={`font-mono font-bold text-gray-900 tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'}`}>
                            {formatPrice(data.totalRevenue)}
                        </p>
                    </div>
                </div>

                {/* Operating Costs */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group`}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:scale-110 transition-transform">
                                <Receipt size={20} />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Dépenses
                                </h3>
                                {periodLabel && (
                                    <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">
                                        {periodLabel}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className={`font-mono font-bold text-gray-900 tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'}`}>
                            {formatPrice(data.totalOperatingCosts)}
                        </p>
                    </div>
                </div>

                {/* Investments */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group relative overflow-hidden`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:scale-110 transition-transform">
                                <TrendingUp size={20} />
                            </div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Investissements
                            </h3>
                        </div>
                    </div>
                    <div className="flex flex-col relative z-10">
                        <p className={`font-mono font-bold text-gray-900 tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'}`}>
                            {formatPrice(data.investments)}
                        </p>
                        <div className="flex items-center mt-2 gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.investmentRate > 20 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {data.investmentRate.toFixed(1)}% du CA
                            </span>
                            {data.investmentRate > 20 && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                                    ⚠️ Impact
                                </span>
                            )}
                        </div>
                    </div>
                    {/* Decorative Background Element */}
                    <div className="absolute -right-6 -bottom-6 opacity-[0.03] text-purple-600 rotate-12 pointer-events-none">
                        <TrendingUp size={100} />
                    </div>
                </div>
            </div>
        );
    }

    // VUE ANALYTIQUE
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Solde début */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group flex flex-col justify-between`}>
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-gray-50 text-gray-500 rounded-lg group-hover:scale-110 transition-transform">
                                <Calendar size={20} />
                            </div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Solde début
                            </h3>
                        </div>
                        <p className={`font-mono font-bold text-gray-900 tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'}`}>
                            {formatPrice(data.previousBalance || 0)}
                        </p>
                    </div>

                    {/* Détail */}
                    {data.previousBalanceDetails && (
                        <div className={`hidden lg:block mt-4 pt-3 border-t border-gray-100 space-y-2 ${isMobile ? 'text-[9px]' : 'text-[10px]'} font-medium`}>
                            <div className="flex justify-between items-center text-gray-500 relative py-0.5">
                                <div className="absolute left-0 top-1/2 w-1.5 h-1.5 rounded-full bg-gray-300 -translate-y-1/2"></div>
                                <span className="pl-3">Capital initial</span>
                                <span className="font-mono">{formatPrice(data.previousBalanceDetails.initialBalance)}</span>
                            </div>
                            {data.previousBalanceDetails.capitalContributions > 0 && (
                                <div className="flex justify-between items-center text-blue-600 relative py-0.5">
                                    <div className="absolute left-0 top-1/2 w-1.5 h-1.5 rounded-full bg-blue-300 -translate-y-1/2"></div>
                                    <span className="pl-3">Apports capital</span>
                                    <span className="font-mono">+{formatPrice(data.previousBalanceDetails.capitalContributions)}</span>
                                </div>
                            )}
                            {data.previousBalanceDetails.activityResult !== 0 && (
                                <div className={`flex justify-between items-center relative py-0.5 ${data.previousBalanceDetails.activityResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    <div className={`absolute left-0 top-1/2 w-1.5 h-1.5 rounded-full -translate-y-1/2 ${data.previousBalanceDetails.activityResult >= 0 ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                    <span className="pl-3">Résultat activité</span>
                                    <span className="font-mono">{formatPrice(data.previousBalanceDetails.activityResult)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Revenus */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group`}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg group-hover:scale-110 transition-transform">
                            <DollarSign size={20} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Revenus
                            </h3>
                            {periodLabel && (
                                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                                    {periodLabel}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className={`font-mono font-bold text-gray-900 tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'}`}>
                            +{formatPrice(data.totalRevenue)}
                        </p>
                        <p className={`mt-2 text-gray-400 font-medium uppercase tracking-widest ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                            Encaissements
                        </p>
                    </div>
                </div>

                {/* Dépenses */}
                <div className={`bg-white rounded-2xl border border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group`}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:scale-110 transition-transform">
                            <Receipt size={20} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Dépenses
                            </h3>
                            {periodLabel && (
                                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                                    {periodLabel}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <p className={`font-mono font-bold text-gray-900 tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'}`}>
                            -{formatPrice(data.totalCosts || 0)}
                        </p>
                        <p className={`mt-2 text-gray-400 font-medium uppercase tracking-widest ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                            Décaissements
                        </p>
                    </div>
                </div>

                {/* Solde fin */}
                <div className={`bg-white rounded-2xl border-t-[3px] ${data.finalBalance && data.finalBalance >= 0 ? 'border-t-green-500' : 'border-t-red-500'} border-x border-b border-gray-100 ${isMobile ? 'p-4' : 'p-5'} shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group relative overflow-hidden`}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className={`p-2 rounded-lg transition-transform group-hover:scale-110 ${(data.finalBalance || 0) >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {(data.finalBalance || 0) >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        </div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Solde fin
                        </h3>
                    </div>
                    <div className="flex flex-col relative z-10">
                        <p className={`font-mono font-bold tracking-tighter whitespace-nowrap ${isMobile ? 'text-xl' : 'text-2xl lg:text-xl xl:text-2xl'} ${(data.finalBalance || 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatPrice(data.finalBalance || 0)}
                        </p>
                        <p className={`mt-2 text-gray-400 font-medium uppercase tracking-widest ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                            Trésorerie théorique
                        </p>
                    </div>
                    <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none opacity-50 z-0"></div>
                </div>
            </div>

            {/* Secondary KPIs Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between h-full">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Marge Op.</p>
                    <p className={`text-xl font-bold mt-1 ${(data.operatingProfitMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {data.operatingProfitMargin.toFixed(1)}%
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between h-full">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Croissance</p>
                    <p className={`text-xl font-bold mt-1 ${(data.revenueGrowth || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(data.revenueGrowth || 0) >= 0 ? '+' : ''}{data.revenueGrowth?.toFixed(1)}%
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between h-full">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Investissement</p>
                    <p className="text-xl font-bold mt-1 text-purple-600">
                        {data.investmentRate.toFixed(1)}%
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between h-full">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Cash Runway</p>
                    <p className={`text-xl font-bold mt-1 ${(data.cashRunway || 0) >= 1 ? 'text-green-600' : (data.cashRunway || 0) >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                        {(data.cashRunway || 0) > 60 ? '> 5 ans' : `${(data.cashRunway || 0).toFixed(1)} mois`}
                    </p>
                </div>
            </div>
        </div>
    );
};

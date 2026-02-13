import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Receipt, Calendar } from 'lucide-react';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { useViewport } from '../../../hooks/useViewport';

interface AccountingKPIsProps {
    viewMode: 'tresorerie' | 'analytique';
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

export const AccountingKPIs: React.FC<AccountingKPIsProps> = ({ viewMode, data }) => {
    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();

    if (viewMode === 'tresorerie') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Operating Profit */}
                <div className={`bg-gradient-to-br ${data.operatingProfit >= 0
                    ? 'from-green-500 to-emerald-600'
                    : 'from-red-500 to-pink-600'
                    } text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-gray-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        {data.operatingProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Bénéfice Opérationnel
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'} tracking-tight`}>
                        {formatPrice(data.operatingProfit)}
                    </p>
                    <p className={`mt-1 opacity-80 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        Marge: {data.operatingProfitMargin.toFixed(1)}%
                    </p>
                </div>

                {/* Total Revenue */}
                <div className={`bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-blue-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        <DollarSign size={20} />
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Revenus période
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'} tracking-tight`}>
                        {formatPrice(data.totalRevenue)}
                    </p>
                </div>

                {/* Operating Costs */}
                <div className={`bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-amber-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        <Receipt size={20} />
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Dépenses Opérationnelles
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'} tracking-tight`}>
                        {formatPrice(data.totalOperatingCosts)}
                    </p>
                </div>

                {/* Investments */}
                <div className={`bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} relative shadow-lg shadow-purple-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={20} />
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Investissements
                        </p>
                        {data.investmentRate > 20 && (
                            <span className="bg-white/20 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded-full font-bold border border-white/30">
                                ⚠️ ÉLEVÉ
                            </span>
                        )}
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'} tracking-tight`}>
                        {formatPrice(data.investments)}
                    </p>
                    {data.investmentRate > 20 && (
                        <p className={`mt-1 opacity-80 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Impact trésorerie élevé ({data.investmentRate.toFixed(1)}% du CA)
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // VUE ANALYTIQUE
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Solde début */}
                <div className={`bg-gradient-to-br from-gray-600 to-slate-700 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-gray-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        <Calendar size={20} />
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Solde début
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'} tracking-tight`}>
                        {formatPrice(data.previousBalance || 0)}
                    </p>

                    {/* Détail */}
                    {data.previousBalanceDetails && (
                        <div className={`hidden lg:block mt-3 pt-3 border-t border-white/10 space-y-1.5 opacity-90 ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                            <div className="flex justify-between">
                                <span>• Capital initial</span>
                                <span className="font-mono">{formatPrice(data.previousBalanceDetails.initialBalance)}</span>
                            </div>
                            {data.previousBalanceDetails.capitalContributions > 0 && (
                                <div className="flex justify-between text-blue-200">
                                    <span>• Apports capital</span>
                                    <span className="font-mono">+{formatPrice(data.previousBalanceDetails.capitalContributions)}</span>
                                </div>
                            )}
                            {data.previousBalanceDetails.activityResult !== 0 && (
                                <div className={`flex justify-between ${data.previousBalanceDetails.activityResult >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    <span>• Résultat activité</span>
                                    <span className="font-mono">{formatPrice(data.previousBalanceDetails.activityResult)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Revenus */}
                <div className={`bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-blue-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        <DollarSign size={20} />
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Revenus
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'} tracking-tight`}>
                        +{formatPrice(data.totalRevenue)}
                    </p>
                    <p className={`mt-1 opacity-70 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                        Encaissements période
                    </p>
                </div>

                {/* Dépenses */}
                <div className={`bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-amber-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        <Receipt size={20} />
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Dépenses
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'} tracking-tight`}>
                        -{formatPrice(data.totalCosts || 0)}
                    </p>
                    <p className={`mt-1 opacity-70 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                        Décaissements période
                    </p>
                </div>

                {/* Solde fin */}
                <div className={`bg-gradient-to-br ${data.finalBalance && data.finalBalance >= 0
                    ? 'from-green-500 to-emerald-600'
                    : 'from-red-500 to-pink-600'
                    } text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} shadow-lg shadow-gray-200/50`}>
                    <div className="flex items-center gap-2 mb-2">
                        {(data.finalBalance || 0) >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        <p className={`opacity-90 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                            Solde fin
                        </p>
                    </div>
                    <p className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'} tracking-tight`}>
                        {formatPrice(data.finalBalance || 0)}
                    </p>
                    <p className={`mt-1 opacity-80 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                        Trésorerie théorique
                    </p>
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

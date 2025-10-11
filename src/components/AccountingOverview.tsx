import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Package,
  Receipt,
  Users,
  Zap,
  RotateCcw,
  ChevronRight
} from 'lucide-react';
import { useSales } from '../hooks/useSales';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useSupplies } from '../hooks/useSupplies';
import { useExpenses } from '../hooks/useExpenses';
import { useSalaries } from '../hooks/useSalaries';
import { useReturns } from '../hooks/useReturns';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { getWeekRange, getMonthRange } from '../utils/accounting';
import { useViewport } from '../hooks/useViewport';

type PeriodType = 'week' | 'month';

export function AccountingOverview() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();

  if (!currentBar || !currentSession) return null;

  const { sales } = useSales(currentBar.id);
  const { supplies } = useSupplies(currentBar.id);
  const expensesHook = useExpenses(currentBar.id);
  const salariesHook = useSalaries(currentBar.id);
  const { returns } = useReturns(currentBar.id);

  const [periodType, setPeriodType] = useState<PeriodType>('month');

  // Calculate period range
  const { start: periodStart, end: periodEnd } = useMemo(() => {
    return periodType === 'week' ? getWeekRange() : getMonthRange();
  }, [periodType]);

  // Calculate sales revenue
  const salesRevenue = useMemo(() => {
    return sales
      .filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate >= periodStart && saleDate <= periodEnd;
      })
      .reduce((sum, sale) => sum + sale.total, 0);
  }, [sales, periodStart, periodEnd]);

  // Calculate returns refunds
  const returnsRefunds = useMemo(() => {
    return returns
      .filter(ret => {
        const retDate = new Date(ret.returnedAt);
        return retDate >= periodStart && retDate <= periodEnd && ret.isRefunded;
      })
      .reduce((sum, ret) => sum + ret.refundAmount, 0);
  }, [returns, periodStart, periodEnd]);

  // Calculate supply costs
  const supplyCosts = useMemo(() => {
    return supplies
      .filter(supply => {
        const supplyDate = new Date(supply.date);
        return supplyDate >= periodStart && supplyDate <= periodEnd;
      })
      .reduce((sum, supply) => sum + supply.totalCost, 0);
  }, [supplies, periodStart, periodEnd]);

  // Calculate expenses
  const expensesCosts = expensesHook.getTotalExpenses(periodStart, periodEnd);

  // Calculate salaries
  const salariesCosts = salariesHook.getTotalSalaries(periodStart, periodEnd);

  // CALCULATIONS
  const totalRevenue = salesRevenue - returnsRefunds; // CA NET = Ventes - Retours remboursés
  const totalCosts = supplyCosts + expensesCosts + salariesCosts;
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const periodLabel = periodType === 'week' ? 'cette semaine' : 'ce mois';

  return (
    <div className={`${isMobile ? 'p-3 space-y-3' : 'p-6 space-y-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
            📊 Vue d'ensemble Comptable
          </h2>
          <p className={`text-gray-600 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {currentBar.name}
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg w-fit">
        {(['week', 'month'] as PeriodType[]).map(type => (
          <button
            key={type}
            onClick={() => setPeriodType(type)}
            className={`px-4 py-2 rounded-md transition-colors ${isMobile ? 'text-sm' : ''} ${
              periodType === type
                ? 'bg-orange-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'week' ? 'Semaine' : 'Mois'}
          </button>
        ))}
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Profit */}
        <div className={`bg-gradient-to-br ${
          netProfit >= 0
            ? 'from-green-500 to-emerald-600'
            : 'from-red-500 to-pink-600'
        } text-white rounded-xl p-4 md:col-span-1`}>
          <div className="flex items-center gap-2 mb-2">
            {netProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Bénéfice NET {periodLabel}
            </p>
          </div>
          <p className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'}`}>
            {formatPrice(netProfit)}
          </p>
          <p className={`mt-1 opacity-80 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            Marge: {profitMargin.toFixed(1)}%
          </p>
        </div>

        {/* Total Revenue */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={20} />
            <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Revenus totaux
            </p>
          </div>
          <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            {formatPrice(totalRevenue)}
          </p>
        </div>

        {/* Total Costs */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Receipt size={20} />
            <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Coûts totaux
            </p>
          </div>
          <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            {formatPrice(totalCosts)}
          </p>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
            💰 Détail des revenus
          </h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Zap className="text-green-600" size={20} />
              </div>
              <div>
                <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                  Ventes
                </p>
                <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Entrées de caisse
                </p>
              </div>
            </div>
            <span className={`font-bold text-green-600 ${isMobile ? 'text-sm' : ''}`}>
              +{formatPrice(salesRevenue)}
            </span>
          </div>
        </div>
      </div>

      {/* Costs Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
            💸 Détail des coûts
          </h3>
        </div>
        <div className="p-4 space-y-3">
          {/* Supplies */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Package className="text-purple-600" size={20} />
              </div>
              <div>
                <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                  Approvisionnements
                </p>
                <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Achat de stock
                </p>
              </div>
            </div>
            <span className={`font-bold text-purple-600 ${isMobile ? 'text-sm' : ''}`}>
              -{formatPrice(supplyCosts)}
            </span>
          </div>

          {/* Expenses */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Receipt className="text-red-600" size={20} />
              </div>
              <div>
                <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                  Dépenses
                </p>
                <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Eau, électricité, etc.
                </p>
              </div>
            </div>
            <span className={`font-bold text-red-600 ${isMobile ? 'text-sm' : ''}`}>
              -{formatPrice(expensesCosts)}
            </span>
          </div>

          {/* Salaries */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="text-blue-600" size={20} />
              </div>
              <div>
                <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                  Salaires
                </p>
                <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Paiements équipe
                </p>
              </div>
            </div>
            <span className={`font-bold text-blue-600 ${isMobile ? 'text-sm' : ''}`}>
              -{formatPrice(salariesCosts)}
            </span>
          </div>

          {/* Returns */}
          {returnsRefunds > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <RotateCcw className="text-amber-600" size={20} />
                </div>
                <div>
                  <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                    Remboursements
                  </p>
                  <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    Retours clients
                  </p>
                </div>
              </div>
              <span className={`font-bold text-amber-600 ${isMobile ? 'text-sm' : ''}`}>
                -{formatPrice(returnsRefunds)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Period Info */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <Calendar className="text-blue-500 flex-shrink-0" size={20} />
          <div className="flex-1">
            <p className={`font-medium text-blue-800 ${isMobile ? 'text-sm' : ''}`}>
              Période: {periodType === 'week' ? 'Semaine' : 'Mois'} en cours
            </p>
            <p className={`mt-1 text-blue-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Du {periodStart.toLocaleDateString('fr-FR')} au {periodEnd.toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
      </div>

      {/* Analysis */}
      {netProfit < 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <TrendingDown className="text-red-500 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className={`font-medium text-red-800 ${isMobile ? 'text-sm' : ''}`}>
                ⚠️ Période déficitaire
              </p>
              <p className={`mt-1 text-red-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Les coûts dépassent les revenus. Analysez vos dépenses et optimisez vos approvisionnements.
              </p>
            </div>
          </div>
        </div>
      )}

      {netProfit > 0 && profitMargin > 30 && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <TrendingUp className="text-green-500 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className={`font-medium text-green-800 ${isMobile ? 'text-sm' : ''}`}>
                ✅ Excellente rentabilité
              </p>
              <p className={`mt-1 text-green-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Votre marge bénéficiaire de {profitMargin.toFixed(1)}% est très bonne. Continuez ainsi!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

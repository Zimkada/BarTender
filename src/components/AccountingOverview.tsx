import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Receipt,
  Users,
  Zap,
  RotateCcw,
  ChevronDown,
  ChevronUp
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
  const { supplies } = useSupplies();
  const expensesHook = useExpenses(currentBar.id);
  const salariesHook = useSalaries(currentBar.id);
  const { returns: allReturns, getReturnsByBar } = useReturns();

  // Filter returns by current bar
  const returns = useMemo(() => {
    return getReturnsByBar(currentBar.id);
  }, [allReturns, currentBar.id, getReturnsByBar]);

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [expensesExpanded, setExpensesExpanded] = useState(false);

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
    const filtered = returns.filter(ret => {
      const retDate = new Date(ret.returnedAt);
      // Seulement retours approuvés/restockés (pas pending ni rejected)
      if (ret.status !== 'approved' && ret.status !== 'restocked') return false;
      // Seulement retours remboursés
      if (!ret.isRefunded) return false;
      // Dans la période
      return retDate >= periodStart && retDate <= periodEnd;
    });

    console.log('🔍 [AccountingOverview] Returns Analysis:', {
      totalReturns: returns.length,
      filteredReturns: filtered.length,
      returnsRefunds: filtered.reduce((sum, ret) => sum + ret.refundAmount, 0),
      returns: filtered.map(r => ({
        id: r.id.substring(0, 8),
        status: r.status,
        isRefunded: r.isRefunded,
        refundAmount: r.refundAmount,
        date: new Date(r.returnedAt).toLocaleDateString('fr-FR')
      }))
    });

    return filtered.reduce((sum, ret) => sum + ret.refundAmount, 0);
  }, [returns, periodStart, periodEnd]);

  // Calculate expenses (ALL categories including 'supply')
  const expensesCosts = useMemo(() => {
    return expensesHook.expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= periodStart && expDate <= periodEnd;
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [expensesHook.expenses, periodStart, periodEnd]);

  // Get expenses breakdown by category (for detailed view)
  const expensesByCategory = useMemo(() => {
    return expensesHook.getExpensesByCategory(periodStart, periodEnd);
  }, [expensesHook, periodStart, periodEnd]);

  // Calculate salaries
  const salariesCosts = salariesHook.getTotalSalaries(periodStart, periodEnd);

  // CALCULATIONS
  const totalRevenue = salesRevenue - returnsRefunds; // CA NET = Ventes - Retours remboursés
  const totalCosts = expensesCosts + salariesCosts; // Coûts = Dépenses (incluant approvisionnements) + Salaires
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
          {/* Sales Revenue */}
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

          {/* Returns Refunds */}
          {returnsRefunds > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <RotateCcw className="text-red-600" size={20} />
                </div>
                <div>
                  <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                    Retours remboursés
                  </p>
                  <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    Déduction revenus
                  </p>
                </div>
              </div>
              <span className={`font-bold text-red-600 ${isMobile ? 'text-sm' : ''}`}>
                -{formatPrice(returnsRefunds)}
              </span>
            </div>
          )}

          {/* Net Revenue Line */}
          {returnsRefunds > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <p className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                  Revenus NET
                </p>
                <span className={`font-bold text-blue-600 ${isMobile ? 'text-base' : 'text-lg'}`}>
                  {formatPrice(totalRevenue)}
                </span>
              </div>
            </div>
          )}
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
          {/* Expenses with sub-categories */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Main Expenses Row */}
            <div
              onClick={() => setExpensesExpanded(!expensesExpanded)}
              className="flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Receipt className="text-red-600" size={20} />
                </div>
                <div>
                  <p className={`font-medium text-gray-800 ${isMobile ? 'text-sm' : ''}`}>
                    Dépenses
                  </p>
                  <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    Approvisionnements, eau, électricité...
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-red-600 ${isMobile ? 'text-sm' : ''}`}>
                  -{formatPrice(expensesCosts)}
                </span>
                {expensesExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {/* Sub-categories (expandable) */}
            {expensesExpanded && Object.keys(expensesByCategory).length > 0 && (
              <div className="bg-white border-t border-gray-200">
                {Object.entries(expensesByCategory).map(([key, data]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className={isMobile ? 'text-base' : 'text-lg'}>{data.icon}</span>
                      <div>
                        <p className={`text-gray-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          {data.label}
                        </p>
                        <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs'}`}>
                          {data.count} transaction{data.count > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-red-600 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      -{formatPrice(data.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
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

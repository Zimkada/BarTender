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
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CalendarDays
} from 'lucide-react';
import { useSales } from '../hooks/useSales';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useSupplies } from '../hooks/useSupplies';
import { useExpenses } from '../hooks/useExpenses';
import { useSalaries } from '../hooks/useSalaries';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';

type PeriodType = 'week' | 'month' | 'custom';

export function AccountingOverview() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();

  const { sales } = useSales(currentBar?.id);
  const { supplies } = useSupplies();
  const expensesHook = useExpenses(currentBar?.id);
  const salariesHook = useSalaries(currentBar?.id);
  const { returns } = useAppContext(); // ✅ Use returns from AppContext (same source as ReturnsSystem)

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = current, -1 = previous, +1 = next
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'tresorerie' | 'analytique'>('tresorerie');

  if (!currentBar || !currentSession) return null;

  // Calculate period range based on type and offset
  const { start: periodStart, end: periodEnd } = useMemo(() => {
    const today = new Date();

    if (periodType === 'custom' && customDateRange.start && customDateRange.end) {
      const start = new Date(customDateRange.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customDateRange.end);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (periodType === 'week') {
      // Calcul semaine calendaire (Lundi-Dimanche)
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + (periodOffset * 7));

      const currentDay = targetDate.getDay();
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;

      const monday = new Date(targetDate);
      monday.setDate(targetDate.getDate() - daysFromMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return { start: monday, end: sunday };
    }

    if (periodType === 'month') {
      // Calcul mois calendrier (1er - dernier jour)
      const targetDate = new Date(today.getFullYear(), today.getMonth() + periodOffset, 1);

      const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      firstDay.setHours(0, 0, 0, 0);

      const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
      lastDay.setHours(23, 59, 59, 999);

      return { start: firstDay, end: lastDay };
    }

    // Fallback (should not happen)
    return { start: today, end: today };
  }, [periodType, periodOffset, customDateRange]);

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
        // Seulement retours approuvés/restockés (pas pending ni rejected)
        if (ret.status !== 'approved' && ret.status !== 'restocked') return false;
        // Seulement retours remboursés
        if (!ret.isRefunded) return false;
        // Dans la période
        return retDate >= periodStart && retDate <= periodEnd;
      })
      .reduce((sum, ret) => sum + ret.refundAmount, 0);
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

  // CALCULATIONS - Period
  const totalRevenue = salesRevenue - returnsRefunds; // CA NET = Ventes - Retours remboursés
  const totalCosts = expensesCosts + salariesCosts; // Coûts = Dépenses (incluant approvisionnements) + Salaires
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // CALCULATIONS - Cumulative Balance (for Vue Analytique)
  // Calculate all revenues and costs BEFORE the current period start
  const previousBalance = useMemo(() => {
    if (viewMode === 'tresorerie') return 0; // Not used in tresorerie view

    // Sum all sales before period
    const previousSales = sales
      .filter(sale => new Date(sale.date) < periodStart)
      .reduce((sum, sale) => sum + sale.total, 0);

    // Sum all returns before period
    const previousReturns = returns
      .filter(ret => {
        if (ret.status !== 'approved' && ret.status !== 'restocked') return false;
        if (!ret.isRefunded) return false;
        return new Date(ret.returnedAt) < periodStart;
      })
      .reduce((sum, ret) => sum + ret.refundAmount, 0);

    // Sum all expenses before period
    const previousExpenses = expensesHook.expenses
      .filter(exp => new Date(exp.date) < periodStart)
      .reduce((sum, exp) => sum + exp.amount, 0);

    // Sum all salaries before period
    const previousSalaries = salariesHook.salaries
      .filter(sal => new Date(sal.paidAt) < periodStart)
      .reduce((sum, sal) => sum + sal.amount, 0);

    const previousRevenue = previousSales - previousReturns;
    const previousCosts = previousExpenses + previousSalaries;

    return previousRevenue - previousCosts;
  }, [viewMode, sales, returns, expensesHook.expenses, salariesHook.salaries, periodStart]);

  // Final balance (for Vue Analytique)
  const finalBalance = previousBalance + netProfit;

  // Period label generation
  const periodLabel = useMemo(() => {
    if (periodType === 'custom') {
      if (!customDateRange.start || !customDateRange.end) return 'Personnalisé';
      const start = new Date(customDateRange.start);
      const end = new Date(customDateRange.end);
      return `${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }

    if (periodType === 'week') {
      const start = periodStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const end = periodEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${start} - ${end}`;
    }

    if (periodType === 'month') {
      return periodStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }

    return '';
  }, [periodType, periodStart, periodEnd, customDateRange]);

  // Navigation handlers
  const handlePreviousPeriod = () => {
    if (periodType === 'custom') return; // No navigation in custom mode
    setPeriodOffset(prev => prev - 1);
  };

  const handleNextPeriod = () => {
    if (periodType === 'custom') return;
    setPeriodOffset(prev => prev + 1);
  };

  const handleToday = () => {
    setPeriodOffset(0);
    if (periodType === 'custom') {
      setPeriodType('month'); // Switch to month view when clicking "Aujourd'hui"
      setCustomDateRange({ start: '', end: '' });
    }
  };

  const handlePeriodTypeChange = (type: PeriodType) => {
    setPeriodType(type);
    setPeriodOffset(0); // Reset to current period
    if (type !== 'custom') {
      setCustomDateRange({ start: '', end: '' });
    }
  };

  return (
    <div className={`${isMobile ? 'p-3 space-y-3' : 'p-6 space-y-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
            📊 Vue d'ensemble Comptable
          </h2>
          <p className={`text-gray-600 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {currentBar?.name}
          </p>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('tresorerie')}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} ${
              viewMode === 'tresorerie'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <DollarSign size={16} />
            Trésorerie
          </button>
          <button
            onClick={() => setViewMode('analytique')}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} ${
              viewMode === 'analytique'
                ? 'bg-purple-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <TrendingUp size={16} />
            Analytique
          </button>
        </div>
      </div>

      {/* Period Type Selector */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-100 p-1 rounded-lg w-fit">
        {(['week', 'month', 'custom'] as PeriodType[]).map(type => (
          <button
            key={type}
            onClick={() => handlePeriodTypeChange(type)}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} ${
              periodType === type
                ? 'bg-orange-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'custom' && <CalendarDays size={16} />}
            {type === 'week' ? 'Semaine' : type === 'month' ? 'Mois' : 'Personnalisé'}
          </button>
        ))}
      </div>

      {/* Custom Date Range Pickers (only when custom selected) */}
      {periodType === 'custom' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className={`text-gray-700 font-medium mb-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            Sélectionner la période
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="flex-1 w-full">
              <label className="block text-xs text-gray-600 mb-1">Date début</label>
              <input
                type="date"
                value={customDateRange.start}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs text-gray-600 mb-1">Date fin</label>
              <input
                type="date"
                value={customDateRange.end}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Period Navigation */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-2">
        <button
          onClick={handlePreviousPeriod}
          disabled={periodType === 'custom'}
          className={`p-2 rounded-lg transition-colors ${
            periodType === 'custom'
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:bg-gray-100 active:scale-95'
          }`}
          title="Période précédente"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 text-center">
          <p className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
            {periodLabel}
          </p>
        </div>

        <button
          onClick={handleNextPeriod}
          disabled={periodType === 'custom'}
          className={`p-2 rounded-lg transition-colors ${
            periodType === 'custom'
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:bg-gray-100 active:scale-95'
          }`}
          title="Période suivante"
        >
          <ChevronRight size={20} />
        </button>

        <button
          onClick={handleToday}
          className="ml-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors active:scale-95 flex items-center gap-1 text-sm"
          title="Revenir à aujourd'hui"
        >
          <Calendar size={16} />
          {!isMobile && <span>Aujourd'hui</span>}
        </button>
      </div>

      {/* Main Stats */}
      {viewMode === 'tresorerie' ? (
        // VUE TRÉSORERIE : 3 cards classiques
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
                Bénéfice NET période
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
                Revenus période
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
                Dépenses période
              </p>
            </div>
            <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              {formatPrice(totalCosts)}
            </p>
          </div>
        </div>
      ) : (
        // VUE ANALYTIQUE : 4 cards avec solde début/fin
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Solde début période */}
          <div className="bg-gradient-to-br from-gray-500 to-slate-600 text-white rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={20} />
              <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Solde début
              </p>
            </div>
            <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              {formatPrice(previousBalance)}
            </p>
            <p className={`mt-1 opacity-70 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
              Report périodes antérieures
            </p>
          </div>

          {/* Revenus période */}
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={20} />
              <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Revenus
              </p>
            </div>
            <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              + {formatPrice(totalRevenue)}
            </p>
            <p className={`mt-1 opacity-70 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
              Encaissements période
            </p>
          </div>

          {/* Dépenses période */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={20} />
              <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Dépenses
              </p>
            </div>
            <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              - {formatPrice(totalCosts)}
            </p>
            <p className={`mt-1 opacity-70 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
              Décaissements période
            </p>
          </div>

          {/* Solde fin période (final balance) */}
          <div className={`bg-gradient-to-br ${
            finalBalance >= 0
              ? 'from-green-500 to-emerald-600'
              : 'from-red-500 to-pink-600'
          } text-white rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-2">
              {finalBalance >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Solde fin
              </p>
            </div>
            <p className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'}`}>
              {formatPrice(finalBalance)}
            </p>
            <p className={`mt-1 opacity-80 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
              Rentabilité globale
            </p>
          </div>
        </div>
      )}

      {/* Revenue Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
            💰 Détail des revenus
          </h3>
        </div>
        <div className="p-4 space-y-3">
          {/* Sales Revenue (NET after returns) */}
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
                  Entrées de caisse nettes
                </p>
              </div>
            </div>
            <span className={`font-bold text-green-600 ${isMobile ? 'text-sm' : ''}`}>
              +{formatPrice(totalRevenue)}
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
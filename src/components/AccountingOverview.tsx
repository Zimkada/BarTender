import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Receipt,
  PlusCircle,
  X,
  Download
} from 'lucide-react';
import { PeriodFilter } from './common/filters/PeriodFilter';
import { Select } from './ui/Select';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { EXPENSE_CATEGORY_LABELS } from '../hooks/useExpenses';
import { useSalaries } from '../hooks/useSalaries';
import { useInitialBalance } from '../hooks/useInitialBalance';
import { useCapitalContributions } from '../hooks/useCapitalContributions';
import { useStockManagement } from '../hooks/useStockManagement';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
// Lazy load charts to reduce initial bundle size (saves ~110 KB gzipped)
const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'));

import { AnalyticsService, DailySalesSummary, ExpensesSummary, SalariesSummary } from '../services/supabase/analytics.service';
import { DataFreshnessIndicatorCompact } from './DataFreshnessIndicator';
import { useDateRangeFilter } from '../hooks/useDateRangeFilter';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { useUnifiedExpenses } from '../hooks/pivots/useUnifiedExpenses';
import { ACCOUNTING_FILTERS, TIME_RANGE_CONFIGS } from '../config/dateFilters';
import type { Return, Supply, Expense, Salary, Consignment } from '../types';

export function AccountingOverview() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();

  // ✨ Utiliser le hook de filtrage temporel
  const {
    timeRange,
    setTimeRange,
    startDate: periodStart,
    endDate: periodEnd,
    customRange,
    updateCustomRange,
    periodLabel,
  } = useDateRangeFilter({
    defaultRange: 'this_month'
  });

  // ✅ Utiliser les Smart Hooks Élite pour les finances unifiées
  const { sales: unifiedSales } = useUnifiedSales(currentBar?.id);
  const { expenses: unifiedExpenses } = useUnifiedExpenses(currentBar?.id);

  const salariesHook = useSalaries(currentBar?.id || '');
  const initialBalanceHook = useInitialBalance(currentBar?.id);
  const capitalContributionsHook = useCapitalContributions(currentBar?.id);
  const { consignments } = useStockManagement();
  const { returns, customExpenseCategories } = useAppContext();

  // ✨ Filtrage Centralisé Local des données unifiées
  const filteredSales = useMemo(() => {
    return unifiedSales.filter(s => {
      const saleDate = (s as any).businessDate || (s as any).createdAt || new Date();
      const date = new Date(saleDate);
      return date >= periodStart && date <= periodEnd;
    });
  }, [unifiedSales, periodStart, periodEnd]);

  const filteredExpenses = useMemo(() => {
    return unifiedExpenses.filter(e => {
      return e.date >= periodStart && e.date <= periodEnd;
    });
  }, [unifiedExpenses, periodStart, periodEnd]);

  // ✨ Calcul des KPIs Financiers Unifiés
  const totalRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.total, 0);
  }, [filteredSales]);

  const totalCosts = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const [viewMode, setViewMode] = useState<'tresorerie' | 'analytique'>('tresorerie');
  const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false);
  const [initialBalanceForm, setInitialBalanceForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: 'Solde initial',
  });

  const [showCapitalContributionModal, setShowCapitalContributionModal] = useState(false);
  const [capitalContributionForm, setCapitalContributionForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    source: 'owner' as import('../types').CapitalSource,
    sourceDetails: '',
  });

  // Analytics State (pour les données NON-REVENU)
  const [prevPeriodStats, setPrevPeriodStats] = useState<DailySalesSummary[]>([]);
  const [chartStats, setChartStats] = useState<DailySalesSummary[]>([]);
  const [historicalRevenue, setHistoricalRevenue] = useState(0);
  const [chartExpenses, setChartExpenses] = useState<ExpensesSummary[]>([]);
  const [chartSalaries, setChartSalaries] = useState<SalariesSummary[]>([]);

  // Load ancillary analytics data (everything except current period revenue)
  useEffect(() => {
    if (currentBar && periodStart && periodEnd) {
      loadAncillaryAnalyticsData();
    }
  }, [currentBar, periodStart, periodEnd]);

  const loadAncillaryAnalyticsData = async () => {
    if (!currentBar) return;
    // isAnalyticsLoading is now handled by useRevenueStats
    try {
      // Previous Period Stats (for Growth)
      const prevPeriodDate = new Date(periodStart);
      prevPeriodDate.setMonth(prevPeriodDate.getMonth() - 1);
      const prevStart = new Date(prevPeriodDate.getFullYear(), prevPeriodDate.getMonth(), 1);
      const prevEnd = new Date(prevPeriodDate.getFullYear(), prevPeriodDate.getMonth() + 1, 0);
      const prev = await AnalyticsService.getDailySummary(currentBar.id, prevStart, prevEnd, 'day');
      setPrevPeriodStats(prev);

      // Chart Stats (12 months)
      const chartStart = new Date();
      chartStart.setMonth(chartStart.getMonth() - 12);
      chartStart.setDate(1);
      const chartEnd = new Date();
      const chartData = await AnalyticsService.getDailySummary(currentBar.id, chartStart, chartEnd, 'month');
      setChartStats(chartData);

      // Historical Revenue (for Balance) - All time up to periodStart
      const historyStart = new Date('2020-01-01'); // Assume start of app usage
      const historyEnd = new Date(periodStart);
      historyEnd.setDate(historyEnd.getDate() - 1);

      // Historical Revenue (for treasury)
      if (historyEnd > historyStart) {
        const history = await AnalyticsService.getRevenueSummary(currentBar.id, historyStart, historyEnd);
        setHistoricalRevenue(history.totalRevenue);
      } else {
        setHistoricalRevenue(0);
      }
      const chartExpensesData = await AnalyticsService.getExpensesSummary(currentBar.id, chartStart, chartEnd, 'month');
      setChartExpenses(chartExpensesData);
      const chartSalariesData = await AnalyticsService.getSalariesSummary(currentBar.id, chartStart, chartEnd, 'month');
      setChartSalaries(chartSalariesData);

    } catch (error) {
      console.error("Error loading ancillary analytics:", error);
    }
  };
  // Indice de fraîcheur (Placeholder unifié)
  const isDataLoading = false;
  // ✨ Calcul des Salaires (Unifié)
  const salariesCosts = useMemo(() => {
    return filteredExpenses
      .filter(e => e.category === 'salary')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // ✨ Calcul des Approvisionnements (Unifié)
  const suppliesCosts = useMemo(() => {
    return filteredExpenses
      .filter(e => e.isSupply)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // ✨ Dépenses Opérationnelles (Unifié - Hors salaires et appro)
  const operatingExpenses = useMemo(() => {
    return filteredExpenses
      .filter(e => !e.isSupply && e.category !== 'investment' && e.category !== 'salary')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // ✨ Investissements (Unifié)
  const investments = useMemo(() => {
    return filteredExpenses
      .filter(e => e.category === 'investment')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // 💎 Indicateurs de Rentabilité Unifiés
  const totalOperatingCosts = useMemo(() => {
    return filteredExpenses
      .filter(e => e.category !== 'investment')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const operatingProfit = totalRevenue - totalOperatingCosts;
  const operatingProfitMargin = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;

  const netProfit = operatingProfit - investments;

  // ✅ Safety checks for NaN
  const safeOperatingProfitMargin = isNaN(operatingProfitMargin) || !isFinite(operatingProfitMargin) ? 0 : operatingProfitMargin;

  // Usage informatif des sous-totaux pour l'export Excel 
  // (On les garde ici pour la clarté mais on les préfixe si inutilisés dans le JSX)
  const _financesUnifiees = { operatingExpenses, suppliesCosts };

  // CALCULATIONS - KPIs and Chart Data
  const {
    revenueGrowth,
    revenuePerServer,
    investmentRate,
    chartData,
  } = useMemo(() => {
    // ✨ Use SQL Net Revenue directly for previous period (DRY)
    const prevTotalRevenue = prevPeriodStats.reduce((sum, day) => sum + (day.net_revenue || 0), 0);

    // 2. KPI Calculations
    const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;

    const serverCount = currentBar?.settings?.serversList?.length || 1;
    const revenuePerServer = serverCount > 0 ? totalRevenue / serverCount : 0;

    const investmentRate = totalRevenue > 0 ? (investments / totalRevenue) * 100 : 0;

    // ✅ Safety checks for NaN in KPIs
    const safeRevenueGrowth = isNaN(revenueGrowth) || !isFinite(revenueGrowth) ? 0 : revenueGrowth;
    const safeRevenuePerServer = isNaN(revenuePerServer) || !isFinite(revenuePerServer) ? 0 : revenuePerServer;
    const safeInvestmentRate = isNaN(investmentRate) || !isFinite(investmentRate) ? 0 : investmentRate;

    // 3. Chart Data (12 months on desktop, 6 months on mobile)
    const monthsToShow = isMobile ? 6 : 12;
    const chartData = Array.from({ length: monthsToShow }).map((_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleString('fr-FR', { month: 'short' });
      const year = date.getFullYear();
      const monthKey = `${month} ${year}`;

      // Find matching stat in chartStats
      // chartStats is grouped by month, so sale_month should match 'YYYY-MM-01'
      // But we need to match carefully.
      // Let's just filter by date range on the client for the few chart points
      // Or better, match by sale_month string if available.
      // The view returns sale_month as date string (start of month).

      const monthStat = chartStats.find(s => {
        const sDate = new Date(s.sale_month);
        return sDate.getFullYear() === year && sDate.getMonth() === date.getMonth();
      });

      // ✨ Use SQL data for revenue (already includes refunds)
      const monthRevenue = monthStat ? (monthStat.net_revenue || 0) : 0;

      // ✨ Find matching expense stat in chartExpenses
      const monthExpenseStat = chartExpenses.find(e => {
        const eDate = new Date(e.expense_month);
        return eDate.getFullYear() === year && eDate.getMonth() === date.getMonth();
      });

      const monthOperatingExpenses = monthExpenseStat ? (monthExpenseStat.operating_expenses || 0) : 0;

      // ✨ Find matching salary stat in chartSalaries
      const monthSalaryStat = chartSalaries.find(s => {
        const sDate = new Date(s.payment_month);
        return sDate.getFullYear() === year && sDate.getMonth() === date.getMonth();
      });

      const monthSalaries = monthSalaryStat ? (monthSalaryStat.total_salaries || 0) : 0;

      return {
        name: monthKey,
        Revenus: monthRevenue,
        'Coûts Opérationnels': monthOperatingExpenses + monthSalaries,
      };
    }).reverse();

    return {
      revenueGrowth: safeRevenueGrowth,
      revenuePerServer: safeRevenuePerServer,
      investmentRate: safeInvestmentRate,
      chartData
    };
  }, [totalRevenue, investments, prevPeriodStats, chartStats, chartExpenses, chartSalaries, currentBar, isMobile, periodStart]);


  // CALCULATIONS - Cumulative Balance (for Vue Analytique)
  // Calculate all revenues and costs BEFORE the current period start
  const previousBalance = useMemo(() => {
    if (viewMode === 'tresorerie') return 0; // Not used in tresorerie view

    // ✅ 1. Start with initial balance (unique)
    const initialBalanceAmount = initialBalanceHook.getInitialBalanceAmount();

    // ✅ 2. Add capital contributions before period
    const previousCapitalContributions = capitalContributionsHook.getTotalContributions(periodStart);

    // 3. Sum all sales before period (Using SQL Stats - NET REVENUE)
    // historicalRevenue is now NET (updated in AnalyticsService)
    const previousRevenue = historicalRevenue;

    // 4. Sum all expenses before period (Unifié)
    const previousExpenses = unifiedExpenses
      .filter(exp => exp.date < periodStart)
      .reduce((sum, exp) => sum + exp.amount, 0);

    // 5. Sum all salaries before period
    const previousSalaries = salariesHook.salaries
      .filter(sal => new Date(sal.paidAt) < periodStart)
      .reduce((sum, sal) => sum + sal.amount, 0);


    const previousCosts = previousExpenses + previousSalaries;

    // ✅ Total = Solde initial + Apports capital + (Revenus - Coûts) des périodes antérieures
    return initialBalanceAmount + previousCapitalContributions + previousRevenue - previousCosts;
  }, [viewMode, unifiedSales, returns, unifiedExpenses, salariesHook.salaries, periodStart, initialBalanceHook.initialBalance, capitalContributionsHook.contributions, historicalRevenue]);

  // Détail du solde de début (pour affichage détaillé dans la carte)
  const previousBalanceDetails = useMemo(() => {
    if (viewMode === 'tresorerie') return { initialBalance: 0, capitalContributions: 0, activityResult: 0 };

    const initialBalanceAmount = initialBalanceHook.getInitialBalanceAmount();
    const previousCapitalContributions = capitalContributionsHook.getTotalContributions(periodStart);

    // 3. Sum all sales before period (Using SQL Stats - NET REVENUE)
    const previousRevenue = historicalRevenue;

    const previousExpenses = unifiedExpenses
      .filter(exp => exp.date < periodStart)
      .reduce((sum, exp) => sum + exp.amount, 0);

    const previousSalaries = salariesHook.salaries
      .filter(sal => new Date(sal.paidAt) < periodStart)
      .reduce((sum, sal) => sum + sal.amount, 0);

    const activityResult = previousRevenue - (previousExpenses + previousSalaries);

    return {
      initialBalance: initialBalanceAmount,
      capitalContributions: previousCapitalContributions,
      activityResult,
    };
  }, [viewMode, unifiedSales, returns, unifiedExpenses, salariesHook.salaries, periodStart, initialBalanceHook.initialBalance, capitalContributionsHook.contributions, historicalRevenue]);

  // Final balance (for Vue Analytique)
  const finalBalance = previousBalance + netProfit;

  // Get expenses breakdown by category (unifié)
  const expensesByCategoryData = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; amount: number; count: number }> = {};

    filteredExpenses.forEach(exp => {
      let key = exp.category;
      if (exp.category === 'custom' && exp.customCategoryId) {
        key = exp.customCategoryId;
      }

      if (!groups[key]) {
        // Import labels if needed or hardcode fallback
        const data = (EXPENSE_CATEGORY_LABELS as any)[exp.category];
        let label = data?.label || exp.category;
        let icon = data?.icon || '📝';

        if (exp.isSupply) {
          label = 'Approvisionnements';
          icon = '📦';
        } else if (exp.category === 'custom' && exp.customCategoryId) {
          const cat = customExpenseCategories.find((c: any) => c.id === exp.customCategoryId);
          label = cat?.name || 'Personnalisée';
          icon = cat?.icon || '📝';
        }

        groups[key] = { label, icon, amount: 0, count: 0 };
      }

      groups[key].amount += exp.amount;
      groups[key].count += 1;
    });

    return groups;
  }, [filteredExpenses, customExpenseCategories]);

  // Cash Runway (Fonds de roulement) - Nombre de mois de couverture
  const cashRunway = useMemo(() => {
    if (totalOperatingCosts <= 0) return 0;
    const result = finalBalance / totalOperatingCosts;
    return isNaN(result) || !isFinite(result) ? 0 : result;
  }, [finalBalance, totalOperatingCosts]);

  if (!currentBar || !currentSession) return null; // MOVED HERE



  // Conditional early return moved here (AFTER all hook declarations)
  if (!currentBar || !currentSession) return null;

  // Initial Balance handlers
  const handleCreateInitialBalance = () => {
    if (!initialBalanceForm.amount || isNaN(parseFloat(initialBalanceForm.amount))) {
      alert('Veuillez saisir un montant valide');
      return;
    }

    try {
      initialBalanceHook.createInitialBalance({
        barId: currentBar!.id,
        amount: parseFloat(initialBalanceForm.amount),
        date: new Date(initialBalanceForm.date),
        description: initialBalanceForm.description || 'Solde initial',
        createdBy: currentSession!.userId,
      });

      // Reset form and close modal
      setInitialBalanceForm({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: 'Solde initial',
      });
      setShowInitialBalanceModal(false);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  // Capital Contribution handlers
  const handleCreateCapitalContribution = () => {
    if (!capitalContributionForm.amount || isNaN(parseFloat(capitalContributionForm.amount))) {
      alert('Veuillez saisir un montant valide');
      return;
    }

    if (parseFloat(capitalContributionForm.amount) <= 0) {
      alert('Le montant doit être positif');
      return;
    }

    capitalContributionsHook.addContribution({
      barId: currentBar!.id,
      amount: parseFloat(capitalContributionForm.amount),
      date: new Date(capitalContributionForm.date),
      description: capitalContributionForm.description || 'Apport de capital',
      source: capitalContributionForm.source,
      sourceDetails: capitalContributionForm.sourceDetails || undefined,
      createdBy: currentSession!.userId,
    });

    // Reset form and close modal
    setCapitalContributionForm({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      source: 'owner',
      sourceDetails: '',
    });
    setShowCapitalContributionModal(false);
  };

  /**
   * ✅ Extended interfaces for Excel export (capture additional DB properties)
   */
  interface ReturnWithQuantity extends Return {
    quantity?: number;
  }

  interface SupplyExtended extends Supply {
    supplierName?: string;
  }

  interface ExpenseExtended {
    id: string;
    amount: number;
    date: Date;
    category: string;
    notes?: string;
    isSupply?: boolean;
    isOptimistic?: boolean;
    productName?: string;
    quantity?: number;
    createdBy: string;
    customCategoryId?: string;
  }

  interface SalaryExtended extends Salary {
    memberName?: string;
    staffName?: string;
  }

  interface ConsignmentExtended extends Consignment {
    totalValue?: number;
    expiredAt?: Date | string;
  }

  // Export comptable complet
  const handleExportAccounting = async () => {
    // Lazy load xlsx library only when export is triggered
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Filtrer les données par période pour l'export (Unifié)
    const exportSales = unifiedSales.filter(sale => {
      const saleObj = sale as any;
      const saleDate = new Date(saleObj.businessDate || saleObj.createdAt || new Date());
      return sale.status === 'validated' && saleDate >= periodStart && saleDate <= periodEnd;
    });

    const exportExpenses = unifiedExpenses.filter(exp => {
      return exp.date >= periodStart && exp.date <= periodEnd;
    });

    const filteredReturns = returns.filter(ret => {
      const retDate = new Date(ret.returnedAt);
      return retDate >= periodStart && retDate <= periodEnd;
    });

    const exportSalaries = exportExpenses.filter(e => e.category === 'salary');
    const salariesActualCosts = exportSalaries.reduce((sum, e) => sum + e.amount, 0);

    const returnsRefunds = filteredReturns.reduce((sum, r) => sum + r.refundAmount, 0);

    // Calculer les coûts unifiés pour l'export
    const suppliesCosts = exportExpenses
      .filter(e => e.isSupply)
      .reduce((sum, e) => sum + e.amount, 0);

    const operatingExpCosts = exportExpenses
      .filter(e => !e.isSupply && e.category !== 'investment' && e.category !== 'salary')
      .reduce((sum, e) => sum + e.amount, 0);

    const investmentCosts = exportExpenses
      .filter(e => e.category === 'investment')
      .reduce((sum, e) => sum + e.amount, 0);

    const currentTotalOperatingCosts = suppliesCosts + operatingExpCosts + salariesActualCosts;
    const currentOperatingProfit = totalRevenue - currentTotalOperatingCosts;
    const currentOperatingProfitMargin = totalRevenue > 0 ? (currentOperatingProfit / totalRevenue) * 100 : 0;
    const currentNetProfit = currentOperatingProfit - investmentCosts;

    // Calculer apports de capital de la période
    const periodCapitalContributions = capitalContributionsHook.contributions.filter(contrib => {
      const contribDate = new Date(contrib.date);
      return contribDate >= periodStart && contribDate <= periodEnd;
    }).reduce((sum, contrib) => sum + contrib.amount, 0);

    // 1. ONGLET RÉSUMÉ
    const summaryData = [
      ['RAPPORT COMPTABLE', currentBar?.name || ''],
      ['PÉRIODE', periodLabel],
      ['DATE EXPORT', new Date().toLocaleDateString('fr-FR')],
      ['Exporté par', currentSession?.userName || ''],
      [],
      ['REVENUS'],
      ['Ventes brutes', totalRevenue + returnsRefunds],
      ['Retours remboursés', -returnsRefunds],
      ['Revenus nets', totalRevenue],
      [],
      ['COÛTS OPÉRATIONNELS'],
      ['Approvisionnements', suppliesCosts],
      ['Dépenses opérationnelles', operatingExpCosts],
      ['Salaires', salariesActualCosts],
      ['Total coûts opérationnels', currentTotalOperatingCosts],
      [],
      ['RÉSULTAT OPÉRATIONNEL'],
      ['Bénéfice opérationnel', currentOperatingProfit],
      ['Marge opérationnelle (%)', currentOperatingProfitMargin.toFixed(2)],
      [],
      ['INVESTISSEMENTS'],
      ['Investissements', investmentCosts],
      ['Taux investissement (%)', (totalRevenue > 0 ? (investmentCosts / totalRevenue * 100) : 0).toFixed(2)],
      [],
      ['RÉSULTAT NET'],
      ['Bénéfice net', currentNetProfit],
      [],
      ['APPORTS DE CAPITAL'],
      ['Apports période', periodCapitalContributions],
      [],
      ['TRÉSORERIE (Vue Analytique)'],
      ['Solde début période', previousBalance],
      ['Solde fin période', finalBalance],
      ['Fonds de roulement (mois)', cashRunway.toFixed(2)],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Résumé');

    // 2. ONGLET VENTES (Unifié)
    const salesData = exportSales.flatMap(sale => {
      const saleObj = sale as any;
      const saleDate = new Date(saleObj.businessDate || saleObj.createdAt || new Date());
      return (sale.items || []).map(item => ({
        Date: saleDate.toLocaleDateString('fr-FR'),
        Heure: saleDate.toLocaleTimeString('fr-FR'),
        'ID Vente': sale.id.slice(0, 8),
        Produit: item.product_name,
        Volume: item.product_volume || '',
        Quantité: item.quantity,
        'Prix unitaire': item.unit_price,
        Total: item.total_price,
        'Créé par': sale.createdBy,
        'Validé par': (sale as any).validatedBy || 'N/A',
        'Statut': sale.status,
      }));
    });
    if (salesData.length > 0) {
      const salesSheet = XLSX.utils.json_to_sheet(salesData);
      XLSX.utils.book_append_sheet(workbook, salesSheet, 'Ventes');
    }

    // 3. ONGLET RETOURS
    const returnsData = filteredReturns.filter(r => r.isRefunded).map(ret => ({
      Date: new Date(ret.returnedAt).toLocaleDateString('fr-FR'),
      Heure: new Date(ret.returnedAt).toLocaleTimeString('fr-FR'),
      'ID Retour': ret.id.slice(0, 8),
      'ID Vente': ret.saleId.slice(0, 8),
      Produit: ret.productName,
      Quantité: -((ret as ReturnWithQuantity).quantity || ret.quantityReturned), // Négatif pour indiquer retours
      'Montant remboursé': ret.refundAmount,
      Motif: ret.reason,
      Statut: ret.status,
      'Remis en stock': ret.autoRestock ? 'Oui' : 'Non',
    }));
    if (returnsData.length > 0) {
      const returnsSheet = XLSX.utils.json_to_sheet(returnsData);
      XLSX.utils.book_append_sheet(workbook, returnsSheet, 'Retours');
    }

    // 4. ONGLET APPROVISIONNEMENTS (Unifié)
    const suppliesData = exportExpenses.filter(e => e.isSupply).map(supply => ({
      Date: supply.date.toLocaleDateString('fr-FR'),
      Produit: supply.productName || 'Approvisionnement',
      Quantité: supply.quantity || 1,
      'Coût total': supply.amount,
      Source: supply.isOptimistic ? 'Offline' : 'Sync',
    }));
    if (suppliesData.length > 0) {
      const suppliesSheet = XLSX.utils.json_to_sheet(suppliesData);
      XLSX.utils.book_append_sheet(workbook, suppliesSheet, 'Approvisionnements');
    }

    // 5. ONGLET DÉPENSES OPÉRATIONNELLES (Unifié)
    const operatingExpensesData = exportExpenses
      .filter(exp => !exp.isSupply && exp.category !== 'investment')
      .map(exp => ({
        Date: exp.date.toLocaleDateString('fr-FR'),
        Catégorie: (EXPENSE_CATEGORY_LABELS as any)[exp.category]?.label || exp.category,
        Description: exp.notes || '',
        Montant: exp.amount,
        Source: exp.isOptimistic ? 'Offline (Attente)' : 'Sync',
      }));
    if (operatingExpensesData.length > 0) {
      const expensesSheet = XLSX.utils.json_to_sheet(operatingExpensesData);
      XLSX.utils.book_append_sheet(workbook, expensesSheet, 'Dépenses Opérationnelles');
    }

    // 6. ONGLET INVESTISSEMENTS (Unifié)
    const investmentsData = exportExpenses
      .filter(exp => exp.category === 'investment')
      .map(exp => ({
        Date: exp.date.toLocaleDateString('fr-FR'),
        Description: exp.notes || '',
        Montant: exp.amount,
        Source: exp.isOptimistic ? 'Offline (Attente)' : 'Sync',
      }));
    if (investmentsData.length > 0) {
      const investmentsSheet = XLSX.utils.json_to_sheet(investmentsData);
      XLSX.utils.book_append_sheet(workbook, investmentsSheet, 'Investissements');
    }

    // 7. ONGLET SALAIRES
    const salariesData = filteredSalaries.map(salary => {
      const salaryExtended = salary as SalaryExtended;
      return {
        Période: salary.period,
        Membre: salaryExtended.memberName || salaryExtended.staffName || 'N/A',
        Montant: salary.amount,
        'Date paiement': new Date(salary.paidAt).toLocaleDateString('fr-FR'),
      };
    });
    if (salariesData.length > 0) {
      const salariesSheet = XLSX.utils.json_to_sheet(salariesData);
      XLSX.utils.book_append_sheet(workbook, salariesSheet, 'Salaires');
    }

    // 8. ONGLET CONSIGNATIONS
    const consignmentsInPeriod = consignments.filter(cons => {
      const consDate = new Date(cons.createdAt);
      return consDate >= periodStart && consDate <= periodEnd;
    });
    if (consignmentsInPeriod.length > 0) {
      const consignmentsData = consignmentsInPeriod.map(cons => {
        const consExtended = cons as ConsignmentExtended;
        return {
          Date: new Date(cons.createdAt).toLocaleDateString('fr-FR'),
          'ID Vente': cons.saleId.slice(0, 8),
          Produit: cons.productName,
          Quantité: cons.quantity,
          'Valeur totale': consExtended.totalValue || cons.totalAmount,
          Client: cons.customerName,
          Téléphone: cons.customerPhone || 'N/A',
          Statut: cons.status === 'active' ? 'Active' :
            cons.status === 'claimed' ? 'Récupérée' :
              cons.status === 'expired' ? 'Expirée' :
                'Confisquée',
          'Date expiration': new Date(cons.expiresAt).toLocaleDateString('fr-FR'),
          'Date récup./expir.': cons.claimedAt ? new Date(cons.claimedAt).toLocaleDateString('fr-FR') :
            consExtended.expiredAt ? new Date(consExtended.expiredAt).toLocaleDateString('fr-FR') :
              'N/A',
        };
      });
      const consignmentsSheet = XLSX.utils.json_to_sheet(consignmentsData);
      XLSX.utils.book_append_sheet(workbook, consignmentsSheet, 'Consignations');
    }

    // 9. ONGLET SOLDE INITIAL (si présent)
    if (initialBalanceHook.initialBalance) {
      const bal = initialBalanceHook.initialBalance;
      const initialBalanceData = [{
        Date: new Date(bal.date).toLocaleDateString('fr-FR'),
        Montant: bal.amount,
        Description: bal.description,
        'Créé par': bal.createdBy,
        'Verrouillé': bal.isLocked ? 'Oui' : 'Non',
      }];
      const initialBalanceSheet = XLSX.utils.json_to_sheet(initialBalanceData);
      XLSX.utils.book_append_sheet(workbook, initialBalanceSheet, 'Solde Initial');
    }

    // 10. ONGLET APPORTS DE CAPITAL
    const filteredCapitalContributions = capitalContributionsHook.contributions.filter(contrib => {
      const contribDate = new Date(contrib.date);
      return contribDate >= periodStart && contribDate <= periodEnd;
    });
    if (filteredCapitalContributions.length > 0) {
      const capitalContributionsData = filteredCapitalContributions.map(contrib => {
        const sourceLabel = contrib.source === 'owner' ? 'Propriétaire' :
          contrib.source === 'partner' ? 'Associé' :
            contrib.source === 'investor' ? 'Investisseur' :
              contrib.source === 'loan' ? 'Prêt bancaire' :
                'Autre';
        return {
          Date: new Date(contrib.date).toLocaleDateString('fr-FR'),
          Montant: contrib.amount,
          Source: sourceLabel,
          'Détails source': contrib.sourceDetails || 'N/A',
          Description: contrib.description,
          'Créé par': contrib.createdBy,
        };
      });
      const capitalContributionsSheet = XLSX.utils.json_to_sheet(capitalContributionsData);
      XLSX.utils.book_append_sheet(workbook, capitalContributionsSheet, 'Apports de Capital');
    }

    // Télécharger le fichier
    const fileName = `Comptabilite_${currentBar?.name.replace(/\s+/g, '_')}_${periodLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className={`${isMobile ? 'p-3 space-y-3 pb-24' : 'p-6 space-y-6'}`}>
      {/* Header */}
      <div className={isMobile ? 'space-y-3' : 'flex items-center justify-between'}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
              📊 Vue d'ensemble Comptable
            </h2>
            <DataFreshnessIndicatorCompact
              viewName="daily_sales_summary"
              onRefreshComplete={loadAncillaryAnalyticsData}
            />
          </div>
          <p className={`text-gray-600 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {currentBar?.name}
          </p>
        </div>

        {/* Actions: Export + Solde initial - Fixed: flex-wrap for small screens */}
        <div className={`flex items-center gap-2 ${isMobile ? 'flex-wrap justify-end' : ''}`}>
          <button
            onClick={handleExportAccounting}
            className={`flex items-center justify-center gap-1 ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'} bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
            title="Exporter rapport comptable"
          >
            <Download size={isMobile ? 16 : 18} />
            {!isMobile && <span>Exporter</span>}
          </button>

          <button
            onClick={() => setShowInitialBalanceModal(true)}
            className={`flex items-center justify-center gap-1 ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'} bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
            title="Définir le solde initial"
          >
            <PlusCircle size={isMobile ? 16 : 18} />
            {!isMobile && <span>Solde initial</span>}
          </button>

          <button
            onClick={() => setShowCapitalContributionModal(true)}
            className={`flex items-center justify-center gap-1 ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'} bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
            title="Ajouter un apport de capital"
          >
            <DollarSign size={isMobile ? 16 : 18} />
            {!isMobile && <span>Apport</span>}
          </button>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('tresorerie')}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} ${viewMode === 'tresorerie'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-200'
              }`}
          >
            <DollarSign size={16} />
            Trésorerie
          </button>
          <button
            onClick={() => setViewMode('analytique')}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} ${viewMode === 'analytique'
              ? 'bg-purple-500 text-white'
              : 'text-gray-600 hover:bg-gray-200'
              }`}
          >
            <TrendingUp size={16} />
            Analytique
          </button>
        </div>
      </div>

      <PeriodFilter
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        availableFilters={ACCOUNTING_FILTERS}
        customRange={customRange}
        updateCustomRange={updateCustomRange}
        className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm"
      />

      {/* Period Label */}
      <div className={`bg-white border border-gray-200 rounded-lg ${isMobile ? 'p-2' : 'p-3'}`}>
        <p className={`text-center font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
          {periodLabel}
        </p>
      </div>

      {/* Main Stats */}
      {
        viewMode === 'tresorerie' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Operating Profit */}
            <div className={`bg-gradient-to-br ${operatingProfit >= 0
              ? 'from-green-500 to-emerald-600'
              : 'from-red-500 to-pink-600'
              } text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>
              <div className="flex items-center gap-2 mb-2">
                {operatingProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Bénéfice Opérationnel
                </p>
              </div>
              <p className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'}`}>
                {formatPrice(operatingProfit)}
              </p>
              <p className={`mt-1 opacity-80 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Marge: {safeOperatingProfitMargin.toFixed(1)}%
              </p>
            </div>

            {/* Total Revenue */}
            <div className={`bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>

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

            {/* Operating Costs */}
            <div className={`bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Receipt size={20} />
                <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Dépenses Opérationnelles
                </p>
              </div>
              <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                {formatPrice(totalOperatingCosts)}
              </p>
            </div>

            {/* Investments */}
            <div className={`bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'} relative`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={20} />
                <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Investissements
                </p>
                {investmentRate > 20 && (
                  <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                    ⚠️ Élevé
                  </span>
                )}
              </div>
              <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                {formatPrice(investments)}
              </p>
              {investmentRate > 20 && (
                <p className={`mt-1 opacity-80 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Impact trésorerie élevé ({investmentRate.toFixed(1)}% du CA)
                </p>
              )}
            </div>
          </div>
        ) : (
          // VUE ANALYTIQUE : 4 cards avec solde début/fin
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Solde début période avec détail */}
              <div className={`bg-gradient-to-br from-gray-500 to-slate-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={20} />
                  <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    Solde début
                  </p>
                </div>
                <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                  {formatPrice(previousBalance)}
                </p>
                {/* Détail de la composition */}
                <div className={`hidden lg:block mt-2 pt-2 border-t border-white/20 space-y-1 opacity-80 ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                  <div className="flex justify-between">
                    <span>• Capital initial:</span>
                    <span>{formatPrice(previousBalanceDetails.initialBalance)}</span>
                  </div>
                  {previousBalanceDetails.capitalContributions > 0 && (
                    <div className="flex justify-between">
                      <span>• Apports capital:</span>
                      <span className="text-blue-200">{formatPrice(previousBalanceDetails.capitalContributions)}</span>
                    </div>
                  )}
                  {previousBalanceDetails.activityResult !== 0 && (
                    <div className="flex justify-between">
                      <span>• Résultat activité:</span>
                      <span className={previousBalanceDetails.activityResult >= 0 ? 'text-green-200' : 'text-red-200'}>
                        {formatPrice(previousBalanceDetails.activityResult)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Revenus période */}
              <div className={`bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>
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
              <div className={`bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>
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
              <div className={`bg-gradient-to-br ${finalBalance >= 0
                ? 'from-green-500 to-emerald-600'
                : 'from-red-500 to-pink-600'
                } text-white rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}>
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

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <p className="text-xs text-gray-600">Marge Opérationnelle</p>
                <p className={`text-lg font-bold ${safeOperatingProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {safeOperatingProfitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <p className="text-xs text-gray-600">Croissance Revenus</p>
                <p className={`text-lg font-bold ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <p className="text-xs text-gray-600">Revenu / Serveur</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatPrice(revenuePerServer)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <p className="text-xs text-gray-600">Taux d'Investissement</p>
                <p className="text-lg font-bold text-purple-600">
                  {investmentRate.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <p className="text-xs text-gray-600">Fonds de Roulement</p>
                <p className={`text-lg font-bold ${cashRunway >= 1 ? 'text-green-600' : cashRunway >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {cashRunway.toFixed(1)} mois
                </p>
              </div>
            </div>

            {/* Charts */}
            <Suspense fallback={<div className="text-center py-8 text-gray-500">Chargement des graphiques...</div>}>
              <AnalyticsCharts data={chartData} expensesByCategory={expensesByCategoryData} />
            </Suspense>
          </div>
        )
      }

      {/* Period Info */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <Calendar className="text-blue-500 flex-shrink-0" size={20} />
          <div className="flex-1">
            <p className={`font-medium text-blue-800 ${isMobile ? 'text-sm' : ''}`}>
              Période: {TIME_RANGE_CONFIGS[timeRange].label}
            </p>
            <p className={`mt-1 text-blue-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Du {periodStart.toLocaleDateString('fr-FR')} au {periodEnd.toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
      </div>

      {/* Analysis */}
      {
        netProfit < 0 && (
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
        )
      }

      {
        netProfit > 0 && operatingProfitMargin > 30 && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <TrendingUp className="text-green-500 flex-shrink-0" size={20} />
              <div className="flex-1">
                <p className={`font-medium text-green-800 ${isMobile ? 'text-sm' : ''}`}>
                  ✅ Excellente rentabilité
                </p>
                <p className={`mt-1 text-green-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                  Votre marge bénéficiaire de {safeOperatingProfitMargin.toFixed(1)}% est très bonne. Continuez ainsi!
                </p>
              </div>
            </div>
          </div>
        )
      }

      {/* Modal: Define Initial Balance */}
      {
        showInitialBalanceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-500 to-indigo-600">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign size={22} />
                  Définir solde initial
                </h3>
                <button
                  onClick={() => setShowInitialBalanceModal(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  Définissez le solde initial de votre comptabilité (par exemple, le montant en caisse à l'ouverture du bar).
                </p>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Montant (FCFA) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={initialBalanceForm.amount}
                    onChange={(e) => setInitialBalanceForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Ex: 500000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Peut être négatif si vous aviez des dettes
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de référence <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={initialBalanceForm.date}
                    onChange={(e) => setInitialBalanceForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={initialBalanceForm.description}
                    onChange={(e) => setInitialBalanceForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Ex: Solde ouverture bar"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Existing initial balance */}
                {initialBalanceHook.initialBalance && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-yellow-800 mb-2">
                      ⚠️ Un solde initial existe déjà :
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">
                        {new Date(initialBalanceHook.initialBalance.date).toLocaleDateString('fr-FR')} - {initialBalanceHook.initialBalance.description}
                      </span>
                      <span className={`font-medium ${initialBalanceHook.initialBalance.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(initialBalanceHook.initialBalance.amount)}
                      </span>
                    </div>
                    {initialBalanceHook.initialBalance.isLocked && (
                      <p className="text-xs text-red-600 mt-2">
                        🔒 Verrouillé (transactions postérieures existent)
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowInitialBalanceModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateInitialBalance}
                  disabled={!!initialBalanceHook.initialBalance}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${initialBalanceHook.initialBalance
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                    }`}
                >
                  {initialBalanceHook.initialBalance ? 'Solde déjà défini' : 'Enregistrer'}
                </button>
              </div>
            </motion.div>
          </div>
        )
      }

      {/* Modal: Add Capital Contribution */}
      {
        showCapitalContributionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-indigo-600">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign size={22} />
                  Apport de Capital
                </h3>
                <button
                  onClick={() => setShowCapitalContributionModal(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  Enregistrez une injection d'argent pour renforcer la trésorerie du bar (apport personnel, prêt, etc.).
                </p>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Montant (FCFA) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={capitalContributionForm.amount}
                    onChange={(e) => setCapitalContributionForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Ex: 500000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Montant positif uniquement (entrée d'argent)
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={capitalContributionForm.date}
                    onChange={(e) => setCapitalContributionForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Source */}
                <div>
                  <Select
                    label="Source"
                    options={[
                      { value: 'owner', label: '👤 Propriétaire (apport personnel)' },
                      { value: 'partner', label: '🤝 Associé' },
                      { value: 'investor', label: '💼 Investisseur externe' },
                      { value: 'loan', label: '🏦 Prêt (banque/personnel)' },
                      { value: 'other', label: '📋 Autre' },
                    ]}
                    value={capitalContributionForm.source}
                    onChange={(e) => setCapitalContributionForm(prev => ({ ...prev, source: e.target.value as import('../types').CapitalSource }))}
                    required
                  />
                </div>

                {/* Source Details (optionnel) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Détails source (optionnel)
                  </label>
                  <input
                    type="text"
                    value={capitalContributionForm.sourceDetails}
                    onChange={(e) => setCapitalContributionForm(prev => ({ ...prev, sourceDetails: e.target.value }))}
                    placeholder="Ex: Prêt Banque ABC, Associé Guy GOUNOU..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={capitalContributionForm.description}
                    onChange={(e) => setCapitalContributionForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Ex: Apport pour couvrir fournisseur urgent"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Existing contributions */}
                {capitalContributionsHook.contributions.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-800 mb-2">
                      📋 Apports existants ({capitalContributionsHook.contributions.length})
                    </p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {capitalContributionsHook.contributions.slice(0, 5).map(contrib => (
                        <div key={contrib.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">
                            {new Date(contrib.date).toLocaleDateString('fr-FR')} - {contrib.source}
                          </span>
                          <span className="font-medium text-green-600">
                            +{formatPrice(contrib.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowCapitalContributionModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateCapitalContribution}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Créer l'apport
                </button>
              </div>
            </motion.div>
          </div>
        )
      }
    </div >
  );
}
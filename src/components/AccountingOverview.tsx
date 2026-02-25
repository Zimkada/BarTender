import { useState, useMemo, Suspense, lazy } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Download,
  Plus,
  FileSpreadsheet
} from 'lucide-react';
import { PeriodFilter } from './common/filters/PeriodFilter';
import { Button } from './ui/Button';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { EXPENSE_CATEGORY_LABELS } from '../hooks/useExpenses';
import { returnReasons } from '../config/returnReasons';
import type { ReturnReason } from '../types';
import { useInitialBalance } from '../hooks/useInitialBalance';
import { useCapitalContributions } from '../hooks/useCapitalContributions';
import { useViewport } from '../hooks/useViewport';
import { isConfirmedReturn } from '../utils/saleHelpers';
import { dateToYYYYMMDD } from '../utils/businessDateHelpers';
import { AccountingKPIs } from '../features/Accounting/components/AccountingKPIs';
import { InitialBalanceModal } from '../features/Accounting/components/InitialBalanceModal';
import { CapitalContributionModal } from '../features/Accounting/components/CapitalContributionModal';

// Lazy load charts to reduce initial bundle size
const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'));


import { DataFreshnessIndicatorCompact } from './DataFreshnessIndicator';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import type { AccountingPeriodProps } from '../types/dateFilters';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useUnifiedExpenses } from '../hooks/pivots/useUnifiedExpenses';
import { useUnifiedReturns } from '../hooks/pivots/useUnifiedReturns';
import {
  useDailyAnalytics,
  useRevenueAnalytics,
  useExpensesAnalytics,
  useSalariesAnalytics,
  analyticsKeys
} from '../hooks/queries/useAnalyticsQueries';
import { ACCOUNTING_FILTERS, ACCOUNTING_FILTERS_MOBILE } from '../config/dateFilters';
import { SyscohadaTranslator } from '../services/accounting/syscohada.service';
import { BarAccountingConfigSchema } from '../services/accounting/syscohada.types';
import { AccountingTransaction } from '../types';
import { useSalaries } from '../hooks/useSalaries';
import { getErrorMessage } from '../utils/errorHandler';

interface AccountingOverviewProps {
  period: AccountingPeriodProps;
}

export function AccountingOverview({ period }: AccountingOverviewProps) {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { isMobile } = useViewport();

  // Période reçue depuis AccountingPage (source unique de vérité)
  const {
    timeRange,
    setTimeRange,
    startDate: periodStart,
    endDate: periodEnd,
    customRange,
    updateCustomRange,
    periodLabel,
  } = period;

  // ✅ Utiliser les Smart Hooks Élite pour les finances unifiées
  // 🛡️ Expert Fix: Passer les filtres de période au hook pour filtrage serveur
  // ✨ 2025-02-21: Cohérence comptable - inclure SEULEMENT les ventes validées
  const { sales: unifiedSales } = useUnifiedSales(currentBar?.id, {
    startDate: dateToYYYYMMDD(periodStart),
    endDate: dateToYYYYMMDD(periodEnd),
    status: 'validated'  // 🎯 CORRECTION: Aligner sur RevenueManager & Revenus
  });
  useUnifiedStock(currentBar?.id);
  const { expenses: unifiedExpenses } = useUnifiedExpenses(currentBar?.id, {
    startDate: dateToYYYYMMDD(periodStart),
    endDate: dateToYYYYMMDD(periodEnd)
  });

  const initialBalanceHook = useInitialBalance(currentBar?.id);
  const capitalContributionsHook = useCapitalContributions(currentBar?.id);
  const { returns: unifiedReturns } = useUnifiedReturns(currentBar?.id, currentBar?.closingHour);
  const { salaries } = useSalaries(currentBar?.id ?? '');
  const { customExpenseCategories } = useAppContext();

  // 📈 PHASE 4: RECOVERY ANALYTICS (React Query Driven)
  // Replaces manual state + useEffect with reactive queries

  // 1. Current Charts Data (12 months)
  const chartStart = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    d.setDate(1);
    return d;
  }, []);
  const chartEnd = useMemo(() => new Date(), []);

  const { data: chartStats = [] } = useDailyAnalytics(currentBar?.id, chartStart, chartEnd, 'month');
  const { data: chartExpenses = [] } = useExpensesAnalytics(currentBar?.id, chartStart, chartEnd, 'month');
  const { data: chartSalaries = [] } = useSalariesAnalytics(currentBar?.id, chartStart, chartEnd, 'month');

  // KPIs via vues matérialisées — source unique de vérité pour la période sélectionnée
  const { data: currentPeriodRevenue = [] } = useDailyAnalytics(currentBar?.id, periodStart, periodEnd, 'day');
  const { data: currentPeriodExpenses = [] } = useExpensesAnalytics(currentBar?.id, periodStart, periodEnd, 'day');
  // 🛡️ FIX : currentPeriodSalaries supprimé — les salaires locaux (useSalaries ligne 85) sont utilisés
  // directement pour inclure les paiements optimistic non encore syncronisés vers Supabase

  // 2. Growth Analysis (Previous Period)
  const prevPeriodRange = useMemo(() => {
    const prevStart = new Date(periodStart);
    prevStart.setMonth(prevStart.getMonth() - 1);
    prevStart.setDate(1);
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 0);
    return { start: prevStart, end: prevEnd };
  }, [periodStart]);

  const { data: prevPeriodStats = [] } = useDailyAnalytics(currentBar?.id, prevPeriodRange.start, prevPeriodRange.end, 'day');

  // 3. Historical Data for Balance
  const historyRange = useMemo(() => {
    const start = new Date('2020-01-01');
    const end = new Date(periodStart);
    end.setDate(end.getDate() - 1);
    return { start, end };
  }, [periodStart]);

  const { data: historicalRevenueData } = useRevenueAnalytics(currentBar?.id, historyRange.start, historyRange.end);
  const historicalRevenue = historicalRevenueData?.totalRevenue || 0;

  // ✨ Filtrage Centralisé Local des données unifiées
  const filteredSales = useMemo(() => {
    return unifiedSales.filter(s => {
      const saleObj = s as Record<string, unknown>;
      const rawDate = saleObj.businessDate || saleObj.business_date || saleObj.createdAt || saleObj.created_at || new Date();
      const date = rawDate instanceof Date ? rawDate : new Date(rawDate as string | number);
      return date >= periodStart && date <= periodEnd;
    });
  }, [unifiedSales, periodStart, periodEnd]);

  const filteredExpenses = useMemo(() => {
    return unifiedExpenses.filter(e => {
      return e.date >= periodStart && e.date <= periodEnd;
    });
  }, [unifiedExpenses, periodStart, periodEnd]);

  // ✨ Calcul des KPIs Financiers — Source unique: vues matérialisées
  // Identique à RevenueManager.totals.revenue pour cohérence parfaite
  const totalRevenue = useMemo(() => {
    return currentPeriodRevenue.reduce(
      (sum, day) => sum + (day.net_revenue || day.gross_revenue || 0), 0
    );
  }, [currentPeriodRevenue]);

  const [viewMode, setViewMode] = useState<'tresorerie' | 'analytique'>('tresorerie');
  const [isExporting, setIsExporting] = useState(false);

  // Modals state
  const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false);
  const [showCapitalContributionModal, setShowCapitalContributionModal] = useState(false);

  // 💎 Indicateurs de Rentabilité — Source unique: vues matérialisées + salaires
  const investments = useMemo(() => {
    return currentPeriodExpenses.reduce(
      (sum, row) => sum + (Number(row.investments) || 0), 0
    );
  }, [currentPeriodExpenses]);

  const periodSalariesTotal = useMemo(() => {
    // 🛡️ FIX : Utiliser les salaires locaux (state) pour inclure les paiements optimistic récents
    return salaries
      .filter(sal => {
        const paidAt = new Date(sal.paidAt);
        return paidAt >= periodStart && paidAt <= periodEnd;
      })
      .reduce((sum, sal) => sum + sal.amount, 0);
  }, [salaries, periodStart, periodEnd]);

  const totalOperatingCosts = useMemo(() => {
    // operating_expenses = dépenses opérationnelles (hors investissements)
    const opEx = currentPeriodExpenses.reduce(
      (sum, row) => sum + (Number(row.operating_expenses) || 0), 0
    );
    // Inclure les salaires = cohérent avec l'onglet Dépenses
    return opEx + periodSalariesTotal;
  }, [currentPeriodExpenses, periodSalariesTotal]);

  const operatingProfit = totalRevenue - totalOperatingCosts;
  const operatingProfitMargin = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;
  const netProfit = operatingProfit - investments;

  // KPIs Extra (Growth, Server, etc)
  const { revenueGrowth, revenuePerServer, investmentRate, chartData } = useMemo(() => {
    const prevTotalRevenue = prevPeriodStats.reduce((sum, day) => sum + (day.net_revenue || 0), 0);
    const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;

    const serverCount = currentBar?.settings?.serversList?.length || 1;
    const revenuePerServer = serverCount > 0 ? totalRevenue / serverCount : 0;
    const investmentRate = totalRevenue > 0 ? (investments / totalRevenue) * 100 : 0;

    const monthsToShow = isMobile ? 6 : 12;
    const chartData = Array.from({ length: monthsToShow }).map((_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleString('fr-FR', { month: 'short' });
      const year = date.getFullYear();
      const monthKey = `${month} ${year}`;

      const expectedMonthPrefix = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Sum all daily rows that fall into this month (string prefix avoids tz bugs)
      const monthStats = chartStats.filter(s => {
        const dateStr = s.sale_date || s.sale_month || '';
        return dateStr.startsWith(expectedMonthPrefix);
      });
      // Fallback to gross_revenue if net_revenue is undefined (e.g., pending database view migration)
      const monthRevenue = monthStats.reduce((sum, s) => sum + (Number(s.net_revenue ?? (s as any).gross_revenue ?? (s as any).total_revenue ?? 0) || 0), 0);

      const monthExpenseStats = chartExpenses.filter(e => {
        const dateStr = e.expense_date || e.expense_month || '';
        return dateStr.startsWith(expectedMonthPrefix);
      });
      const monthOperatingExpenses = monthExpenseStats.reduce((sum, e) => sum + (Number(e.operating_expenses) || 0), 0);

      const monthSalaryStats = chartSalaries.filter(s => {
        const dateStr = s.payment_date || s.payment_month || '';
        return dateStr.startsWith(expectedMonthPrefix);
      });
      const monthSalaries = monthSalaryStats.reduce((sum, s) => sum + (Number(s.total_salaries) || 0), 0);

      return {
        name: monthKey,
        Revenus: monthRevenue,
        'Coûts Opérationnels': monthOperatingExpenses + monthSalaries,
      };
    }).reverse();

    return {
      revenueGrowth: isFinite(revenueGrowth) ? revenueGrowth : 0,
      revenuePerServer: isFinite(revenuePerServer) ? revenuePerServer : 0,
      investmentRate: isFinite(investmentRate) ? investmentRate : 0,
      chartData
    };
  }, [totalRevenue, investments, prevPeriodStats, chartStats, chartExpenses, chartSalaries, currentBar, isMobile]);

  // Analytique: Balance Calculations
  const { previousBalance, previousBalanceDetails, finalBalance, totalCosts } = useMemo(() => {
    if (viewMode === 'tresorerie') return { previousBalance: 0, previousBalanceDetails: undefined, finalBalance: 0, totalCosts: 0 };

    const initialBalanceAmount = initialBalanceHook.getInitialBalanceAmount();
    const previousCapitalContributions = capitalContributionsHook.getTotalContributions(periodStart);
    const previousRevenue = historicalRevenue;

    const previousCosts = unifiedExpenses
      .filter((exp: any) => exp.date < periodStart)
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);

    const previousReturnsRefunds = unifiedReturns
      .filter(r => {
        const rDate = new Date(r.returnedAt);
        return rDate < periodStart && isConfirmedReturn(r);
      })
      .reduce((sum, r) => sum + r.refundAmount, 0);

    const prevBal = initialBalanceAmount + previousCapitalContributions + previousRevenue - previousCosts - previousReturnsRefunds;

    // Details for tooltip/display
    const details = {
      initialBalance: initialBalanceAmount,
      capitalContributions: previousCapitalContributions,
      activityResult: previousRevenue - previousCosts - previousReturnsRefunds // Approximate activity result
    };

    // Period Total Costs (All included for cash flow view) — inclure salaires pour cohérence
    // 🛡️ FIX : Exclure les salaires de opExCosts car ils sont déjà dans filteredExpenses
    // (unifiedExpenses fusionne expenses + supplies + salaries → sans exclusion = double comptage)
    const opExCosts = filteredExpenses
      .filter(e => e.category !== 'salary')
      .reduce((sum, e) => sum + e.amount, 0);
    // 🛡️ FIX : Utiliser les salaires locaux pour inclure les paiements optimistic récents
    const salaryCosts = salaries
      .filter(sal => {
        const paidAt = new Date(sal.paidAt);
        return paidAt >= periodStart && paidAt <= periodEnd;
      })
      .reduce((sum, sal) => sum + sal.amount, 0);
    const tCosts = opExCosts + salaryCosts;

    return {
      previousBalance: prevBal,
      previousBalanceDetails: details,
      finalBalance: prevBal + operatingProfit - investments, // Approx: Start + (Revenue - Ops - Inv)
      totalCosts: tCosts
    };
  }, [viewMode, unifiedExpenses, unifiedReturns, periodStart, periodEnd, initialBalanceHook.initialBalance, capitalContributionsHook.contributions, historicalRevenue, operatingProfit, investments, filteredExpenses, salaries]);

  // Cash Runway Fix
  const cashRunway = useMemo(() => {
    if (totalOperatingCosts <= 0) return 0;
    // Normalize monthly cost if period is not month-like
    // Simple approach: Use totalOperatingCosts directly if it represents a month, 
    // or infer monthly burn rate from chart data if available?
    // Let's keep it simple: Real cash / Current Burn rate (extrapolated to month?)
    // For now, let's just use finalBalance / totalOperatingCosts but only show if period > 7 days
    const diffTime = Math.abs(periodEnd.getTime() - periodStart.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 15) return 0; // Don't show for short periods as burn rate is misleading

    const result = finalBalance / totalOperatingCosts;
    return isFinite(result) ? result : 0;
  }, [finalBalance, totalOperatingCosts, periodStart, periodEnd]);


  // Expenses Breakdown (reuse logic)
  const expensesByCategoryData = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; amount: number; count: number }> = {};
    filteredExpenses.forEach(exp => {
      let key = exp.category;
      if (exp.category === 'custom' && exp.customCategoryId) key = exp.customCategoryId;

      if (!groups[key]) {
        const data = (EXPENSE_CATEGORY_LABELS as Record<string, { label: string; icon: string }>)[exp.category];
        let label = data?.label || exp.category;
        let icon = data?.icon || '📝';
        if (exp.isSupply) { label = 'Approvisionnements'; icon = '📦'; }
        else if (exp.category === 'custom' && exp.customCategoryId) {
          const cat = customExpenseCategories.find((c: { id: string; name: string; icon: string }) => c.id === exp.customCategoryId);
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

  // Handlers for Modals
  const handleInitialBalanceSubmit = async (data: any) => {
    try {
      await initialBalanceHook.createInitialBalance({
        barId: currentBar!.id,
        amount: parseFloat(data.amount),
        date: new Date(data.date),
        description: data.description || 'Solde initial',
        createdBy: currentSession!.userId,
      });
      setShowInitialBalanceModal(false);
    } catch (error) {
      alert((error as Error).message); // TODO: Switch to Toast later
    }
  };

  const handleCapitalContributionSubmit = async (data: any) => {
    try {
      await capitalContributionsHook.addContribution({
        barId: currentBar!.id,
        amount: parseFloat(data.amount),
        date: new Date(data.date),
        description: data.description || 'Apport de capital',
        source: data.source,
        sourceDetails: data.sourceDetails,
        createdBy: currentSession!.userId,
      });
      setShowCapitalContributionModal(false);
    } catch (error) {
      alert((error as Error).message); // TODO: Switch to Toast
    }
  };

  // Export Logic (Keep existing one, just wrapper)
  // ... (keeping the massive handleExportAccounting for now, but hidden in this refactor for brevity?
  // No, I must include it or functionality is lost. I'll paste the previous logic.)


  const handleExportAccounting = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Filtrage pour export (data déjà filtrée par période via hooks)
    const exportSales = filteredSales.filter(sale => sale.status === 'validated');
    const exportExpenses = filteredExpenses;

    const summaryData = [
      ['RAPPORT COMPTABLE', currentBar?.name || ''],
      ['PÉRIODE', periodLabel],
      ['DATE EXPORT', new Date().toLocaleDateString('fr-FR')],
      [],
      ['REVENUS', totalRevenue],
      ['COÛTS OPÉRATIONNELS', totalOperatingCosts],
      ['BÉNÉFICE', operatingProfit],
      ['INVESTISSEMENTS', investments],
      ['SOLDE NET', netProfit]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Résumé');

    // Ventes
    const salesData = exportSales.flatMap(sale => {
      const saleObj = sale as Record<string, unknown>;
      const rawDate = saleObj.businessDate || saleObj.business_date || saleObj.createdAt || saleObj.created_at || new Date();
      const saleDate = rawDate instanceof Date ? rawDate : new Date(rawDate as string | number);
      return (sale.items || []).map(item => ({
        Date: saleDate.toLocaleDateString(),
        Produit: item.product_name,
        Total: item.total_price,
        Paiement: (saleObj.paymentMethod as string) || 'cash'
      }));
    });
    if (salesData.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesData), 'Ventes');

    // Dépenses
    const expensesData = exportExpenses.map(e => ({
      Date: e.date.toLocaleDateString(),
      Catégorie: (EXPENSE_CATEGORY_LABELS as Record<string, { label: string }>)[e.category]?.label || e.category,
      Montant: e.amount,
      Note: e.notes
    }));
    if (expensesData.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expensesData), 'Dépenses');

    XLSX.writeFile(workbook, `Comptabilite_${periodLabel}.xlsx`);
  };

  const handleExportSyscohada = async () => {
    if (!currentBar) return;
    setIsExporting(true);
    try {
      const transactions: AccountingTransaction[] = [];

      // Ventes (filteredSales déjà filtré par période via hook serveur + filtre local)
      const exportSales = filteredSales.filter(sale => sale.status === 'validated');
      exportSales.forEach(sale => {
        const saleObj = sale as Record<string, unknown>;
        const rawCreatedAt = saleObj.createdAt || saleObj.created_at || new Date();
        const rawBusinessDate = saleObj.businessDate || saleObj.business_date;
        transactions.push({
          id: sale.id,
          barId: currentBar.id,
          type: 'sale',
          amount: sale.total,
          paymentMethod: (saleObj.paymentMethod as string) || 'cash',
          date: rawCreatedAt instanceof Date ? rawCreatedAt : new Date(rawCreatedAt as string | number),
          businessDate: rawBusinessDate
            ? (rawBusinessDate instanceof Date ? rawBusinessDate : new Date(rawBusinessDate as string | number))
            : undefined,
          description: `Ventes du service`,
          createdBy: sale.createdBy,
          createdAt: rawCreatedAt instanceof Date ? rawCreatedAt : new Date(rawCreatedAt as string | number)
        });
      });

      // Dépenses (filteredExpenses déjà filtré par période — salaires exclus, traités séparément)
      filteredExpenses.filter(e => e.category !== 'salary').forEach(e => {
        // Obtenir le label traduit de la catégorie, sinon utiliser le nom
        const categoryLabel = (EXPENSE_CATEGORY_LABELS as Record<string, { label: string }>)[e.category]?.label || e.category;
        transactions.push({
          id: e.id,
          barId: currentBar.id,
          type: e.category === 'supply' ? 'supply' : 'expense',
          amount: e.amount,
          // Pour les catégories personnalisées, passer l'UUID (customCategoryId) afin que
          // le mapping configMappings fonctionne (clé = UUID, pas la valeur 'custom')
          category: e.customCategoryId || e.category,
          date: e.date,
          description: e.notes || categoryLabel,
          createdBy: e.createdBy,
          createdAt: e.date
        });
      });

      // Retours
      const exportReturns = unifiedReturns.filter(r => {
        if (!isConfirmedReturn(r)) return false;
        const d = new Date(r.returnedAt);
        return d >= periodStart && d <= periodEnd;
      });
      exportReturns.forEach(r => {
        const returnObj = r as Record<string, unknown>;
        transactions.push({
          id: r.id,
          barId: currentBar.id,
          type: 'return',
          amount: r.refundAmount,
          paymentMethod: (returnObj.originalPaymentMethod as string) || 'cash',
          date: new Date(r.returnedAt),
          description: `Retour: ${returnReasons[returnObj.reason as ReturnReason]?.label || (returnObj.reason as string) || ''}`,
          createdBy: r.returnedBy,
          createdAt: new Date(r.returnedAt)
        });
      });

      // Salaires
      const exportSalaries = salaries.filter(s => {
        const d = new Date(s.paidAt);
        return d >= periodStart && d <= periodEnd;
      });
      exportSalaries.forEach(s => {
        const memberLabel = s.memberName || s.staffName || '';
        transactions.push({
          id: s.id,
          barId: s.barId,
          type: 'salary',
          amount: s.amount,
          date: new Date(s.paidAt),
          description: `Salaire${memberLabel ? ` - ${memberLabel}` : ''} (${s.period})`,
          createdBy: s.createdBy,
          createdAt: new Date(s.createdAt)
        });
      });

      // Config validée avec Zod (fail-safe: utilise les défauts si invalide)
      const configParsed = BarAccountingConfigSchema.safeParse(currentBar.settings?.accounting ?? {});
      const config = configParsed.success ? configParsed.data : {};

      // Translate basic transactions
      const entries = SyscohadaTranslator.translateTransactions(transactions, config);

      // Capital Contributions
      const exportContribs = capitalContributionsHook.contributions.filter(c => {
        const d = new Date(c.date);
        return d >= periodStart && d <= periodEnd;
      });
      const capitalEntries = SyscohadaTranslator.translateCapitalContributions(exportContribs);

      // Initial Balance (if inside the period)
      const initBal = initialBalanceHook.initialBalance;
      if (initBal) {
        const db = new Date(initBal.date);
        if (db >= periodStart && db <= periodEnd) {
          const initEntries = SyscohadaTranslator.translateTransactions([{
            id: initBal.id,
            barId: initBal.barId,
            type: 'initial_balance',
            amount: initBal.amount,
            date: new Date(initBal.date),
            description: initBal.description,
            createdBy: initBal.createdBy,
            createdAt: new Date(initBal.createdAt)
          }], config);
          entries.push(...initEntries);
        }
      }

      // Combine and sort chronologically
      const allEntries = [...entries, ...capitalEntries].sort((a, b) => a.date.getTime() - b.date.getTime());

      // Guard: ne pas générer un fichier vide
      if (allEntries.length === 0) {
        alert('Aucune écriture comptable à exporter pour cette période.');
        return;
      }

      // Generate Excel — format légal "Du JJ/MM/AAAA au JJ/MM/AAAA"
      const formatDateFR = (d: Date) =>
        d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const barInfo = {
        name: currentBar.name,
        rccm: currentBar.settings.rccm,
        ifu: currentBar.settings.ifu,
        dateStr: `Du ${formatDateFR(periodStart)} au ${formatDateFR(periodEnd)}`
      };

      await SyscohadaTranslator.exportJournalExcel(allEntries, barInfo);
    } catch (error) {
      alert(`Erreur lors de l'export : ${getErrorMessage(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const queryClient = useQueryClient();

  if (!currentBar || !currentSession) return null;

  return (
    <div className={`${isMobile ? 'p-3 space-y-4 pb-24' : 'p-6 space-y-6'}`}>
      {/* Header with Glassmorphism feel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`font-bold text-gray-900 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              📊 Pilotage
            </h2>
            <DataFreshnessIndicatorCompact
              viewName="daily_sales_summary"
              onRefreshComplete={() => queryClient.invalidateQueries({ queryKey: analyticsKeys.all })}
              className="mt-1"
            />
          </div>

          <p className="text-gray-500 text-sm font-medium">
            {currentBar.name} • Comptabilité & Finances
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4">
          {/* Export Actions — Primary (filled) */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <Button variant="default" size="sm" onClick={handleExportSyscohada} disabled={isExporting} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 justify-center sm:justify-start">
              <FileSpreadsheet size={16} className="mr-2" />
              {isExporting ? 'Export en cours...' : 'Livre Journal'}
            </Button>
            <Button variant="default" size="sm" onClick={handleExportAccounting} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white justify-center sm:justify-start">
              <Download size={16} className="mr-2" />
              Export Simple
            </Button>
          </div>

          {/* Modal Actions — Secondary (outline) */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowInitialBalanceModal(true)} className="w-full sm:w-auto justify-center sm:justify-start">
              <DollarSign size={16} className="mr-2" />
              Solde Initial
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCapitalContributionModal(true)} className="w-full sm:w-auto border-blue-600 text-blue-700 hover:bg-blue-50 justify-center sm:justify-start">
              <Plus size={16} className="mr-2" />
              Apport Capital
            </Button>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white/50 backdrop-blur-sm border border-white/60 p-1.5 rounded-xl shadow-sm flex flex-col xl:flex-row gap-2 justify-between items-center">
        {/* View Mode Switcher */}
        <div className="flex bg-white/40 backdrop-blur-md rounded-2xl p-1 gap-1.5 border border-brand-subtle shadow-sm w-full md:flex-1 overflow-hidden">
          <button
            onClick={() => setViewMode('tresorerie')}
            className={`px-4 py-2 h-10 md:px-6 md:h-11 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-tight transition-all sm:min-w-[120px] flex-1 ${viewMode === 'tresorerie' ? 'glass-action-button-active-2026 shadow-md shadow-brand-subtle text-brand-primary' : 'glass-action-button-2026 text-gray-500 hover:text-brand-primary'}`}
          >
            Trésorerie
          </button>
          <button
            onClick={() => setViewMode('analytique')}
            className={`px-4 py-2 h-10 md:px-6 md:h-11 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-tight transition-all sm:min-w-[120px] flex-1 ${viewMode === 'analytique' ? 'glass-action-button-active-2026 shadow-md shadow-brand-subtle text-brand-primary' : 'glass-action-button-2026 text-gray-500 hover:text-brand-primary'}`}
          >
            Analytique
          </button>
        </div>

        {/* Period Filter */}
        <div className="w-full xl:w-auto overflow-x-auto">
          <PeriodFilter
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            availableFilters={ACCOUNTING_FILTERS}
            customRange={customRange}
            updateCustomRange={updateCustomRange}
            className="bg-transparent shadow-none border-none p-0"
          />
        </div>
      </div>

      {/* Main Stats KPIs */}
      <AccountingKPIs
        viewMode={viewMode}
        periodLabel={periodLabel}
        data={{
          totalRevenue,
          totalOperatingCosts,
          operatingProfit,
          operatingProfitMargin,
          investments,
          investmentRate,

          previousBalance,
          previousBalanceDetails,
          finalBalance,
          totalCosts,

          revenueGrowth,
          revenuePerServer,
          cashRunway
        }}
      />

      {/* Charts Section */}
      <Suspense fallback={<div className="h-64 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-400">Chargement graphiques...</div>}>
        <AnalyticsCharts data={chartData} expensesByCategory={expensesByCategoryData} />
      </Suspense>

      {/* Modals */}
      <InitialBalanceModal
        open={showInitialBalanceModal}
        onClose={() => setShowInitialBalanceModal(false)}
        onSubmit={handleInitialBalanceSubmit}
        existingBalance={initialBalanceHook.initialBalance ? {
          ...initialBalanceHook.initialBalance,
          date: initialBalanceHook.initialBalance.date instanceof Date
            ? initialBalanceHook.initialBalance.date.toISOString()
            : initialBalanceHook.initialBalance.date
        } : null}
      />

      <CapitalContributionModal
        open={showCapitalContributionModal}
        onClose={() => setShowCapitalContributionModal(false)}
        onSubmit={handleCapitalContributionSubmit}
        existingContributions={capitalContributionsHook.contributions.map(c => ({
          ...c,
          date: c.date instanceof Date ? c.date.toISOString() : c.date
        }))}
      />

    </div>
  );
}
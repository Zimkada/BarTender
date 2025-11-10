import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
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
  CalendarDays,
  PlusCircle,
  X,
  Download
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { getExpensesByCategory } from '../hooks/useExpenses';
import { useSalaries } from '../hooks/useSalaries';
import { useInitialBalance } from '../hooks/useInitialBalance';
import { useCapitalContributions } from '../hooks/useCapitalContributions';
import { useStockManagement } from '../hooks/useStockManagement';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { getSaleDate } from '../utils/saleHelpers';

type PeriodType = 'week' | 'month' | 'custom';

import AnalyticsCharts from './AnalyticsCharts';

export function AccountingOverview() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();

  // ✅ Utiliser AppContext et StockContext (sources uniques)
  const { sales, supplies } = useAppContext();
  const salariesHook = useSalaries(currentBar?.id);
  const initialBalanceHook = useInitialBalance(currentBar?.id);
  const capitalContributionsHook = useCapitalContributions(currentBar?.id);
  const { consignments } = useStockManagement();
  const { returns, expenses, customExpenseCategories } = useAppContext(); // ✅ Use expenses from AppContext

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = current, -1 = previous, +1 = next
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [expensesExpanded, setExpensesExpanded] = useState(false);
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
        const saleDate = getSaleDate(sale);
        return sale.status === 'validated' && saleDate >= periodStart && saleDate <= periodEnd;
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
    return expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= periodStart && expDate <= periodEnd;
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses, periodStart, periodEnd]);

  // Get expenses breakdown by category (for detailed view)
  const expensesByCategoryData = useMemo(() => {
    return getExpensesByCategory(expenses, customExpenseCategories, periodStart, periodEnd);
  }, [expenses, customExpenseCategories, periodStart, periodEnd]);

  // Calculate salaries
  const salariesCosts = salariesHook.getTotalSalaries(periodStart, periodEnd);

  const totalCosts = expensesCosts + salariesCosts;

  // CALCULATIONS - Period
  const totalRevenue = salesRevenue - returnsRefunds; // CA NET = Ventes - Retours remboursés

  const operatingExpenses = useMemo(() => {
    return expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= periodStart && expDate <= periodEnd && exp.category !== 'investment';
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses, periodStart, periodEnd]);

  const investments = useMemo(() => {
    return expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= periodStart && expDate <= periodEnd && exp.category === 'investment';
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses, periodStart, periodEnd]);

  const totalOperatingCosts = operatingExpenses + salariesCosts;
  const operatingProfit = totalRevenue - totalOperatingCosts;
  const operatingProfitMargin = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;

  const netProfit = operatingProfit - investments;

  // CALCULATIONS - KPIs and Chart Data
  const {
    revenueGrowth,
    revenuePerServer,
    investmentRate,
    chartData,
  } = useMemo(() => {
    // 1. Previous Period Calculation
    const prevPeriodDate = new Date(periodStart);
    prevPeriodDate.setMonth(prevPeriodDate.getMonth() - 1);
    const prevPeriodStart = new Date(prevPeriodDate.getFullYear(), prevPeriodDate.getMonth(), 1);
    const prevPeriodEnd = new Date(prevPeriodDate.getFullYear(), prevPeriodDate.getMonth() + 1, 0);

    const prevSalesRevenue = sales
      .filter(sale => {
        const saleDate = getSaleDate(sale);
        return sale.status === 'validated' && saleDate >= prevPeriodStart && saleDate <= prevPeriodEnd;
      })
      .reduce((sum, sale) => sum + sale.total, 0);

    const prevReturnsRefunds = returns
      .filter(ret => {
        const retDate = new Date(ret.returnedAt);
        if (ret.status !== 'approved' && ret.status !== 'restocked') return false;
        if (!ret.isRefunded) return false;
        return retDate >= prevPeriodStart && retDate <= prevPeriodEnd;
      })
      .reduce((sum, ret) => sum + ret.refundAmount, 0);

    const prevTotalRevenue = prevSalesRevenue - prevReturnsRefunds;

    // 2. KPI Calculations
    const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;
    
    const serverCount = currentBar?.settings?.serversList?.length || 1;
    const revenuePerServer = totalRevenue / serverCount;

    const investmentRate = totalRevenue > 0 ? (investments / totalRevenue) * 100 : 0;

    // 3. Chart Data (last 12 months)
    const chartData = Array.from({ length: 12 }).map((_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleString('fr-FR', { month: 'short' });
      const year = date.getFullYear();
      const monthKey = `${month} ${year}`;

      const monthStart = new Date(year, date.getMonth(), 1);
      const monthEnd = new Date(year, date.getMonth() + 1, 0);

      const monthSales = sales
        .filter(s => new Date(s.date) >= monthStart && new Date(s.date) <= monthEnd)
        .reduce((sum, s) => sum + s.total, 0);
      
      const monthReturns = returns
        .filter(r => {
          const rDate = new Date(r.returnedAt);
          if (r.status !== 'approved' && r.status !== 'restocked') return false;
          if (!r.isRefunded) return false;
          return rDate >= monthStart && rDate <= monthEnd;
        })
        .reduce((sum, r) => sum + r.refundAmount, 0);

      const monthRevenue = monthSales - monthReturns;

      const monthOperatingExpenses = expenses
        .filter(e => new Date(e.date) >= monthStart && new Date(e.date) <= monthEnd && e.category !== 'investment')
        .reduce((sum, e) => sum + e.amount, 0);

      const monthSalaries = salariesHook.salaries
        .filter(s => new Date(s.paidAt) >= monthStart && new Date(s.paidAt) <= monthEnd)
        .reduce((sum, s) => sum + s.amount, 0);

      return {
        name: monthKey,
        Revenus: monthRevenue,
        'Coûts Opérationnels': monthOperatingExpenses + monthSalaries,
      };
    }).reverse();

    return { revenueGrowth, revenuePerServer, investmentRate, chartData };
  }, [totalRevenue, investments, operatingExpenses, sales, returns, expenses, salariesHook.salaries, periodStart, currentBar]);


  // CALCULATIONS - Cumulative Balance (for Vue Analytique)
  // Calculate all revenues and costs BEFORE the current period start
  const previousBalance = useMemo(() => {
    if (viewMode === 'tresorerie') return 0; // Not used in tresorerie view

    // ✅ 1. Start with initial balance (unique)
    const initialBalanceAmount = initialBalanceHook.getInitialBalanceAmount();

    // ✅ 2. Add capital contributions before period
    const previousCapitalContributions = capitalContributionsHook.getTotalContributions(periodStart);

    // 3. Sum all sales before period
    const previousSales = sales
      .filter(sale => {
        const saleDate = getSaleDate(sale);
        return sale.status === 'validated' && saleDate < periodStart;
      })
      .reduce((sum, sale) => sum + sale.total, 0);

    // 3. Sum all returns before period
    const previousReturns = returns
      .filter(ret => {
        if (ret.status !== 'approved' && ret.status !== 'restocked') return false;
        if (!ret.isRefunded) return false;
        return new Date(ret.returnedAt) < periodStart;
      })
      .reduce((sum, ret) => sum + ret.refundAmount, 0);

    // 4. Sum all expenses before period
    const previousExpenses = expenses
      .filter(exp => new Date(exp.date) < periodStart)
      .reduce((sum, exp) => sum + exp.amount, 0);

    // 5. Sum all salaries before period
    const previousSalaries = salariesHook.salaries
      .filter(sal => new Date(sal.paidAt) < periodStart)
      .reduce((sum, sal) => sum + sal.amount, 0);

    const previousRevenue = previousSales - previousReturns;
    const previousCosts = previousExpenses + previousSalaries;

    // ✅ Total = Solde initial + Apports capital + (Revenus - Coûts) des périodes antérieures
    return initialBalanceAmount + previousCapitalContributions + previousRevenue - previousCosts;
  }, [viewMode, sales, returns, expenses, salariesHook.salaries, periodStart, initialBalanceHook.initialBalance, capitalContributionsHook.contributions]);

  // Détail du solde de début (pour affichage détaillé dans la carte)
  const previousBalanceDetails = useMemo(() => {
    if (viewMode === 'tresorerie') return { initialBalance: 0, capitalContributions: 0, activityResult: 0 };

    const initialBalanceAmount = initialBalanceHook.getInitialBalanceAmount();
    const previousCapitalContributions = capitalContributionsHook.getTotalContributions(periodStart);

    const previousSales = sales
      .filter(sale => {
        const saleDate = getSaleDate(sale);
        return sale.status === 'validated' && saleDate < periodStart;
      })
      .reduce((sum, sale) => sum + sale.total, 0);

    const previousReturns = returns
      .filter(ret => {
        if (ret.status !== 'approved' && ret.status !== 'restocked') return false;
        if (!ret.isRefunded) return false;
        return new Date(ret.returnedAt) < periodStart;
      })
      .reduce((sum, ret) => sum + ret.refundAmount, 0);

    const previousExpenses = expenses
      .filter(exp => new Date(exp.date) < periodStart)
      .reduce((sum, exp) => sum + exp.amount, 0);

    const previousSalaries = salariesHook.salaries
      .filter(sal => new Date(sal.paidAt) < periodStart)
      .reduce((sum, sal) => sum + sal.amount, 0);

    const activityResult = (previousSales - previousReturns) - (previousExpenses + previousSalaries);

    return {
      initialBalance: initialBalanceAmount,
      capitalContributions: previousCapitalContributions,
      activityResult,
    };
  }, [viewMode, sales, returns, expenses, salariesHook.salaries, periodStart, initialBalanceHook.initialBalance, capitalContributionsHook.contributions]);

  // Final balance (for Vue Analytique)
  const finalBalance = previousBalance + netProfit;

  // Cash Runway (Fonds de roulement) - Nombre de mois de couverture
  const cashRunway = useMemo(() => {
    const averageMonthlyOperatingCosts = totalOperatingCosts > 0 ? totalOperatingCosts : 1;
    return finalBalance / averageMonthlyOperatingCosts;
  }, [finalBalance, totalOperatingCosts]);

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

  // Export comptable complet
  const handleExportAccounting = () => {
    const workbook = XLSX.utils.book_new();

    // Filtrer les données par période pour l'export
    const filteredSales = sales.filter(sale => {
      const saleDate = getSaleDate(sale);
      return sale.status === 'validated' && saleDate >= periodStart && saleDate <= periodEnd;
    });

    const filteredReturns = returns.filter(ret => {
      const retDate = new Date(ret.returnedAt);
      return retDate >= periodStart && retDate <= periodEnd;
    });

    const filteredSupplies = supplies.filter(supply => {
      const supplyDate = new Date(supply.date);
      return supplyDate >= periodStart && supplyDate <= periodEnd;
    });

    const filteredSalaries = salariesHook.salaries.filter(salary => {
      const salaryDate = new Date(salary.paidAt);
      return salaryDate >= periodStart && salaryDate <= periodEnd;
    });

    // Calculer les coûts d'approvisionnement
    // ✅ FIX: Utiliser totalCost qui est calculé correctement dans useSupplies
    // totalCost = (quantity / lotSize) * lotPrice
    const suppliesCosts = filteredSupplies.reduce((sum, supply) =>
      sum + supply.totalCost, 0
    );

    // Calculer apports de capital de la période
    const periodCapitalContributions = capitalContributionsHook.contributions.filter(contrib => {
      const contribDate = new Date(contrib.date);
      return contribDate >= periodStart && contribDate <= periodEnd;
    }).reduce((sum, contrib) => sum + contrib.amount, 0);

    // 1. ONGLET RÉSUMÉ
    const summaryData = [
      ['RAPPORT COMPTABLE', currentBar?.name || ''],
      ['Période', periodLabel],
      ['Date export', new Date().toLocaleDateString('fr-FR')],
      ['Exporté par', currentSession?.userName || ''],
      [],
      ['REVENUS'],
      ['Ventes brutes', totalRevenue + returnsRefunds],
      ['Retours remboursés', -returnsRefunds],
      ['Revenus nets', totalRevenue],
      [],
      ['COÛTS OPÉRATIONNELS'],
      ['Approvisionnements', suppliesCosts],
      ['Dépenses opérationnelles', operatingExpenses],
      ['Salaires', salariesCosts],
      ['Total coûts opérationnels', totalOperatingCosts],
      [],
      ['RÉSULTAT OPÉRATIONNEL'],
      ['Bénéfice opérationnel', operatingProfit],
      ['Marge opérationnelle (%)', operatingProfitMargin.toFixed(2)],
      [],
      ['INVESTISSEMENTS'],
      ['Investissements', investments],
      ['Taux investissement (%)', investmentRate.toFixed(2)],
      [],
      ['RÉSULTAT NET'],
      ['Bénéfice net', netProfit],
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

    // 2. ONGLET VENTES
    const salesData = filteredSales.flatMap(sale => {
      const saleDate = getSaleDate(sale);
      return sale.items.map(item => ({
        Date: saleDate.toLocaleDateString('fr-FR'),
        Heure: saleDate.toLocaleTimeString('fr-FR'),
        'ID Vente': sale.id.slice(0, 8),
        Produit: item.product.name,
        Volume: item.product.volume,
        Quantité: item.quantity,
        'Prix unitaire': item.product.price,
        Total: item.product.price * item.quantity,
        'Créé par': sale.createdBy,
        'Validé par': sale.validatedBy || 'N/A',
        'Statut': sale.status,
      }));
    }
    );
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
      Quantité: ret.quantity,
      'Montant remboursé': ret.refundAmount,
      Motif: ret.reason,
      Statut: ret.status,
      'Remis en stock': ret.autoRestock ? 'Oui' : 'Non',
    }));
    if (returnsData.length > 0) {
      const returnsSheet = XLSX.utils.json_to_sheet(returnsData);
      XLSX.utils.book_append_sheet(workbook, returnsSheet, 'Retours');
    }

    // 4. ONGLET APPROVISIONNEMENTS
    const suppliesData = filteredSupplies.map(supply => ({
      Date: new Date(supply.date).toLocaleDateString('fr-FR'),
      Produit: supply.productName,
      Quantité: supply.quantity,
      'Prix lot': supply.lotPrice,
      'Taille lot': supply.lotSize,
      'Coût total': supply.lotPrice * supply.lotSize,
      Fournisseur: supply.supplierName || 'N/A',
    }));
    if (suppliesData.length > 0) {
      const suppliesSheet = XLSX.utils.json_to_sheet(suppliesData);
      XLSX.utils.book_append_sheet(workbook, suppliesSheet, 'Approvisionnements');
    }

    // 5. ONGLET DÉPENSES OPÉRATIONNELLES
    const operatingExpensesData = expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= periodStart && expDate <= periodEnd && exp.category !== 'investment';
      })
      .map(exp => ({
        Date: new Date(exp.date).toLocaleDateString('fr-FR'),
        Catégorie: exp.category === 'water' ? 'Eau' :
                   exp.category === 'electricity' ? 'Électricité' :
                   exp.category === 'maintenance' ? 'Entretien' :
                   exp.customCategory || 'Autre',
        Description: exp.description,
        Montant: exp.amount,
      }));
    if (operatingExpensesData.length > 0) {
      const expensesSheet = XLSX.utils.json_to_sheet(operatingExpensesData);
      XLSX.utils.book_append_sheet(workbook, expensesSheet, 'Dépenses Opérationnelles');
    }

    // 6. ONGLET INVESTISSEMENTS
    const investmentsData = expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= periodStart && expDate <= periodEnd && exp.category === 'investment';
      })
      .map(exp => ({
        Date: new Date(exp.date).toLocaleDateString('fr-FR'),
        Description: exp.description,
        Montant: exp.amount,
      }));
    if (investmentsData.length > 0) {
      const investmentsSheet = XLSX.utils.json_to_sheet(investmentsData);
      XLSX.utils.book_append_sheet(workbook, investmentsSheet, 'Investissements');
    }

    // 7. ONGLET SALAIRES
    const salariesData = filteredSalaries.map(salary => ({
      Période: salary.period,
      Membre: salary.memberName,
      Montant: salary.amount,
      'Date paiement': new Date(salary.paidAt).toLocaleDateString('fr-FR'),
    }));
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
      const consignmentsData = consignmentsInPeriod.map(cons => ({
        Date: new Date(cons.createdAt).toLocaleDateString('fr-FR'),
        'ID Vente': cons.saleId.slice(0, 8),
        Produit: cons.productName,
        Quantité: cons.quantity,
        'Valeur totale': cons.totalValue,
        Client: cons.customerName,
        Téléphone: cons.customerPhone || 'N/A',
        Statut: cons.status === 'active' ? 'Active' :
                cons.status === 'claimed' ? 'Récupérée' :
                cons.status === 'expired' ? 'Expirée' :
                'Confisquée',
        'Date expiration': new Date(cons.expiresAt).toLocaleDateString('fr-FR'),
        'Date récup./expir.': cons.claimedAt ? new Date(cons.claimedAt).toLocaleDateString('fr-FR') :
                              cons.expiredAt ? new Date(cons.expiredAt).toLocaleDateString('fr-FR') :
                              'N/A',
      }));
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

        {/* Actions: Export + Solde initial */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAccounting}
            className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
            title="Exporter rapport comptable"
          >
            <Download size={18} />
            {!isMobile && <span>Exporter</span>}
          </button>

          <button
            onClick={() => setShowInitialBalanceModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
            title="Définir le solde initial"
          >
            <PlusCircle size={18} />
            {!isMobile && <span>Solde initial</span>}
          </button>

          <button
            onClick={() => setShowCapitalContributionModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
            title="Ajouter un apport de capital"
          >
            <DollarSign size={18} />
            {!isMobile && <span>Apport</span>}
          </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Operating Profit */}
          <div className={`bg-gradient-to-br ${
            operatingProfit >= 0
              ? 'from-green-500 to-emerald-600'
              : 'from-red-500 to-pink-600'
          } text-white rounded-xl p-4`}>
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
              Marge: {operatingProfitMargin.toFixed(1)}%
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

          {/* Operating Costs */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl p-4">
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
          <div className="bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white rounded-xl p-4 relative">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={20} />
              <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Investissements
              </p>
              {investmentRate > 20 && (
                <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
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
              {/* Détail de la composition */}
              <div className={`mt-2 pt-2 border-t border-white/20 space-y-1 ${isMobile ? 'text-[9px]' : 'text-[10px]'} opacity-80`}>
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

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-600">Marge Opérationnelle</p>
              <p className={`text-lg font-bold ${operatingProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {operatingProfitMargin.toFixed(1)}%
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
              <p className={`text-lg font-bold ${cashRunway >= 1 ? 'text-green-600' : cashRunway >= 0.5 ? 'text-orange-600' : 'text-red-600'}`}>
                {cashRunway.toFixed(1)} mois
              </p>
            </div>
          </div>

          {/* Charts */}
          <AnalyticsCharts data={chartData} expensesByCategory={expensesByCategoryData} />
        </div>
      )}

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

      {netProfit > 0 && operatingProfitMargin > 30 && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <TrendingUp className="text-green-500 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className={`font-medium text-green-800 ${isMobile ? 'text-sm' : ''}`}>
                ✅ Excellente rentabilité
              </p>
              <p className={`mt-1 text-green-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Votre marge bénéficiaire de {operatingProfitMargin.toFixed(1)}% est très bonne. Continuez ainsi!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Define Initial Balance */}
      {showInitialBalanceModal && (
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  initialBalanceHook.initialBalance
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                {initialBalanceHook.initialBalance ? 'Solde déjà défini' : 'Enregistrer'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: Add Capital Contribution */}
      {showCapitalContributionModal && (
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source <span className="text-red-500">*</span>
                </label>
                <select
                  value={capitalContributionForm.source}
                  onChange={(e) => setCapitalContributionForm(prev => ({ ...prev, source: e.target.value as import('../types').CapitalSource }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="owner">👤 Propriétaire (apport personnel)</option>
                  <option value="partner">🤝 Associé</option>
                  <option value="investor">💼 Investisseur externe</option>
                  <option value="loan">🏦 Prêt (banque/personnel)</option>
                  <option value="other">📋 Autre</option>
                </select>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
      )}
    </div>
  );
}
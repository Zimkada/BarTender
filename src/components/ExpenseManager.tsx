import { useMemo, useState, useEffect } from 'react';
import {
  Plus,
  TrendingDown,
  LayoutGrid,
  Receipt
} from 'lucide-react';
import {
  EXPENSE_CATEGORY_LABELS,
} from '../hooks/useExpenses';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useUnifiedExpenses } from '../hooks/pivots/useUnifiedExpenses';
import { useSalaries } from '../hooks/useSalaries';
import { useFeedback } from '../hooks/useFeedback';
import type { AccountingPeriodProps } from '../types/dateFilters';
import { PeriodFilter } from './common/filters/PeriodFilter';
import { ACCOUNTING_FILTERS, ACCOUNTING_FILTERS_MOBILE } from '../config/dateFilters';

// UI Components
import { Button } from './ui/Button';
import { ConfirmationModal } from './common/ConfirmationModal';

// Features Components
import { ExpenseListItem } from '../features/Accounting/components/ExpenseListItem';
import { ExpenseFormModal } from '../features/Accounting/components/ExpenseFormModal';
import { CategoryFormModal } from '../features/Accounting/components/CategoryFormModal';
import { SalaryListItem } from '../features/Accounting/components/SalaryListItem';
import { SalaryFormModal } from '../features/Accounting/components/SalaryFormModal';
import { getCurrentPeriod } from '../utils/accounting';
import {
  formatDate,
  formatPrice as formatPriceUtil
} from '../utils/formatters';

import type { BarMember, User } from '../types';

interface BarMemberWithUser extends BarMember {
  user: User;
}

interface ExpenseManagerProps {
  period: AccountingPeriodProps;
}

function ExpenseManagerContent({ period }: ExpenseManagerProps) {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const { showSuccess, showError } = useFeedback();

  // ✅ Utiliser le Smart Hook Élite pour les finances
  const { expenses: unifiedExpenses, customCategories } = useUnifiedExpenses(currentBar?.id);
  const {
    salaries,
    addSalary,
    deleteSalary,
    getSalariesByPeriod,
    getSalaryForPeriod
  } = useSalaries(currentBar?.id || '');

  const {
    addExpense,
    addCustomExpenseCategory,
    deleteExpense,
  } = useAppContext();

  // State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Salaries State
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set([getCurrentPeriod()]));
  const [members, setMembers] = useState<BarMemberWithUser[]>([]);
  const [salaryToDelete, setSalaryToDelete] = useState<string | null>(null);

  const salariesByPeriod = getSalariesByPeriod();

  const { getBarMembers } = useBarContext();

  // Load members
  useEffect(() => {
    if (!currentBar?.id) return;
    const loadMembers = async () => {
      try {
        const data = await getBarMembers(currentBar.id);
        setMembers(data || []);
      } catch (error) {
        console.error('Error loading members:', error);
      }
    };
    loadMembers();
  }, [currentBar?.id, getBarMembers]);

  // Période reçue depuis AccountingPage (source unique de vérité)
  const {
    timeRange,
    setTimeRange,
    startDate: periodStart,
    endDate: periodEnd,
    periodLabel,
    customRange,
    updateCustomRange
  } = period;

  // Confirmation Modal
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  const handleAddExpense = (data: any) => {
    try {
      addExpense({
        amount: parseFloat(data.amount),
        category: data.category,
        customCategoryId: data.category === 'custom' ? data.customCategoryId : undefined,
        date: new Date(data.date),
        notes: data.notes.trim() || undefined,
        createdBy: currentSession!.userId
      });
      showSuccess('Dépense enregistrée avec succès');
      setShowExpenseModal(false);
    } catch (error) {
      showError('Erreur lors de l\'ajout de la dépense');
    }
  };

  const handleAddCustomCategory = (data: { name: string; icon: string }) => {
    try {
      addCustomExpenseCategory(data.name, data.icon, currentSession!.userId);
      showSuccess('Catégorie créée');
      setShowCategoryModal(false);
    } catch (error) {
      showError('Erreur lors de la création de la catégorie');
    }
  };

  const confirmDeleteExpense = () => {
    if (expenseToDelete) {
      deleteExpense(expenseToDelete);
      setExpenseToDelete(null);
      showSuccess('Dépense supprimée');
    }
  };

  const handleAddSalary = (data: { memberId: string; amount: string; period: string }) => {
    try {
      addSalary({
        barId: currentBar!.id,
        memberId: data.memberId,
        amount: parseFloat(data.amount),
        period: data.period,
        paidAt: new Date(),
        createdBy: currentSession!.userId
      });

      showSuccess('Salaire enregistré avec succès');
      setShowSalaryModal(false);
    } catch (error: any) {
      showError(error.message || 'Erreur lors de l\'ajout du salaire');
    }
  };

  const confirmDeleteSalary = () => {
    if (salaryToDelete) {
      deleteSalary(salaryToDelete);
      setSalaryToDelete(null);
      showSuccess('Paiement supprimé');
    }
  };

  const toggleCategory = (categoryKey: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey);
    } else {
      newExpanded.add(categoryKey);
    }
    setExpandedCategories(newExpanded);
  };

  const togglePeriod = (period: string) => {
    const newExpanded = new Set(expandedPeriods);
    if (newExpanded.has(period)) {
      newExpanded.delete(period);
    } else {
      newExpanded.add(period);
    }
    setExpandedPeriods(newExpanded);
  };

  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return 'Membre inconnu';
    return member.user?.name || member.user?.username || 'N/A';
  };

  const getMemberRole = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member?.role || 'N/A';
  };

  // Générer les 12 derniers mois pour le sélecteur de salaires
  const periodOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      options.push(`${year}-${month}`);
    }
    return options;
  }, []);

  // ✨ Filter Unified Expenses
  const filteredUnified = useMemo(() => {
    return unifiedExpenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate >= periodStart && expDate <= periodEnd;
    });
  }, [unifiedExpenses, periodStart, periodEnd]);

  // ✨ Filter Salaries — comparaison par objets Date normalisés au 1er du mois
  const filteredSalaries = useMemo(() => {
    return salaries.filter(salary => {
      const salaryDate = new Date(`${salary.period}-01`);
      const pStartNorm = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
      const pEndNorm   = new Date(periodEnd.getFullYear(),   periodEnd.getMonth(),   1);
      return salaryDate >= pStartNorm && salaryDate <= pEndNorm;
    });
  }, [salaries, periodStart, periodEnd]);

  const totalExpenses = filteredUnified.reduce((sum, e) => sum + e.amount, 0) + filteredSalaries.reduce((sum, s) => sum + s.amount, 0);

  // ✨ Group by Category (Unified)
  const expensesByCategory = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; amount: number; count: number }> = {};

    filteredUnified.forEach(exp => {
      let key = exp.category;
      if (exp.category === 'custom' && exp.customCategoryId) {
        key = exp.customCategoryId;
      }

      if (!groups[key]) {
        // Fallback labels
        let label = (EXPENSE_CATEGORY_LABELS as any)[exp.category]?.label || exp.category;
        let icon = (EXPENSE_CATEGORY_LABELS as any)[exp.category]?.icon || '📝';

        if (exp.isSupply) {
          label = 'Approvisionnements';
          icon = '📦';
        } else if (exp.category === 'custom' && exp.customCategoryId) {
          const cat = customCategories.find(c => c.id === exp.customCategoryId);
          label = cat?.name || 'Personnalisée';
          icon = cat?.icon || '📝';
        }

        groups[key] = { label, icon, amount: 0, count: 0 };
      }

      groups[key].amount += exp.amount;
      groups[key].count += 1;
    });

    // Inject Salaries Group
    if (filteredSalaries.length > 0) {
      const salariesTotal = filteredSalaries.reduce((sum, s) => sum + s.amount, 0);
      groups['salaries'] = {
        label: 'Salaires & RH',
        icon: '👨‍💼',
        amount: salariesTotal,
        count: filteredSalaries.length
      };
    }

    return groups;
  }, [filteredUnified, customCategories, filteredSalaries]);

  // ✨ Unified Items List for Rendering
  const getItemsByCategory = (categoryKey: string) => {
    if (categoryKey === 'salaries') return []; // TODO: Retourner les paies ici
    return filteredUnified.filter(exp => {
      if (exp.isSupply && categoryKey === 'supply') return true;
      const expKey = exp.category === 'custom' && exp.customCategoryId ? exp.customCategoryId : exp.category;
      return expKey === categoryKey;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header with Premium Style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`font-bold text-gray-900 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            💸 <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">Dépenses & Charges</span>
          </h2>
          <p className="text-sm text-gray-500 font-medium tracking-tight">
            Gérez vos flux sortants et approvisionnements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryModal(true)}
            className="border-gray-200 text-gray-600 hover:bg-gray-50 bg-white"
          >
            <Plus size={16} className="md:hidden" />
            <span className="md:hidden">Catégorie</span>
            <LayoutGrid size={16} className="hidden md:inline mr-2" />
            <span className="hidden md:inline">Ajouter Catégorie</span>
          </Button>
          <div className="flex bg-brand-primary p-0.5 rounded-xl shadow-sm">
            <Button
              variant="default"
              onClick={() => setShowExpenseModal(true)}
              className="bg-brand-primary hover:bg-brand-dark shadow-none text-white rounded-l-lg rounded-r-none border-r border-brand-dark/20 h-9 px-4"
            >
              <Plus size={16} className="mr-2 md:hidden" />
              <span className="hidden md:inline mr-1">Ajouter</span>
              Dépense
            </Button>
            <Button
              variant="default"
              onClick={() => setShowSalaryModal(true)}
              className="bg-brand-primary hover:bg-brand-dark shadow-none text-white rounded-r-lg rounded-l-none h-9 px-4 border-l border-brand-dark/10"
            >
              <Plus size={16} className="mr-2 md:hidden" />
              <span className="hidden md:inline mr-1">Ajouter</span>
              Salaire
            </Button>
          </div>
        </div>
      </div>

      {/* Period & Total Quick Look */}
      <div className="flex flex-col gap-4">
        {/* Filters Row */}
        <div className="flex flex-col items-start">
          <PeriodFilter
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            availableFilters={ACCOUNTING_FILTERS}
            customRange={customRange}
            updateCustomRange={updateCustomRange}
            justify="start"
            className="flex-none"
          />
        </div>

        {/* Total Row */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group flex items-center justify-between overflow-hidden relative min-h-[56px]">
          <div className="relative z-10 flex flex-col justify-center">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Total {periodLabel}
            </h3>
            <p className="font-mono font-bold text-gray-900 tracking-tight text-3xl">
              {formatPrice(totalExpenses)}
            </p>
          </div>
          <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:scale-110 transition-transform relative z-10">
            <TrendingDown size={20} />
          </div>
          {/* Decorative Background Element */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none opacity-50 z-0"></div>
        </div>
      </div>

      {/* Categories List */}
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-gray-900 flex items-center gap-2 text-sm uppercase tracking-widest">
            Par catégorie
          </h3>
          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full font-bold">
            {Object.keys(expensesByCategory).length} groupes
          </span>
        </div>

        <div className="divide-y divide-gray-50">
          {Object.keys(expensesByCategory).length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                <Receipt className="text-gray-300" size={32} />
              </div>
              <p className="text-gray-500 font-medium">Aucune dépense enregistrée sur cette période.</p>
            </div>
          ) : (
            Object.entries(expensesByCategory)
              .sort((a, b) => b[1].amount - a[1].amount) // Higher first
              .map(([key, data]) => {
                if (key === 'salaries') {
                  return (
                    <div key={key} className="bg-gray-50/50">
                      <ExpenseListItem
                        key={key}
                        categoryKey={key}
                        data={data}
                        items={[]}
                        isExpanded={expandedCategories.has(key)}
                        onToggle={() => toggleCategory(key)}
                        onDelete={() => { }} // Not possible to bulk delete salaries here
                        isMobile={isMobile}
                      />
                      {expandedCategories.has(key) && (
                        <div className="bg-gray-50/80 px-4 md:px-12 py-4 border-t border-gray-100 flex flex-col gap-3 shadow-inner">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-bold text-gray-700">Journal des Paies</h4>
                            <Button variant="outline" size="sm" onClick={() => setShowSalaryModal(true)} className="h-8 text-xs bg-white border-brand-primary/20 text-brand-primary hover:bg-brand-primary/5">
                              <Plus size={14} className="mr-1" /> Payer
                            </Button>
                          </div>
                          {Object.keys(salariesByPeriod).sort().reverse().map(period => (
                            <SalaryListItem
                              key={period}
                              period={period}
                              data={salariesByPeriod[period]}
                              isExpanded={expandedPeriods.has(period)}
                              onToggle={() => togglePeriod(period)}
                              onDelete={(id) => setSalaryToDelete(id)}
                              getMemberName={getMemberName}
                              getMemberRole={getMemberRole}
                              isMobile={isMobile}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <ExpenseListItem
                    key={key}
                    categoryKey={key}
                    data={data}
                    items={getItemsByCategory(key)}
                    isExpanded={expandedCategories.has(key)}
                    onToggle={() => toggleCategory(key)}
                    onDelete={(id) => setExpenseToDelete(id)}
                    isMobile={isMobile}
                  />
                );
              })
          )
          }
        </div>
      </div>

      {/* Modals */}
      <ExpenseFormModal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSubmit={handleAddExpense}
        customCategories={customCategories}
      />

      <CategoryFormModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSubmit={handleAddCustomCategory}
      />

      <SalaryFormModal
        open={showSalaryModal}
        onClose={() => setShowSalaryModal(false)}
        onSubmit={handleAddSalary}
        members={members}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        periodOptions={periodOptions}
        getSalaryForPeriod={getSalaryForPeriod}
      />

      <ConfirmationModal
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={confirmDeleteExpense}
        title="Supprimer la dépense"
        message="Voulez-vous vraiment supprimer cette dépense ? Cette action impactera immédiatement votre balance comptable."
        confirmLabel="Supprimer"
        isDestructive={true}
      />

      <ConfirmationModal
        isOpen={!!salaryToDelete}
        onClose={() => setSalaryToDelete(null)}
        onConfirm={confirmDeleteSalary}
        title="Supprimer le paiement"
        message="Voulez-vous vraiment supprimer cet enregistrement de salaire ? Cette action impactera votre balance comptable."
        confirmLabel="Supprimer"
        isDestructive={true}
      />
    </div>
  );
}

export function ExpenseManager({ period }: ExpenseManagerProps) {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();

  if (!currentBar || !currentSession) {
    return null;
  }

  return <ExpenseManagerContent period={period} />;
}

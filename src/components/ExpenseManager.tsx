import { useMemo, useState } from 'react';
import {
  Plus,
  TrendingDown,
  LayoutGrid
} from 'lucide-react';
import {
  EXPENSE_CATEGORY_LABELS,
} from '../hooks/useExpenses';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { getWeekRange, getMonthRange } from '../utils/accounting';
import { useViewport } from '../hooks/useViewport';
import { useUnifiedExpenses } from '../hooks/pivots/useUnifiedExpenses';
import { useFeedback } from '../hooks/useFeedback';

// UI Components
import { Button } from './ui/Button';
import { ConfirmationModal } from './common/ConfirmationModal';

// Features Components
import { ExpenseListItem } from '../features/Accounting/components/ExpenseListItem';
import { ExpenseFormModal } from '../features/Accounting/components/ExpenseFormModal';
import { CategoryFormModal } from '../features/Accounting/components/CategoryFormModal';

type PeriodType = 'week' | 'month' | 'all';

function ExpenseManagerContent() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const { showSuccess, showError } = useFeedback();

  // ✅ Utiliser le Smart Hook Élite pour les finances
  const { expenses: unifiedExpenses, customCategories } = useUnifiedExpenses(currentBar?.id);

  const {
    addExpense,
    addCustomExpenseCategory,
    deleteExpense,
  } = useAppContext();

  // State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  const toggleCategory = (categoryKey: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey);
    } else {
      newExpanded.add(categoryKey);
    }
    setExpandedCategories(newExpanded);
  };

  // Calculate period range
  const getPeriodRange = () => {
    const now = new Date();
    if (periodType === 'week') return getWeekRange();
    if (periodType === 'month') return getMonthRange();
    return { start: new Date(2020, 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  };

  const { start: periodStart, end: periodEnd } = getPeriodRange();

  // ✨ Filter Unified Expenses
  const filteredUnified = useMemo(() => {
    return unifiedExpenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate >= periodStart && expDate <= periodEnd;
    });
  }, [unifiedExpenses, periodStart, periodEnd]);

  const totalExpenses = filteredUnified.reduce((sum, e) => sum + e.amount, 0);

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

    return groups;
  }, [filteredUnified, customCategories]);

  // ✨ Unified Items List for Rendering
  const getItemsByCategory = (categoryKey: string) => {
    return filteredUnified.filter(exp => {
      if (exp.isSupply && categoryKey === 'supply') return true;
      const expKey = exp.category === 'custom' && exp.customCategoryId ? exp.customCategoryId : exp.category;
      return expKey === categoryKey;
    });
  };

  const periodLabel = periodType === 'week' ? 'Semaine' : periodType === 'month' ? 'Mois' : 'Global';

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
            className="border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <LayoutGrid size={16} className="mr-2" />
            Catégories
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowExpenseModal(true)}
            className="bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-200"
          >
            <Plus size={18} className="mr-2" />
            Dépense
          </Button>
        </div>
      </div>

      {/* Period & Total Quick Look */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white/50 backdrop-blur-sm border border-white/60 p-2 rounded-2xl shadow-sm flex items-center justify-between gap-1">
          {(['week', 'month', 'all'] as PeriodType[]).map(type => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${periodType === type
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              {type === 'week' ? 'Semaine' : type === 'month' ? 'Mois' : 'Tout'}
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 bg-gradient-to-br from-rose-600 to-rose-700 text-white rounded-2xl p-4 shadow-xl flex items-center justify-between overflow-hidden relative group">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">Total {periodLabel}</p>
            <p className="text-3xl font-black tracking-tighter">
              {formatPrice(totalExpenses)}
            </p>
          </div>
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center relative z-10 transition-transform group-hover:scale-110">
            <TrendingDown className="text-rose-400" size={32} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
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
              .map(([key, data]) => (
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
              ))
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

      <ConfirmationModal
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={confirmDeleteExpense}
        title="Supprimer la dépense"
        message="Voulez-vous vraiment supprimer cette dépense ? Cette action impactera immédiatement votre balance comptable."
        confirmLabel="Supprimer"
        isDestructive={true}
      />
    </div>
  );
}

export function ExpenseManager() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();

  if (!currentBar || !currentSession) {
    return null;
  }

  return <ExpenseManagerContent />;
}

import { Receipt } from 'lucide-react';
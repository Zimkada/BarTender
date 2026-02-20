import { useMemo, useState } from 'react';
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
            className="bg-brand-primary hover:bg-brand-dark shadow-sm text-white"
          >
            <Plus size={18} className="mr-2" />
            Dépense
          </Button>
        </div>
      </div>

      {/* Period & Total Quick Look */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white/40 backdrop-blur-md rounded-2xl p-1 gap-1.5 border border-brand-subtle shadow-sm flex items-center justify-between overflow-hidden">
          {(['week', 'month', 'all'] as PeriodType[]).map(type => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={`flex-1 py-2 px-3 h-10 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all sm:min-w-[80px] ${periodType === type
                ? 'glass-action-button-active-2026 shadow-md shadow-brand-subtle text-brand-primary'
                : 'glass-action-button-2026 text-gray-500 hover:text-brand-primary'
                }`}
            >
              {type === 'week' ? 'Semaine' : type === 'month' ? 'Mois' : 'Tout'}
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group flex items-center justify-between overflow-hidden relative">
          <div className="relative z-10 flex flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Total {periodLabel}
            </h3>
            <p className="font-mono font-bold text-gray-900 tracking-tight text-3xl">
              {formatPrice(totalExpenses)}
            </p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl group-hover:scale-110 transition-transform relative z-10">
            <TrendingDown size={28} />
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

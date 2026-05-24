import { useMemo, useState, useEffect } from 'react';
import {
  Plus,
  TrendingDown,
  LayoutGrid,
  Receipt,
  Settings,
  UserCog,
  Briefcase
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
import { getErrorMessage } from '../utils/errorHandler';
import { PeriodFilter } from './common/filters/PeriodFilter';
import { ACCOUNTING_FILTERS } from '../config/dateFilters';

// UI Components
import { Button } from './ui/Button';
import { ConfirmationModal } from './common/ConfirmationModal';

// Features Components
import { ExpenseListItem } from '../features/Accounting/components/ExpenseListItem';
import { ExpenseFormModal } from '../features/Accounting/components/ExpenseFormModal';
import { CategoryFormModal } from '../features/Accounting/components/CategoryFormModal';
import { SalaryListItem } from '../features/Accounting/components/SalaryListItem';
import { SalaryFormModal } from '../features/Accounting/components/SalaryFormModal';
import { EditSupplyMetadataModal } from '../features/Accounting/components/EditSupplyMetadataModal';
import { useStockMutations } from '../hooks/mutations/useStockMutations';
import type { UnifiedExpense } from '../hooks/pivots/useUnifiedExpenses';
import { getCurrentPeriod } from '../utils/accounting';

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

  const { reverseSupply, updateSupplyMetadata } = useStockMutations(currentBar?.id);
  // Promoteur uniquement — le RPC serveur rejette aussi les gérants,
  // mais on aligne l'UI pour éviter une action vouée à échouer.
  const canManageSupplies = currentSession?.role === 'promoteur' || currentSession?.role === 'super_admin';

  // State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Supply reverse / edit state
  const [supplyToReverse, setSupplyToReverse] = useState<UnifiedExpense | null>(null);
  const [supplyToEdit, setSupplyToEdit] = useState<UnifiedExpense | null>(null);

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

  const handleConfirmReverseSupply = () => {
    if (!supplyToReverse || !supplyToReverse.supplyProductId) return;
    reverseSupply.mutate(
      { supplyId: supplyToReverse.id, productId: supplyToReverse.supplyProductId },
      { onSettled: () => setSupplyToReverse(null) }
    );
  };

  const handleSubmitEditSupply = (updates: { supplierName: string; supplierPhone: string; notes: string }) => {
    if (!supplyToEdit) return;
    updateSupplyMetadata.mutate(
      { supplyId: supplyToEdit.id, updates },
      { onSettled: () => setSupplyToEdit(null) }
    );
  };

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
    } catch {
      showError('Erreur lors de l\'ajout de la dépense');
    }
  };

  const handleAddCustomCategory = (data: { name: string; icon: string }) => {
    try {
      addCustomExpenseCategory(data.name, data.icon, currentSession!.userId);
      showSuccess('Catégorie créée');
      setShowCategoryModal(false);
    } catch {
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
    } catch (error) {
      showError(getErrorMessage(error) || 'Erreur lors de l\'ajout du salaire');
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

  // Filtrage local (pour l'affichage temps réel avant sync ou réactivité UI)
  const filteredUnified = useMemo(() => {
    return unifiedExpenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate >= periodStart && expDate <= periodEnd;
    });
  }, [unifiedExpenses, periodStart, periodEnd]);

  const filteredSalaries = useMemo(() => {
    return salaries.filter(sal => {
      const paidAt = new Date(sal.paidAt);
      return paidAt >= periodStart && paidAt <= periodEnd;
    });
  }, [salaries, periodStart, periodEnd]);

  const filteredSalariesTotal = useMemo(() => {
    return filteredSalaries.reduce((sum, sal) => sum + sal.amount, 0);
  }, [filteredSalaries]);

  // 📈 KPIs — Unified local state approach
  // ✅ Fixes audit findings:
  //   1. Consistent data source (filteredUnified) for both total and categories
  //   2. Includes all expense types (investments, supplies, etc.) — not just operating_expenses
  const { totalExpenses, operatingExpenses, investmentExpenses } = useMemo(() => {
    // 🛡️ CRITICAL: Exclude salaries (already in filteredSalariesTotal) and reversed supplies
    // Reversed supplies stay in the list for audit trail but must not count toward the total
    let operating = 0;
    let investments = 0;
    filteredUnified.forEach(exp => {
      if (exp.category === 'salary' || exp.supplyReversed) return;
      if (exp.category === 'investment') {
        investments += exp.amount;
      } else {
        operating += exp.amount;
      }
    });
    return {
      totalExpenses: operating + investments + filteredSalariesTotal,
      operatingExpenses: operating,
      investmentExpenses: investments,
    };
  }, [filteredUnified, filteredSalariesTotal]);

  // ✨ Group by Category (Unified)
  const expensesByCategory = useMemo(() => {
    const groups: Record<string, { label: string; icon: string; amount: number; count: number }> = {};

    filteredUnified.forEach(exp => {
      if (exp.category === 'salary') return;
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

      // Reversed supplies stay in the list (audit trail) but don't add to the group amount
      if (!exp.supplyReversed) {
        groups[key].amount += exp.amount;
      }
      groups[key].count += 1;
    });

    if (filteredSalaries.length > 0) {
      const salaryMeta = (EXPENSE_CATEGORY_LABELS as any).salary;
      groups['salary'] = {
        label: salaryMeta?.label || 'Salaires & RH',
        icon: salaryMeta?.icon || '👨‍💼',
        amount: filteredSalariesTotal,
        count: filteredSalaries.length
      };
    }

    return groups;
  }, [filteredUnified, customCategories, filteredSalaries, filteredSalariesTotal]);

  // ✨ Unified Items List for Rendering
  const getItemsByCategory = (categoryKey: string) => {
    if (categoryKey === 'salary') return [];
    return filteredUnified.filter(exp => {
      if (exp.isSupply && categoryKey === 'supply') return true;
      const expKey = exp.category === 'custom' && exp.customCategoryId ? exp.customCategoryId : exp.category;
      return expKey === categoryKey;
    });
  };

  return (
    <div className="space-y-6">
      {/* Actions toolbar — le titre est porté par TabbedPageHeader */}
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryModal(true)}
            className="border-border text-foreground/80 hover:bg-muted bg-card"
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

        {/* Total Row — KPI principal */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between min-h-[56px]">
          <div className="flex flex-col justify-center">
            <h3 className="text-micro text-muted-foreground mb-1">
              Total {periodLabel}
            </h3>
            <p className="text-h1 font-semibold text-foreground tabular-nums">
              {formatPrice(totalExpenses)}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
            <TrendingDown size={18} />
          </div>
        </div>

        {/* 3 sous-KPIs — Opérationnel / Salaires / Investissements */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Opérationnel', value: operatingExpenses, icon: Settings },
            { label: 'Salaires', value: filteredSalariesTotal, icon: UserCog },
            { label: 'Investissements', value: investmentExpenses, icon: Briefcase },
          ].map((kpi, idx) => (
            <div key={idx} className="bg-card rounded-2xl p-4 shadow-sm border border-border flex items-center gap-3 hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center flex-shrink-0">
                <kpi.icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-micro text-muted-foreground">{kpi.label}</p>
                <p className="text-body font-semibold text-foreground tabular-nums truncate">
                  {formatPrice(kpi.value)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories List */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-h3 text-foreground">
            Par catégorie
          </h3>
          <span className="bg-muted text-foreground/70 text-caption px-2 py-0.5 rounded-full font-medium tabular-nums">
            {Object.keys(expensesByCategory).length} groupes
          </span>
        </div>

        <div className="divide-y divide-border">
          {Object.keys(expensesByCategory).length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <Receipt className="text-muted-foreground/60" size={32} />
              </div>
              <p className="text-muted-foreground font-medium">Aucune dépense enregistrée sur cette période.</p>
            </div>
          ) : (
            Object.entries(expensesByCategory)
              .sort((a, b) => b[1].amount - a[1].amount) // Higher first
              .map(([key, data]) => {
                if (key === 'salary') {
                  return (
                    <div key={key} className="bg-muted/50">
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
                        <div className="bg-muted/80 px-4 md:px-12 py-4 border-t border-border flex flex-col gap-3 shadow-inner">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="text-body-sm font-semibold text-foreground/80">Journal des Paies</h4>
                            <Button variant="outline" size="sm" onClick={() => setShowSalaryModal(true)} className="h-8 text-caption bg-card border-brand-primary/20 text-brand-primary hover:bg-brand-primary/5">
                              <Plus size={14} className="mr-1" /> Payer
                            </Button>
                          </div>
                          {Object.keys(salariesByPeriod)
                            .filter(period => {
                              // 🛡️ FIX : Filtrer par paidAt (date réelle de paiement)
                              // et non par période comptable (YYYY-MM).
                              // Cas concret : salaire de janvier payé en février doit
                              // apparaître dans le journal "Aujourd'hui" ou "Ce mois-ci".
                              return salariesByPeriod[period].salaries.some(sal => {
                                const paidAt = new Date(sal.paidAt);
                                return paidAt >= periodStart && paidAt <= periodEnd;
                              });
                            })
                            .sort().reverse().map(period => (
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
                    onReverseSupply={setSupplyToReverse}
                    onEditSupplyMetadata={setSupplyToEdit}
                    canManageSupplies={canManageSupplies}
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

      <ConfirmationModal
        isOpen={!!supplyToReverse}
        onClose={() => setSupplyToReverse(null)}
        onConfirm={handleConfirmReverseSupply}
        title="Annuler l'approvisionnement"
        message={`Cette action va créer une écriture d'annulation pour "${supplyToReverse?.productName ?? 'cet approvisionnement'}" (${supplyToReverse?.quantity ?? ''} unités). Le stock et la comptabilité seront corrigés automatiquement. L'opération originale reste visible dans l'historique.`}
        confirmLabel={reverseSupply.isPending ? 'Annulation…' : 'Confirmer l\'annulation'}
        cancelLabel="Garder"
        isDestructive={true}
        isLoading={reverseSupply.isPending}
      />

      {supplyToEdit && (
        <EditSupplyMetadataModal
          open={!!supplyToEdit}
          onClose={() => setSupplyToEdit(null)}
          onSubmit={handleSubmitEditSupply}
          isLoading={updateSupplyMetadata.isPending}
          initial={{
            supplierName: supplyToEdit.supplySupplier ?? '',
            supplierPhone: supplyToEdit.supplySupplierPhone ?? '',
            notes: supplyToEdit.notes ?? '',
            productName: supplyToEdit.productName,
          }}
        />
      )}
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

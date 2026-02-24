// ===== HELPER FUNCTIONS POUR EXPENSES =====
// ⚠️ Ce hook ne gère plus le state (maintenant dans AppContext)
// Il fournit seulement des fonctions utilitaires pour les dépenses

import { Expense, ExpenseCategoryCustom } from '../types';

export const EXPENSE_CATEGORY_LABELS = {
  supply: { label: 'Approvisionnements', icon: '📦', color: 'green' },
  water: { label: 'Facture Eau', icon: '💧', color: 'blue' },
  electricity: { label: 'Facture Électricité', icon: '⚡', color: 'yellow' },
  maintenance: { label: 'Entretien/Réparations', icon: '🔧', color: 'gray' },
  investment: { label: 'Investissement', icon: '📈', color: 'purple' },
  salary: { label: 'Salaires & RH', icon: '👨‍💼', color: 'indigo' },
  custom: { label: 'Personnalisée', icon: '📝', color: 'purple' },
};

// ===== FONCTIONS UTILITAIRES =====

// Obtenir le label d'une catégorie
export const getCategoryLabel = (expense: Expense, customCategories: ExpenseCategoryCustom[]) => {
  if (expense.category === 'custom' && expense.customCategoryId) {
    const custom = customCategories.find(c => c.id === expense.customCategoryId);
    return custom?.name || 'Personnalisée';
  }
  return EXPENSE_CATEGORY_LABELS[expense.category]?.label || expense.category;
};

// Obtenir l'icône d'une catégorie
export const getCategoryIcon = (expense: Expense, customCategories: ExpenseCategoryCustom[]) => {
  if (expense.category === 'custom' && expense.customCategoryId) {
    const custom = customCategories.find(c => c.id === expense.customCategoryId);
    return custom?.icon || '📝';
  }
  return EXPENSE_CATEGORY_LABELS[expense.category]?.icon || '📝';
};

// Calculer le total des dépenses pour une période
export const getTotalExpenses = (expenses: Expense[], startDate: Date, endDate: Date) => {
  return expenses
    .filter(exp => {
      const expDate = new Date(exp.date);
      return expDate >= startDate && expDate <= endDate;
    })
    .reduce((sum, exp) => sum + exp.amount, 0);
};

// Obtenir les dépenses par catégorie
export const getExpensesByCategory = (
  expenses: Expense[],
  customCategories: ExpenseCategoryCustom[],
  startDate: Date,
  endDate: Date
) => {
  const filtered = expenses.filter(exp => {
    const expDate = new Date(exp.date);
    return expDate >= startDate && expDate <= endDate;
  });

  const byCategory: Record<string, { label: string; icon: string; amount: number; count: number }> = {};

  filtered.forEach(exp => {
    const key = exp.category === 'custom' && exp.customCategoryId
      ? exp.customCategoryId
      : exp.category;

    if (!byCategory[key]) {
      byCategory[key] = {
        label: getCategoryLabel(exp, customCategories),
        icon: getCategoryIcon(exp, customCategories),
        amount: 0,
        count: 0,
      };
    }

    byCategory[key].amount += exp.amount;
    byCategory[key].count += 1;
  });

  return byCategory;
};

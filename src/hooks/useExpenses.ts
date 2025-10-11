import { useState, useEffect } from 'react';
import { Expense, ExpenseCategoryCustom } from '../types';
import { useLocalStorage } from './useLocalStorage';

export const EXPENSE_CATEGORY_LABELS = {
  supply: { label: 'Approvisionnements', icon: '📦', color: 'green' },
  water: { label: 'Facture Eau', icon: '💧', color: 'blue' },
  electricity: { label: 'Facture Électricité', icon: '⚡', color: 'yellow' },
  maintenance: { label: 'Entretien/Réparations', icon: '🔧', color: 'gray' },
  custom: { label: 'Personnalisée', icon: '📝', color: 'purple' },
};

export function useExpenses(barId: string) {
  const [expenses, setExpenses] = useLocalStorage<Expense[]>(`expenses_${barId}`, []);
  const [customCategories, setCustomCategories] = useLocalStorage<ExpenseCategoryCustom[]>(
    `expense_categories_${barId}`,
    []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Créer une dépense
  const addExpense = (expense: Omit<Expense, 'id' | 'createdAt'>) => {
    const newExpense: Expense = {
      ...expense,
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    setExpenses([...expenses, newExpense]);
    return newExpense;
  };

  // Créer une catégorie personnalisée
  const addCustomCategory = (name: string, icon: string, createdBy: string) => {
    const newCategory: ExpenseCategoryCustom = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      barId,
      name,
      icon,
      createdAt: new Date(),
      createdBy,
    };

    setCustomCategories([...customCategories, newCategory]);
    return newCategory;
  };

  // Supprimer une dépense
  const deleteExpense = (expenseId: string) => {
    setExpenses(expenses.filter(exp => exp.id !== expenseId));
  };

  // Obtenir toutes les catégories (standard + custom)
  const getAllCategories = () => {
    return customCategories;
  };

  // Obtenir le label d'une catégorie
  const getCategoryLabel = (expense: Expense) => {
    if (expense.category === 'custom' && expense.customCategoryId) {
      const custom = customCategories.find(c => c.id === expense.customCategoryId);
      return custom?.name || 'Personnalisée';
    }
    return EXPENSE_CATEGORY_LABELS[expense.category]?.label || expense.category;
  };

  // Obtenir l'icône d'une catégorie
  const getCategoryIcon = (expense: Expense) => {
    if (expense.category === 'custom' && expense.customCategoryId) {
      const custom = customCategories.find(c => c.id === expense.customCategoryId);
      return custom?.icon || '📝';
    }
    return EXPENSE_CATEGORY_LABELS[expense.category]?.icon || '📝';
  };

  // Calculer le total des dépenses pour une période
  const getTotalExpenses = (startDate: Date, endDate: Date) => {
    return expenses
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= startDate && expDate <= endDate;
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  };

  // Obtenir les dépenses par catégorie
  const getExpensesByCategory = (startDate: Date, endDate: Date) => {
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
          label: getCategoryLabel(exp),
          icon: getCategoryIcon(exp),
          amount: 0,
          count: 0,
        };
      }

      byCategory[key].amount += exp.amount;
      byCategory[key].count += 1;
    });

    return byCategory;
  };

  return {
    expenses,
    customCategories,
    isLoading,
    addExpense,
    addCustomCategory,
    deleteExpense,
    getAllCategories,
    getCategoryLabel,
    getCategoryIcon,
    getTotalExpenses,
    getExpensesByCategory,
  };
}

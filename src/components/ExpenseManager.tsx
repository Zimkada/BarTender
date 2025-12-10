import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  X,
  TrendingDown,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  EXPENSE_CATEGORY_LABELS,
  getTotalExpenses,
  getExpensesByCategory
} from '../hooks/useExpenses';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { getWeekRange, getMonthRange } from '../utils/accounting';
import { ExpenseCategory } from '../types';
import { useViewport } from '../hooks/useViewport';
import { Textarea } from './ui/Textarea';
import { Label } from './ui/Label';
import { Select } from './ui/Select';

type PeriodType = 'week' | 'month' | 'all';

function ExpenseManagerContent() {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();

  // ✅ Utiliser AppContext pour les dépenses et les supplies
  const {
    expenses,
    supplies, // ✨ NOUVEAU
    customExpenseCategories,
    addExpense,
    addCustomExpenseCategory,
    deleteExpense,
  } = useAppContext();

  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Form states
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('water');
  const [customCategoryId, setCustomCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Custom category form
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📝');

  const handleAddExpense = () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Montant invalide');
      return;
    }

    if (category === 'custom' && !customCategoryId) {
      alert('Sélectionnez une catégorie personnalisée');
      return;
    }

    addExpense({
      barId: currentBar!.id,
      amount: parseFloat(amount),
      category,
      customCategoryId: category === 'custom' ? customCategoryId : undefined,
      date: new Date(date),
      notes: notes.trim() || undefined,
      createdBy: currentSession!.userId
    });

    // Reset form
    setAmount('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    setShowForm(false);
  };

  const handleAddCustomCategory = () => {
    if (!newCategoryName.trim()) {
      alert('Nom de catégorie requis');
      return;
    }

    addCustomExpenseCategory(newCategoryName.trim(), newCategoryIcon, currentSession!.userId);
    setNewCategoryName('');
    setNewCategoryIcon('📝');
    setShowCategoryForm(false);
  };

  const handleDeleteExpense = (expenseId: string) => {
    if (confirm('Supprimer cette dépense ?')) {
      deleteExpense(expenseId);
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
    if (periodType === 'week') return getWeekRange();
    if (periodType === 'month') return getMonthRange();
    return { start: new Date(0), end: new Date() };
  };

  const { start: periodStart, end: periodEnd } = getPeriodRange();

  // ✨ Filter Supplies
  const filteredSupplies = supplies.filter(supply => {
    const supplyDate = new Date(supply.date);
    return supplyDate >= periodStart && supplyDate <= periodEnd;
  });

  const suppliesTotal = filteredSupplies.reduce((sum, s) => sum + s.totalCost, 0);

  // ✨ Filter Expenses
  const filteredExpenses = expenses.filter(exp => {
    const expDate = new Date(exp.date);
    return expDate >= periodStart && expDate <= periodEnd;
  });

  const expensesTotal = getTotalExpenses(expenses, periodStart, periodEnd);

  // ✨ Total Global
  const totalExpenses = expensesTotal + suppliesTotal;

  // ✨ Merge Categories
  const expensesByCategory = getExpensesByCategory(expenses, customExpenseCategories, periodStart, periodEnd);

  if (filteredSupplies.length > 0) {
    expensesByCategory['supplies'] = {
      label: 'Approvisionnements',
      icon: '📦',
      amount: suppliesTotal,
      count: filteredSupplies.length
    };
  }

  // ✨ Unified Items List for Rendering
  const getItemsByCategory = (categoryKey: string) => {
    if (categoryKey === 'supplies') {
      return filteredSupplies.map(s => ({
        id: s.id,
        date: s.date,
        amount: s.totalCost,
        notes: `${s.productName} (${s.quantity} unités)`,
        isSupply: true
      }));
    }

    return filteredExpenses
      .filter(exp => {
        const expKey = exp.category === 'custom' && exp.customCategoryId
          ? exp.customCategoryId
          : exp.category;
        return expKey === categoryKey;
      })
      .map(exp => ({
        id: exp.id,
        date: exp.date,
        amount: exp.amount,
        notes: exp.notes,
        isSupply: false
      }));
  };

  const periodLabel = periodType === 'week' ? 'Semaine' : periodType === 'month' ? 'Mois' : 'Tout';

  return (
    <div className={`${isMobile ? 'p-3 space-y-3' : 'p-6 space-y-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
            💸 Gestion des Dépenses
          </h2>
          <p className={`text-gray-600 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {currentBar!.name}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className={`bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2 ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-2'
            }`}
        >
          <Plus size={isMobile ? 16 : 20} />
          {!isMobile && 'Ajouter'}
        </button>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg w-fit">
        {(['week', 'month', 'all'] as PeriodType[]).map(type => (
          <button
            key={type}
            onClick={() => setPeriodType(type)}
            className={`px-3 py-1.5 rounded-md transition-colors ${isMobile ? 'text-xs' : 'text-sm'} ${periodType === type
              ? 'bg-amber-500 text-white'
              : 'text-gray-600 hover:bg-gray-200'
              }`}
          >
            {type === 'week' ? 'Semaine' : type === 'month' ? 'Mois' : 'Tout'}
          </button>
        ))}
      </div>

      {/* Total */}
      <div className="bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>Total {periodLabel}</p>
            <p className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'}`}>
              {formatPrice(totalExpenses)}
            </p>
          </div>
          <TrendingDown size={isMobile ? 32 : 48} className="opacity-20" />
        </div>
      </div>

      {/* By Category */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
            Par catégorie
          </h3>
        </div>
        <div className="divide-y divide-gray-200">
          {Object.entries(expensesByCategory).length === 0 ? (
            <p className={`p-4 text-center text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Aucune dépense pour cette période
            </p>
          ) : (
            Object.entries(expensesByCategory).map(([key, data]) => (
              <div key={key}>
                <button
                  onClick={() => toggleCategory(key)}
                  className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${isMobile ? 'text-sm' : ''
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{data.icon}</span>
                    <div className="text-left">
                      <p className="font-medium text-gray-800">{data.label}</p>
                      <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        {data.count} dépense{data.count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-red-600 ${isMobile ? 'text-sm' : ''}`}>
                      -{formatPrice(data.amount)}
                    </span>
                    {expandedCategories.has(key) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {/* Expanded details */}
                <AnimatePresence>
                  {expandedCategories.has(key) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-gray-50"
                    >
                      <div className="px-4 pb-4 space-y-2">
                        {getItemsByCategory(key)
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map(item => (
                            <div
                              key={item.id}
                              className={`flex items-center justify-between bg-white p-3 rounded-lg ${isMobile ? 'text-xs' : 'text-sm'
                                }`}
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-800">
                                  {formatPrice(item.amount)}
                                </p>
                                <p className="text-gray-500">
                                  {new Date(item.date).toLocaleDateString('fr-FR')}
                                </p>
                                {item.notes && (
                                  <p className="text-gray-600 mt-1">{item.notes}</p>
                                )}
                              </div>
                              {!item.isSupply && (
                                <button
                                  onClick={() => handleDeleteExpense(item.id)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Custom categories button */}
      <button
        onClick={() => setShowCategoryForm(true)}
        className={`w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-amber-500 hover:text-amber-500 transition-colors flex items-center justify-center gap-2 ${isMobile ? 'text-sm' : ''
          }`}
      >
        <Plus size={isMobile ? 16 : 20} />
        Créer une catégorie personnalisée
      </button>

      {/* Add Expense Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${isMobile ? 'max-w-sm p-4' : 'max-w-md p-6'
                }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  Nouvelle dépense
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Amount */}
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Montant (FCFA)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="5000"
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none ${isMobile ? 'text-sm' : ''
                      }`}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Catégorie
                  </label>
                  <Select
                    options={[
                      ...Object.entries(EXPENSE_CATEGORY_LABELS)
                        .filter(([key]) => key !== 'custom')
                        .map(([key, data]) => ({ value: key, label: `${data.icon} ${data.label}` })),
                      ...customExpenseCategories.map(cat => ({ value: `custom:${cat.id}`, label: `${cat.icon} ${cat.name}` }))
                    ]}
                    value={category === 'custom' && customCategoryId ? `custom:${customCategoryId}` : category}
                    onChange={e => {
                      const value = e.target.value;
                      if (value.startsWith('custom:')) {
                        setCategory('custom');
                        setCustomCategoryId(value.replace('custom:', ''));
                      } else {
                        setCategory(value as ExpenseCategory);
                        setCustomCategoryId('');
                      }
                    }}
                    className={`w-full ${isMobile ? 'text-sm' : ''}`}
                  />
                </div>

                {/* Date */}
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none ${isMobile ? 'text-sm' : ''
                      }`}
                  />
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="expenseNotes" className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Notes (optionnel)
                  </Label>
                  <Textarea
                    id="expenseNotes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Détails de la dépense..."
                    rows={3}
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none resize-none ${isMobile ? 'text-sm' : ''
                      }`}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className={`flex-1 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors ${isMobile ? 'text-sm' : ''
                      }`}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleAddExpense}
                    className={`flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors ${isMobile ? 'text-sm' : ''
                      }`}
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Custom Category Modal */}
      <AnimatePresence>
        {showCategoryForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCategoryForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`bg-white rounded-2xl shadow-2xl w-full ${isMobile ? 'max-w-sm p-4' : 'max-w-md p-6'
                }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  Nouvelle catégorie
                </h3>
                <button
                  onClick={() => setShowCategoryForm(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Nom de la catégorie
                  </label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="Ex: Loyer, Internet, etc."
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none ${isMobile ? 'text-sm' : ''
                      }`}
                  />
                </div>

                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Icône (emoji)
                  </label>
                  <input
                    type="text"
                    value={newCategoryIcon}
                    onChange={e => setNewCategoryIcon(e.target.value)}
                    placeholder="📝"
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none ${isMobile ? 'text-sm' : ''
                      }`}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCategoryForm(false)}
                    className={`flex-1 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors ${isMobile ? 'text-sm' : ''
                      }`}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleAddCustomCategory}
                    className={`flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors ${isMobile ? 'text-sm' : ''
                      }`}
                  >
                    Créer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
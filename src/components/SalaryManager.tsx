import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  Users,
  DollarSign,
  Calendar,
  X,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useSalaries } from '../hooks/useSalaries';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { formatPeriod, getCurrentPeriod } from '../utils/accounting';
import { useViewport } from '../hooks/useViewport';

export function SalaryManager() {
  const { currentSession } = useAuth();
  const { currentBar, getBarMembers } = useBarContext();
  const formatPrice = useCurrencyFormatter();
  const { isMobile } = useViewport();

  if (!currentBar || !currentSession) return null;

  const members = getBarMembers();
  const {
    salaries,
    addSalary,
    deleteSalary,
    getSalaryForPeriod,
    getTotalSalariesForMonth,
    getSalariesByPeriod,
    getUnpaidMembers
  } = useSalaries(currentBar.id);

  const [showForm, setShowForm] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set([getCurrentPeriod()]));

  // Form states
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [amount, setAmount] = useState('');

  const activeMembers = members.filter(m => m.isActive);
  const unpaidMembers = getUnpaidMembers(activeMembers, selectedPeriod);
  const salariesByPeriod = getSalariesByPeriod();
  const sortedPeriods = Object.keys(salariesByPeriod).sort().reverse();

  const handleAddSalary = () => {
    if (!selectedMemberId) {
      alert('Sélectionnez un membre de l\'équipe');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert('Montant invalide');
      return;
    }

    try {
      addSalary({
        barId: currentBar.id,
        memberId: selectedMemberId,
        amount: parseFloat(amount),
        period: selectedPeriod,
        paidAt: new Date(),
        createdBy: currentSession.userId
      });

      // Reset form
      setSelectedMemberId('');
      setAmount('');
      setShowForm(false);
    } catch (error: any) {
      alert(error.message || 'Erreur lors de l\'ajout du salaire');
    }
  };

  const handleDeleteSalary = (salaryId: string) => {
    if (confirm('Supprimer ce salaire ?')) {
      deleteSalary(salaryId);
    }
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

    const user = member as any; // Simple pour éviter erreur typage
    return user.name || user.userName || 'N/A';
  };

  const getMemberRole = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member?.role || 'N/A';
  };

  const currentMonthTotal = getTotalSalariesForMonth(selectedPeriod);

  // Générer les 12 derniers mois pour le sélecteur
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

  return (
    <div className={`${isMobile ? 'p-3 space-y-3' : 'p-6 space-y-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-2xl'}`}>
            💰 Gestion des Salaires
          </h2>
          <p className={`text-gray-600 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {currentBar.name}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className={`bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 ${
            isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-2'
          }`}
        >
          <Plus size={isMobile ? 16 : 20} />
          {!isMobile && 'Payer'}
        </button>
      </div>

      {/* Period selector */}
      <div>
        <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
          Période
        </label>
        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-orange-500 focus:outline-none ${
            isMobile ? 'text-sm' : ''
          }`}
        >
          {periodOptions.map(period => (
            <option key={period} value={period}>
              {formatPeriod(period)}
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl p-4">
          <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>Total {formatPeriod(selectedPeriod)}</p>
          <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            {formatPrice(currentMonthTotal)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl p-4">
          <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>Membres payés</p>
          <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            {activeMembers.length - unpaidMembers.length} / {activeMembers.length}
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl p-4">
          <p className={`opacity-90 ${isMobile ? 'text-xs' : 'text-sm'}`}>En attente</p>
          <p className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            {unpaidMembers.length}
          </p>
        </div>
      </div>

      {/* Unpaid members alert */}
      {unpaidMembers.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-500 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className={`font-medium text-amber-800 ${isMobile ? 'text-sm' : ''}`}>
                {unpaidMembers.length} membre{unpaidMembers.length > 1 ? 's' : ''} en attente de paiement
              </p>
              <ul className={`mt-2 space-y-1 text-amber-700 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                {unpaidMembers.map(member => {
                  const user = member as any;
                  return (
                    <li key={member.id}>
                      • {user.name || user.userName} ({member.role})
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Salary history by period */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className={`font-semibold text-gray-800 ${isMobile ? 'text-sm' : 'text-base'}`}>
            Historique des paiements
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {sortedPeriods.length === 0 ? (
            <p className={`p-4 text-center text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
              Aucun salaire enregistré
            </p>
          ) : (
            sortedPeriods.map(period => {
              const data = salariesByPeriod[period];
              const isExpanded = expandedPeriods.has(period);

              return (
                <div key={period}>
                  <button
                    onClick={() => togglePeriod(period)}
                    className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                      isMobile ? 'text-sm' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Calendar size={20} className="text-green-500" />
                      <div className="text-left">
                        <p className="font-medium text-gray-800">{formatPeriod(period)}</p>
                        <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          {data.count} paiement{data.count > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold text-green-600 ${isMobile ? 'text-sm' : ''}`}>
                        {formatPrice(data.amount)}
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-gray-50"
                      >
                        <div className="px-4 pb-4 space-y-2">
                          {data.salaries.map(salary => (
                            <div
                              key={salary.id}
                              className={`flex items-center justify-between bg-white p-3 rounded-lg ${
                                isMobile ? 'text-xs' : 'text-sm'
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-800 truncate">
                                    {getMemberName(salary.memberId)}
                                  </p>
                                  <p className="text-gray-500">
                                    {getMemberRole(salary.memberId)} • {new Date(salary.paidAt).toLocaleDateString('fr-FR')}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-bold text-green-600">
                                    {formatPrice(salary.amount)}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteSalary(salary.id)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2 flex-shrink-0"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Salary Form Modal */}
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
              className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${
                isMobile ? 'max-w-sm p-4' : 'max-w-md p-6'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold text-gray-800 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                  Payer un salaire
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Period */}
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Période
                  </label>
                  <select
                    value={selectedPeriod}
                    onChange={e => setSelectedPeriod(e.target.value)}
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-orange-500 focus:outline-none ${
                      isMobile ? 'text-sm' : ''
                    }`}
                  >
                    {periodOptions.map(period => (
                      <option key={period} value={period}>
                        {formatPeriod(period)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Member */}
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Membre de l'équipe
                  </label>
                  <select
                    value={selectedMemberId}
                    onChange={e => setSelectedMemberId(e.target.value)}
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-orange-500 focus:outline-none ${
                      isMobile ? 'text-sm' : ''
                    }`}
                  >
                    <option value="">Sélectionner...</option>
                    {activeMembers.map(member => {
                      const user = member as any;
                      const alreadyPaid = getSalaryForPeriod(member.id, selectedPeriod);
                      return (
                        <option key={member.id} value={member.id} disabled={!!alreadyPaid}>
                          {user.name || user.userName} ({member.role}) {alreadyPaid ? '✓ Payé' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className={`block text-gray-700 font-medium mb-2 ${isMobile ? 'text-sm' : ''}`}>
                    Montant (FCFA)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="50000"
                    className={`w-full border-2 border-gray-300 rounded-lg px-4 py-2 focus:border-orange-500 focus:outline-none ${
                      isMobile ? 'text-sm' : ''
                    }`}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className={`flex-1 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors ${
                      isMobile ? 'text-sm' : ''
                    }`}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleAddSalary}
                    className={`flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors ${
                      isMobile ? 'text-sm' : ''
                    }`}
                  >
                    Payer
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

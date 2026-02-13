import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Wallet,
  Users,
  AlertCircle
} from 'lucide-react';
import { useSalaries } from '../hooks/useSalaries';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { formatPeriod, getCurrentPeriod } from '../utils/accounting';
import { useViewport } from '../hooks/useViewport';
import { useFeedback } from '../hooks/useFeedback';

// UI Components
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { ConfirmationModal } from './common/ConfirmationModal';

// Features Components
import { SalaryListItem } from '../features/Accounting/components/SalaryListItem';
import { SalaryFormModal } from '../features/Accounting/components/SalaryFormModal';

import type { BarMember, User } from '../types';

interface BarMemberWithUser extends BarMember {
  user: User;
}

export function SalaryManager() {
  const { currentSession } = useAuth();
  const { currentBar, getBarMembers } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const { showSuccess, showError } = useFeedback();

  const {
    addSalary,
    deleteSalary,
    getSalaryForPeriod,
    getTotalSalariesForMonth,
    getSalariesByPeriod,
    getUnpaidMembers
  } = useSalaries(currentBar?.id || '');

  // State
  const [showForm, setShowForm] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set([getCurrentPeriod()]));
  const [members, setMembers] = useState<BarMemberWithUser[]>([]);
  const [salaryToDelete, setSalaryToDelete] = useState<string | null>(null);

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

  const activeMembers = members.filter(m => m.isActive);
  const unpaidMembers = getUnpaidMembers(activeMembers, selectedPeriod);
  const salariesByPeriod = getSalariesByPeriod();
  const sortedPeriods = Object.keys(salariesByPeriod).sort().reverse();

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
      setShowForm(false);
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

  if (!currentBar || !currentSession) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`font-bold text-gray-900 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            💰 <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">Gestion des Salaires</span>
          </h2>
          <p className="text-sm text-gray-500 font-medium tracking-tight">
            Suivi des rémunérations de l'équipe du bar.
          </p>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={() => setShowForm(true)}
          className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-gray-200"
        >
          <Plus size={18} className="mr-2" />
          Payer un salaire
        </Button>
      </div>

      {/* Period Selection & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Période active</label>
          <Select
            options={periodOptions.map(period => ({ value: period, label: formatPeriod(period) }))}
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="bg-white border-gray-200"
          />
        </div>

        <div className="lg:col-span-1 bg-white border border-gray-100 p-4 rounded-2xl shadow-sm group hover:shadow-md transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <Wallet size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total {formatPeriod(selectedPeriod)}</span>
          </div>
          <p className="text-xl font-black text-gray-900 tracking-tight">{formatPrice(currentMonthTotal)}</p>
        </div>

        <div className="lg:col-span-1 bg-white border border-gray-100 p-4 rounded-2xl shadow-sm group hover:shadow-md transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <Users size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Membres payés</span>
          </div>
          <p className="text-xl font-black text-gray-900 tracking-tight">
            {activeMembers.length - unpaidMembers.length} <span className="text-sm font-bold text-gray-300">/ {activeMembers.length}</span>
          </p>
        </div>

        <div className="lg:col-span-1 bg-white border border-gray-100 p-4 rounded-2xl shadow-sm group hover:shadow-md transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">En attente</span>
          </div>
          <p className="text-xl font-black text-amber-600 tracking-tight">{unpaidMembers.length}</p>
        </div>
      </div>

      {/* Unpaid members alert - Premium Style */}
      {unpaidMembers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="font-bold text-amber-900 leading-tight">Attention : {unpaidMembers.length} membre{unpaidMembers.length > 1 ? 's n\'ont' : ' n\'a'} pas été payé{unpaidMembers.length > 1 ? 's' : ''} pour {formatPeriod(selectedPeriod)}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unpaidMembers.map(member => (
                <span key={member.id} className="bg-amber-100/50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200/50">
                  {getMemberName(member.id)} ({member.role})
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Salary history */}
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-gray-900 flex items-center gap-2 text-sm uppercase tracking-widest">
            Historique des paies
          </h3>
        </div>

        <div className="divide-y divide-gray-50">
          {sortedPeriods.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                <Wallet className="text-gray-300" size={32} />
              </div>
              <p className="text-gray-500 font-medium">Aucun salaire enregistré.</p>
            </div>
          ) : (
            sortedPeriods.map(period => (
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
            ))
          )}
        </div>
      </div>

      {/* Modals */}
      <SalaryFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleAddSalary}
        members={members}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        periodOptions={periodOptions}
        getSalaryForPeriod={getSalaryForPeriod}
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

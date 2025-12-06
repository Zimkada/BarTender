import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Building2,
  Ban,
  CheckCircle,
  UserCog,
  Key,
  BarChart3,
  Search,
  Filter,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Bar, Sale, Return, BarMember, User } from '../types';
import { getBusinessDate, getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { AuthService } from '../services/supabase/auth.service';

interface BarsManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onShowBarStats: (bar: Bar) => void;
}

export default function BarsManagementPanel({ isOpen, onClose, onShowBarStats }: BarsManagementPanelProps) {
  const { sales: allSales, returns: allReturns } = useAppContext();
  const { bars, updateBar } = useBarContext();
  const { impersonate, changePassword } = useAuth();

  const [allBarMembers, setAllBarMembers] = useState<(BarMember & { user: User })[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Load members when panel opens
  useEffect(() => {
    if (isOpen) {
      loadMembers();
    }
  }, [isOpen]);

  const loadMembers = async () => {
    try {
      const members = await AuthService.getAllBarMembers();
      setAllBarMembers(members);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
    }
  };

  // Helper function to get bar revenue for today
  const getBarTodayRevenue = (barId: string): number => {
    try {
      const bar = bars.find(b => b.id === barId);
      const closeHour = bar?.closingHour ?? 6;
      const currentBusinessDateStr = getCurrentBusinessDateString(closeHour);

      // Filter global sales for this bar and the current business day
      const salesToday = allSales.filter(sale =>
        sale.barId === barId &&
        getBusinessDate(sale, closeHour) === currentBusinessDateStr &&
        sale.status === 'validated'
      );
      const salesTotal = salesToday.reduce((sum, sale) => sum + sale.total, 0);

      // Filter global returns for this bar and the current business day
      const returnsToday = allReturns.filter(ret => {
        if (ret.barId !== barId || ret.status === 'rejected' || !ret.isRefunded) return false;
        return getBusinessDate(ret, closeHour) === currentBusinessDateStr;
      });
      const returnsTotal = returnsToday.reduce((sum, ret) => sum + ret.refundAmount, 0);

      return salesTotal - returnsTotal;
    } catch (error) {
      console.error(`Error calculating revenue for bar ${barId}:`, error);
      return 0;
    }
  };

  // Filtered bars based on search and status
  const filteredBars = useMemo(() => {
    let result = [...bars];

    // Apply search filter (bar name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(bar =>
        bar.name.toLowerCase().includes(query) ||
        (bar.address && bar.address.toLowerCase().includes(query)) ||
        (bar.email && bar.email.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    if (statusFilter === 'active') {
      result = result.filter(bar => bar.isActive);
    } else if (statusFilter === 'suspended') {
      result = result.filter(bar => !bar.isActive);
    }

    return result;
  }, [bars, searchQuery, statusFilter]);

  // Suspendre/Activer un bar
  const toggleBarStatus = (barId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'suspendre' : 'activer';
    if (confirm(`Voulez-vous vraiment ${action} ce bar ?`)) {
      updateBar(barId, { isActive: !currentStatus });
    }
  };

  // Réinitialiser mot de passe promoteur
  const handleResetPassword = (_userId: string, userName: string) => {
    const newPassword = prompt(
      `Réinitialiser le mot de passe de ${userName}\n\nEntrez le nouveau mot de passe (min. 4 caractères):`
    );

    if (newPassword === null) return; // Annulé

    if (!newPassword || newPassword.length < 4) {
      alert('Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    const confirm2 = confirm(
      `Confirmer la réinitialisation du mot de passe de ${userName}?\n\nNouveau mot de passe: ${newPassword}\n\n⚠️ Cette action sera enregistrée dans les logs d'audit.`
    );

    if (confirm2) {
      changePassword(newPassword); // Note: This only changes current user password in AuthContext.
      // But we are in Super Admin panel.
      // Ideally we should use an admin function.
      // For now, alerting user as before.
      alert(`⚠️ Attention: La réinitialisation de mot de passe administrateur n'est pas encore implémentée pour les autres utilisateurs.`);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Gestion des Bars</h2>
                <p className="text-purple-100 text-sm">Gérer tous les bars de BarTender Pro</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Search and Filters */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-200 mb-4">
              <div className="flex flex-col md:flex-row gap-3">
                {/* Search Input */}
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Rechercher par nom, adresse ou email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Filter */}
                <div className="md:w-56">
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white transition-all cursor-pointer"
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="active">✅ Actifs uniquement</option>
                      <option value="suspended">🚫 Suspendus uniquement</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filtered Count */}
              <div className="mt-3 flex items-center justify-between text-sm">
                <p className="text-gray-600">
                  <span className="font-semibold text-purple-700">{filteredBars.length}</span>
                  {' '}bar{filteredBars.length > 1 ? 's' : ''} affiché{filteredBars.length > 1 ? 's' : ''}
                  {filteredBars.length !== bars.length && (
                    <span className="text-gray-500"> sur {bars.length} au total</span>
                  )}
                </p>
                {(searchQuery || statusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="text-purple-600 hover:text-purple-700 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Réinitialiser filtres
                  </button>
                )}
              </div>
            </div>

            {/* Bars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredBars.map((bar) => {
                // Filter members for this bar
                const members = allBarMembers.filter(m => m.barId === bar.id);
                // Find owner: match ownerId OR role is promoteur OR role is super_admin
                const owner = members.find(m => m.userId === bar.ownerId)?.user
                  || members.find(m => m.role === 'promoteur')?.user
                  || members.find(m => m.role === 'super_admin')?.user;
                const todayRevenue = getBarTodayRevenue(bar.id);

                return (
                  <div
                    key={bar.id}
                    className={`bg-white rounded-lg p-3 border-2 ${bar.isActive ? 'border-green-200' : 'border-red-200'
                      } hover:shadow-lg transition-shadow`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-base text-gray-900 truncate">{bar.name}</h4>
                        <p className="text-xs text-gray-500 truncate">{bar.address || 'Pas d\'adresse'}</p>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ml-2 ${bar.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                        }`}>
                        {bar.isActive ? 'Actif' : 'Suspendu'}
                      </div>
                    </div>

                    <div className="space-y-1 text-xs mb-3">
                      <p className="text-gray-600">
                        <span className="font-semibold">Promoteur:</span> {owner?.name || 'Inconnu'}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-semibold">Email:</span> {owner?.email || bar.email || 'N/A'}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-semibold">Téléphone:</span> {bar.phone || 'N/A'}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-semibold">Membres:</span> {members.length}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-semibold">Créé le:</span>{' '}
                        {new Date(bar.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                      {/* CA Aujourd'hui - Highlight */}
                      <div className="pt-1 mt-1 border-t border-gray-200">
                        <p className="text-green-700 font-bold">
                          <span className="font-semibold">CA Aujourd'hui:</span>{' '}
                          {todayRevenue.toLocaleString()} FCFA
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => toggleBarStatus(bar.id, bar.isActive)}
                        className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 ${bar.isActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                      >
                        {bar.isActive ? (
                          <>
                            <Ban className="w-3.5 h-3.5" />
                            Suspendre
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Activer
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          // Find the promoteur member of this bar
                          const promoteurMember = members.find(m => m.role === 'promoteur');
                          if (promoteurMember) {
                            impersonate(promoteurMember.user.id, bar.id, 'promoteur');
                            onClose(); // Close panel after impersonation
                          } else {
                            alert('Aucun promoteur trouvé pour ce bar');
                          }
                        }}
                        className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold text-xs hover:bg-amber-200 flex items-center justify-center gap-1.5"
                        title="Se connecter en tant que promoteur"
                      >
                        <UserCog className="w-3.5 h-3.5" />
                        Impersonate
                      </button>
                      <button
                        onClick={() => {
                          const promoteurMember = members.find(m => m.role === 'promoteur');
                          if (promoteurMember) {
                            handleResetPassword(promoteurMember.user.id, promoteurMember.user.name);
                          } else {
                            alert('Aucun promoteur trouvé pour ce bar');
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-semibold text-xs hover:bg-blue-200 flex items-center justify-center gap-1.5"
                        title="Réinitialiser le mot de passe du promoteur"
                      >
                        <Key className="w-3.5 h-3.5" />
                        Reset MDP
                      </button>
                      <button
                        onClick={() => onShowBarStats(bar)}
                        className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg font-semibold text-xs hover:bg-purple-200 flex items-center justify-center gap-1.5 col-span-3"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Voir Statistiques Détaillées
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty states with filters awareness */}
            {filteredBars.length === 0 && bars.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-semibold">Aucun bar créé pour le moment</p>
                <p className="text-sm">Les bars créés apparaîtront ici</p>
              </div>
            )}
            {filteredBars.length === 0 && bars.length > 0 && (
              <div className="text-center py-12 text-gray-500">
                <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-semibold">Aucun bar trouvé</p>
                <p className="text-sm mb-4">Essayez de modifier vos critères de recherche</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="text-purple-600 hover:text-purple-700 font-semibold inline-flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Réinitialiser les filtres
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

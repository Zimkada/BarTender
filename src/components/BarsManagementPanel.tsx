import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import {
  X, Building2, Search, Filter, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Bar, BarMember, User } from '../types';
import { Select } from './ui/Select';
import { Alert } from './ui/Alert';
import { AdminService } from '../services/supabase/admin.service';
import { AuthService } from '../services/supabase/auth.service';
import { BarService } from '../services/supabase/bar.service';
import { BarCard } from './BarCard';
import { AdminPanelErrorBoundary } from './AdminPanelErrorBoundary';
import { AdminPanelSkeleton } from './AdminPanelSkeleton';

interface BarsManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onShowBarStats: (bar: Bar) => void;
}

export default function BarsManagementPanel({ isOpen, onClose, onShowBarStats }: BarsManagementPanelProps) {
  const { impersonate } = useAuth();

  const [bars, setBars] = useState<Bar[]>([]);
  const [allBarMembers, setAllBarMembers] = useState<(BarMember & { user: User })[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10); // 10 bars per page

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / limit);

  const loadBars = useCallback(async () => {
    if (!isOpen) return;
    try {
      setError(null);
      setLoading(true);
      const data = await AdminService.getPaginatedBars({
        page: currentPage,
        limit,
        searchQuery: debouncedSearchQuery,
        statusFilter,
      });
      setBars(data.bars);
      setTotalCount(data.totalCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des bars';
      setError(message);
      console.error('Erreur chargement des bars:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, currentPage, limit, debouncedSearchQuery, statusFilter]);

  const loadMembers = useCallback(async () => {
    if (!isOpen) return;
    try {
      const members = await AuthService.getAllBarMembers();
      setAllBarMembers(members);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
    }
  }, [isOpen]);

  useEffect(() => {
    loadBars();
    loadMembers();
  }, [loadBars, loadMembers]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statusFilter]);

  const toggleBarStatus = async (barId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'suspendre' : 'activer';
    if (confirm(`Voulez-vous vraiment ${action} ce bar ?`)) {
      try {
        await BarService.updateBar(barId, { is_active: !currentStatus });
        // Refresh a la liste
        loadBars();
      } catch (error) {
        console.error(`Erreur lors de la mise à jour du bar ${barId}:`, error);
        alert(`Impossible de mettre à jour le bar.`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
          <AdminPanelErrorBoundary fallbackTitle="Erreur dans la gestion des bars">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
              <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
              <div className="flex items-center gap-3"><Building2 className="w-8 h-8" /><div><h2 className="text-2xl font-bold">Gestion des Bars</h2><p className="text-purple-100 text-sm">Gérer tous les bars de BarTender Pro</p></div></div>
            </div>

            <div className="p-4 md:p-6 border-b">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Rechercher par nom, adresse ou email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />{searchQuery && (<button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>)}</div>
                </div>
                <div className="md:w-56">
                  <div className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" /><Select options={[{ value: 'all', label: 'Tous les statuts' }, { value: 'active', label: '✅ Actifs uniquement' }, { value: 'suspended', label: '🚫 Suspendus uniquement' },]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')} className="pl-10" /></div>
                </div>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 border-b">
                <Alert variant="destructive" title="Erreur de chargement">
                  <div className="flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      onClick={() => loadBars()}
                      className="ml-4 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded-md font-medium transition-colors"
                    >
                      Réessayer
                    </button>
                  </div>
                </Alert>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading && bars.length === 0 ? (
                <AdminPanelSkeleton count={4} type="card" />
              ) : !loading && bars.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><Search className="w-16 h-16 mx-auto mb-4 text-gray-300" /><p className="text-lg font-semibold">Aucun bar trouvé</p><p className="text-sm mb-4">Essayez de modifier vos critères de recherche</p><button onClick={() => { setSearchQuery(''); setStatusFilter('all'); }} className="text-purple-600 hover:text-purple-700 font-semibold inline-flex items-center gap-2"><X className="w-4 h-4" />Réinitialiser les filtres</button></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:p-6">
                  {bars.map((bar) => {
                    const members = allBarMembers.filter(m => m.barId === bar.id);
                    return (
                      <BarCard
                        key={bar.id}
                        bar={bar}
                        members={members}
                        onToggleStatus={toggleBarStatus}
                        onImpersonate={impersonate}
                        onShowStats={onShowBarStats}
                        onClose={onClose}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex-shrink-0 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">Page <span className="font-semibold">{currentPage}</span> sur <span className="font-semibold">{totalPages}</span> ({totalCount} bars)</p>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </AdminPanelErrorBoundary>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
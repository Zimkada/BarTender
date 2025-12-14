import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  ShoppingCart,
  DollarSign,
  AlertCircle,
  UserCheck,
  UserX,
  CheckCircle,
  XCircle,
  Award,
  Bell,
  LogOut,
  Shield
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Sale, User, Return } from '../types';
import { AuthService } from '../services/supabase/auth.service';
import { getBusinessDate, getCurrentBusinessDateString, dateToYYYYMMDD, filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { useAppContext } from '../context/AppContext';
import { Alert } from './ui/Alert';
import { supabase } from '../lib/supabase';

interface SuperAdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Define the type for our stats to avoid 'any'
interface DashboardStats {
  total_revenue: number;
  sales_count: number;
  active_users_count: number;
  new_users_count: number;
  bars_count: number;
  active_bars_count: number;
}

const PERIODS = [
  { label: "Aujourd'hui", value: '0 days' },
  { label: 'Hier', value: '1 day' },
  { label: '7 jours', value: '7 days' },
  { label: '30 jours', value: '30 days' },
];

export default function SuperAdminDashboard({ isOpen, onClose }: SuperAdminDashboardProps) {
  const { user, logout } = useAuth();
  const { bars } = useBarContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('7 days');

  useEffect(() => {
    console.log('[SuperAdminDashboard] useEffect triggered. isOpen:', isOpen, 'selectedPeriod:', selectedPeriod);
    if (isOpen) {
      loadDashboardStats();
    }
  }, [isOpen, selectedPeriod]);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      // Generate a random UUID for cache busting
      const cacheBuster = crypto.randomUUID();

      console.log('Calling get_dashboard_stats with:', {
        p_period: selectedPeriod,
        p_cache_buster: cacheBuster,
      });

      const { data, error } = await supabase.rpc('get_dashboard_stats', {
        p_period: selectedPeriod,
        p_cache_buster: cacheBuster,
      });

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        setStats(data[0]);
      } else {
        // Set stats to 0 if no data is returned
        setStats({
          total_revenue: 0,
          sales_count: 0,
          active_users_count: 0,
          new_users_count: 0,
          bars_count: 0,
          active_bars_count: 0,
        });
      }

    } catch (err: any) {
      console.error('Erreur chargement des statistiques:', err);
      setError('Impossible de charger les statistiques. ' + err.message);
    } finally {
      setLoading(false);
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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 md:p-6 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 md:w-8 md:h-8" />
              <div>
                <h2 className="text-xl md:text-2xl font-bold">Super Admin Dashboard</h2>
                <p className="text-purple-100 text-xs md:text-sm">Vue d'ensemble de BarTender Pro</p>
              </div>
            </div>
          </div>

          {/* Period Filter */}
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-center gap-2">
              {PERIODS.map(period => (
                <button
                  key={period.value}
                  onClick={() => setSelectedPeriod(period.value)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${selectedPeriod === period.value
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-purple-100'
                    }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>


          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {loading && <div className="text-center">Chargement des données...</div>}
            {error && <Alert show={true} variant="destructive">{error}</Alert>}
            {stats && !loading && !error && (
              <>
                {/* 🏢 Section 1: Statistiques des Bars */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-bold text-gray-900">Statistiques des Bars</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 shadow-sm border border-purple-200">
                      <div className="flex items-start gap-3">
                        <Building2 className="w-6 h-6 text-purple-600 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600 text-xs md:text-sm mb-1">Total Bars</p>
                          <p className="text-2xl md:text-3xl font-bold text-purple-600">{stats.bars_count}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600 text-xs md:text-sm mb-1">Bars Actifs</p>
                          <p className="text-2xl md:text-3xl font-bold text-green-600">{stats.active_bars_count}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 👥 Section 2: Statistiques des Utilisateurs */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-bold text-gray-900">Statistiques des Utilisateurs</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 shadow-sm border border-blue-200">
                      <div className="flex items-start gap-3">
                        <Users className="w-6 h-6 text-blue-600 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600 text-xs md:text-sm mb-1">Nouveaux Utilisateurs</p>
                          <p className="text-2xl md:text-3xl font-bold text-blue-600">{stats.new_users_count}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200">
                      <div className="flex items-start gap-3">
                        <UserCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600 text-xs md:text-sm mb-1">Utilisateurs Actifs</p>
                          <p className="text-2xl md:text-3xl font-bold text-green-600">{stats.active_users_count}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 💰 Section 3: Performance & Analytics */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-bold text-gray-900">Performance & Analytics</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4">
                    {/* CA Total Card */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4 md:p-6 shadow-sm border border-green-200">
                      <div className="flex items-start gap-3">
                        <DollarSign className="w-8 h-8 text-green-600 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-gray-600 text-sm mb-1">Chiffre d'Affaires</p>
                          <p className="text-3xl md:text-4xl font-bold text-green-600">
                            {stats.total_revenue.toLocaleString('fr-FR')} <span className="text-xl md:text-2xl">FCFA</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Ventes Count Card */}
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 md:p-6 shadow-sm border border-amber-200">
                      <div className="flex items-start gap-3">
                        <ShoppingCart className="w-8 h-8 text-amber-600 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-gray-600 text-sm mb-1">Nombre de Ventes</p>
                          <p className="text-3xl md:text-4xl font-bold text-amber-600">{stats.sales_count}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
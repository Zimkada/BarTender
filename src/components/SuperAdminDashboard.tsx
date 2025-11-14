import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Building2,
  TrendingUp,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Sale } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';

interface SuperAdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SuperAdminDashboard({ isOpen, onClose }: SuperAdminDashboardProps) {
  const { bars, barMembers } = useBarContext();
  const { users } = useAuth();

  // Statistiques globales
  const stats = useMemo(() => {
    const promoteurs = users.filter(u => {
      const memberRoles = barMembers.filter(m => m.userId === u.id).map(m => m.role);
      return memberRoles.includes('promoteur');
    });

    // Calculate total sales count across all bars (today)
    let totalSalesToday = 0;
    bars.forEach(bar => {
      try {
        const salesKey = `sales_${bar.id}`;
        const salesData = localStorage.getItem(salesKey);
        const sales: Sale[] = salesData ? JSON.parse(salesData) : [];

        const closeHour = bar.settings?.businessDayCloseHour ?? 6;
        const currentBusinessDay = getCurrentBusinessDay(closeHour);

        const salesToday = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          const saleBusinessDay = getBusinessDay(saleDate, closeHour);
          return isSameDay(saleBusinessDay, currentBusinessDay);
        });

        totalSalesToday += salesToday.length;
      } catch (error) {
        console.error(`Error counting sales for bar ${bar.id}:`, error);
      }
    });

    return {
      totalBars: bars.length,
      totalPromoteurs: promoteurs.length,
      activeBars: bars.filter(b => b.isActive).length,
      totalSalesToday,
    };
  }, [bars, users, barMembers]);

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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col"
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
              <ShieldCheck className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Super Admin Dashboard</h2>
                <p className="text-purple-100 text-sm">Vue d'ensemble de BarTender Pro</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Statistiques Globales</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 shadow-sm border border-purple-200">
                <div className="flex flex-col items-center text-center">
                  <Building2 className="w-10 h-10 text-purple-600 mb-2" />
                  <p className="text-gray-600 text-sm mb-1">Total Bars</p>
                  <p className="text-3xl font-bold text-purple-600">{stats.totalBars}</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 shadow-sm border border-blue-200">
                <div className="flex flex-col items-center text-center">
                  <Users className="w-10 h-10 text-blue-600 mb-2" />
                  <p className="text-gray-600 text-sm mb-1">Promoteurs</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.totalPromoteurs}</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200">
                <div className="flex flex-col items-center text-center">
                  <TrendingUp className="w-10 h-10 text-green-600 mb-2" />
                  <p className="text-gray-600 text-sm mb-1">Bars Actifs</p>
                  <p className="text-3xl font-bold text-green-600">{stats.activeBars}</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 shadow-sm border border-orange-200">
                <div className="flex flex-col items-center text-center">
                  <ShoppingCart className="w-10 h-10 text-orange-600 mb-2" />
                  <p className="text-gray-600 text-sm mb-1">Ventes Aujourd'hui</p>
                  <p className="text-3xl font-bold text-orange-600">{stats.totalSalesToday}</p>
                </div>
              </div>
            </div>

            {/* Info Message */}
            <div className="mt-6 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-200">
              <p className="text-sm text-gray-700 text-center">
                💡 <span className="font-semibold">Conseil:</span> Utilisez le menu mobile (☰) pour accéder aux fonctionnalités de gestion détaillées
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

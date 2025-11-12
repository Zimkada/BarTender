import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Building2,
  TrendingUp,
  UserPlus,
  Eye,
  EyeOff,
  Ban,
  CheckCircle,
  ShieldCheck,
  DollarSign,
  BarChart3,
  UserCog, // For impersonate button
  ShoppingCart,
  Search,
  Filter,
  FileText,
  Key, // For password reset
  RefreshCw, // For generate password
  Copy, // For copy credentials
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { useDataStore } from '../hooks/useDataStore';
import { Bar, User, Sale, Return } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';
import { AuditLogsPanel } from './AuditLogsPanel';

interface SuperAdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreatePromoteurForm {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  barName: string;
  barAddress: string;
  barPhone: string;
}

const initialFormData: CreatePromoteurForm = {
  email: '',
  phone: '',
  password: '',
  firstName: '',
  lastName: '',
  barName: '',
  barAddress: '',
  barPhone: '',
};

export default function SuperAdminDashboard({ isOpen, onClose }: SuperAdminDashboardProps) {
  const { bars, createBar, updateBar, barMembers, getBarMembers } = useBarContext();
  const { users, createUser, impersonate, changePassword } = useAuth();
  const { initializeBarData } = useAppContext();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreatePromoteurForm>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<CreatePromoteurForm>>({});
  const [selectedBarForStats, setSelectedBarForStats] = useState<Bar | null>(null);
  const [statsPeriodFilter, setStatsPeriodFilter] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [statsCustomDates, setStatsCustomDates] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });

  // A.1: Filters and Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // Helper function to get bar revenue for today
  const getBarTodayRevenue = (barId: string): number => {
    try {
      // Get sales for this bar from localStorage
      const salesKey = `sales_${barId}`;
      const salesData = localStorage.getItem(salesKey);
      const sales: Sale[] = salesData ? JSON.parse(salesData) : [];

      // Get returns for this bar
      const returnsKey = `returns_${barId}`;
      const returnsData = localStorage.getItem(returnsKey);
      const returns: Return[] = returnsData ? JSON.parse(returnsData) : [];

      // Get bar settings for business day calculation
      const bar = bars.find(b => b.id === barId);
      const closeHour = bar?.settings?.businessDayCloseHour ?? 6;
      const currentBusinessDay = getCurrentBusinessDay(closeHour);

      // Calculate today's sales total
      const salesToday = sales.filter(sale => {
        const saleDate = new Date(sale.date);
        const saleBusinessDay = getBusinessDay(saleDate, closeHour);
        return isSameDay(saleBusinessDay, currentBusinessDay);
      });

      const salesTotal = salesToday.reduce((sum, sale) => sum + sale.total, 0);

      // Calculate today's returns (only refunded returns)
      const returnsToday = returns.filter(ret => {
        if (ret.status === 'rejected' || !ret.isRefunded) return false;
        const returnDate = new Date(ret.returnedAt);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      });

      const returnsTotal = returnsToday.reduce((sum, ret) => sum + ret.refundAmount, 0);

      // Net revenue = Sales - Refunded Returns
      return salesTotal - returnsTotal;
    } catch (error) {
      console.error(`Error calculating revenue for bar ${barId}:`, error);
      return 0;
    }
  };

  // Calculate bar revenue for custom period
  const getBarRevenueCustomPeriod = (barId: string, startDate: Date, endDate: Date) => {
    try {
      const salesKey = `sales_${barId}`;
      const salesData = localStorage.getItem(salesKey);
      const sales: Sale[] = salesData ? JSON.parse(salesData) : [];

      const returnsKey = `returns_${barId}`;
      const returnsData = localStorage.getItem(returnsKey);
      const returns: Return[] = returnsData ? JSON.parse(returnsData) : [];

      // Filter sales in date range
      const periodSales = sales.filter(s => {
        const saleDate = new Date(s.date);
        return saleDate >= startDate && saleDate <= endDate;
      });

      // Filter returns in date range
      const periodReturns = returns.filter(r => {
        if (r.status === 'rejected' || !r.isRefunded) return false;
        const returnDate = new Date(r.returnedAt);
        return returnDate >= startDate && returnDate <= endDate;
      });

      const revenue = periodSales.reduce((sum, s) => sum + s.total, 0) -
                      periodReturns.reduce((sum, r) => sum + r.refundAmount, 0);

      // Calculate days in period
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      return {
        revenue,
        salesCount: periodSales.length,
        days: daysDiff,
        averagePerDay: daysDiff > 0 ? revenue / daysDiff : 0,
      };
    } catch (error) {
      console.error(`Error calculating custom period revenue for bar ${barId}:`, error);
      return { revenue: 0, salesCount: 0, days: 0, averagePerDay: 0 };
    }
  };

  // Calculate bar revenue by period
  const getBarRevenuePeriods = (barId: string) => {
    try {
      const salesKey = `sales_${barId}`;
      const salesData = localStorage.getItem(salesKey);
      const sales: Sale[] = salesData ? JSON.parse(salesData) : [];

      const returnsKey = `returns_${barId}`;
      const returnsData = localStorage.getItem(returnsKey);
      const returns: Return[] = returnsData ? JSON.parse(returnsData) : [];

      const bar = bars.find(b => b.id === barId);
      const closeHour = bar?.settings?.businessDayCloseHour ?? 6;

      const now = new Date();
      const currentBusinessDay = getCurrentBusinessDay(closeHour);

      // Today
      const todaySales = sales.filter(sale => {
        const saleDate = new Date(sale.date);
        const saleBusinessDay = getBusinessDay(saleDate, closeHour);
        return isSameDay(saleBusinessDay, currentBusinessDay);
      });
      const todayReturns = returns.filter(ret => {
        if (ret.status === 'rejected' || !ret.isRefunded) return false;
        const returnDate = new Date(ret.returnedAt);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      });
      const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0) -
                           todayReturns.reduce((sum, r) => sum + r.refundAmount, 0);

      // Week (last 7 days)
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);
      const weekReturns = returns.filter(r => {
        if (r.status === 'rejected' || !r.isRefunded) return false;
        return new Date(r.returnedAt) >= weekAgo;
      });
      const weekRevenue = weekSales.reduce((sum, s) => sum + s.total, 0) -
                          weekReturns.reduce((sum, r) => sum + r.refundAmount, 0);

      // Month (last 30 days)
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthSales = sales.filter(s => new Date(s.date) >= monthAgo);
      const monthReturns = returns.filter(r => {
        if (r.status === 'rejected' || !r.isRefunded) return false;
        return new Date(r.returnedAt) >= monthAgo;
      });
      const monthRevenue = monthSales.reduce((sum, s) => sum + s.total, 0) -
                           monthReturns.reduce((sum, r) => sum + r.refundAmount, 0);

      // Total (all time)
      const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
      const totalReturns = returns.filter(r => r.status !== 'rejected' && r.isRefunded)
                                   .reduce((sum, r) => sum + r.refundAmount, 0);
      const totalRevenue = totalSales - totalReturns;

      return {
        today: { revenue: todayRevenue, salesCount: todaySales.length },
        week: { revenue: weekRevenue, salesCount: weekSales.length },
        month: { revenue: monthRevenue, salesCount: monthSales.length },
        total: { revenue: totalRevenue, salesCount: sales.length },
      };
    } catch (error) {
      console.error(`Error calculating revenue periods for bar ${barId}:`, error);
      return {
        today: { revenue: 0, salesCount: 0 },
        week: { revenue: 0, salesCount: 0 },
        month: { revenue: 0, salesCount: 0 },
        total: { revenue: 0, salesCount: 0 },
      };
    }
  };

  // A.1: Filtered bars based on search and status
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

  // Générer mot de passe sécurisé
  const generateSecurePassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    let password = '';

    // Garantir au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%&*'[Math.floor(Math.random() * 7)];

    // Compléter le reste
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Mélanger
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    setFormData({ ...formData, password });
  };

  // Copier credentials dans presse-papier
  const copyCredentials = () => {
    const username = formData.email.split('@')[0];
    const credentials = `Bar: ${formData.barName}\nNom: ${formData.firstName} ${formData.lastName}\nEmail: ${formData.email}\nTéléphone: ${formData.phone}\n\nCREDENTIALS:\nUsername: ${username}\nMot de passe: ${formData.password}`;

    navigator.clipboard.writeText(credentials).then(() => {
      alert('✅ Credentials copiés dans le presse-papier!');
    }).catch(() => {
      // Fallback pour navigateurs anciens
      const textarea = document.createElement('textarea');
      textarea.value = credentials;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('✅ Credentials copiés!');
    });
  };

  // Validation formulaire
  const validateForm = (): boolean => {
    const errors: Partial<CreatePromoteurForm> = {};

    if (!formData.email.trim()) errors.email = 'Email requis';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Email invalide';

    if (!formData.phone.trim()) errors.phone = 'Téléphone requis';
    else if (!/^01\d{8}$/.test(formData.phone.replace(/\s/g, ''))) errors.phone = 'Format: 01XXXXXXXX (10 chiffres)';

    if (!formData.password.trim()) errors.password = 'Mot de passe requis';
    else if (formData.password.length < 6) errors.password = 'Minimum 6 caractères';

    if (!formData.firstName.trim()) errors.firstName = 'Prénom requis';
    if (!formData.lastName.trim()) errors.lastName = 'Nom requis';
    if (!formData.barName.trim()) errors.barName = 'Nom du bar requis';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Créer promoteur + bar
  const handleCreatePromoteur = () => {
    if (!validateForm()) return;

    try {
      // 1. Créer utilisateur
      const username = formData.email.split('@')[0]; // email prefix comme username
      const newUser = createUser(
        {
          username,
          password: formData.password,
          name: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone,
          email: formData.email,
          isActive: true,
          firstLogin: true,
        },
        'promoteur'
      );

      if (!newUser) {
        alert('Erreur lors de la création du promoteur');
        return;
      }

      // 2. Créer bar avec le nouveau promoteur comme propriétaire
      const newBar = createBar({
        name: formData.barName,
        address: formData.barAddress || undefined,
        phone: formData.barPhone || undefined,
        email: formData.email,
        isActive: true,
        ownerId: newUser.id, // 🔧 FIX: Assigner le nouveau promoteur comme owner
        settings: {
          currency: 'FCFA',
          currencySymbol: ' FCFA',
          timezone: 'Africa/Porto-Novo',
          language: 'fr',
          businessDayCloseHour: 6,
          operatingMode: 'full',
          consignmentExpirationDays: 7,
        },
      });

      if (!newBar) {
        alert('Erreur lors de la création du bar');
        return;
      }

      // 3. Initialiser les données du bar (catégories et produits par défaut)
      console.log(`[SuperAdminDashboard] Initializing data for new bar: ${newBar.id}`);
      initializeBarData(newBar.id);

      // 4. Succès
      alert(`✅ Promoteur créé avec succès!\n\nBar: ${formData.barName}\n\nCredentials:\nUsername: ${username}\nMot de passe: ${formData.password}\nBar: ${formData.barName}\n\n(Envoyez ces informations au promoteur)`);

      setFormData(initialFormData);
      setShowCreateForm(false);
    } catch (error) {
      console.error('Erreur création promoteur:', error);
      alert('Erreur lors de la création');
    }
  };

  // Suspendre/Activer un bar
  const toggleBarStatus = (barId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'suspendre' : 'activer';
    if (confirm(`Voulez-vous vraiment ${action} ce bar ?`)) {
      updateBar(barId, { isActive: !currentStatus });
    }
  };

  // Réinitialiser mot de passe promoteur
  const handleResetPassword = (userId: string, userName: string) => {
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
      changePassword(userId, newPassword);
      alert(`✅ Mot de passe réinitialisé avec succès!\n\nUtilisateur: ${userName}\nNouveau mot de passe: ${newPassword}\n\n(Communiquez ce mot de passe au promoteur)`);
    }
  };

  if (!isOpen) return null;

  return (
    <>
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
                <p className="text-purple-100 text-sm">Gestion globale de BarTender Pro</p>
              </div>
            </div>
          </div>

          {/* Stats Cards - Version compacte */}
          <div className="p-4 bg-gradient-to-b from-purple-50 to-white">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 shadow-sm border border-purple-100">
                <div className="flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-purple-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-600 text-xs">Total Bars</p>
                    <p className="text-xl font-bold text-purple-600">{stats.totalBars}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 shadow-sm border border-blue-100">
                <div className="flex items-center gap-2">
                  <Users className="w-6 h-6 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-600 text-xs">Promoteurs</p>
                    <p className="text-xl font-bold text-blue-600">{stats.totalPromoteurs}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 shadow-sm border border-green-100">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-green-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-600 text-xs">Actifs</p>
                    <p className="text-xl font-bold text-green-600">{stats.activeBars}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 shadow-sm border border-orange-100">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6 text-orange-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-600 text-xs">Ventes Aujourd'hui</p>
                    <p className="text-xl font-bold text-orange-600">
                      {stats.totalSalesToday}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Boutons Actions */}
            <div className="mb-4 flex gap-3">
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow text-sm"
              >
                <UserPlus className="w-4 h-4" />
                Créer un Promoteur
              </button>
              <button
                onClick={() => setShowAuditLogs(true)}
                className="bg-gradient-to-r from-gray-700 to-gray-900 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow text-sm"
              >
                <FileText className="w-4 h-4" />
                Audit Logs
              </button>
            </div>

            {/* Formulaire Création Promoteur */}
            <AnimatePresence>
              {showCreateForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-8 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200 overflow-hidden"
                >
                  <h3 className="text-xl font-bold text-purple-900 mb-4 flex items-center gap-2">
                    <UserPlus className="w-6 h-6" />
                    Nouveau Promoteur
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Infos Promoteur */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-purple-800 text-sm">Informations Promoteur</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Prénom *
                        </label>
                        <input
                          type="text"
                          value={formData.firstName}
                          onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.firstName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="Guy"
                        />
                        {formErrors.firstName && <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nom *
                        </label>
                        <input
                          type="text"
                          value={formData.lastName}
                          onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.lastName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="GOUNOU"
                        />
                        {formErrors.lastName && <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="guy.gounou@example.com"
                        />
                        {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Téléphone *
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.phone ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="0197123456"
                        />
                        {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mot de passe *
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                              className={`w-full px-4 py-2 border rounded-lg pr-10 ${formErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                              placeholder="Minimum 6 caractères"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={generateSecurePassword}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                            title="Générer un mot de passe sécurisé"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                        {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                        <p className="text-xs text-gray-500 mt-1">
                          💡 Cliquez sur <RefreshCw className="w-3 h-3 inline" /> pour générer un mot de passe sécurisé
                        </p>
                      </div>
                    </div>

                    {/* Infos Bar */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-purple-800 text-sm">Informations du Bar</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nom du Bar *
                        </label>
                        <input
                          type="text"
                          value={formData.barName}
                          onChange={(e) => setFormData({ ...formData, barName: e.target.value })}
                          className={`w-full px-4 py-2 border rounded-lg ${formErrors.barName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="Bar La Plage"
                        />
                        {formErrors.barName && <p className="text-red-500 text-xs mt-1">{formErrors.barName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Adresse (optionnel)
                        </label>
                        <input
                          type="text"
                          value={formData.barAddress}
                          onChange={(e) => setFormData({ ...formData, barAddress: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          placeholder="Cotonou, Bénin"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Téléphone Bar (optionnel)
                        </label>
                        <input
                          type="tel"
                          value={formData.barPhone}
                          onChange={(e) => setFormData({ ...formData, barPhone: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          placeholder="0197987654"
                        />
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-purple-200 mt-6">
                        <h5 className="font-semibold text-gray-700 text-sm mb-2">Récapitulatif</h5>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Username: <span className="font-mono text-purple-600">{formData.email.split('@')[0] || '(email)'}</span></li>
                          <li>• Email: <span className="font-mono text-purple-600">{formData.email || '(à remplir)'}</span></li>
                          <li>• Rôle: <span className="font-semibold text-purple-700">Promoteur</span></li>
                          <li>• Bar créé automatiquement</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-6">
                    <button
                      onClick={handleCreatePromoteur}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-shadow"
                    >
                      Créer le Promoteur
                    </button>
                    <button
                      type="button"
                      onClick={copyCredentials}
                      disabled={!formData.email || !formData.password}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      title="Copier les credentials dans le presse-papier"
                    >
                      <Copy className="w-4 h-4" />
                      Copier
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        setFormData(initialFormData);
                        setFormErrors({});
                      }}
                      className="px-6 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Liste des Bars */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600" />
                Tous les Bars ({bars.length})
              </h3>

              {/* A.1: Search and Filters UI */}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredBars.map((bar) => {
                  const owner = users.find(u => u.id === bar.ownerId);
                  const members = getBarMembers(bar.id);
                  const todayRevenue = getBarTodayRevenue(bar.id);

                  return (
                    <div
                      key={bar.id}
                      className={`bg-white rounded-lg p-3 border-2 ${
                        bar.isActive ? 'border-green-200' : 'border-red-200'
                      } hover:shadow-lg transition-shadow`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-base text-gray-900 truncate">{bar.name}</h4>
                          <p className="text-xs text-gray-500 truncate">{bar.address || 'Pas d\'adresse'}</p>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ml-2 ${
                          bar.isActive
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
                          <span className="font-semibold">Email:</span> {bar.email || 'N/A'}
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
                          className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 ${
                            bar.isActive
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
                              onClose(); // Close admin dashboard after impersonation
                            } else {
                              alert('Aucun promoteur trouvé pour ce bar');
                            }
                          }}
                          className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg font-semibold text-xs hover:bg-orange-200 flex items-center justify-center gap-1.5"
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
                          onClick={() => setSelectedBarForStats(bar)}
                          className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg font-semibold text-xs hover:bg-purple-200 flex items-center justify-center gap-1.5"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          Stats
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* A.1: Empty states with filters awareness */}
              {filteredBars.length === 0 && bars.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-semibold">Aucun bar créé pour le moment</p>
                  <p className="text-sm">Créez votre premier promoteur pour commencer</p>
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {/* Modal Stats Détaillé */}
    <AnimatePresence>
      {selectedBarForStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
            onClick={() => setSelectedBarForStats(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-8 h-8" />
                    <div>
                      <h2 className="text-2xl font-bold">{selectedBarForStats.name}</h2>
                      <p className="text-purple-100 text-sm">Statistiques détaillées</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedBarForStats(null)}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(85vh-88px)]">
                {(() => {
                  const periods = getBarRevenuePeriods(selectedBarForStats.id);

                  return (
                    <div className="space-y-6">
                      {/* Filtres de période */}
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Période d'analyse</h3>

                        {/* Boutons filtres */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          <button
                            onClick={() => setStatsPeriodFilter('today')}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                              statsPeriodFilter === 'today'
                                ? 'bg-green-500 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            Aujourd'hui
                          </button>
                          <button
                            onClick={() => setStatsPeriodFilter('week')}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                              statsPeriodFilter === 'week'
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            7 Derniers Jours
                          </button>
                          <button
                            onClick={() => setStatsPeriodFilter('month')}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                              statsPeriodFilter === 'month'
                                ? 'bg-orange-500 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            30 Derniers Jours
                          </button>
                          <button
                            onClick={() => setStatsPeriodFilter('custom')}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                              statsPeriodFilter === 'custom'
                                ? 'bg-purple-500 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            Période Personnalisée
                          </button>
                        </div>

                        {/* Date pickers pour période personnalisée */}
                        {statsPeriodFilter === 'custom' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date de début
                              </label>
                              <input
                                type="date"
                                value={statsCustomDates.start}
                                onChange={(e) => setStatsCustomDates({ ...statsCustomDates, start: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date de fin
                              </label>
                              <input
                                type="date"
                                value={statsCustomDates.end}
                                onChange={(e) => setStatsCustomDates({ ...statsCustomDates, end: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Affichage statistiques selon filtre */}
                      {(() => {
                        let statsData: any = null;
                        let periodLabel = '';
                        let bgColor = '';
                        let iconColor = '';
                        let iconBg = '';

                        if (statsPeriodFilter === 'custom') {
                          if (!statsCustomDates.start || !statsCustomDates.end) {
                            return (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                                <p className="text-yellow-700 font-semibold">
                                  Veuillez sélectionner une date de début et une date de fin
                                </p>
                              </div>
                            );
                          }
                          const startDate = new Date(statsCustomDates.start);
                          const endDate = new Date(statsCustomDates.end);
                          endDate.setHours(23, 59, 59, 999); // End of day

                          if (startDate > endDate) {
                            return (
                              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                                <p className="text-red-700 font-semibold">
                                  La date de début doit être antérieure à la date de fin
                                </p>
                              </div>
                            );
                          }

                          statsData = getBarRevenueCustomPeriod(selectedBarForStats.id, startDate, endDate);
                          periodLabel = `Du ${startDate.toLocaleDateString('fr-FR')} au ${endDate.toLocaleDateString('fr-FR')}`;
                          bgColor = 'from-purple-50 to-indigo-50';
                          iconColor = 'text-purple-600';
                          iconBg = 'bg-purple-500';
                        } else if (statsPeriodFilter === 'today') {
                          statsData = periods.today;
                          periodLabel = 'Aujourd\'hui';
                          bgColor = 'from-green-50 to-emerald-50';
                          iconColor = 'text-green-600';
                          iconBg = 'bg-green-500';
                        } else if (statsPeriodFilter === 'week') {
                          statsData = { ...periods.week, days: 7, averagePerDay: periods.week.revenue / 7 };
                          periodLabel = '7 Derniers Jours';
                          bgColor = 'from-blue-50 to-cyan-50';
                          iconColor = 'text-blue-600';
                          iconBg = 'bg-blue-500';
                        } else if (statsPeriodFilter === 'month') {
                          statsData = { ...periods.month, days: 30, averagePerDay: periods.month.revenue / 30 };
                          periodLabel = '30 Derniers Jours';
                          bgColor = 'from-orange-50 to-amber-50';
                          iconColor = 'text-orange-600';
                          iconBg = 'bg-orange-500';
                        }

                        return (
                          <>
                            {/* Carte principale statistiques filtrées */}
                            <div className={`bg-gradient-to-br ${bgColor} rounded-xl p-6 border-2 ${iconColor.replace('text-', 'border-')}-200`}>
                              <div className="flex items-center gap-3 mb-4">
                                <div className={`${iconBg} text-white p-3 rounded-lg`}>
                                  <BarChart3 className="w-8 h-8" />
                                </div>
                                <div>
                                  <h3 className="text-2xl font-bold text-gray-900">{periodLabel}</h3>
                                  <p className="text-sm text-gray-600">
                                    {statsPeriodFilter === 'custom'
                                      ? `Période de ${statsData.days} jour${statsData.days > 1 ? 's' : ''}`
                                      : 'Période sélectionnée'}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {/* CA Net */}
                                <div className="bg-white rounded-lg p-4">
                                  <p className="text-sm text-gray-600 mb-1">CA Net</p>
                                  <p className={`text-3xl font-bold ${iconColor}`}>
                                    {statsData.revenue.toLocaleString()} FCFA
                                  </p>
                                </div>

                                {/* Grid 2 colonnes */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-white rounded-lg p-4">
                                    <p className="text-xs text-gray-600 mb-1">Nombre de ventes</p>
                                    <p className="text-xl font-bold text-gray-900">
                                      {statsData.salesCount}
                                    </p>
                                  </div>
                                  {(statsPeriodFilter === 'week' || statsPeriodFilter === 'month' || statsPeriodFilter === 'custom') && (
                                    <div className="bg-white rounded-lg p-4">
                                      <p className="text-xs text-gray-600 mb-1">CA/jour moyen</p>
                                      <p className="text-xl font-bold text-gray-900">
                                        {Math.round(statsData.averagePerDay).toLocaleString()} FCFA
                                      </p>
                                    </div>
                                  )}
                                  {statsPeriodFilter === 'today' && (
                                    <div className="bg-white rounded-lg p-4">
                                      <p className="text-xs text-gray-600 mb-1">Vente moyenne</p>
                                      <p className="text-xl font-bold text-gray-900">
                                        {statsData.salesCount > 0
                                          ? Math.round(statsData.revenue / statsData.salesCount).toLocaleString()
                                          : 0} FCFA
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Stats supplémentaires pour période custom */}
                                {statsPeriodFilter === 'custom' && statsData.salesCount > 0 && (
                                  <div className="bg-white rounded-lg p-4">
                                    <p className="text-xs text-gray-600 mb-1">Vente moyenne</p>
                                    <p className="text-xl font-bold text-gray-900">
                                      {Math.round(statsData.revenue / statsData.salesCount).toLocaleString()} FCFA
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Vue d'ensemble toutes périodes */}
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-gray-600" />
                                Vue d'ensemble globale
                              </h3>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white rounded-lg p-3">
                                  <p className="text-xs text-gray-600 mb-1">Aujourd'hui</p>
                                  <p className="text-lg font-bold text-green-600">
                                    {periods.today.revenue.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500">{periods.today.salesCount} ventes</p>
                                </div>
                                <div className="bg-white rounded-lg p-3">
                                  <p className="text-xs text-gray-600 mb-1">7 jours</p>
                                  <p className="text-lg font-bold text-blue-600">
                                    {periods.week.revenue.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500">{periods.week.salesCount} ventes</p>
                                </div>
                                <div className="bg-white rounded-lg p-3">
                                  <p className="text-xs text-gray-600 mb-1">30 jours</p>
                                  <p className="text-lg font-bold text-orange-600">
                                    {periods.month.revenue.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500">{periods.month.salesCount} ventes</p>
                                </div>
                                <div className="bg-white rounded-lg p-3">
                                  <p className="text-xs text-gray-600 mb-1">Total</p>
                                  <p className="text-lg font-bold text-purple-600">
                                    {periods.total.revenue.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500">{periods.total.salesCount} ventes</p>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* Section Facturation Future (si pertinent) - Affichée seulement pour month ou custom */}
                      {(statsPeriodFilter === 'month' || (statsPeriodFilter === 'custom' && statsCustomDates.start && statsCustomDates.end)) && (() => {
                        const revenueForBilling = statsPeriodFilter === 'month'
                          ? periods.month.revenue
                          : getBarRevenueCustomPeriod(
                              selectedBarForStats.id,
                              new Date(statsCustomDates.start),
                              new Date(statsCustomDates.end + 'T23:59:59')
                            ).revenue;

                        return (
                          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl p-6 border-2 border-amber-200">
                            <div className="flex items-center gap-3 mb-4">
                              <DollarSign className="w-6 h-6 text-amber-600" />
                              <h3 className="text-lg font-bold text-gray-900">Simulation Facturation</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                              Calcul indicatif pour modèle de facturation au prorata du CA
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Commission 5%</p>
                                <p className="text-xl font-bold text-amber-600">
                                  {Math.round(revenueForBilling * 0.05).toLocaleString()} FCFA
                                </p>
                              </div>
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Commission 3%</p>
                                <p className="text-xl font-bold text-amber-600">
                                  {Math.round(revenueForBilling * 0.03).toLocaleString()} FCFA
                                </p>
                              </div>
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Commission 2%</p>
                                <p className="text-xl font-bold text-amber-600">
                                  {Math.round(revenueForBilling * 0.02).toLocaleString()} FCFA
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}


                      {/* Informations Bar */}
                      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Informations du Bar</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Adresse</p>
                            <p className="font-semibold text-gray-900">{selectedBarForStats.address || 'Non renseignée'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Téléphone</p>
                            <p className="font-semibold text-gray-900">{selectedBarForStats.phone || 'Non renseigné'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Email</p>
                            <p className="font-semibold text-gray-900">{selectedBarForStats.email || 'Non renseigné'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Date de création</p>
                            <p className="font-semibold text-gray-900">
                              {new Date(selectedBarForStats.createdAt).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
    </AnimatePresence>

    {/* Audit Logs Panel */}
    <AuditLogsPanel
      isOpen={showAuditLogs}
      onClose={() => setShowAuditLogs(false)}
    />
  </>
  );
}

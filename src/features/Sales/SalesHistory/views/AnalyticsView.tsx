// src/features/Sales/SalesHistory/views/AnalyticsView.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { motion } from 'framer-motion';
import { useAppContext } from '../../../../context/AppContext';
import { useBarContext } from '../../../../context/BarContext';
import { useAuth } from '../../../../context/AuthContext';
import { useCurrencyFormatter } from '../../../../hooks/useBeninCurrency';
import { Select } from '../../../../components/ui/Select';
import { useViewport } from '../../../../hooks/useViewport';
import { AnalyticsService, TopProduct } from '../../../../services/supabase/analytics.service';
import { useDateRangeFilter } from '../../../../hooks/useDateRangeFilter';
import { SALES_HISTORY_FILTERS, TIME_RANGE_CONFIGS } from '../../../../config/dateFilters';
import { dateToYYYYMMDD, filterByBusinessDateRange, getBusinessDate } from '../../../../utils/businessDateHelpers';
import { getSaleDate } from '../../../../utils/saleHelpers'; // NEW: Added getSaleDate for evolutionChartData
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../../../../utils/businessDay'; // NEW: Added for filteredConsignments logic
import { TopProductsChart } from '../../../../components/analytics/TopProductsChart'; // Corrected Path
import {
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Minus,
  RotateCcw,
  Archive,
  ShoppingCart,
  ShieldCheck, // For Super Admin
  Crown, // For promoteur
  Settings, // For gerant
  Users, // For serveur
  Clock // NEW
} from 'lucide-react';
import { Sale, Category, Product, User, BarMember, Return } from '../../../../types';

// TYPES - Moved from SalesHistory.tsx
type Stats = {
  totalRevenue: number;
  totalItems: number;
  kpiValue: number;
  kpiLabel: string;
  topProducts: {
    byUnits: { name: string; volume: string; displayName: string; units: number; revenue: number; profit: number }[];
    byRevenue: { name: string; volume: string; displayName: string; units: number; revenue: number; profit: number }[];
    byProfit: { name: string; volume: string; displayName: string; units: number; revenue: number; profit: number }[];
  };
};


// Couleurs thème orange/ambre - Moved from SalesHistory.tsx
const CHART_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#ea580c', '#c2410c'];

interface AnalyticsViewProps {
  sales: Sale[];
  stats: Stats;
  formatPrice: (price: number) => string;
  categories: Category[];
  products: Product[];
  users: User[];
  barMembers: BarMember[];
  timeRange: string;
  isMobile: boolean;
  returns: Return[];
  closeHour: number;
  filteredConsignments: any[];
  startDate: Date;
  endDate: Date;
  topProductMetric: 'units' | 'revenue' | 'profit';
  setTopProductMetric: (metric: 'units' | 'revenue' | 'profit') => void;
  topProductsLimit: number;
  setTopProductsLimit: (limit: number) => void;
  isLoadingTopProducts: boolean;
  viewMode: 'list' | 'cards' | 'analytics';
}

export function AnalyticsView({
  sales,
  stats,
  formatPrice,
  categories,
  products: _products,
  users,
  barMembers,
  timeRange,
  isMobile,
  returns,
  closeHour,
  filteredConsignments,
  startDate,
  endDate,
  topProductMetric,
  setTopProductMetric,
  topProductsLimit,
  setTopProductsLimit,
  isLoadingTopProducts,
  viewMode
}: AnalyticsViewProps) {
  console.log('AnalyticsView - viewMode:', viewMode);
  console.log('AnalyticsView - topProductsData (stats.topProducts):', stats.topProducts);
  console.log('AnalyticsView - topProductsData (byUnits):', stats.topProducts.byUnits); // Correction ici, topProductsData est directement dans stats
  console.log('AnalyticsView - topProductMetric:', topProductMetric);
  console.log('AnalyticsView - topProductsLimit:', topProductsLimit);
  // Protection: s'assurer que tous les tableaux sont définis
  const safeUsers = users || [];
  const safeBarMembers = barMembers || [];

  const { sales: allSales } = useAppContext();

  // Calculer période précédente pour comparaison
  const { previousPeriodSales } = useMemo(() => {
    // 1. Calculer la durée de la période actuelle
    const currentDuration = endDate.getTime() - startDate.getTime();
    if (currentDuration <= 0) return { previousPeriodSales: [] };

    // 2. Déterminer les dates de la période précédente
    const previousEnd = startDate;
    const previousStart = new Date(previousEnd.getTime() - currentDuration);

    // 3. Convertir en strings YYYY-MM-DD pour le filtrage
    const prevStartDateStr = dateToYYYYMMDD(previousStart);
    // `-1` milliseconde pour garantir que la date de fin est exclusive et éviter tout chevauchement avec la `startDate` de la période actuelle.
    const prevEndDateStr = dateToYYYYMMDD(new Date(previousEnd.getTime() - 1));

    // 4. Filtrer les ventes GLOBALES avec le helper centralisé
    const previous = filterByBusinessDateRange(allSales, prevStartDateStr, prevEndDateStr, closeHour);

    return { previousPeriodSales: previous };
  }, [allSales, startDate, endDate, closeHour]);

  // KPIs avec tendances
  const kpis = useMemo(() => {
    const prevRevenue = previousPeriodSales.reduce((sum, s) => sum + s.total, 0);
    const prevCount = previousPeriodSales.length;
    const prevItems = previousPeriodSales.reduce((sum, s) =>
      sum + s.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );

    const revenueChange = prevRevenue > 0 ? ((stats.totalRevenue - prevRevenue) / prevRevenue) * 100 : (stats.totalRevenue > 0 ? 100 : 0);
    const salesChange = prevCount > 0 ? ((sales.length - prevCount) / prevCount) * 100 : (sales.length > 0 ? 100 : 0);
    const itemsChange = prevItems > 0 ? ((stats.totalItems - prevItems) / prevItems) * 100 : (stats.totalItems > 0 ? 100 : 0);

    return {
      revenue: { value: stats.totalRevenue, change: revenueChange },
      salesCount: { value: sales.length, change: salesChange },
      kpi: { value: stats.kpiValue, label: stats.kpiLabel, change: 0 },
      items: { value: stats.totalItems, change: itemsChange }
    };
  }, [sales, stats, previousPeriodSales]);

  // Statistiques consignations
  const consignmentStats = useMemo(() => {
    const activeConsignments = filteredConsignments.filter(c => c.status === 'active');
    const claimedConsignments = filteredConsignments.filter(c => c.status === 'claimed');
    const expiredConsignments = filteredConsignments.filter(c => c.status === 'expired');
    const forfeitedConsignments = filteredConsignments.filter(c => c.status === 'forfeited');

    const activeValue = activeConsignments.reduce((sum, c) => sum + c.totalAmount, 0);
    const claimedValue = claimedConsignments.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalValue = filteredConsignments.reduce((sum, c) => sum + c.totalAmount, 0);

    const totalQuantity = filteredConsignments.reduce((sum, c) => sum + c.quantity, 0);
    const claimedQuantity = claimedConsignments.reduce((sum, c) => sum + c.quantity, 0);
    const claimRate = filteredConsignments.length > 0
      ? (claimedConsignments.length / filteredConsignments.length) * 100
      : 0;

    return {
      total: filteredConsignments.length,
      active: activeConsignments.length,
      claimed: claimedConsignments.length,
      expired: expiredConsignments.length,
      forfeited: forfeitedConsignments.length,
      activeValue,
      claimedValue,
      totalValue,
      totalQuantity,
      claimedQuantity,
      claimRate
    };
  }, [filteredConsignments]);

  // Données pour graphique d'évolution - granularité adaptative
  const evolutionChartData = useMemo(() => {
    const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    // NOUVELLE LOGIQUE POUR VUE HORAIRE (<= 2 jours)
    if (dayCount <= 2) {
      const grouped = new Map<number, { label: string; revenue: number; sales: number; sortKey: number }>();

      // 1. Créer la "matrice" horaire de la journée commerciale, en démarrant de closeHour
      for (let i = 0; i < 24; i++) {
        const hour = (closeHour + i) % 24;
        const label = `${String(hour).padStart(2, '0')}h`;
        // Clé de tri pour respecter l'ordre de la journée commerciale
        grouped.set(hour, { label, revenue: 0, sales: 0, sortKey: i });
      }

      // 2. Peupler la matrice avec les ventes en utilisant l'heure de création réelle
      sales.forEach(sale => {
        if (sale.status !== 'validated') return;

        const saleCreationDate = new Date(sale.createdAt);
        const hour = saleCreationDate.getHours();

        if (grouped.has(hour)) {
          const existing = grouped.get(hour)!;
          existing.revenue += sale.total;
          existing.sales += 1;
        }
      });

      // 3. Convertir la map en tableau trié par la clé de tri
      return Array.from(grouped.values()).sort((a, b) => a.sortKey - b.sortKey);
    }

    // ANCIENNE LOGIQUE (CORRECTE POUR VUES > 2 JOURS)
    const grouped: Record<string, { label: string; revenue: number; sales: number; timestamp: number }> = {};
    sales.forEach(sale => {
      if (sale.status !== 'validated') return;

      let label: string;
      const saleDate = getSaleDate(sale); // Utilise le business day normalisé à minuit

      if (dayCount <= 14) { // Jusqu'à 2 semaines -> grouper par jour
        label = saleDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
      } else { // Plus de 2 semaines -> grouper par jour (DD/MM)
        label = saleDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      }

      const timestamp = saleDate.getTime();
      if (!grouped[label]) {
        grouped[label] = { label, revenue: 0, sales: 0, timestamp };
      }
      grouped[label].revenue += sale.total;
      grouped[label].sales += 1;
      // Le timestamp est utilisé pour le tri chronologique des jours
      grouped[label].timestamp = Math.min(grouped[label].timestamp, timestamp);
    });

    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);

  }, [sales, startDate, endDate, closeHour]);

  // Répartition par catégorie (sur CA BRUT pour avoir le détail des ventes)
  const categoryData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    let totalGross = 0;

    sales.forEach(sale => { // 'sales' is now the filtered list passed in props
      sale.items.forEach((item: any) => {
        const productId = item.product?.id || item.product_id;
        const product = _products.find(p => p.id === productId);
        const categoryId = product?.categoryId;

        const category = categories.find(c => c.id === categoryId);
        const catName = category?.name || 'Autre';
        const price = item.unit_price || 0;
        const itemRevenue = price * item.quantity;
        catRevenue[catName] = (catRevenue[catName] || 0) + itemRevenue;
        totalGross += itemRevenue;
      });
    });

    // Calculer les pourcentages sur le total BRUT pour cohérence
    return Object.entries(catRevenue).map(([name, value]) => ({
      name,
      value,
      percentage: totalGross > 0 ? (value / totalGross) * 100 : 0
    }));
  }, [sales, categories, _products]);

  // Performance par utilisateur
  const [userFilter, setUserFilter] = useState<'all' | 'servers' | 'management'>('all');

  const userPerformance = useMemo(() => {
    const userStats: Record<string, { name: string; role: string; revenue: number; sales: number; items: number }> = {};

    // Les ventes sont déjà filtrées par période via useDateRangeFilter
    // On n'a plus besoin de refiltrer, juste d'utiliser 'sales' directement
    const performanceSales = sales;

    // 1. Ajouter les ventes (déjà filtrées par période)
    performanceSales.forEach(sale => {
      // Mode simplifié : utiliser assignedTo si présent
      // Mode complet : utiliser createdBy (userId)
      if (sale.assignedTo) {
        // Mode simplifié - assignedTo contient le nom du serveur
        const serverName = sale.assignedTo;

        if (!userStats[serverName]) {
          // Détecter si c'est le gérant/promoteur qui a servi lui-même
          let role = 'serveur';
          if (serverName.includes('Moi (')) {
            if (serverName.includes('Gérant')) role = 'gerant';
            else if (serverName.includes('Promoteur')) role = 'promoteur';
          }

          userStats[serverName] = {
            name: serverName,
            role,
            revenue: 0,
            sales: 0,
            items: 0
          };
        }

        userStats[serverName].revenue += sale.total;
        userStats[serverName].sales += 1;
        userStats[serverName].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
      } else {
        // Mode complet - utiliser createdBy (userId)
        const user = safeUsers.find(u => u.id === sale.createdBy);
        if (!user) {

          return;
        }

        // Chercher d'abord dans barMembers, sinon utiliser le rôle de l'utilisateur
        const member = safeBarMembers.find(m => m.userId === user.id);
        const role = member?.role || 'serveur';

        if (!userStats[user.id]) {
          userStats[user.id] = {
            name: user.name,
            role,
            revenue: 0,
            sales: 0,
            items: 0
          };
        }

        userStats[user.id].revenue += sale.total;
        userStats[user.id].sales += 1;
        userStats[user.id].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
      }
    });

    // 2. Déduire les retours remboursés de la période filtrée
    // 🔒 SERVEURS : Seulement retours de LEURS ventes (même logique que getTodayTotal)
    const performanceSaleIds = new Set(performanceSales.map(s => s.id));

    // Filtrer les retours par business_date (même logique que les ventes)
    const startDateStr = dateToYYYYMMDD(startDate);
    const endDateStr = dateToYYYYMMDD(endDate);

    const filteredReturns = returns.filter(r => {
      if (r.status !== 'approved' && r.status !== 'restocked') return false;
      if (!r.isRefunded) return false;
      // 🔒 IMPORTANT: Seulement retours des ventes affichées
      if (!performanceSaleIds.has(r.saleId)) return false;

      // Filtrer par business_date du retour
      const returnBusinessDate = getBusinessDate(r, closeHour);
      return returnBusinessDate >= startDateStr && returnBusinessDate <= endDateStr;
    });

    // Déduire les retours du revenue de chaque vendeur
    filteredReturns.forEach(ret => {
      // Trouver la vente originale pour identifier le vendeur
      // ✅ IMPORTANT: Chercher dans performanceSales (même période)
      const originalSale = performanceSales.find(s => s.id === ret.saleId);
      if (!originalSale) {

        return; // Vente hors période, ignorer
      }

      const identifier = originalSale.assignedTo || originalSale.createdBy;


      if (userStats[identifier]) {
        userStats[identifier].revenue -= ret.refundAmount;
      } else {
        console.warn('❌ Identifier non trouvé dans userStats:', identifier);
      }
    });

    const allUsers = Object.values(userStats);

    if (userFilter === 'servers') {
      return allUsers.filter(u => u.role === 'serveur');
    } else if (userFilter === 'management') {
      return allUsers.filter(u => u.role === 'gerant' || u.role === 'promoteur');
    }

    return allUsers;
  }, [sales, returns, safeUsers, safeBarMembers, userFilter, closeHour, startDate, endDate]);

  // Top produits - 3 analyses (CA NET = Ventes - Retours) avec CUMP pour profit exact
  const topProductsData = useMemo(() => {
    const productStats: Record<string, { name: string; volume: string; units: number; revenue: number; profit: number; cost: number }> = {};

    // 1. Ajouter les ventes
    sales.forEach(sale => {
      sale.items.forEach((item: any) => {
        const productId = item.product?.id || item.product_id;
        const productName = item.product?.name || item.product_name || 'Produit';
        const productVolume = item.product?.volume || item.product_volume || '';
        const productPrice = item.product?.price || item.unit_price || 0;

        if (!productId) return; // Skip items without product ID

        // ✨ NEW: Get CUMP from product or fallback to 0
        const product = _products.find(p => p.id === productId);
        const currentAverageCost = product?.currentAverageCost ?? 0;

        if (!productStats[productId]) {
          productStats[productId] = {
            name: productName,
            volume: productVolume,
            units: 0,
            revenue: 0,
            cost: 0,
            profit: 0
          };
        }

        const quantity = item.quantity;
        const revenue = productPrice * quantity;
        const cost = currentAverageCost * quantity;

        productStats[productId].units += quantity;
        productStats[productId].revenue += revenue;
        productStats[productId].cost += cost;
        productStats[productId].profit += (revenue - cost); // ✨ CUMP: profit = revenue - cost
      });
    });

    // 2. Déduire les retours remboursés
    const filteredReturns = returns.filter(r => {
      if (r.status !== 'approved' && r.status !== 'restocked') return false;
      if (!r.isRefunded) return false;

      const returnDate = new Date(r.returnedAt);

      if (timeRange === 'today') {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      } else if (timeRange === 'week') {
        const currentDay = new Date().getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date();
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return returnDate >= monday && returnDate <= sunday;
      } else if (timeRange === 'month') {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        return returnDate >= firstDay && returnDate <= lastDay;
      } else if (timeRange === 'custom') {
        return true;
      }
      return false;
    });

    filteredReturns.forEach(ret => {
      if (productStats[ret.productId]) {
        // ✨ NEW: Deduct cost proportionally when item is returned
        const product = _products.find(p => p.id === ret.productId);
        const currentAverageCost = product?.currentAverageCost ?? 0;
        const returnedCost = currentAverageCost * ret.quantityReturned;

        productStats[ret.productId].units -= ret.quantityReturned;
        productStats[ret.productId].revenue -= ret.refundAmount;
        productStats[ret.productId].cost -= returnedCost;
        productStats[ret.productId].profit -= (ret.refundAmount - returnedCost); // Revenue loss - cost recovery
      }
    });

    const products = Object.values(productStats).map(p => ({
      ...p,
      displayName: `${p.name} ${p.volume ? `(${p.volume})` : ''}`
    }));

    return {
      byUnits: products.sort((a, b) => b.units - a.units).slice(0, 5),
      byRevenue: products.sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      byProfit: products.sort((a, b) => b.profit - a.profit).slice(0, 5)
    };
  }, [sales, returns, timeRange, closeHour, _products]);

  const TrendIcon = ({ change }: { change: number }) => {
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getRoleBadge = (role: string) => {
    if (role === 'promoteur') return { icon: '🏆', color: 'bg-yellow-100 text-yellow-800', label: 'Promoteur' };
    if (role === 'gerant') return { icon: '👔', color: 'bg-purple-100 text-purple-800', label: 'Gérant' };
    return { icon: '👨‍💼', color: 'bg-blue-100 text-blue-800', label: 'Serveur' };
  };

  // Message si pas de données
  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BarChart3 size={64} className="text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-600 mb-2">Aucune donnée disponible</h3>
        <p className="text-sm text-gray-500">Effectuez des ventes pour voir les analytics</p>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {/* KPIs principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3`}>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">Chiffre d'affaires</h4>
          <p className="text-xl font-bold text-amber-900">{formatPrice(kpis.revenue.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.revenue.change} />
            <span className={`text-xs font-medium ${kpis.revenue.change > 0 ? 'text-green-600' : kpis.revenue.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.revenue.change > 0 ? '+' : ''}{kpis.revenue.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">Ventes totales</h4>
          <p className="text-xl font-bold text-amber-900">{kpis.salesCount.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.salesCount.change} />
            <span className={`text-xs font-medium ${kpis.salesCount.change > 0 ? 'text-green-600' : kpis.salesCount.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.salesCount.change > 0 ? '+' : ''}{kpis.salesCount.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">{kpis.kpi.label}</h4>
          <p className="text-xl font-bold text-amber-900">{formatPrice(kpis.kpi.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-600">Période actuelle</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">Articles vendus</h4>
          <p className="text-xl font-bold text-amber-900">{kpis.items.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.items.change} />
            <span className={`text-xs font-medium ${kpis.items.change > 0 ? 'text-green-600' : kpis.items.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.items.change > 0 ? '+' : ''}{kpis.items.change.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Graphiques principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
        {/* Évolution CA - granularité adaptative */}
        <div className="bg-white rounded-xl p-4 border border-amber-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">
            Évolution du CA
            <span className="text-xs text-gray-500 ml-2">
              ({timeRange === 'today' ? 'par heure' : timeRange === 'week' ? 'par jour' : timeRange === 'month' ? 'par semaine' : 'par jour'})
            </span>
          </h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <LineChart data={evolutionChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #fdba74', borderRadius: '8px' }}
                formatter={(value: number) => formatPrice(value)}
              />
              <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Répartition par catégorie */}
        <div className="bg-white rounded-xl p-4 border border-amber-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Répartition par catégorie</h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={isMobile ? 40 : 60}
                outerRadius={isMobile ? 70 : 90}
                paddingAngle={2}
                dataKey="value"
                label={(entry: any) => `${entry.percentage.toFixed(0)}%`}
              >
                {categoryData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatPrice(value)} />
              <Legend
                layout={isMobile ? "horizontal" : "vertical"}
                align={isMobile ? "center" : "right"}
                verticalAlign={isMobile ? "bottom" : "middle"}
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section Consignations */}
      {consignmentStats.total > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-semibold text-gray-800">Consignations</h4>
          </div>

          {/* Stats grid */}
          <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-5'} gap-3 mb-3`}>
            <div className="bg-white rounded-lg p-3 border border-indigo-100">
              <p className="text-xs text-gray-600 mb-1">Total</p>
              <p className="text-lg font-bold text-indigo-900">{consignmentStats.total}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(consignmentStats.totalValue)}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-gray-600 mb-1">Actives</p>
              <p className="text-lg font-bold text-blue-900">{consignmentStats.active}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(consignmentStats.activeValue)}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-green-100">
              <p className="text-xs text-gray-600 mb-1">Récupérées</p>
              <p className="text-lg font-bold text-green-900">{consignmentStats.claimed}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(consignmentStats.claimedValue)}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <p className="text-xs text-gray-600 mb-1">Expirées</p>
              <p className="text-lg font-bold text-amber-900">{consignmentStats.expired}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-600 mb-1">Confisquées</p>
              <p className="text-lg font-bold text-red-900">{consignmentStats.forfeited}</p>
            </div>
          </div>

          {/* Taux de récupération */}
          <div className="bg-white rounded-lg p-3 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700">Taux de récupération</span>
              <span className="text-sm font-bold text-indigo-900">{consignmentStats.claimRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(consignmentStats.claimRate, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {consignmentStats.claimedQuantity} articles sur {consignmentStats.totalQuantity} récupérés
            </p>
          </div>
        </div>
      )}

      {/* Performance équipe */}
      <div className="bg-white rounded-xl p-4 border border-amber-100">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Performance Équipe</h4>
          <Select
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'servers', label: 'Serveurs' },
              { value: 'management', label: 'Management' },
            ]}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value as any)}
            size="sm"
            className="w-40"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-amber-100">
                <th className="text-left text-xs font-medium text-gray-600 pb-2 px-1">Nom</th>
                <th className="text-right text-xs font-medium text-gray-600 pb-2 px-2">CA</th>
                <th className="text-right text-xs font-medium text-gray-600 pb-2 px-2">Ventes</th>
                <th className="text-right text-xs font-medium text-gray-600 pb-2 px-1">% CA</th>
              </tr>
            </thead>
            <tbody>
              {userPerformance.sort((a, b) => b.revenue - a.revenue).map((user, index) => {
                const badge = getRoleBadge(user.role);
                return (
                  <tr key={index} className="border-b border-amber-50">
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.icon}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{user.name}</span>
                      </div>
                    </td>
                    <td className="text-right text-sm font-semibold text-amber-600 py-2 px-2">
                      {formatPrice(user.revenue)}
                    </td>
                    <td className="text-right text-sm text-gray-600 py-2 px-2">{user.sales}</td>
                    <td className="text-right text-sm font-medium text-gray-700 py-2 px-1">
                      {((user.revenue / stats.totalRevenue) * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top produits - Composant dédié */}
      <TopProductsChart
        data={stats.topProducts}
        metric={topProductMetric}
        onMetricChange={setTopProductMetric}
        limit={topProductsLimit}
        onLimitChange={setTopProductsLimit}
        isLoading={isLoadingTopProducts}
        isMobile={isMobile}
        formatPrice={formatPrice}
      />
    </div>
  );
}
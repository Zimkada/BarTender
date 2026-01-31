// src/features/Sales/SalesHistory/views/AnalyticsView.tsx
import { useMemo } from 'react';
import { useAppContext } from '../../../../context/AppContext';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import { getSaleDate } from '../../../../utils/saleHelpers';
import { TopProductsChart } from '../../../../components/analytics/TopProductsChart';
import { useTeamPerformance } from '../../../../hooks/useTeamPerformance';
import { TeamPerformanceChart } from '../../../../components/analytics/TeamPerformanceChart';
import {
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from '../../../../components/charts/RechartsWrapper';
import {
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  Clock
} from 'lucide-react';
import { Sale, Category, Product, User, BarMember, Return } from '../../../../types';

// TYPES
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

import { useTheme } from '../../../../context/ThemeContext';
import { ThemeService } from '../../../../services/theme.service';

// NOTE: Chart colors are now dynamic inside the component


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
  startDate,
  endDate,
  topProductMetric,
  setTopProductMetric,
  topProductsLimit,
  setTopProductsLimit,
  isLoadingTopProducts
}: AnalyticsViewProps) {


  // Protection: s'assurer que tous les tableaux sont définis
  const safeUsers = users || [];
  const safeBarMembers = barMembers || [];

  const { sales: allSales } = useAppContext();
  const { themeConfig } = useTheme();

  // Génération dynamique des couleurs du graphique basée sur le thème actif
  const chartColors = useMemo(() => {
    const colors = ThemeService.getColors(themeConfig);
    return [
      colors.primary,      // Dominant
      colors.secondary,    // Secondaire
      colors.accent,       // Accent
      `${colors.primary}80`, // Primary 50% opacity
      `${colors.secondary}80`, // Secondary 50% opacity
      `${colors.primary}40`, // Primary 25% opacity
      '#64748b'            // Neutral slate-500 for "Others"
    ];
  }, [themeConfig]);

  // Helper pour calculer le CA NET d'une vente (après déduction des retours remboursés)
  const getSaleNetRevenue = (sale: Sale): number => {
    const saleReturns = returns.filter(r => r.saleId === sale.id && r.isRefunded && (r.status === 'approved' || r.status === 'restocked'));
    const refundAmount = saleReturns.reduce((sum, r) => sum + r.refundAmount, 0);
    return sale.total - refundAmount;
  };


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
    // Calculer CA NET de la période précédente (brut - retours remboursés)
    const prevGrossRevenue = previousPeriodSales.reduce((sum, s) => sum + s.total, 0);
    const prevSaleIds = new Set(previousPeriodSales.map(s => s.id));
    const prevRefunds = returns
      .filter(r => prevSaleIds.has(r.saleId) && r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
      .reduce((sum, r) => sum + r.refundAmount, 0);
    const prevRevenue = prevGrossRevenue - prevRefunds;

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
  }, [sales, stats, previousPeriodSales, returns]);

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

      // 2. Peupler la matrice avec les ventes en utilisant l'heure de création réelle (CA NET)
      sales.forEach(sale => {
        if (sale.status !== 'validated') return;

        const saleCreationDate = new Date(sale.createdAt);
        const hour = saleCreationDate.getHours();

        if (grouped.has(hour)) {
          const existing = grouped.get(hour)!;
          existing.revenue += getSaleNetRevenue(sale);
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
      grouped[label].revenue += getSaleNetRevenue(sale);
      grouped[label].sales += 1;
      // Le timestamp est utilisé pour le tri chronologique des jours
      grouped[label].timestamp = Math.min(grouped[label].timestamp, timestamp);
    });

    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);

  }, [sales, startDate, endDate, closeHour]);

  // Répartition par catégorie (sur CA NET pour cohérence avec le reste du dashboard)
  const categoryData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    let totalNet = 0;

    sales.forEach(sale => {
      if (sale.status !== 'validated') return;

      // Calcul du net pour cette vente (total - retours associés)
      const saleReturns = returns.filter(r => r.saleId === sale.id && r.isRefunded && (r.status === 'approved' || r.status === 'restocked'));
      const refundAmount = saleReturns.reduce((sum, r) => sum + r.refundAmount, 0);
      const saleNet = sale.total - refundAmount;

      // Pro-rata du net sur les items (simplification: on applique le ratio net/brut à chaque item)
      const ratio = sale.total > 0 ? saleNet / sale.total : 0;

      sale.items.forEach((item: any) => {
        const productId = item.product?.id || item.product_id;
        const product = _products.find(p => p.id === productId);
        const categoryId = product?.categoryId;

        const category = categories.find(c => c.id === categoryId);
        const catName = category?.name || 'Autre';
        const itemGross = (item.unit_price || 0) * item.quantity;
        const itemNet = itemGross * ratio;

        catRevenue[catName] = (catRevenue[catName] || 0) + itemNet;
        totalNet += itemNet;
      });
    });

    const sortedData = Object.entries(catRevenue)
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalNet > 0 ? (value / totalNet) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);

    // Si moins de 7 catégories, on retourne tout
    if (sortedData.length <= 6) return sortedData;

    // Sinon, on garde le TOP 6 et on groupe le reste en "Autres"
    const top6 = sortedData.slice(0, 6);
    const others = sortedData.slice(6);
    const othersValue = others.reduce((sum, item) => sum + item.value, 0);

    return [
      ...top6,
      {
        name: 'Autres',
        value: othersValue,
        percentage: totalNet > 0 ? (othersValue / totalNet) * 100 : 0
      }
    ];
  }, [sales, categories, _products, returns]);

  // Performance par utilisateur
  const userPerformance = useTeamPerformance({
    sales,
    returns,
    users: safeUsers,
    barMembers: safeBarMembers,
    startDate,
    endDate,
    closeHour
  });

  const TrendIcon = ({ change }: { change: number }) => {
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
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
        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-xs font-bold text-brand-primary opacity-80 mb-1">Chiffre d'affaires</h4>
          <p className="text-xl font-black text-brand-dark">{formatPrice(kpis.revenue.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.revenue.change} />
            <span className={`text-xs font-bold ${kpis.revenue.change > 0 ? 'text-green-600' : kpis.revenue.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.revenue.change > 0 ? '+' : ''}{kpis.revenue.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-xs font-bold text-brand-primary opacity-80 mb-1">Ventes totales</h4>
          <p className="text-xl font-black text-brand-dark">{kpis.salesCount.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.salesCount.change} />
            <span className={`text-xs font-bold ${kpis.salesCount.change > 0 ? 'text-green-600' : kpis.salesCount.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.salesCount.change > 0 ? '+' : ''}{kpis.salesCount.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-xs font-bold text-brand-primary opacity-80 mb-1">{kpis.kpi.label}</h4>
          <p className="text-xl font-black text-brand-dark">{formatPrice(kpis.kpi.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-4 h-4 text-brand-primary" />
            <span className="text-xs font-bold text-brand-primary">Période actuelle</span>
          </div>
        </div>

        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-xs font-bold text-brand-primary opacity-80 mb-1">Articles vendus</h4>
          <p className="text-xl font-black text-brand-dark">{kpis.items.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.items.change} />
            <span className={`text-xs font-bold ${kpis.items.change > 0 ? 'text-green-600' : kpis.items.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.items.change > 0 ? '+' : ''}{kpis.items.change.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Graphiques principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`} data-guide="analytics-charts">
        {/* Évolution CA - granularité adaptative */}
        <div className="bg-white rounded-xl p-4 border border-brand-subtle shadow-sm">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">
            Évolution du CA
            <span className="text-xs text-gray-500 ml-2">
              ({timeRange === 'today' ? 'par heure' : timeRange === 'week' ? 'par jour' : timeRange === 'month' ? 'par semaine' : 'par jour'})
            </span>
          </h4>
          <div style={{ width: '100%', height: isMobile ? 200 : 250 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              <LineChart data={evolutionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--brand-bg-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid var(--brand-primary)', borderRadius: '12px', boxShadow: '0 4px 12px var(--brand-shadow)' }}
                  formatter={(value: any) => formatPrice(Number(value))}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--brand-primary)" strokeWidth={3} dot={{ fill: 'var(--brand-primary)', r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Répartition par catégorie */}
        <div className="bg-white rounded-xl p-4 border border-brand-subtle shadow-sm">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Répartition par catégorie</h4>
          <div style={{ width: '100%', height: isMobile ? 200 : 250 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 40 : 60}
                  outerRadius={isMobile ? 70 : 90}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                  label={(entry: any) => `${entry.percentage.toFixed(0)}%`}
                >
                  {categoryData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatPrice(Number(value))} />
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
      </div>

      {/* Performance équipe - Graphique */}
      <div data-guide="analytics-team">
        <TeamPerformanceChart
          data={userPerformance}
          formatPrice={formatPrice}
        />
      </div>

      {/* Top produits - Composant dédié */}
      <div data-guide="analytics-top-products">
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
    </div>
  );
}
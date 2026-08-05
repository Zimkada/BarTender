// src/features/Sales/SalesHistory/views/AnalyticsView.tsx
import { useMemo, useState } from 'react';
import { useBarContext } from '../../../../context/BarContext';
import { useUnifiedSales } from '../../../../hooks/pivots/useUnifiedSales';
import { dateToYYYYMMDD, filterByBusinessDateRange } from '../../../../utils/businessDateHelpers';
import { getSaleDate, isConfirmedReturn } from '../../../../utils/saleHelpers';
import { TopProductsChart } from '../../../../components/analytics/TopProductsChart';
import { useTeamPerformance } from '../../../../hooks/useTeamPerformance';
import { TeamPerformanceChart } from '../../../../components/analytics/TeamPerformanceChart';
import { ChartTooltip } from '../../../../components/charts/ChartTooltip';
import { KitchenAnalyticsBlock } from '../../../../components/kitchen/KitchenAnalyticsBlock';
import { ScopeSwitcher } from '../../../../components/common/ScopeSwitcher';
import {
  itemMatchesScope,
  type ActivityScope,
} from '../../../../components/common/scopeHelpers';
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
import { UnifiedReturn } from '../../../../hooks/pivots/useUnifiedReturns';

const chartAxisTick = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 };
const chartLegendStyle = { color: 'hsl(var(--muted-foreground))', fontSize: '12px' };

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
  returns: (Return | UnifiedReturn)[];
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

  const { currentBar, hasRestaurant } = useBarContext();

  /**
   * ⭐ Portée des statistiques — Tout / Bar / Restau (§9).
   *
   * ⚠️ « Tout » par défaut : c'est la vue qui répond à « combien j'ai fait
   * aujourd'hui ». Démarrer sur « Bar » masquerait le CA restaurant sans que
   * l'utilisateur l'ait demandé.
   *
   * ⭐ VERROU §3 : sur un bar pur, la portée est TOUJOURS 'all'. Le sélecteur
   * ne s'y rend pas, donc `setScope` n'est jamais appelé — mais rien ne
   * l'empêcherait structurellement (URL, état persisté). Sans ce verrou, une
   * portée 'kitchen' viderait tous les graphiques d'un bar sans cuisine.
   */
  const [rawScope, setScope] = useState<ActivityScope>('all');
  const scope: ActivityScope = hasRestaurant ? rawScope : 'all';
  // ⚡ Egress: ne charger que la période analysée + la période précédente (pour les
  // comparaisons de tendance), au lieu des 6 mois du défaut dataTier. La fenêtre
  // = [startDate - durée ; endDate], soit 2× la durée de la période courante.
  // includeItems requis pour le top produits (cf. sale.items plus bas).
  const analyticsSalesFilters = useMemo(() => {
    const currentDuration = endDate.getTime() - startDate.getTime();
    // Garde-fou 1 : si période invalide, on borne au moins à la période courante.
    let fetchStart = currentDuration > 0
      ? new Date(startDate.getTime() - currentDuration)
      : startDate;
    // Garde-fou 2 : plafonner la fenêtre de fetch à 12 mois max en amont de endDate.
    // Évite tout fetch massif accidentel si l'utilisateur compare une période très
    // longue (ex: 2 ans). Au-delà, la comparaison de tendance perd de sa pertinence
    // métier et le coût egress deviendrait disproportionné.
    const MAX_FETCH_WINDOW_MS = 366 * 24 * 60 * 60 * 1000; // ~12 mois
    const earliestAllowed = new Date(endDate.getTime() - MAX_FETCH_WINDOW_MS);
    if (fetchStart < earliestAllowed) {
      fetchStart = earliestAllowed;
    }
    return {
      startDate: dateToYYYYMMDD(fetchStart),
      endDate: dateToYYYYMMDD(endDate),
      includeItems: true,
    };
  }, [startDate, endDate]);
  const { sales: allSales } = useUnifiedSales(currentBar?.id, analyticsSalesFilters);
  const { themeConfig } = useTheme();

  // Génération dynamique des couleurs du graphique basée sur le thème actif
  const chartColors = useMemo(() => {
    const colors = ThemeService.getColors(themeConfig);
    return [
      colors.primary,      // Dominant
      colors.secondary,    // Secondaire
      colors.accent,       // Accent
      `${colors.primary}B3`, // Primary 70% opacity
      `${colors.secondary}B3`, // Secondary 70% opacity
      `${colors.accent}B3`,   // Accent 70% opacity
      `${colors.primary}66`, // Primary 40% opacity
      '#64748b'            // Neutral slate-500 for "Others"
    ];
  }, [themeConfig]);

  /**
   * ⭐⭐ INDEX DES REMBOURSEMENTS PAR VENTE — défaut de performance trouvé le
   * 05/08/2026 (« la répartition met un petit temps à s'actualiser »).
   *
   * ⛔ AVANT : `returns.filter(r => r.saleId === sale.id)` était appelé DANS
   * la boucle sur les ventes — un parcours complet des retours POUR CHAQUE
   * vente. Sur 200 ventes et 50 retours : 10 000 comparaisons.
   * ⚠️ Et ce coût était payé QUATRE FOIS : `getScopedNetRevenue` est appelée
   * par les KPI, la période précédente, la courbe d'évolution et la
   * répartition — chacune reparcourant tout.
   *
   * ⭐ Une Map construite UNE fois : la recherche passe de O(n) à O(1), donc
   * le total de O(n×m) à O(n+m). C'est le changement de portée qui en
   * bénéficie le plus — il invalide tous les useMemo d'un coup.
   */
  const refundBySaleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of returns) {
      if (!isConfirmedReturn(r)) continue;
      map.set(r.saleId, (map.get(r.saleId) ?? 0) + r.refundAmount);
    }
    return map;
  }, [returns]);

  /**
   * ⭐⭐ CA NET **DE LA PORTÉE COURANTE** — défaut signalé en test terrain le
   * 05/08/2026, relevé SQL à l'appui.
   *
   * ⛔ Les KPI sommaient `getSaleNetRevenue(s)` — le total de la vente
   * ENTIÈRE — sans jamais regarder les items. Une vente mixte (boisson +
   * plat) comptait donc INTÉGRALEMENT en portée Restau.
   * Mesuré sur le bar de test : l'écran affichait 11 400 F alors que le CA
   * plats réel valait 5 000 F. Un promoteur aurait cru sa cuisine DEUX FOIS
   * plus rentable qu'elle ne l'est — et aurait décidé sur ce chiffre.
   *
   * ⚠️ C'est ce que signalait l'avertissement ESLint « missing dependency:
   * scope » sur le useMemo des KPI, que j'avais écarté comme préexistant. Il
   * ne l'était pas : il désignait ce défaut.
   *
   * ⭐ Le remboursement est réparti AU PRORATA de la part de la portée dans
   * la vente : rembourser un plat ne doit pas amputer le CA des boissons, et
   * inversement. Même simplification que la répartition par catégorie plus
   * bas — cohérente d'un bloc à l'autre du même écran.
   */
  const getScopedNetRevenue = (sale: Sale): number => {
    const scopedGross = sale.items.reduce(
      (sum, item) => (itemMatchesScope(item, scope) ? sum + item.total_price : sum),
      0
    );
    // ⚠️ En portée « Tout », `scopedGross` vaut le brut : on retombe
    // exactement sur `getSaleNetRevenue`, donc AUCUN changement pour un bar
    // pur ou une portée non filtrée (§3).
    if (scopedGross === 0) return 0;

    // ⭐ O(1) via l index, au lieu d un parcours complet des retours.
    const refundAmount = refundBySaleId.get(sale.id) ?? 0;
    if (refundAmount === 0) return scopedGross;

    const ratio = sale.total > 0 ? scopedGross / sale.total : 0;
    return scopedGross - refundAmount * ratio;
  };

  /** Articles de la portée courante — même règle que le CA. */
  const getScopedItemCount = (sale: Sale): number =>
    sale.items.reduce(
      (sum, item) => (itemMatchesScope(item, scope) ? sum + item.quantity : sum),
      0
    );

  /** Une vente COMPTE dans la portée si elle y a au moins un article. */
  const saleTouchesScope = (sale: Sale): boolean =>
    sale.items.some((item) => itemMatchesScope(item, scope));


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

  // KPIs avec tendances (Calculés sur la donnée RÉELLE filtrée pour réactivité maximale)
  const kpis = useMemo(() => {
    // 1. Calculer CA NET de la période actuelle (brut - retours remboursés)
    const currentRevenue = sales.reduce((sum, s) => {
      // Pour les stats, on ne compte que les ventes validées (ou optimistes qui le seront)
      if (s.status !== 'validated' && !s.isOptimistic) return sum;
      return sum + getScopedNetRevenue(s);
    }, 0);

    // ⚠️ items_count VOLONTAIREMENT IGNORE : ce compteur denormalise porte
    // TOUS les articles de la vente, sans distinction de portee. L utiliser
    // ferait compter les boissons en portee Restau — le defaut meme qu on
    // corrige ici.
    const currentItems = sales.reduce((sum, s) => {
      if (s.status !== 'validated' && !s.isOptimistic) return sum;
      return sum + getScopedItemCount(s);
    }, 0);

    // ⚠️ Une vente ne compte QUE si elle contient un article de la portee :
    // sinon une soiree 100 % boissons afficherait « 11 ventes » en Restau.
    const currentCount = sales.filter(
      s => (s.status === 'validated' || s.isOptimistic) && saleTouchesScope(s)
    ).length;

    // 2. Calculer CA NET de la période précédente (pour la tendance)
    // ⚠️ MEME portee sur la periode precedente : comparer un CA Restau a un
    // CA global produirait des tendances absurdes (« -60 % » alors que la
    // cuisine progresse).
    const prevRevenue = previousPeriodSales.reduce(
      (sum, s) => sum + getScopedNetRevenue(s), 0
    );
    const prevCount = previousPeriodSales.filter(saleTouchesScope).length;
    const prevItems = previousPeriodSales.reduce(
      (sum, s) => sum + getScopedItemCount(s), 0
    );

    // 3. Calculer les variations
    const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);
    const salesChange = prevCount > 0 ? ((currentCount - prevCount) / prevCount) * 100 : (currentCount > 0 ? 100 : 0);
    const itemsChange = prevItems > 0 ? ((currentItems - prevItems) / prevItems) * 100 : (currentItems > 0 ? 100 : 0);

    // 4. Recalculer le KPI (moyenne heure/jour) sur la donnée fraîche
    const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    let currentKpiValue = 0;
    if (timeRange === 'today') {
      const now = new Date();
      const effectiveNow = now < startDate ? startDate : now;
      const hoursElapsed = (effectiveNow.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      currentKpiValue = hoursElapsed > 0 ? currentRevenue / hoursElapsed : 0;
    } else {
      currentKpiValue = currentRevenue / dayCount;
    }

    return {
      revenue: { value: currentRevenue, change: revenueChange },
      salesCount: { value: currentCount, change: salesChange },
      kpi: { value: currentKpiValue, label: stats.kpiLabel, change: 0 },
      items: { value: currentItems, change: itemsChange }
    };
    // ⚠️ scope INDISPENSABLE dans les deps : sans lui, changer de portee ne
    // recalculerait RIEN et les KPI resteraient figes sur la precedente.
  }, [sales, stats.kpiLabel, previousPeriodSales, returns, startDate, endDate, timeRange, scope]);

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
          // ⭐ CA de la PORTEE — sinon la courbe montrait des pics superieurs
          // au CA plats reel (test terrain : 3 200 F pour des plats a 2 500).
          existing.revenue += getScopedNetRevenue(sale);
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
      grouped[label].revenue += getScopedNetRevenue(sale);
      grouped[label].sales += 1;
      // Le timestamp est utilisé pour le tri chronologique des jours
      grouped[label].timestamp = Math.min(grouped[label].timestamp, timestamp);
    });

    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);

    // ⚠️ scope dans les deps : sans lui la courbe resterait figee sur la
    // portee precedente.
  }, [sales, startDate, endDate, closeHour, scope]);

  // Répartition par catégorie (sur CA NET pour cohérence avec le reste du dashboard)
  const categoryData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    let totalNet = 0;

    sales.forEach(sale => {
      if (sale.status !== 'validated') return;

      // Calcul du net pour cette vente (total - retours associés)
      // ⭐ O(1) via l index (cf. refundBySaleId plus haut).
      const refundAmount = refundBySaleId.get(sale.id) ?? 0;
      const saleNet = sale.total - refundAmount;

      // Pro-rata du net sur les items (simplification: on applique le ratio net/brut à chaque item)
      const ratio = sale.total > 0 ? saleNet / sale.total : 0;

      sale.items.forEach((item) => {
        /**
         * ⭐ PORTÉE — l'item entre-t-il dans ce que l'utilisateur regarde ?
         * Règle partagée avec le Dashboard (`itemMatchesScope`) : les deux
         * écrans doivent classer un item de la MÊME façon, sinon leurs
         * chiffres divergeraient pour la même journée.
         */
        if (!itemMatchesScope(item, scope)) return;

        /**
         * ⭐ Un PLAT n'a pas de `product_id` : il porte `item_type: 'dish'` et
         * `dish_id` (format retenu le 04/08/2026). `find` retournerait donc
         * `undefined` et tout son CA tomberait dans « Autre ».
         *
         * ⚠️ On REGROUPE sous « Restau » plutôt qu'on n'EXCLUT : ce graphique
         * est une RÉPARTITION du CA, il doit totaliser 100 %. En portée
         * « Tout », exclure les plats produirait un camembert qui ne couvre pas
         * tout le chiffre d'affaires — plus trompeur que le défaut corrigé.
         *
         * ⚠️ Un seul libellé pour tous les plats, sans détailler leurs
         * catégories : mélanger « Grillades » et « Bière » dans le même
         * camembert brouillerait la lecture. La répartition fine des plats
         * relèvera des cartes de la portée « Restau ».
         */
        if ((item.item_type ?? 'product') === 'dish') {
          const itemNet = (item.unit_price || 0) * item.quantity * ratio;
          catRevenue['Restau'] = (catRevenue['Restau'] || 0) + itemNet;
          totalNet += itemNet;
          return;
        }

        const productId = item.product_id;
        const product = (_products || []).find(p => p.id === productId);
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
    /**
     * ⛔⛔ `scope` MANQUAIT — c'est LA cause du délai signalé le 05/08/2026
     * (« la répartition met un petit temps avant de s'actualiser lors du
     * switch bar ↔ restau »).
     *
     * Le graphique lit `itemMatchesScope(item, scope)` mais ne se recalculait
     * PAS au changement de portée : il restait figé sur la précédente jusqu'à
     * ce qu'une AUTRE dépendance bouge (un refetch des ventes, par exemple).
     * D'où l'impression de latence — ce n'était pas un calcul lent, c'était
     * un calcul qui n'avait pas lieu.
     *
     * ⚠️ Ce n'était donc pas un défaut d'animation Recharts, comme je l'avais
     * d'abord supposé. Vérifier avant de conclure.
     *
     * ⭐ `refundBySaleId` ajouté aussi : la Map remplace le filtre imbriqué.
     */
  }, [sales, categories, _products, refundBySaleId, scope]);

  /**
   * ⭐⭐ TOP PRODUITS FILTRÉ PAR PORTÉE — 05/08/2026.
   *
   * ⚠️ La RPC `get_top_products_aggregated` ne connaît pas la portée : elle
   * renvoie boissons ET plats mélangés. On filtre donc ICI, sur les NOMS de
   * plats relevés dans les ventes de la période.
   *
   * ⚠️ FILTRAGE PAR NOM et non par id : la RPC laisse `product_id` à NULL
   * pour un plat (elle groupe sur `dish_id` depuis la migration
   * 20260805100000, mais n'expose pas cette clé dans son RETURNS TABLE).
   * Le nom est le seul lien disponible — et il est figé à la vente, donc
   * stable.
   *
   * ⚠️ LIMITE CONNUE, relevée à la code review du 05/08/2026 : un PRODUIT et
   * un PLAT homonymes seraient confondus. `dishes` garantit l'unicité du nom
   * ENTRE PLATS (idx_dishes_unique_name_per_bar), mais rien n'empêche un
   * `bar_products` de porter le même libellé — ce sont deux tables.
   * ⭐ Le plat l'emporterait : `dishNames.has(name)` classerait les DEUX en
   * Restau. Risque accepté — un bar nommant identiquement une boisson et un
   * plat créerait de toute façon une confusion pour ses serveurs.
   * ⛔ La correction propre serait d'exposer `dish_id` dans le RETURNS TABLE
   * de la RPC : une migration de plus sur une fonction que TOUS les bars
   * utilisent, pour un cas qui ne s'est jamais produit.
   *
   * ⛔ LIMITE ASSUMÉE : la RPC plafonne à `p_limit` AVANT ce filtrage. Si les
   * 5 premiers articles sont des boissons, la portée Restau affichera une
   * liste courte, voire vide, alors que des plats se vendent. Corriger
   * exigerait un paramètre de portée dans la RPC — une seconde migration sur
   * une fonction que TOUS les bars utilisent. Le gain ne le justifie pas
   * tant qu'aucun bar n'a assez de plats pour que le cas se produise.
   *
   * ⭐ En portée « Tout », la liste est retournée TELLE QUELLE : aucun coût,
   * aucun changement pour un bar pur (§3).
   */
  const dishNames = useMemo(() => {
    const names = new Set<string>();
    for (const sale of sales) {
      for (const item of sale.items) {
        if ((item.item_type ?? 'product') === 'dish') names.add(item.product_name);
      }
    }
    return names;
  }, [sales]);

  const scopedTopProducts = useMemo(() => {
    if (scope === 'all') return stats.topProducts;

    const keep = (row: { name: string }) =>
      scope === 'kitchen' ? dishNames.has(row.name) : !dishNames.has(row.name);

    return {
      byUnits: stats.topProducts.byUnits.filter(keep),
      byRevenue: stats.topProducts.byRevenue.filter(keep),
      byProfit: stats.topProducts.byProfit.filter(keep),
    };
  }, [stats.topProducts, scope, dishNames]);

  // Performance par utilisateur
  const userPerformance = useTeamPerformance({
    sales,
    returns,
    users: safeUsers,
    barMembers: safeBarMembers,
    startDate,
    endDate,
    closeHour,
    // ⭐ Sans cette portee, le graphique affichait le CA TOTAL de chaque
    // membre en Restau — boissons comprises (test terrain 05/08/2026).
    scope
  });

  const TrendIcon = ({ change }: { change: number }) => {
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-600 dark:text-green-400" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-600 dark:text-red-400" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  // Message si pas de données
  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BarChart3 size={64} className="text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="text-h3 text-foreground/80 mb-2">Aucune donnée disponible</h3>
        <p className="text-body-sm text-muted-foreground">Effectuez des ventes pour voir les analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ⭐ Portée — placée AVANT les chiffres : elle définit ce qu'ils
          couvrent. La mettre après laisserait lire des montants sans savoir
          de quoi ils parlent.
          §3 — ne rend RIEN sur un bar pur : l'écran est alors identique. */}
      <ScopeSwitcher
        scope={scope}
        onScopeChange={setScope}
        hasRestaurant={hasRestaurant}
      />

      {/* KPIs principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3`} data-guide="analytics-kpis">
        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-micro text-brand-primary mb-1">Chiffre d'affaires</h4>
          <p className="text-h2 font-semibold text-foreground tabular-nums">{formatPrice(kpis.revenue.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.revenue.change} />
            <span className={`text-caption font-medium tabular-nums ${kpis.revenue.change > 0 ? 'text-green-600 dark:text-green-400' : kpis.revenue.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {kpis.revenue.change > 0 ? '+' : ''}{kpis.revenue.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-micro text-brand-primary mb-1">Ventes totales</h4>
          <p className="text-h2 font-semibold text-foreground tabular-nums">{kpis.salesCount.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.salesCount.change} />
            <span className={`text-caption font-medium tabular-nums ${kpis.salesCount.change > 0 ? 'text-green-600 dark:text-green-400' : kpis.salesCount.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {kpis.salesCount.change > 0 ? '+' : ''}{kpis.salesCount.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-micro text-brand-primary mb-1">{kpis.kpi.label}</h4>
          <p className="text-h2 font-semibold text-foreground tabular-nums">{formatPrice(kpis.kpi.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-4 h-4 text-brand-primary" />
            <span className="text-caption font-medium text-brand-primary">Période actuelle</span>
          </div>
        </div>

        <div className="bg-brand-subtle rounded-xl p-4 border border-brand-subtle">
          <h4 className="text-micro text-brand-primary mb-1">Articles vendus</h4>
          <p className="text-h2 font-semibold text-foreground tabular-nums">{kpis.items.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.items.change} />
            <span className={`text-caption font-medium tabular-nums ${kpis.items.change > 0 ? 'text-green-600 dark:text-green-400' : kpis.items.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {kpis.items.change > 0 ? '+' : ''}{kpis.items.change.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* ⭐⭐ MÉTRIQUES CUISINE — portée Restau UNIQUEMENT.
          Placées APRÈS les KPI ventes : elles les COMPLÈTENT, elles ne les
          remplacent pas. Le CA et les ventes restent calculés depuis `sales`,
          comme en portée Bar — une seule source par chiffre.
          ⚠️ En portée « Tout », ce bloc est MASQUÉ : mélanger une marge
          matière (cuisine seule) à un CA global laisserait croire que le
          taux couvre aussi les boissons.
          ⚠️ Le composant se masque LUI-MÊME sans `canViewKitchenCosts` et
          sans données — la condition ici ne porte que sur la portée. */}
      {scope === 'kitchen' && (
        <KitchenAnalyticsBlock
          barId={currentBar?.id}
          startDate={startDate}
          endDate={endDate}
          formatPrice={formatPrice}
          isMobile={isMobile}
        />
      )}

      {/* Graphiques principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`} data-guide="analytics-charts">
        {/* Évolution CA - granularité adaptative */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-guide="analytics-revenue-chart">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Évolution du CA
            <span className="text-xs text-muted-foreground ml-2">
              ({timeRange === 'today' ? 'par heure' : timeRange === 'week' ? 'par jour' : timeRange === 'month' ? 'par semaine' : 'par jour'})
            </span>
          </h4>
          <div style={{ width: '100%', height: isMobile ? 200 : 250 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              <LineChart data={evolutionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.55} />
                <XAxis dataKey="label" tick={chartAxisTick} />
                <YAxis tick={chartAxisTick} />
                <Tooltip content={<ChartTooltip valueFormatter={(value) => formatPrice(value)} />} />
                <Line type="monotone" dataKey="revenue" stroke="var(--brand-primary)" strokeWidth={3} dot={{ fill: 'var(--brand-primary)', r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Répartition par catégorie */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm" data-guide="analytics-category-chart">
          <h4 className="text-sm font-semibold text-foreground mb-3">Répartition par catégorie</h4>
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={((entry: { percentage: number }) => `${entry.percentage.toFixed(0)}%`) as any}
                  labelLine={{ stroke: 'hsl(var(--border))' }}
                >
                  {categoryData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip valueFormatter={(value) => formatPrice(value)} />} />
                <Legend
                  layout={isMobile ? "horizontal" : "vertical"}
                  align={isMobile ? "center" : "right"}
                  verticalAlign={isMobile ? "bottom" : "middle"}
                  wrapperStyle={chartLegendStyle}
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
          colors={chartColors}
        />
      </div>

      {/* ⭐⭐ TOP PRODUITS — FILTRÉ par portée depuis le 05/08/2026.
          ⛔ Il affichait « Whisky Cola, Racines, Beaufort » en portée Restau.
          ⚠️ Je l'avais d'abord MASQUÉ, en concluant trop vite que sa source
          SQL n'était pas filtrable. L'utilisateur a demandé ce qu'on perdait
          à le garder : la réponse était les TROIS AXES (unités, revenu,
          marge) que le classement des plats du bloc cuisine n'a pas.
          ⭐ La migration 20260805100000 a rendu ce classement JUSTE pour les
          plats (clé COALESCE(product_id, dish_id) + marge FEFO). Le filtrer
          est donc devenu la bonne réponse — et il redonne les trois axes. */}
      <div data-guide="analytics-top-products">
        <TopProductsChart
          data={scopedTopProducts}
          metric={topProductMetric}
          onMetricChange={setTopProductMetric}
          limit={topProductsLimit}
          onLimitChange={setTopProductsLimit}
          isLoading={isLoadingTopProducts}
          isMobile={isMobile}
          /* ⚠️ En portee Restau sans plat vendu, le message par defaut
             (« Aucune vente enregistree ») CONTREDIRAIT les KPI juste
             au-dessus, qui affichent le CA des boissons. */
          emptyLabel={
            scope === 'kitchen'
              ? { title: 'Aucun plat vendu',
                  hint: 'Les ventes de cette periode ne comportent pas de plats.' }
              : scope === 'bar'
                ? { title: 'Aucune boisson vendue',
                    hint: 'Les ventes de cette periode ne comportent pas de boissons.' }
                : undefined
          }
          formatPrice={formatPrice}
        />
      </div>
    </div>
  );
}

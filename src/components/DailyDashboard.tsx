import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScopeSwitcher } from './common/ScopeSwitcher';
import { useDailyScopeTotals, useDishes } from '../hooks/queries/useDishesQueries';
import { itemMatchesScope, type ActivityScope } from './common/scopeHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { Sale } from '../types';
import { AnalyticsService } from '../services/supabase/analytics.service';
import { analyticsKeys } from '../hooks/queries/useAnalyticsQueries';
import { replaceAccents, buildWhatsAppMessage } from '../utils/stringFormatting';

// Hook & Sub-components
import { useDashboardAnalytics } from '../hooks/useDashboardAnalytics';
import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { DashboardSummary } from './dashboard/tabs/DashboardSummary';
import { DashboardOrders } from './dashboard/tabs/DashboardOrders';
import { DashboardPerformance } from './dashboard/tabs/DashboardPerformance';
import { DashboardViewMode } from '../pages/DashboardPage';

interface DailyDashboardProps {
  activeView?: DashboardViewMode;
}

/**
 * DailyDashboard - Page tableau de bord quotidien
 * Refactoré : Shell léger qui orchestre les onglets
 */
export function DailyDashboard({ activeView = 'summary' }: DailyDashboardProps) {
  const { users } = useAppContext();
  const { currentBar, hasRestaurant } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, showError, setLoading } = useFeedback();
  const queryClient = useQueryClient();

  // Architecture: Data fetching & Business Logic centralized in Hook
  const analytics = useDashboardAnalytics(currentBar?.id);

  /**
   * ⭐ Portée des chiffres — Tout / Bar / Restau (§9).
   *
   * ⭐ VERROU §3 : sur un bar pur, TOUJOURS 'all'. Le sélecteur ne s'y rend
   * pas, donc `setScope` n'est jamais appelé — mais rien ne l'empêcherait
   * structurellement. Sans ce verrou, une portée 'kitchen' afficherait un CA
   * à zéro sur un bar sans cuisine.
   */
  const [rawScope, setScope] = useState<ActivityScope>('all');
  const scope: ActivityScope = hasRestaurant ? rawScope : 'all';

  /**
   * ⭐ Ventilation SERVEUR — la « query agrégée supplémentaire » du §9.
   *
   * ⚠️ Appelée UNE fois : changer de portée ne redemande rien. Le Dashboard
   * charge les ventes avec `includeItems: false` (optimisation egress
   * délibérée) — ventiler côté client annulerait ce gain.
   */
  const { data: scopeTotals } = useDailyScopeTotals(
    currentBar?.id,
    analytics.todayDateStr
  );

  /**
   * ⛔⛔ TOP PRODUITS FILTRE PAR PORTEE — defaut signale en test terrain le
   * 05/08/2026, captures a l appui.
   *
   * Le classement affichait « Poulet braise, Racines, Whisky Cola » dans LES
   * TROIS portees, sans jamais changer. Il vient de
   * `get_top_products_aggregated`, une RPC qui n a AUCUNE notion de portee —
   * alors que les KPI juste au-dessus, eux, reagissaient correctement.
   * ⚠️ Un selecteur qui ne filtre QU UNE PARTIE de l ecran est pire qu absent :
   * l utilisateur croit lire des chiffres coherents entre eux.
   *
   * ⭐ Meme approche que l onglet Analytique : on filtre sur les NOMS de
   * plats, `useDishes` etant deja en cache (aucune requete supplementaire, et
   * `enabled: hasRestaurant` la desactive sur un bar pur — §3).
   *
   * ⚠️ Filtrage par NOM et non par id : la RPC laisse `product_id` a NULL
   * pour un plat et n expose pas `dish_id`. Le nom est le seul lien — il est
   * fige a la vente, donc stable. Limite connue : un produit et un plat
   * homonymes seraient confondus (le plat l emporterait).
   */
  const { data: dishes = [] } = useDishes(currentBar?.id);

  const dishNameSet = useMemo(
    () => new Set(dishes.map((d) => d.name)),
    [dishes]
  );

  const scopedTopProducts = useMemo(() => {
    if (scope === 'all') return analytics.topProductsList;
    return analytics.topProductsList.filter((p) => {
      /**
       * ⚠️ Le libelle porte le VOLUME entre parentheses (« Racines (33) »),
       * ajoute par le hook. On compare donc sur la partie AVANT la
       * parenthese — sinon aucun nom ne correspondrait jamais.
       */
      const bareName = p.name.replace(/\s*\([^)]*\)\s*$/, '');
      const isDish = dishNameSet.has(bareName);
      return scope === 'kitchen' ? isDish : !isDish;
    });
  }, [analytics.topProductsList, scope, dishNameSet]);

  /**
   * ⚠️ NOMBRE DE VENTES par portee — defaut signale le 05/08/2026 : la carte
   * affichait « 2 ventes » en RESTAU alors qu une seule contenait un plat.
   *
   * ⛔ La RPC `get_daily_scope_totals` ne ventile PAS ce compteur (seulement
   * CA et articles). On le derive donc des ventes chargees, en comptant
   * celles qui portent AU MOINS un article de la portee.
   *
   * ⚠️ On ne reutilise PAS `scopedItems` ici : la carte « Articles » l affiche
   * deja, et deux cartes montrant le meme nombre sous deux libelles
   * differents feraient douter des deux.
   *
   * ⚠️ Le Dashboard charge les ventes avec `includeItems: false` (§3) —
   * `items` peut donc etre VIDE. On retombe alors sur le compte global
   * plutot que d afficher zero : un chiffre approximatif vaut mieux qu un
   * chiffre faux.
   */
  const scopedSalesCount = useMemo(() => {
    if (scope === 'all') return analytics.sales.length;
    const withItems = analytics.sales.filter((s) => (s.items?.length ?? 0) > 0);
    if (withItems.length === 0) return analytics.sales.length;
    return withItems.filter((s) =>
      s.items.some((i) => itemMatchesScope(i, scope))
    ).length;
  }, [analytics.sales, scope]);

  /**
   * Chiffres affichés selon la portée.
   *
   * ⚠️ En portée « Tout », on garde `analytics.todayTotal` plutôt que le total
   * du RPC : c'est le chiffre HISTORIQUE du Dashboard, déjà net des retours.
   * Le remplacer ferait bouger un montant que les promoteurs connaissent, sans
   * qu'ils l'aient demandé.
   *
   * ⚠️ En portée Bar/Restau, les montants du RPC sont BRUTS — les retours ne
   * sont pas ventilables (un remboursement porte sur une vente entière, pas
   * sur un item). On les affiche donc tels quels : approximer une part de
   * remboursement serait une fausse précision.
   */
  const scopedTotal = scope === 'all'
    ? analytics.todayTotal
    : scope === 'kitchen'
      ? (scopeTotals?.revenue_kitchen ?? 0)
      : (scopeTotals?.revenue_bar ?? 0);

  const scopedItems = scope === 'all'
    ? analytics.totalItems
    : scope === 'kitchen'
      ? (scopeTotals?.items_kitchen ?? 0)
      : (scopeTotals?.items_bar ?? 0);
  const { validateSale: validateMutation, rejectSale: rejectMutation } = useSalesMutations(currentBar?.id || '');

  // Actions
  const handleValidateSale = (id: string) => currentSession && validateMutation.mutate({ id, validatorId: currentSession.userId });
  const handleRejectSale = (id: string) => currentSession && rejectMutation.mutate({ id, rejectorId: currentSession.userId });
  const handleValidateAll = (list: Sale[]) => {
    if (currentSession && list.length && confirm(`Valider ${list.length} ventes ?`)) {
      list.forEach(s => validateMutation.mutate({ id: s.id, validatorId: currentSession.userId }));
    }
  };

  const handleRefresh = async () => {
    if (!currentBar) return;
    setLoading('refresh', true);
    try {
      // 1. Rafraîchir la vue matérialisée en DB (daily_sales_summary, etc.)
      await AnalyticsService.refreshAllViews('manual');
      // 2. Invalider le cache React Query pour forcer un re-fetch de la vue
      if (currentBar?.id) {
        await queryClient.invalidateQueries({ predicate: analyticsKeys.barPredicate(currentBar.id) });
      }
      showSuccess('Données actualisées');
    } catch {
      showError('Erreur lors de l\'actualisation');
    } finally {
      setLoading('refresh', false);
    }
  };

  const exportToWhatsApp = () => {
    const barName = currentBar?.name || 'Mon Bar';
    const reportDate = analytics.todayDateStr ? new Date(analytics.todayDateStr) : new Date();

    let body = `*RÉSUMÉ FINANCIER*\n`;
    body += `- Total (Net) : *${formatPrice(analytics.todayTotal)}*\n`;
    body += `- Commandes : ${analytics.sales.length}\n`;
    body += `- Articles vendus : ${analytics.totalItems}\n\n`;

    body += `*OPÉRATIONS*\n`;
    body += `- Retours traités : ${analytics.returns.length}\n`;
    body += `- Consignations actives : ${analytics.consignments.length}\n`;

    if (analytics.topProductsList.length) {
      body += `\n*TOP PRODUITS*\n`;
      analytics.topProductsList.slice(0, 3).forEach((p, i) => {
        body += `${i + 1}. ${p.name} : *${p.qty}*\n`;
      });
    }

    const msg = buildWhatsAppMessage({
      barName,
      title: 'Rapport journalier',
      date: reportDate,
      body,
    });

    const asciiMsg = replaceAccents(msg);
    window.open(`https://wa.me/?text=${encodeURIComponent(asciiMsg)}`, '_blank');
    showSuccess('📱 Rapport exporté');
  };

  if (!currentBar) return <div className="text-center py-20 text-gray-500">Sélectionnez un bar</div>;

  return (
    <>
      {/* ⭐ Portée — AVANT les onglets : elle vaut pour toute la page, pas
          pour un onglet. La placer dans « Synthèse » laisserait croire que
          « Commandes » n'est pas concerné.
          §3 — ne rend RIEN sur un bar pur. */}
      {hasRestaurant && (
        <div className="px-4 sm:px-6 pt-3">
          <ScopeSwitcher
            scope={scope}
            onScopeChange={setScope}
            hasRestaurant={hasRestaurant}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
      {/* ONGLET SYNTHÈSE */}
      {activeView === 'summary' && (
        <motion.div
          key="summary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <DashboardSummary
            currentBar={currentBar}
            todayTotal={scopedTotal}
            salesCount={scopedSalesCount}
            pendingSalesCount={analytics.pendingSales.length}
            totalItems={scopedItems}
            returnsCount={analytics.validatedReturnsCount}
            pendingReturnsCount={analytics.pendingReturnsCount}
            consignmentsCount={analytics.consignments.length}
            lowStockProducts={analytics.lowStockProducts}
            topProductsList={scopedTopProducts}
            scope={scope}
            barId={currentBar?.id}
            businessDate={analytics.todayDateStr}
            allProductsStockInfo={analytics.allProductsStockInfo}
            isServerRole={analytics.isServerRole}
            formatPrice={formatPrice}
            onRefresh={handleRefresh}
            onExportWhatsApp={exportToWhatsApp}
          />
        </motion.div>
      )}

      {/* ONGLET COMMANDES */}
      {activeView === 'orders' && (
        <motion.div
          key="orders"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <DashboardOrders
            sales={analytics.pendingSales}
            users={users}
            onValidate={handleValidateSale}
            onReject={handleRejectSale}
            onValidateAll={handleValidateAll}
            isServerRole={analytics.isServerRole}
            currentUserId={currentSession?.userId || ''}
            formatPrice={formatPrice}
            processingId={validateMutation.isPending ? validateMutation.variables?.id : (rejectMutation.isPending ? rejectMutation.variables?.id : null)}
          />
        </motion.div>
      )}

      {/* ONGLET PERFORMANCE */}
      {activeView === 'performance' && (
        <motion.div
          key="performance"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <DashboardPerformance
            teamPerformanceData={analytics.teamPerformanceData}
            totalRevenue={analytics.todayTotal}
            isServerRole={analytics.isServerRole}
          />
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

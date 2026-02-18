import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { Sale } from '../types';
import { AnalyticsService } from '../services/supabase/analytics.service';
import { replaceAccents } from '../utils/stringFormatting';

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
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, showError, setLoading, isLoading } = useFeedback();
  const queryClient = useQueryClient();

  const [cashClosed, setCashClosed] = useState(false);

  // Architecture: Data fetching & Business Logic centralized in Hook
  const analytics = useDashboardAnalytics(currentBar?.id);
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
    setLoading(true);
    try {
      // 1. Rafraîchir la vue matérialisée en DB (daily_sales_summary, etc.)
      await AnalyticsService.refreshAllViews('manual');
      // 2. Invalider le cache React Query pour forcer un re-fetch de la vue
      await queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      showSuccess('Données actualisées');
    } catch {
      showError('Erreur lors de l\'actualisation');
    } finally {
      setLoading(false);
    }
  };

  const exportToWhatsApp = () => {
    const barName = currentBar?.name || 'Mon Bar';
    const dateStr = analytics.todayDateStr
      ? new Date(analytics.todayDateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let msg = `*RAPPORT JOURNALIER - ${barName.toUpperCase()}*\n`;
    msg += `_${dateStr}_\n\n`;

    msg += `---------------------------\n`;
    msg += `*RESUME FINANCIER*\n`;
    msg += `- Total (Net) : *${formatPrice(analytics.todayTotal)}*\n`;
    msg += `- Commandes : ${analytics.sales.length}\n`;
    msg += `- Articles vendus : ${analytics.totalItems}\n\n`;

    msg += `*OPERATIONS*\n`;
    msg += `- Retours traites : ${analytics.returns.length}\n`;
    msg += `- Consignations actives : ${analytics.consignments.length}\n`;

    if (analytics.topProductsList.length) {
      msg += `\n*TOP PRODUITS*\n`;
      analytics.topProductsList.slice(0, 3).forEach((p, i) => {
        msg += `${i + 1}. ${p.name} : *${p.qty}*\n`;
      });
    }

    msg += `---------------------------\n`;
    msg += `_Genere via BarTender_`;

    const asciiMsg = replaceAccents(msg);
    window.open(`https://wa.me/?text=${encodeURIComponent(asciiMsg)}`, '_blank');
    showSuccess('📱 Rapport exporté');
  };

  const closeCash = async () => {
    if (!confirm('Fermer la caisse ?')) return;
    setLoading('closeCash', true);
    await new Promise(r => setTimeout(r, 1000));
    setCashClosed(true);
    showSuccess('✅ Caisse fermée');
    setLoading('closeCash', false);
    exportToWhatsApp();
  };

  if (!currentBar) return <div className="text-center py-20 text-gray-500">Sélectionnez un bar</div>;

  return (
    <AnimatePresence mode="wait">
      {/* ONGLET SYNTHÈSE */}
      {activeView === 'summary' && (
        <motion.div
          key="summary"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <DashboardSummary
            currentBar={currentBar}
            todayTotal={analytics.todayTotal}
            salesCount={analytics.sales.length}
            pendingSalesCount={analytics.pendingSales.length}
            totalItems={analytics.totalItems}
            returnsCount={analytics.validatedReturnsCount}
            pendingReturnsCount={analytics.pendingReturnsCount}
            consignmentsCount={analytics.consignments.length}
            lowStockProducts={analytics.lowStockProducts}
            topProductsList={analytics.topProductsList}
            allProductsStockInfo={analytics.allProductsStockInfo}
            isServerRole={analytics.isServerRole}
            formatPrice={formatPrice}
            onRefresh={handleRefresh}
            onExportWhatsApp={exportToWhatsApp}
            onCloseCash={closeCash}
            cashClosed={cashClosed}
            isClosingCash={isLoading('closeCash')}
          />
        </motion.div>
      )}

      {/* ONGLET COMMANDES */}
      {activeView === 'orders' && (
        <motion.div
          key="orders"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <DashboardPerformance
            teamPerformanceData={analytics.teamPerformanceData}
            totalRevenue={analytics.todayTotal}
            isServerRole={analytics.isServerRole}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

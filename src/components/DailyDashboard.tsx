import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const { validateSale, rejectSale, users } = useAppContext();
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const { showSuccess, setLoading, isLoading } = useFeedback();

  const [cashClosed, setCashClosed] = useState(false);

  // Architecture: Data fetching & Business Logic centralized in Hook
  const analytics = useDashboardAnalytics(currentBar?.id);

  // Actions
  const handleValidateSale = (id: string) => currentSession && validateSale(id, currentSession.userId);
  const handleRejectSale = (id: string) => currentSession && rejectSale(id, currentSession.userId);
  const handleValidateAll = (list: Sale[]) => {
    if (currentSession && list.length && confirm(`Valider ${list.length} ventes ?`)) {
      list.forEach(s => validateSale(s.id, currentSession.userId));
    }
  };

  const handleRefresh = async () => {
    // The hook handles data freshness via React Query invalidation mostly, 
    // but here we force a DB fetch for the stats
    if (currentBar && analytics.todayDateStr) {
      // The hook uses React Query with 'dailySummary' key. 
      // Ideally we invalidate queries but here we just re-fetch the stats part manually for the indicator
      // Or simply let React Query handle it.
      // For the FreshnessIndicator, we pass a callback.
      await AnalyticsService.getDailySummary(currentBar.id, analytics.todayDateStr, analytics.todayDateStr, 'day');
      showSuccess('✅ Données actualisées avec succès');
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

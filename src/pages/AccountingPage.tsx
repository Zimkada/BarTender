import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Receipt, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

// Lazy load heavy accounting components to reduce initial bundle size
const AccountingOverview = lazy(() => import('../components/AccountingOverview').then(m => ({ default: m.AccountingOverview })));
const RevenueManager = lazy(() => import('../components/RevenueManager').then(m => ({ default: m.RevenueManager })));
const ExpenseManager = lazy(() => import('../components/ExpenseManager').then(m => ({ default: m.ExpenseManager })));

import { useBarContext } from '../context/BarContext';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { useDateRangeFilter } from '../hooks/useDateRangeFilter';
import { DataFreshnessIndicatorCompact } from '../components/DataFreshnessIndicator';
import { AnalyticsService } from '../services/supabase/analytics.service';
import { analyticsKeys } from '../hooks/queries/useAnalyticsQueries';
import type { AccountingPeriodProps } from '../types/dateFilters';

type TabType = 'overview' | 'revenues' | 'expenses';

/**
 * AccountingPage - Page de comptabilité
 * Route: /accounting
 * Refactoré de modale vers page
 */
export default function AccountingPage() {
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    const handleRefreshAnalytics = async () => {
        // salaries_summary est une vue normale (pas matérialisée) — pas de refresh dédié.
        // L'indicateur de fraîcheur est basé sur daily_sales_summary (vue la plus critique).
        // expenses_summary est la seule vue matérialisée à rafraîchir explicitement.
        const results = await Promise.allSettled([
            AnalyticsService.refreshView('expenses_summary', 'manual'),
        ]);
        const failed = results.filter(r => r.status === 'rejected');
        await queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
        if (failed.length > 0) {
            throw new Error('Certaines vues n\'ont pas pu être actualisées');
        }
    };

    // SOURCE DE VÉRITÉ UNIQUE — une seule période pour les 3 onglets
    const {
        timeRange, setTimeRange,
        startDate, endDate,
        periodLabel, customRange, updateCustomRange,
    } = useDateRangeFilter({ defaultRange: 'this_month' });

    const periodProps: AccountingPeriodProps = {
        timeRange, setTimeRange, startDate, endDate,
        periodLabel, customRange, updateCustomRange,
    };

    if (!currentBar || !currentSession) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <p className="text-gray-500">Sélectionnez un bar pour accéder à la comptabilité</p>
            </div>
        );
    }


    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <TabbedPageHeader
                title="Comptabilité"
                subtitle="Suivez vos revenus, dépenses et gérez les salaires de l'équipe."
                icon={<DollarSign size={24} />}
                guideId="accounting-guide"
                tabs={[
                    { id: 'overview', label: 'Vue globale', icon: BarChart3 },
                    { id: 'revenues', label: 'Revenus', icon: DollarSign },
                    { id: 'expenses', label: 'Dépenses', icon: Receipt },
                ]}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as TabType)}
                hideSubtitleOnMobile={true}
                actions={
                    <DataFreshnessIndicatorCompact
                        viewName="daily_sales_summary"
                        onRefreshComplete={handleRefreshAnalytics}
                    />
                }
            />

            {/* Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                >
                    <Suspense fallback={
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                            <span className="ml-3 text-gray-600">Chargement...</span>
                        </div>
                    }>
                        {activeTab === 'overview' && <AccountingOverview period={periodProps} />}
                        {activeTab === 'revenues' && <RevenueManager period={periodProps} />}
                        {activeTab === 'expenses' && <ExpenseManager period={periodProps} />}
                    </Suspense>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

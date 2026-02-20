import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Receipt, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Lazy load heavy accounting components to reduce initial bundle size
const AccountingOverview = lazy(() => import('../components/AccountingOverview').then(m => ({ default: m.AccountingOverview })));
const RevenueManager = lazy(() => import('../components/RevenueManager').then(m => ({ default: m.RevenueManager })));
const ExpenseManager = lazy(() => import('../components/ExpenseManager').then(m => ({ default: m.ExpenseManager })));

import { useBarContext } from '../context/BarContext';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';

type TabType = 'overview' | 'revenues' | 'expenses';

/**
 * AccountingPage - Page de comptabilité
 * Route: /accounting
 * Refactoré de modale vers page
 */
export default function AccountingPage() {
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const [activeTab, setActiveTab] = useState<TabType>('overview');

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
                tabs={[
                    { id: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
                    { id: 'revenues', label: 'Revenus', icon: DollarSign },
                    { id: 'expenses', label: 'Dépenses', icon: Receipt },
                ]}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as TabType)}
                hideSubtitleOnMobile={true}
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
                        {activeTab === 'overview' && <AccountingOverview />}
                        {activeTab === 'revenues' && <RevenueManager />}
                        {activeTab === 'expenses' && <ExpenseManager />}
                    </Suspense>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

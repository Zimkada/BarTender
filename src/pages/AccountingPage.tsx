import React, { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Receipt, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Lazy load heavy accounting components to reduce initial bundle size
const AccountingOverview = lazy(() => import('../components/AccountingOverview').then(m => ({ default: m.AccountingOverview })));
const ExpenseManager = lazy(() => import('../components/ExpenseManager').then(m => ({ default: m.ExpenseManager })));
const SalaryManager = lazy(() => import('../components/SalaryManager').then(m => ({ default: m.SalaryManager })));
import { useBarContext } from '../context/BarContext';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';

type TabType = 'overview' | 'expenses' | 'salaries';

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

    const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
        { id: 'overview', label: 'Vue d\'ensemble', icon: <BarChart3 size={18} /> },
        { id: 'expenses', label: 'Dépenses', icon: <Receipt size={18} /> },
        { id: 'salaries', label: 'Salaires', icon: <DollarSign size={18} /> },
    ];

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <TabbedPageHeader
                title="Comptabilité"
                subtitle="Suivez vos revenus, dépenses et gérez les salaires de l'équipe."
                icon={<DollarSign size={24} />}
                tabs={[
                    { id: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
                    { id: 'expenses', label: 'Dépenses', icon: Receipt },
                    { id: 'salaries', label: 'Salaires', icon: DollarSign },
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
                        {activeTab === 'expenses' && <ExpenseManager />}
                        {activeTab === 'salaries' && <SalaryManager />}
                    </Suspense>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

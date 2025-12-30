import React, { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Receipt, DollarSign, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Lazy load heavy accounting components to reduce initial bundle size
const AccountingOverview = lazy(() => import('../components/AccountingOverview').then(m => ({ default: m.AccountingOverview })));
const ExpenseManager = lazy(() => import('../components/ExpenseManager').then(m => ({ default: m.ExpenseManager })));
const SalaryManager = lazy(() => import('../components/SalaryManager').then(m => ({ default: m.SalaryManager })));
import { useBarContext } from '../context/BarContext';
import { useViewport } from '../hooks/useViewport';
import { Button } from '../components/ui/Button';

type TabType = 'overview' | 'expenses' | 'salaries';

/**
 * AccountingPage - Page de comptabilité
 * Route: /accounting
 * Refactoré de modale vers page
 */
export default function AccountingPage() {
    const navigate = useNavigate();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();
    const { isMobile } = useViewport();
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
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 mb-6 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(-1)}
                            className="rounded-lg transition-colors hover:bg-white/20"
                        >
                            <ArrowLeft size={24} />
                        </Button>
                        <div className="flex items-center gap-3">
                            <DollarSign size={isMobile ? 28 : 32} />
                            <div>
                                <h1 className={`font-bold ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                                    Comptabilité
                                </h1>
                                <p className={`text-amber-100 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                    Gestion financière de {currentBar.name}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 py-3 border-b border-gray-200">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                        {tabs.map(tab => (
                            <Button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                variant={activeTab === tab.id ? 'default' : 'secondary'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${isMobile ? 'text-sm' : ''
                                    } ${activeTab === tab.id
                                        ? 'font-semibold'
                                        : 'font-medium'
                                    }`}
                            >
                                {!isMobile && tab.icon}
                                <span>{tab.label}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

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

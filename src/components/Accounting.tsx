import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Receipt, DollarSign, ArrowLeft } from 'lucide-react';
import { AccountingOverview } from './AccountingOverview';
import { ExpenseManager } from './ExpenseManager';
import { SalaryManager } from './SalaryManager';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useViewport } from '../hooks/useViewport';

type TabType = 'overview' | 'expenses' | 'salaries';

/**
 * Accounting - Page de comptabilité
 * Route: /accounting
 * Refactoré de modale vers page
 */
export default function Accounting() {
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
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
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
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                  isMobile ? 'text-sm' : ''
                } ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-white font-semibold'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium'
                }`}
              >
                {!isMobile && tab.icon}
                <span>{tab.label}</span>
              </button>
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
          {activeTab === 'overview' && <AccountingOverview />}
          {activeTab === 'expenses' && <ExpenseManager />}
          {activeTab === 'salaries' && <SalaryManager />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

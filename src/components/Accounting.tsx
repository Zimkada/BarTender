import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Receipt, DollarSign, X } from 'lucide-react';
import { AccountingOverview } from './AccountingOverview';
import { ExpenseManager } from './ExpenseManager';
import { SalaryManager } from './SalaryManager';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useViewport } from '../hooks/useViewport';

type TabType = 'overview' | 'expenses' | 'salaries';

interface AccountingProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Accounting({ isOpen, onClose }: AccountingProps) {
  const { currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { isMobile } = useViewport();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!currentBar || !currentSession) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: <BarChart3 size={18} /> },
    { id: 'expenses', label: 'Dépenses', icon: <Receipt size={18} /> },
    { id: 'salaries', label: 'Salaires', icon: <DollarSign size={18} /> },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header avec tabs */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white flex-shrink-0">
                <div className={`${isMobile ? 'px-3 py-3' : 'px-6 py-4'}`}>
                  <div className="flex items-center justify-between mb-4">
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
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  {/* Tabs navigation */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                          isMobile ? 'text-sm' : ''
                        } ${
                          activeTab === tab.id
                            ? 'bg-white text-amber-600 font-semibold'
                            : 'bg-white/20 text-white hover:bg-white/30 font-medium'
                        }`}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto bg-gradient-to-br from-amber-50 to-amber-50">
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
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

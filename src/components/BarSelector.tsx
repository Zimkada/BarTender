import React from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBarContext } from '../context/BarContext';
import { useAuth } from "../context/AuthContext";

interface BarSelectorProps {
  onCreateNew?: () => void;
}

export function BarSelector({ onCreateNew }: BarSelectorProps) {
  const { currentSession, hasPermission } = useAuth();
  const { currentBar, userBars, switchBar } = useBarContext();
  const [isOpen, setIsOpen] = React.useState(false);

  if (!currentSession || userBars.length <= 1) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
      >
        <Building2 size={20} className="text-white" />
        <span className="text-white font-medium">{currentBar?.name || 'Sélectionner un bar'}</span>
        <ChevronDown 
          size={16} 
          className={`text-white transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl py-2 min-w-[250px] z-50"
            >
              {userBars.map(bar => (
                <button
                  key={bar.id}
                  onClick={() => {
                    switchBar(bar.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                    currentBar?.id === bar.id ? 'bg-amber-50' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    currentBar?.id === bar.id ? 'bg-amber-500' : 'bg-gray-300'
                  }`} />
                  <div>
                    <p className="font-medium text-gray-800">{bar.name}</p>
                    {bar.address && (
                      <p className="text-sm text-gray-500">{bar.address}</p>
                    )}
                  </div>
                </button>
              ))}
              
              {hasPermission('canCreateBars') && onCreateNew && (
                <>
                  <div className="border-t my-2" />
                  <button
                    onClick={() => {
                      onCreateNew();
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 text-amber-600"
                  >
                    <Plus size={20} />
                    <span className="font-medium">Créer un nouveau bar</span>
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

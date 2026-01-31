import React from 'react';
import { ChevronDown, Plus, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBarContext } from '../context/BarContext';
import { useAuth } from "../context/AuthContext";
import AnimatedBarName from './AnimatedBarName';

interface BarSelectorProps {
  onCreateNew?: () => void;
  variant?: 'default' | 'transparent';
}

export function BarSelector({ onCreateNew, variant = 'default' }: BarSelectorProps) {
  const { currentSession, hasPermission } = useAuth();
  const { currentBar, userBars, switchBar } = useBarContext();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Fermer au clic outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Masquer si 1 seul bar
  // Utiliser allBarIds (depuis auth session) comme source de vérité pour le multi-bar
  // Fallback: utiliser userBars si allBarIds n'est pas disponible (transition period)
  const hasMultipleBars = currentSession && (
    (currentSession.allbarIds?.length && currentSession.allbarIds.length > 1) ||
    userBars.length > 1
  );

  if (!hasMultipleBars) {
    return null;
  }

  const handleSwitch = async (barId: string) => {
    await switchBar(barId);
    setIsOpen(false);
  };

  const buttonClasses = variant === 'default'
    ? "flex items-center gap-2.5 px-3 py-2 glass-button-2026 rounded-xl transition-all active:scale-95 group"
    : "flex items-center gap-2 px-1 py-1 rounded-xl transition-all active:scale-95 group hover:bg-white/10";

  return (
    <div ref={dropdownRef} className="relative z-[110] h-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
        aria-label="Sélectionner un bar"
        aria-expanded={isOpen}
      >
        <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
          <img
            src="/icons/icon-48x48.png"
            alt="Bar"
            className="w-4 h-4 rounded-sm"
          />
        </div>
        <div className="flex flex-col items-start leading-none justify-center h-full">
          <AnimatedBarName text={currentBar?.name || 'Sélectionner'} className="text-lg font-black text-white uppercase tracking-tight truncate" />
        </div>
        <ChevronDown
          size={16}
          className={`text-white/80 transition-transform duration-300 ml-1 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute top-full mt-3 left-0 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl py-2 min-w-[280px] border border-brand-primary/20 overflow-hidden z-[120]"
          >
            <div className="px-4 py-2 border-b border-gray-100/50 mb-1">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Passer à un autre bar</p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
              {userBars.map((bar) => (
                <button
                  key={bar.id}
                  onClick={() => handleSwitch(bar.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-brand-primary/5 transition-all flex items-center gap-3 relative group ${currentBar?.id === bar.id ? 'bg-brand-primary/10' : ''}`}
                >
                  <div className={`w-1.5 h-6 rounded-full transition-all ${currentBar?.id === bar.id ? 'bg-brand-primary scale-y-100' : 'bg-transparent scale-y-0'}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-black text-sm uppercase tracking-tight truncate ${currentBar?.id === bar.id ? 'text-brand-primary' : 'text-gray-900'}`}>
                        {bar.name}
                      </p>
                      {bar.isSetupComplete && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                    {bar.address && (
                      <p className="text-[10px] text-gray-500 truncate font-medium mt-0.5">{bar.address}</p>
                    )}
                  </div>

                  {currentBar?.id === bar.id && (
                    <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                  )}
                </button>
              ))}
            </div>

            {hasPermission('canCreateBars') && onCreateNew && (
              <>
                <div className="border-t border-gray-100/50 my-1" />
                <button
                  onClick={() => {
                    onCreateNew();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors flex items-center gap-3 text-emerald-600 group"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus size={18} />
                  </div>
                  <span className="font-black text-xs uppercase tracking-wider">Créer un nouveau bar</span>
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


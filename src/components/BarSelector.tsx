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
    (currentSession.allBarIds?.length && currentSession.allBarIds.length > 1) ||
    userBars.length > 1
  );

  if (!hasMultipleBars) {
    return null;
  }

  const handleSwitch = (barId: string) => {
    switchBar(barId);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
        aria-label="Sélectionner un bar"
        aria-expanded={isOpen}
      >
        <Building2 size={20} className="text-white" />
        <span className="text-white font-medium hidden sm:inline">
          {currentBar?.name || 'Sélectionner un bar'}
        </span>
        <ChevronDown
          size={16}
          className={`text-white transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl py-2 min-w-[250px] max-w-[350px] z-50"
          >
            {userBars.map((bar, index) => (
              <button
                key={bar.id}
                onClick={() => handleSwitch(bar.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 ${currentBar?.id === bar.id ? 'bg-amber-50 hover:bg-amber-100' : ''
                  } ${index !== 0 ? 'border-t border-gray-100' : ''}`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${currentBar?.id === bar.id ? 'bg-amber-500' : 'bg-gray-300'
                  }`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${currentBar?.id === bar.id ? 'text-amber-600' : 'text-gray-800'
                    }`}>
                    {bar.name}
                  </p>
                  {bar.address && (
                    <p className="text-sm text-gray-500 truncate">{bar.address}</p>
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
        )}
      </AnimatePresence>
    </div>
  );
}


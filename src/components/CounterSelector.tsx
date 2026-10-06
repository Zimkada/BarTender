import React from 'react';
import { ChevronDown, CheckCircle2, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCounterContext } from '../context/CounterContext';

interface CounterSelectorProps {
  variant?: 'default' | 'transparent';
}

/**
 * Sélecteur de comptoir actif.
 *
 * ⭐ Chantier comptoirs multiples (04/10/2026). Décision d'ergonomie : un
 * sélecteur PERMANENT dans le header, à côté du nom du bar. Un appui change de
 * comptoir — une serveuse en plein service ne doit pas naviguer dans un menu.
 *
 * ⛔ Ne rend RIEN si le bar n'a qu'un comptoir. C'est la garantie de
 * non-régression : les 13 bars existants sont tous mono-comptoir et leur
 * interface doit rester identique au pixel.
 */
export function CounterSelector({ variant = 'default' }: CounterSelectorProps) {
  const { counters, currentCounter, hasMultipleCounters, switchCounter } =
    useCounterContext();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // ⛔ Mono-comptoir : invisible. Ne pas afficher un sélecteur à un seul choix.
  if (!hasMultipleCounters || !currentCounter) return null;

  const handleSwitch = (counterId: string) => {
    switchCounter(counterId);
    setIsOpen(false);
  };

  const buttonClasses =
    variant === 'default'
      ? 'flex items-center gap-2 px-3 py-2 glass-button-2026 rounded-xl transition-all active:scale-95'
      : 'flex items-center gap-1.5 px-2 py-1 rounded-xl transition-all active:scale-95 hover:bg-card/10';

  return (
    <div ref={dropdownRef} className="relative z-[110]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
        aria-label="Sélectionner un comptoir"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Store className="w-4 h-4 text-white/80 flex-shrink-0" aria-hidden="true" />
        <span className="text-body-sm font-semibold text-white truncate max-w-[9rem]">
          {currentCounter.name}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-white/70 flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label="Comptoirs disponibles"
            className="absolute top-full left-0 mt-2 min-w-[14rem] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          >
            {counters.map((counter) => {
              const isCurrent = counter.id === currentCounter.id;
              return (
                <button
                  key={counter.id}
                  onClick={() => handleSwitch(counter.id)}
                  role="option"
                  aria-selected={isCurrent}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className={`text-body-sm truncate ${
                      isCurrent ? 'font-semibold text-brand-primary' : 'text-foreground'
                    }`}
                  >
                    {counter.name}
                  </span>
                  {isCurrent && (
                    <CheckCircle2
                      className="w-4 h-4 text-brand-primary flex-shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

CounterSelector.displayName = 'CounterSelector';

export default CounterSelector;

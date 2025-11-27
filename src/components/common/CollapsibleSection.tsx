import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CollapsibleSectionProps {
    /** Titre de la section */
    title: string;
    /** Icône à afficher à gauche du titre (optionnel) */
    icon?: React.ReactNode;
    /** Badge à afficher à droite du titre (optionnel) */
    badge?: string | number;
    /** Contenu de la section */
    children: React.ReactNode;
    /** État initial (ouvert/fermé) */
    defaultOpen?: boolean;
    /** Classes CSS additionnelles pour le container */
    className?: string;
}

/**
 * Section collapsible réutilisable avec animation
 * 
 * Features :
 * - Animation fluide d'ouverture/fermeture
 * - Support icône et badge
 * - État initial configurable
 * - Styles personnalisables
 * 
 * @example
 * ```tsx
 * <CollapsibleSection
 *   title="Statistiques"
 *   icon={<BarChart size={18} />}
 *   badge="3 alertes"
 *   defaultOpen={false}
 * >
 *   <div>Contenu de la section</div>
 * </CollapsibleSection>
 * ```
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    icon,
    badge,
    children,
    defaultOpen = false,
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`bg-white rounded-xl border border-amber-200 overflow-hidden ${className}`}>
            {/* Header cliquable */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-4 flex items-center justify-between hover:bg-amber-50 transition-colors text-left"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Masquer' : 'Afficher'} ${title}`}
            >
                <div className="flex items-center gap-2">
                    {/* Icône (optionnel) */}
                    {icon && <div className="flex-shrink-0">{icon}</div>}

                    {/* Titre */}
                    <span className="font-semibold text-gray-800">{title}</span>

                    {/* Badge (optionnel) */}
                    {badge !== undefined && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                            {badge}
                        </span>
                    )}
                </div>

                {/* Icône chevron animée */}
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="text-amber-500 flex-shrink-0"
                >
                    ▼
                </motion.div>
            </button>

            {/* Contenu avec animation */}
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0 border-t border-amber-100">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

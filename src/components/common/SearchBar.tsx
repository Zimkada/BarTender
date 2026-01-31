import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
    /** Valeur actuelle de la recherche */
    value: string;
    /** Callback appelé lors du changement de valeur */
    onChange: (value: string) => void;
    /** Texte du placeholder (optionnel) */
    placeholder?: string;
    /** Classes CSS additionnelles (optionnel) */
    className?: string;
}

/**
 * Barre de recherche réutilisable avec icône et bouton clear
 * 
 * Features :
 * - Icône de recherche à gauche
 * - Bouton X pour effacer (apparaît si valeur non vide)
 * - Placeholder personnalisable
 * - Styles cohérents avec le thème de l'app
 * 
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * 
 * <SearchBar 
 *   value={search}
 *   onChange={setSearch}
 *   placeholder="Rechercher un produit..."
 * />
 * ```
 */
export const SearchBar: React.FC<SearchBarProps> = ({
    value,
    onChange,
    placeholder = "Rechercher...",
    className = ""
}) => {
    return (
        <div className={`relative ${className}`}>
            {/* Icône de recherche */}
            <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                size={18}
            />

            {/* Input de recherche */}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-brand-primary/20 bg-white focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary transition-all outline-none text-gray-800 placeholder-gray-400 font-medium"
            />

            {/* Bouton clear (visible seulement si valeur non vide) */}
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Effacer la recherche"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
};

import { useMemo } from 'react';
import { Product } from '../types';

interface UseFilteredProductsProps {
    products: Product[];
    searchQuery: string;
    selectedCategory: string;
    onlyInStock?: boolean;
}

/**
 * Hook pour filtrer les produits (Recherche, Catégorie, Stock)
 * Centralise la logique utilisée dans HomePage et QuickSaleFlow
 */
export function useFilteredProducts({
    products,
    searchQuery,
    selectedCategory,
    onlyInStock = true
}: UseFilteredProductsProps) {
    return useMemo(() => {
        let filtered = products;

        // 1. Filtrer par catégorie
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(p => p.categoryId === selectedCategory);
        }

        // 2. Filtrer par recherche (Nom ou Volume)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.volume && p.volume.toLowerCase().includes(query))
            );
        }

        // 3. Filtrer par stock (Optionnel, activé par défaut)
        if (onlyInStock) {
            filtered = filtered.filter(p => p.stock > 0);
        }

        return filtered;
    }, [products, selectedCategory, searchQuery, onlyInStock]);
}

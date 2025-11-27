import { Product, Category } from '../types';

/**
 * Modes de tri disponibles pour les produits
 */
export type SortMode = 'category' | 'alphabetical' | 'stock';

/**
 * Trie les produits selon le mode sélectionné
 * 
 * Modes disponibles :
 * - 'category' : Tri par catégorie (alphabétique), puis par nom dans chaque catégorie
 * - 'alphabetical' : Tri alphabétique global par nom de produit
 * - 'stock' : Tri par niveau de stock (alertes en premier, puis stock croissant)
 * 
 * @param products - Liste des produits à trier
 * @param mode - Mode de tri à appliquer
 * @param categories - Liste des catégories (nécessaire pour le tri par catégorie)
 * @returns Nouvelle liste triée (immutabilité préservée)
 * 
 * @example
 * ```typescript
 * // Tri par catégorie
 * const sorted = sortProducts(products, 'category', categories);
 * 
 * // Tri alphabétique
 * const sorted = sortProducts(products, 'alphabetical', categories);
 * 
 * // Tri par stock (alertes en premier)
 * const sorted = sortProducts(products, 'stock', categories);
 * ```
 */
export const sortProducts = (
    products: Product[],
    mode: SortMode,
    categories: Category[]
): Product[] => {
    // Créer une copie pour préserver l'immutabilité
    const sorted = [...products];

    switch (mode) {
        case 'alphabetical':
            // Tri alphabétique simple par nom
            return sorted.sort((a, b) =>
                a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
            );

        case 'category':
            // Tri par catégorie, puis par nom dans chaque catégorie
            return sorted.sort((a, b) => {
                // Trouver les noms de catégories
                const catA = categories.find(c => c.id === a.categoryId)?.name || '';
                const catB = categories.find(c => c.id === b.categoryId)?.name || '';

                // Comparer les catégories
                const catCompare = catA.localeCompare(catB, 'fr', { sensitivity: 'base' });

                // Si même catégorie, trier par nom de produit
                if (catCompare === 0) {
                    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                }

                return catCompare;
            });

        case 'stock':
            // Tri par niveau de stock (alertes en premier)
            return sorted.sort((a, b) => {
                const aIsAlert = a.stock <= a.alertThreshold;
                const bIsAlert = b.stock <= b.alertThreshold;

                // Les alertes en premier
                if (aIsAlert && !bIsAlert) return -1;
                if (!aIsAlert && bIsAlert) return 1;

                // Si même statut d'alerte, trier par stock croissant
                return a.stock - b.stock;
            });

        default:
            return sorted;
    }
};

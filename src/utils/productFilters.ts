import { Product } from '../types';

/**
 * Filtre les produits selon un terme de recherche
 * 
 * Critères de recherche :
 * - Nom du produit (insensible à la casse)
 * - Volume du produit (si présent)
 * - Combinaison nom + volume (ex: "Heineken 33")
 * 
 * @param products - Liste des produits à filtrer
 * @param searchTerm - Terme de recherche saisi par l'utilisateur
 * @returns Liste filtrée des produits correspondants
 * 
 * @example
 * ```typescript
 * const results = searchProducts(products, "Heineken");
 * // Retourne tous les produits contenant "Heineken" dans le nom
 * 
 * const results = searchProducts(products, "33");
 * // Retourne tous les produits avec "33" dans le nom ou le volume
 * ```
 */
export const searchProducts = (
    products: Product[],
    searchTerm: string
): Product[] => {
    // Si pas de terme de recherche, retourner tous les produits
    if (!searchTerm.trim()) {
        return products;
    }

    const search = searchTerm.toLowerCase().trim();

    return products.filter(product => {
        const name = product.name.toLowerCase();
        const volume = product.volume?.toLowerCase() || '';
        const combined = `${name} ${volume}`.toLowerCase();

        return (
            name.includes(search) ||
            volume.includes(search) ||
            combined.includes(search)
        );
    });
};

import { useMemo } from 'react';
import { Product, Category, ProductStockInfo } from '../types';
import { sortProducts, SortMode } from '../utils/productSorting';
import { searchProducts } from '../utils/productFilters';

interface UseInventoryFilterProps {
    products: Product[];
    categories: Category[];
    searchTerm: string;
    sortMode: SortMode;
    showSuspiciousOnly?: boolean; // ✨ Nouveau filtre
    getProductStockInfo: (id: string) => ProductStockInfo | null;
}

export function useInventoryFilter({
    products,
    categories,
    searchTerm,
    sortMode,
    showSuspiciousOnly = false,
    getProductStockInfo
}: UseInventoryFilterProps) {

    const filteredProducts = useMemo(() => {
        let result = products;

        // 1. Filtre Recherche
        if (searchTerm.trim()) {
            result = searchProducts(result, searchTerm);
        }

        // 2. Filtre Suspicious (Anomalies)
        if (showSuspiciousOnly) {
            result = result.filter(p => {
                const stockInfo = getProductStockInfo(p.id);
                if (!stockInfo) return false;

                // CRITÈRE D'ANOMALIE :
                // - Stock physique négatif (Impossible)
                // - Stock disponible négatif (Vente à découvert)
                return stockInfo.physicalStock < 0 || stockInfo.availableStock < 0;
            });
        }

        return result;
    }, [products, searchTerm, showSuspiciousOnly, getProductStockInfo]);

    const sortedProducts = useMemo(
        () => sortProducts(filteredProducts, sortMode, categories),
        [filteredProducts, sortMode, categories]
    );

    const lowStockProducts = useMemo(() =>
        products.filter(p => {
            const stockInfo = getProductStockInfo(p.id);
            const stockToCompare = stockInfo ? stockInfo.availableStock : p.stock;
            return stockToCompare <= p.alertThreshold;
        }),
        [products, getProductStockInfo]
    );

    const categoryStats = useMemo(() => {
        // Stats basées sur l'ensemble des produits (ou filtrés ? standard = global)
        // Ici on garde les stats globales pour l'onglet stats
        return categories.map(cat => {
            const catProducts = products.filter(p => p.categoryId === cat.id);
            const catAlerts = catProducts.filter(p => {
                const stockInfo = getProductStockInfo(p.id);
                const stockToCompare = stockInfo ? stockInfo.availableStock : p.stock;
                return stockToCompare <= p.alertThreshold;
            });
            return {
                categoryId: cat.id,
                categoryName: cat.name,
                categoryColor: cat.color,
                totalProducts: catProducts.length,
                alertsCount: catAlerts.length
            };
        }).filter(stat => stat.totalProducts > 0);
    }, [products, categories, getProductStockInfo]);

    return {
        sortedProducts,
        lowStockProducts,
        categoryStats,
        // On retourne le compte de suspects pour info éventuelle
        suspiciousCount: products.filter(p => {
            const info = getProductStockInfo(p.id);
            return info && (info.physicalStock < 0 || info.availableStock < 0);
        }).length
    };
}

import { useMemo } from 'react';
import { Product, Category, ProductStockInfo, BarSettings } from '../types';
import { sortProducts, SortMode } from '../utils/productSorting';
import { searchProducts } from '../utils/productFilters';
import { detectProductAnomaly, findDuplicateAnomaly, ProductAnomaly } from '../utils/anomalyDetection';

interface UseInventoryFilterProps {
    products: Product[];
    categories: Category[];
    searchTerm: string;
    sortMode: SortMode;
    showAnomaliesOnly?: boolean;
    barSettings?: BarSettings;
    getProductStockInfo: (id: string) => ProductStockInfo | null;
}

export interface ProductWithAnomaly extends Product {
    anomaly: ProductAnomaly | null;
}

export function useInventoryFilter({
    products,
    categories,
    searchTerm,
    sortMode,
    showAnomaliesOnly = false,
    barSettings,
    getProductStockInfo
}: UseInventoryFilterProps) {

    // 1. Calcul enrichi avec les anomalies
    const productsWithAnomalies = useMemo(() => {
        return products.map(p => {
            const stockInfo = getProductStockInfo(p.id);

            // On cherche d'abord les anomalies de données/stock
            let anomaly = detectProductAnomaly(p, stockInfo, barSettings);

            // Si aucune anomalie critique/compta, on cherche les doublons
            if (!anomaly) {
                anomaly = findDuplicateAnomaly(p, products);
            }

            return { ...p, anomaly };
        });
    }, [products, getProductStockInfo, barSettings]);

    const filteredProducts = useMemo(() => {
        let result = productsWithAnomalies;

        // 1. Filtre Recherche
        if (searchTerm.trim()) {
            result = searchProducts(result, searchTerm) as ProductWithAnomaly[];
        }

        // 2. Filtre Anomalies
        if (showAnomaliesOnly) {
            result = result.filter(p => !!p.anomaly);
        }

        return result;
    }, [productsWithAnomalies, searchTerm, showAnomaliesOnly]);

    const sortedProducts = useMemo(
        () => sortProducts(filteredProducts, sortMode, categories) as ProductWithAnomaly[],
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
        anomalyCount: productsWithAnomalies.filter(p => !!p.anomaly).length
    };
}

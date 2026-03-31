import { useMemo } from 'react';
import { Package } from 'lucide-react';
import { Product, Category, ProductStockInfo, BarSettings } from '../../types';
import { InventoryCard } from './InventoryCard';
import { EmptyState } from '../common/EmptyState';
import { ProductWithAnomaly } from '../../hooks/useInventoryFilter';
import type { DisplayCost } from '../../utils/costResolution';

interface InventoryListProps {
    products: ProductWithAnomaly[];
    categories: Category[];
    getProductStockInfo: (id: string) => ProductStockInfo | null;
    getDisplayCostForProduct: (id: string, settings?: BarSettings | null) => DisplayCost;
    barSettings?: BarSettings | null;
    onEdit: (product: Product) => void;
    onAdjust: (product: Product) => void;
    onDelete: (product: Product) => void;
    onHistory: (product: Product) => void;
    searchTerm: string;
}

export function InventoryList({
    products,
    categories,
    getProductStockInfo,
    getDisplayCostForProduct,
    barSettings,
    onEdit,
    onAdjust,
    onDelete,
    onHistory,
    searchTerm
}: InventoryListProps) {

    if (products.length === 0) {
        return (
            <EmptyState
                icon={Package}
                message="Aucun produit trouvé"
                subMessage={searchTerm ? "Essayez une autre recherche" : "Votre inventaire est vide"}
            />
        );
    }

    // 🛡️ Map O(1) pour lookup catégorie — évite O(N×M) dans le .map() produits
    const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);
    const getCategoryName = (categoryId: string) => categoryMap.get(categoryId) || 'Sans catégorie';

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
                const displayCost = getDisplayCostForProduct(product.id, barSettings);
                const margin = displayCost.cost > 0
                    ? ((product.price - displayCost.cost) / product.price) * 100
                    : 0;
                const stockInfo = getProductStockInfo(product.id);
                const categoryName = getCategoryName(product.categoryId);

                return (
                    <InventoryCard
                        key={product.id}
                        product={product}
                        stockInfo={stockInfo}
                        displayCost={displayCost}
                        margin={margin}
                        categoryName={categoryName}
                        onEdit={onEdit}
                        onAdjust={onAdjust}
                        onDelete={onDelete}
                        onHistory={onHistory}
                    />
                );
            })}
        </div>
    );
}

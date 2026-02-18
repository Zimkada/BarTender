import { Package } from 'lucide-react';
import { Product, Category, ProductStockInfo } from '../../types';
import { InventoryCard } from './InventoryCard';
import { EmptyState } from '../common/EmptyState';
import { ProductWithAnomaly } from '../../hooks/useInventoryFilter';

interface InventoryListProps {
    products: ProductWithAnomaly[];
    categories: Category[];
    getProductStockInfo: (id: string) => ProductStockInfo | null;
    getAverageCostPerUnit: (id: string) => number;
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
    getAverageCostPerUnit,
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

    const getCategoryName = (categoryId: string) => {
        return categories.find(cat => cat.id === categoryId)?.name || 'Sans catégorie';
    };

    const getMargin = (product: Product) => {
        const avgCost = getAverageCostPerUnit(product.id);
        if (avgCost === 0) return 0;
        return ((product.price - avgCost) / product.price) * 100;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
                const avgCost = getAverageCostPerUnit(product.id);
                const margin = getMargin(product);
                const stockInfo = getProductStockInfo(product.id);
                const categoryName = getCategoryName(product.categoryId);

                return (
                    <InventoryCard
                        key={product.id}
                        product={product}
                        stockInfo={stockInfo}
                        avgCost={avgCost}
                        margin={margin}
                        categoryName={categoryName}
                        onEdit={onEdit}
                        onAdjust={onAdjust}
                        onDelete={onDelete}
                        onHistory={onHistory} // ✨ Pass to card
                    />
                );
            })}
        </div>
    );
}

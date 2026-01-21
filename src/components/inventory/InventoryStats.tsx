import { Container, BarChart3, LayoutGrid, AlertTriangle } from 'lucide-react';
import { Product } from '../../types';
import { CategoryStatsList } from '../common/CategoryStatsList';
import { Button } from '../ui/Button';

interface InventoryStatsProps {
    products: Product[];
    categoryStats: any[]; // Or import the type if available, simplified for now
    lowStockProducts: Product[];
    onNavigateToOperations: () => void;
    formatPrice: (amount: number) => string;
}

export function InventoryStats({
    products,
    categoryStats,
    lowStockProducts,
    onNavigateToOperations,
    formatPrice
}: InventoryStatsProps) {
    const totalStockValue = products.reduce((acc, p) => acc + (p.price * p.stock), 0);

    return (
        <div className="space-y-6">
            {/* Résumé Global */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-500 p-5 rounded-2xl text-white shadow-lg shadow-amber-200/50">
                    <Container className="mb-2 opacity-50" size={24} />
                    <div className="text-2xl font-black">{products.length}</div>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Types de produits</p>
                </div>
                <div className="bg-blue-600 p-5 rounded-2xl text-white shadow-lg shadow-blue-200/50">
                    <BarChart3 className="mb-2 opacity-50" size={24} />
                    <div className="text-lg font-bold truncate">
                        {formatPrice(totalStockValue)}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Valeur Vente Stock</p>
                </div>
            </div>

            {/* Répartition Catégories */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <LayoutGrid size={18} className="text-amber-500" />
                    Répartition par catégorie
                </h3>
                <div className="space-y-4">
                    <CategoryStatsList stats={categoryStats} showAlerts={false} />
                </div>
            </div>

            {/* Indicateurs additionnels */}
            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 text-center">
                <AlertTriangle className="mx-auto text-orange-500 mb-2" size={32} />
                <h4 className="font-bold text-gray-900">{lowStockProducts.length} produits nécessitent votre attention</h4>
                <p className="text-sm text-gray-600 mt-1">Consultez l'onglet Opérations pour réapprovisionner</p>
                <Button
                    onClick={onNavigateToOperations}
                    className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold"
                >
                    Aller aux opérations
                </Button>
            </div>
        </div>
    );
}

import { Container, LayoutGrid, AlertTriangle, Tags, Wallet, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
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


    return (
        <div className="space-y-6">
            {/* Résumé Global */}
            {/* Résumé Global (Nouvelle version 4 cartes) */}
            <InventorySummaryCards products={products} formatPrice={formatPrice} />

            {/* Répartition Catégories */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <LayoutGrid size={18} className="text-brand-primary" />
                    Répartition par catégorie
                </h3>
                <div className="space-y-4">
                    <CategoryStatsList stats={categoryStats} showAlerts={false} />
                </div>
            </div>

            {/* Indicateurs additionnels */}
            <div className="bg-brand-subtle p-6 rounded-2xl border border-brand-subtle text-center">
                <AlertTriangle className="mx-auto text-brand-primary mb-2" size={32} />
                <h4 className="font-bold text-gray-900">{lowStockProducts.length} produits nécessitent votre attention</h4>
                <p className="text-sm text-gray-600 mt-1">Consultez l'onglet Opérations pour réapprovisionner</p>
                <Button
                    onClick={onNavigateToOperations}
                    className="mt-4 btn-brand font-bold px-8"
                >
                    Aller aux opérations
                </Button>
            </div>
        </div>
    );
}

function InventorySummaryCards({ products, formatPrice }: { products: Product[], formatPrice: (amount: number) => string }) {
    // Calculs
    const stats = {
        categoriesCount: new Set(products.map(p => p.categoryId)).size,
        productsCount: products.length,
        purchaseValue: products.reduce((acc, p) => acc + (p.stock * (p.currentAverageCost || 0)), 0),
        saleValue: products.reduce((acc, p) => acc + (p.stock * p.price), 0),
    };

    const cards = [
        {
            label: "Catégories",
            value: stats.categoriesCount,
            icon: Tags,
            color: "bg-purple-50 text-purple-600",
            iconColor: "text-purple-500",
            delay: 0
        },
        {
            label: "Produits",
            value: stats.productsCount,
            icon: Container, // Container remplace Package/Box
            color: "bg-blue-50 text-blue-600",
            iconColor: "text-blue-500",
            delay: 0.1
        },
        {
            label: "Valeur Achat Stock Actuel",
            value: formatPrice(stats.purchaseValue),
            icon: Wallet,
            color: "bg-emerald-50 text-emerald-600",
            iconColor: "text-emerald-500",
            delay: 0.2
        },
        {
            label: "Valeur Vente Stock Actuel",
            value: formatPrice(stats.saleValue),
            icon: TrendingUp,
            color: "bg-brand-subtle text-brand-dark",
            iconColor: "text-brand-primary",
            delay: 0.3
        }
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card, idx) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: card.delay }}
                    whileTap={{ scale: 0.98 }}
                    className={`p-4 rounded-2xl border border-gray-100 shadow-sm bg-white flex flex-col items-center justify-center text-center gap-2`}
                >
                    <div className={`w-10 h-10 rounded-full ${card.color} flex items-center justify-center mb-1`}>
                        <card.icon size={20} />
                    </div>
                    <div>
                        <div className="text-xl font-black text-gray-900 leading-tight">
                            {card.value}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
                            {card.label}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

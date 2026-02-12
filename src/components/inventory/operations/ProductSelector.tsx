import { useState, useMemo } from 'react';
import { X, Search, ShoppingCart, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, Category } from '../../../types';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { EnhancedButton } from '../../EnhancedButton';

interface ProductSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    categories: Category[];
    onAddToCart: (product: Product, quantity: number) => void;
}

export function ProductSelector({ isOpen, onClose, products, categories, onAddToCart }: ProductSelectorProps) {
    const { formatPrice } = useCurrencyFormatter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [quantities, setQuantities] = useState<Record<string, number>>({});

    // Fonction helper pour obtenir le nom de catégorie
    const getCategoryName = (categoryId: string): string => {
        if (!categoryId) return 'Sans catégorie';
        if (!categories || categories.length === 0) {
            // Fallback si les catégories ne sont pas encore chargées
            return `Catégorie ${categoryId.substring(0, 8)}...`;
        }
        const category = categories.find(c => c.id === categoryId);
        return category?.name || 'Sans catégorie';
    };

    // Extraction des catégories uniques avec mapping vers noms
    const categoryOptions = useMemo(() => {
        const categoryMap = new Map<string, string>();
        products.forEach(p => {
            if (p.categoryId && !categoryMap.has(p.categoryId)) {
                categoryMap.set(p.categoryId, p.categoryId);
            }
        });
        return [
            { id: 'all', name: 'Toutes les catégories' },
            ...Array.from(categoryMap.entries()).map(([id]) => ({ id, name: getCategoryName(id) }))
        ];
    }, [products, categories]);

    // Filtrage des produits
    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.volume.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory === 'all' || product.categoryId === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [products, searchTerm, selectedCategory]);

    const handleAddToCart = (product: Product) => {
        const quantity = quantities[product.id] || 1;
        onAddToCart(product, quantity);
        setQuantities(prev => ({ ...prev, [product.id]: 1 })); // Reset après ajout
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
                >
                    {/* Header - Clean white design like Modal */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                                <Package size={20} className="text-brand-primary" />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                Sélectionner des produits
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-4 text-gray-400 hover:text-gray-500 transition-colors"
                            aria-label="Fermer"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Filtres */}
                    <div className="p-4 border-b border-gray-200 space-y-3">
                        {/* Recherche */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Rechercher un produit..."
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-brand-primary/30 rounded-xl text-sm font-medium shadow-inner transition-all outline-none"
                            />
                        </div>

                        {/* Catégories pills */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-bottom">
                            {categoryOptions.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${selectedCategory === cat.id
                                        ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20 scale-105'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Liste des produits */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {filteredProducts.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <Package size={48} className="mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Aucun produit trouvé</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {filteredProducts.map(product => (
                                    <motion.div
                                        key={product.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-gray-50 rounded-xl p-4 border-2 border-gray-100 hover:border-brand-primary/30 transition-all"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-gray-900 truncate">{product.name}</h4>
                                                <p className="text-xs text-gray-500">{product.volume}</p>
                                                <p className="text-sm font-medium text-brand-primary mt-1">
                                                    {formatPrice(product.price)}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${product.stock <= product.alertThreshold
                                                    ? 'bg-red-50 text-red-600'
                                                    : 'bg-green-50 text-green-600'
                                                    }`}>
                                                    {product.stock <= product.alertThreshold ? '⚠️ Alerte' : '✓ OK'}
                                                </span>
                                                <span className="text-xs text-gray-500">Stock: {product.stock}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="1"
                                                value={quantities[product.id] || 1}
                                                onChange={(e) => setQuantities(prev => ({
                                                    ...prev,
                                                    [product.id]: parseInt(e.target.value) || 1
                                                }))}
                                                className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:border-brand-primary focus:ring-2 focus:ring-brand-subtle outline-none"
                                            />
                                            <EnhancedButton
                                                variant="primary"
                                                size="sm"
                                                onClick={() => handleAddToCart(product)}
                                                icon={<ShoppingCart size={14} />}
                                                className="flex-1"
                                            >
                                                Ajouter
                                            </EnhancedButton>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <p className="text-sm text-gray-600 text-center">
                            {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} disponible{filteredProducts.length > 1 ? 's' : ''}
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

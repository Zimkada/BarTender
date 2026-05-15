import { useState, useRef, useEffect } from "react";
import { Search, X, Package, ArrowLeft } from "lucide-react";
import { useUnifiedStock } from "../../hooks/pivots/useUnifiedStock";
import { useFilteredProducts } from "../../hooks/useFilteredProducts";
import { ProductGrid } from "../ProductGrid";
import { Product } from "../../types";
import { useBarContext } from "../../context/BarContext";
import { Input } from "../ui/Input";

interface SwapProductSelectorProps {
    onSelect: (product: Product) => void;
    onCancel: () => void;
    title?: string;
}

/**
 * Enhanced product selector for "Magic Swap" flow.
 * Reuse existing ProductGrid but with specialized search and selection logic.
 */
export function SwapProductSelector({
    onSelect,
    onCancel,
    title = "Choisir l'article de remplacement"
}: SwapProductSelectorProps) {
    const { currentBar } = useBarContext();
    const { products, categories, isLoading, getProductStockInfo } = useUnifiedStock(currentBar?.id);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Focus search on mount
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    // Enrich products with stock for filtering
    const productsWithStock = products.map(product => ({
        ...product,
        stock: getProductStockInfo(product.id)?.availableStock ?? 0
    }));

    const filteredProducts = useFilteredProducts({
        products: productsWithStock,
        searchQuery: searchTerm,
        selectedCategory,
        onlyInStock: false
    });

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-xl">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 bg-brand-subtle/40">
                <div className="flex items-center justify-between mb-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={onCancel}
                            className="w-9 h-9 flex items-center justify-center bg-white rounded-lg text-gray-500 hover:text-brand-primary hover:border-brand-primary border border-gray-200 transition-colors flex-shrink-0"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <h3 className="text-h3 text-gray-900 truncate">
                            {title}
                        </h3>
                    </div>
                    <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-brand-subtle text-micro font-semibold text-brand-primary border border-brand-subtle flex-shrink-0">
                        Mode échange
                    </span>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10"
                        size={16}
                    />
                    <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Rechercher un produit (nom, volume…)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-11 bg-white border-gray-200 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 rounded-xl text-body-sm"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 hover:text-gray-600 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Categories */}
                <div className="flex gap-2 overflow-x-auto py-2 no-scrollbar mt-1">
                    <button
                        onClick={() => setSelectedCategory("all")}
                        className={`px-3 h-8 rounded-full text-caption font-medium transition-colors shrink-0 border ${selectedCategory === "all"
                            ? "bg-brand-primary text-white border-brand-primary"
                            : "bg-white text-gray-600 border-gray-200 hover:border-brand-primary hover:text-brand-primary"
                            }`}
                    >
                        Tous
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-3 h-8 rounded-full text-caption font-medium transition-colors shrink-0 border ${selectedCategory === cat.id
                                ? "bg-brand-primary text-white border-brand-primary"
                                : "bg-white text-gray-600 border-gray-200 hover:border-brand-primary hover:text-brand-primary"
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5 pt-3 custom-scrollbar">
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 mb-4">
                            <Package size={24} className="text-gray-300" />
                        </div>
                        <p className="text-body-sm font-medium text-gray-500 mb-0.5">Aucun produit trouvé</p>
                        <p className="text-caption text-gray-400">Essayez un autre mot-clé ou catégorie</p>
                    </div>
                ) : (
                    <ProductGrid
                        products={filteredProducts}
                        onAddToCart={onSelect}
                        isLoading={isLoading}
                        getAvailableStock={(productId) => getProductStockInfo(productId)?.availableStock}
                    />
                )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-micro text-gray-400 tabular-nums">
                    {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} affiché{filteredProducts.length > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                    <span className="text-micro text-brand-primary font-semibold">Sélection directe</span>
                </div>
            </div>
        </div>
    );
}

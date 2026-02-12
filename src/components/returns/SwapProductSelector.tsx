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
        <div className="flex flex-col h-full bg-white rounded-3xl overflow-hidden border border-purple-100 shadow-xl">
            {/* Header Area */}
            <div className="p-6 pb-4 border-b border-gray-50 bg-purple-50/30">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onCancel}
                            className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-gray-500 hover:text-purple-600 shadow-sm border border-gray-100 transition-all hover:scale-105 active:scale-95"
                        >
                            <ArrowLeft size={18} strokeWidth={2.5} />
                        </button>
                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">
                            {title}
                        </h3>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 bg-purple-100/50 px-3 py-1.5 rounded-full border border-purple-200/50">
                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">
                            Mode Échange
                        </span>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400 z-10"
                        size={18}
                        strokeWidth={3}
                    />
                    <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Rechercher un produit (Nom, Volume...)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-12 h-14 bg-white border-purple-100 focus:border-purple-500 focus:ring-purple-500/10 rounded-2xl text-base shadow-inner"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm("")}
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 hover:text-gray-600 transition-colors"
                        >
                            <X size={14} strokeWidth={3} />
                        </button>
                    )}
                </div>

                {/* Categories Bar */}
                <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar mt-2">
                    <button
                        onClick={() => setSelectedCategory("all")}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 border ${selectedCategory === "all"
                                ? "bg-purple-600 text-white border-purple-600 shadow-md"
                                : "bg-white text-gray-500 border-gray-100 hover:border-purple-200"
                            }`}
                    >
                        Tous
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 border ${selectedCategory === cat.id
                                    ? "bg-purple-600 text-white border-purple-600 shadow-md"
                                    : "bg-white text-gray-500 border-gray-100 hover:border-purple-200"
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid Area */}
            <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar">
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                        <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center border border-gray-100 mb-6 italic">
                            <Package size={40} strokeWidth={1} />
                        </div>
                        <p className="text-sm font-black text-gray-400 mb-1 uppercase tracking-widest">Aucun produit trouvé</p>
                        <p className="text-xs text-gray-400">Essayez un autre mot-clé ou catégorie</p>
                    </div>
                ) : (
                    <ProductGrid
                        products={filteredProducts}
                        onAddToCart={onSelect}
                        isLoading={isLoading}
                    />
                )}
            </div>

            {/* Footer Info */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {filteredProducts.length} produits affichés
                </span>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Sélection directe</span>
                </div>
            </div>
        </div>
    );
}

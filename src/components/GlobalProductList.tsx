import React, { useState, useMemo } from 'react';
import { Edit2, Trash2, ArrowUpDown, Package, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { GlobalProduct } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { EmptyProductsState } from './EmptyProductsState';
import { GlobalCatalogTableImage } from './GlobalCatalogTableImage';
import { Input } from './ui/Input';
import { Select, SelectOption } from './ui/Select';
import { Button } from './ui/Button';

interface GlobalProductListProps {
    products: GlobalProduct[];
    onEdit: (product: GlobalProduct) => void;
    onDelete: (product: GlobalProduct) => void;
}

type SortField = 'name' | 'category' | 'brand' | 'price';
type SortDirection = 'asc' | 'desc';

export function GlobalProductList({ products, onEdit, onDelete }: GlobalProductListProps) {
    const { formatPrice } = useCurrencyFormatter();

    // États pour le tri, filtre, recherche et pagination
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Extraire les catégories uniques pour le filtre
    const categoryOptions: SelectOption[] = useMemo(() => {
        const cats = new Set(products.map(p => p.category));
        const sortedCats = Array.from(cats).sort();
        return [
            { value: 'all', label: 'Toutes les catégories' },
            ...sortedCats.map(cat => ({ value: cat, label: cat }))
        ];
    }, [products]);

    // Logique de Tri
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Logique Combinée : Recherche -> Filtre -> Tri
    const processedProducts = useMemo(() => {
        let result = [...products];

        // 1. Recherche
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(p =>
                p.name.toLowerCase().includes(lowerTerm) ||
                (p.brand || '').toLowerCase().includes(lowerTerm)
            );
        }

        // 2. Filtre Catégorie
        if (selectedCategory !== 'all') {
            result = result.filter(p => p.category === selectedCategory);
        }

        // 3. Tri
        result.sort((a, b) => {
            const direction = sortDirection === 'asc' ? 1 : -1;
            switch (sortField) {
                case 'name':
                    return a.name.localeCompare(b.name) * direction;
                case 'category':
                    return a.category.localeCompare(b.category) * direction;
                case 'brand':
                    return ((a.brand || '')).localeCompare(b.brand || '') * direction;
                case 'price':
                    return ((a.suggestedPriceMin || 0) - (b.suggestedPriceMin || 0)) * direction;
                default:
                    return 0;
            }
        });

        return result;
    }, [products, searchTerm, selectedCategory, sortField, sortDirection]);

    // Logique Pagination
    const totalPages = Math.ceil(processedProducts.length / itemsPerPage);
    const paginatedProducts = processedProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page quand recherche/filtre change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedCategory]);

    const SortIcon = ({ field }: { field: SortField }) => (
        <ArrowUpDown
            size={14}
            className={`inline-block ml-1 transition-colors ${sortField === field ? 'text-blue-600' : 'text-muted-foreground/60'}`}
        />
    );

    return (
        <div className="space-y-4">
            {/* Barre d'outils (Recherche & Filtres) */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
                <div className="w-full sm:w-64">
                    <Input
                        type="text"
                        placeholder="Rechercher un produit..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        leftIcon={<Search size={18} />}
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="text-foreground/70" size={18} />
                    <Select
                        options={categoryOptions}
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full sm:w-48"
                    />
                </div>
            </div>

            {/* Tableau */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted border-b border-border">
                            <tr>
                                <th className="px-4 py-3 font-medium text-muted-foreground w-16">Img</th>
                                <th
                                    className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:bg-muted transition-colors"
                                    onClick={() => handleSort('name')}
                                >
                                    Produit <SortIcon field="name" />
                                </th>
                                <th
                                    className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:bg-muted transition-colors hidden md:table-cell"
                                    onClick={() => handleSort('brand')}
                                >
                                    Marque <SortIcon field="brand" />
                                </th>
                                <th
                                    className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:bg-muted transition-colors"
                                    onClick={() => handleSort('category')}
                                >
                                    Catégorie <SortIcon field="category" />
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Volume</th>
                                <th
                                    className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:bg-muted transition-colors text-right"
                                    onClick={() => handleSort('price')}
                                >
                                    Prix Sugg. <SortIcon field="price" />
                                </th>
                                <th className="px-4 py-3 font-medium text-muted-foreground text-right w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-blue-50/50 transition-colors group">
                                    <td className="px-4 py-2">
                                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border">
                                            {product.officialImage ? (
                                                <GlobalCatalogTableImage
                                                    src={product.officialImage}
                                                    alt={product.name}
                                                />
                                            ) : (
                                                <Package size={16} className="text-muted-foreground/60" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="font-medium text-foreground">{product.name}</div>
                                        <div className="text-xs text-muted-foreground md:hidden">{product.brand}</div>
                                    </td>
                                    <td className="px-4 py-2 hidden md:table-cell text-foreground/70">
                                        {product.brand || '-'}
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground">
                                            {product.category}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 hidden sm:table-cell text-foreground/70">
                                        {product.volume}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-foreground/80">
                                        {product.suggestedPriceMin ? formatPrice(product.suggestedPriceMin) : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                onClick={() => onEdit(product)}
                                                variant="ghost"
                                                size="icon"
                                                className="p-1.5 text-foreground/70 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Modifier"
                                            >
                                                <Edit2 size={16} />
                                            </Button>
                                            <Button
                                                onClick={() => onDelete(product)}
                                                variant="ghost"
                                                size="icon"
                                                className="p-1.5 text-foreground/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Supprimer"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {processedProducts.length === 0 && (
                    <div className="p-4">
                        <EmptyProductsState
                            title="Aucun produit trouvé"
                            message={searchTerm ? `Aucun résultat pour "${searchTerm}"` : "Le catalogue est vide."}
                        />
                    </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
                        <div className="text-sm text-muted-foreground">
                            Affichage de <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> à <span className="font-medium">{Math.min(currentPage * itemsPerPage, processedProducts.length)}</span> sur <span className="font-medium">{processedProducts.length}</span> résultats
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                variant="outline"
                                size="icon"
                            >
                                <ChevronLeft size={16} />
                            </Button>
                            <span className="text-sm font-medium text-foreground/80 px-2">
                                Page {currentPage} sur {totalPages}
                            </span>
                            <Button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                variant="outline"
                                size="icon"
                            >
                                <ChevronRight size={16} />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

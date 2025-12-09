import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Save, X, Loader2, Search, Filter, LayoutGrid, List as ListIcon } from 'lucide-react';
import { ProductsService } from '../services/supabase/products.service';
import { CategoriesService } from '../services/supabase/categories.service';
import { GlobalProduct, GlobalCategory } from '../types';
import { useFeedback } from '../hooks/useFeedback';
import { ImageUpload } from './ImageUpload';
import { GlobalProductList } from './GlobalProductList';
import { Textarea } from './ui/Textarea';
import { Label } from './ui/Label';

export function GlobalProductsTab() {
    const [products, setProducts] = useState<GlobalProduct[]>([]);
    const [categories, setCategories] = useState<GlobalCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<GlobalProduct | null>(null);
    const { showSuccess, showError } = useFeedback();

    // Filters & View Mode
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        brand: '',
        manufacturer: '',
        volume: '33cl',
        volumeMl: 330,
        category: '',
        subcategory: '',
        officialImage: '',
        barcode: '',
        suggestedPriceMin: 0,
        suggestedPriceMax: 0,
        description: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [productsData, categoriesData] = await Promise.all([
                ProductsService.getGlobalProducts(),
                CategoriesService.getGlobalCategories()
            ]);
            setProducts(productsData);
            setCategories(categoriesData);
        } catch (error: any) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (product.brand && product.brand.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [products, searchQuery, selectedCategory]);

    const handleOpenModal = (product?: GlobalProduct) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                brand: product.brand || '',
                manufacturer: product.manufacturer || '',
                volume: product.volume,
                volumeMl: product.volumeMl || 0,
                category: product.category,
                subcategory: product.subcategory || '',
                officialImage: product.officialImage || '',
                barcode: product.barcode || '',
                suggestedPriceMin: product.suggestedPriceMin || 0,
                suggestedPriceMax: product.suggestedPriceMax || 0,
                description: product.description || ''
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                brand: '',
                manufacturer: '',
                volume: '33cl',
                volumeMl: 330,
                category: categories[0]?.name || '',
                subcategory: '',
                officialImage: '',
                barcode: '',
                suggestedPriceMin: 0,
                suggestedPriceMax: 0,
                description: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.category || !formData.volume) {
            showError('Nom, Catégorie et Volume sont requis');
            return;
        }

        try {
            const payload = {
                name: formData.name,
                brand: formData.brand,
                manufacturer: formData.manufacturer,
                volume: formData.volume,
                volume_ml: formData.volumeMl,
                category: formData.category,
                subcategory: formData.subcategory,
                official_image: formData.officialImage,
                barcode: formData.barcode,
                suggested_price_min: formData.suggestedPriceMin,
                suggested_price_max: formData.suggestedPriceMax,
                description: formData.description
            };

            if (editingProduct) {
                await ProductsService.updateGlobalProduct(editingProduct.id, payload);
                showSuccess('Produit mis à jour');
            } else {
                await ProductsService.createGlobalProduct(payload as any);
                showSuccess('Produit créé');
            }
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            showError(error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;

        try {
            await ProductsService.deleteGlobalProduct(id);
            showSuccess('Produit supprimé');
            loadData();
        } catch (error: any) {
            showError(error.message);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-6">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Rechercher un produit..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                        >
                            <option value="all">Toutes les catégories</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                            title="Vue Grille"
                        >
                            <LayoutGrid size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'list'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                            title="Vue Liste"
                        >
                            <ListIcon size={20} />
                        </button>
                    </div>
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex-1 md:flex-none justify-center"
                    >
                        <Plus size={20} />
                        <span className="hidden sm:inline">Nouveau Produit</span>
                    </button>
                </div>
            </div>

            {/* Grid or List View */}
            <div className="flex-1 overflow-y-auto">
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {filteredProducts.map((product) => (
                            <div
                                key={product.id}
                                className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col group hover:shadow-md transition-shadow"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-md font-medium truncate max-w-[70%]">
                                        {product.category}
                                    </span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleOpenModal(product)}
                                            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product.id)}
                                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="aspect-square mb-2 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden relative">
                                    {product.officialImage ? (
                                        <img
                                            src={product.officialImage}
                                            alt={product.name}
                                            className="w-full h-full object-contain p-2"
                                        />
                                    ) : (
                                        <div className="text-gray-300 text-[10px] text-center p-2">
                                            Pas d'image
                                        </div>
                                    )}
                                </div>

                                <h4 className="font-bold text-gray-900 text-sm leading-tight mb-0.5 line-clamp-2">{product.name}</h4>
                                <p className="text-xs text-gray-500 mb-2 truncate">{product.brand} - {product.volume}</p>

                                <div className="mt-auto pt-2 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs gap-1">
                                    <span className="text-gray-400 text-[10px]">Prix suggéré</span>
                                    <span className="font-semibold text-gray-900">
                                        {product.suggestedPriceMin ? `${product.suggestedPriceMin}` : ''}
                                        {product.suggestedPriceMin && product.suggestedPriceMax ? '-' : ''}
                                        {product.suggestedPriceMax || '?'} F
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <GlobalProductList
                        products={filteredProducts}
                        onEdit={handleOpenModal}
                        onDelete={handleDelete}
                    />
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">
                                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Ex: Heineken"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
                                    <input
                                        type="text"
                                        value={formData.brand}
                                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Volume *</label>
                                        <input
                                            type="text"
                                            value={formData.volume}
                                            onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Ex: 33cl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Volume (ml)</label>
                                        <input
                                            type="number"
                                            value={formData.volumeMl}
                                            onChange={(e) => setFormData({ ...formData, volumeMl: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <ImageUpload
                                        currentImage={formData.officialImage}
                                        onImageChange={(url) => setFormData({ ...formData, officialImage: url })}
                                        bucketName="product-images"
                                        folderPath="global-products"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                    >
                                        <option value="">Sélectionner une catégorie</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix Min (Suggéré)</label>
                                        <input
                                            type="number"
                                            value={formData.suggestedPriceMin}
                                            onChange={(e) => setFormData({ ...formData, suggestedPriceMin: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix Max (Suggéré)</label>
                                        <input
                                            type="number"
                                            value={formData.suggestedPriceMax}
                                            onChange={(e) => setFormData({ ...formData, suggestedPriceMax: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Code-barres</label>
                                    <input
                                        type="text"
                                        value={formData.barcode}
                                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div className="mt-4">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

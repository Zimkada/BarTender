import { useState, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, TruckIcon, FileSpreadsheet, AlertTriangle, Package } from 'lucide-react';
import { Product, ProductStockInfo, Category } from '../../types';
import { Button } from '../ui/Button';
import { InventoryAddForm } from './operations/InventoryAddForm';
import { InventorySupplyForm } from './operations/InventorySupplyForm';
import { BackButton } from '../ui/BackButton';

// Lazy load
// Lazy load
const ProductImport = lazy(() => import('../ProductImport').then(m => ({ default: m.ProductImport })));

interface InventoryOperationsProps {
    lowStockProducts: Product[];
    getProductStockInfo: (id: string) => ProductStockInfo | null;
    categories: Category[];
    products: Product[];
    onSaveProduct: (data: any) => Promise<void> | void;
    onSupply: (data: any) => Promise<void> | void;
    isProductImportEnabled: boolean;
}

type OperationMode = 'menu' | 'add' | 'supply' | 'import';

export function InventoryOperations({
    lowStockProducts,
    getProductStockInfo,
    categories,
    products,
    onSaveProduct,
    onSupply,
    isProductImportEnabled
}: InventoryOperationsProps) {
    const [mode, setMode] = useState<OperationMode>('menu');

    const handleBack = () => setMode('menu');

    return (
        <div className="space-y-6">
            <AnimatePresence mode="wait">
                {mode === 'menu' ? (
                    <motion.div
                        key="op-menu"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="space-y-6"
                    >
                        {/* Tuiles d'action */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <button
                                onClick={() => setMode('add')}
                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-amber-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                            >
                                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <PlusCircle size={28} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">Nouveau Produit</h3>
                                    <p className="text-sm text-gray-500">Ajouter manuellement au catalogue</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setMode('supply')}
                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-green-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                            >
                                <div className="p-3 bg-green-100 text-green-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <TruckIcon size={28} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">Approvisionner</h3>
                                    <p className="text-sm text-gray-500">Enregistrer des entrées de stock</p>
                                </div>
                            </button>

                            {isProductImportEnabled && (
                                <button
                                    onClick={() => setMode('import')}
                                    className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-blue-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                                >
                                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                                        <FileSpreadsheet size={28} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">Import Excel</h3>
                                        <p className="text-sm text-gray-500">Charger une liste massive</p>
                                    </div>
                                </button>
                            )}
                        </div>

                        {/* Section Alertes */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <AlertTriangle size={18} className="text-orange-500" />
                                    Urgent : Stocks bas
                                </h3>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${lowStockProducts.length > 0 ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                                    {lowStockProducts.length > 0 ? `${lowStockProducts.length} alertes` : 'OK'}
                                </span>
                            </div>

                            <div className="p-4">
                                {lowStockProducts.length === 0 ? (
                                    <div className="text-center py-6">
                                        <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Package size={24} />
                                        </div>
                                        <p className="text-gray-600 font-medium">Tous les stocks sont à jour ✓</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {lowStockProducts.map(product => {
                                            const stock = getProductStockInfo(product.id);
                                            return (
                                                <div key={product.id} className="flex items-center justify-between p-3 bg-orange-50/50 rounded-xl border border-orange-100">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-orange-600 font-bold border border-orange-100">
                                                            {stock?.physicalStock ?? 0}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900">{product.name}</p>
                                                            <p className="text-[10px] text-gray-500 uppercase font-black">Seuil: {product.alertThreshold}</p>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        onClick={() => setMode('supply')}
                                                        size="sm"
                                                        className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold h-7"
                                                    >
                                                        Réappro
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="op-form"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                    >
                        {mode === 'add' && (
                            <InventoryAddForm
                                onClose={handleBack}
                                onSave={(data) => {
                                    onSaveProduct(data);
                                    handleBack();
                                }}
                                categories={categories}
                            />
                        )}
                        {mode === 'supply' && (
                            <InventorySupplyForm
                                onClose={handleBack}
                                onSave={onSupply}
                                products={products}
                            />
                        )}
                        {mode === 'import' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[400px]">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
                                    <BackButton
                                        onClick={handleBack}
                                        iconType="chevron"
                                        className="text-gray-500 hover:text-gray-900"
                                    />
                                    <h2 className="text-lg font-bold text-gray-900">Importation Massive</h2>
                                </div>
                                <Suspense fallback={<div className="py-12 text-center text-gray-400">Chargement...</div>}>
                                    <ProductImport
                                        isOpen={true}
                                        inline={true}
                                        onClose={handleBack}
                                    />
                                </Suspense>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

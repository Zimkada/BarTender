import { useState, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, TruckIcon, FileSpreadsheet, ShoppingCart } from 'lucide-react';
import { Product, ProductStockInfo, Category } from '../../types';

import { InventoryAddForm } from './operations/InventoryAddForm';
import { InventorySupplyForm } from './operations/InventorySupplyForm';
import { OrderPreparation } from './operations/OrderPreparation';
import { OrderFinalization } from './operations/OrderFinalization';
import { BackButton } from '../ui/BackButton';

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

type OperationMode = 'menu' | 'add' | 'supply' | 'import' | 'order-prep' | 'order-finalize';

export function InventoryOperations({
    lowStockProducts,
    categories,
    products,
    onSaveProduct,
    onSupply,
    isProductImportEnabled
}: InventoryOperationsProps) {
    const [mode, setMode] = useState<OperationMode>('menu');
    const [supplyInitialData, setSupplyInitialData] = useState<{ productId?: string; quantity?: number } | undefined>(undefined);

    const handleBack = () => {
        setMode('menu');
        setSupplyInitialData(undefined);
    };

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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <button
                                onClick={() => setMode('add')}
                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-amber-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                            >
                                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <PlusCircle size={28} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-900">Nouveau Produit</h3>
                                    <p className="text-sm text-gray-500 line-clamp-1">Ajout manuel</p>
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
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-900">Import Excel</h3>
                                        <p className="text-sm text-gray-500 line-clamp-1">Chargement massif</p>
                                    </div>
                                </button>
                            )}

                            <button
                                onClick={() => setMode('order-prep')}
                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-orange-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                            >
                                <div className="p-3 bg-orange-100 text-orange-600 rounded-xl group-hover:scale-110 transition-transform relative">
                                    <ShoppingCart size={28} />
                                    {lowStockProducts.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-pulse" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-900">Préparation Commandes</h3>
                                    <p className="text-sm text-gray-500 line-clamp-1">Analyses & Suggestions d'achat</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setMode('supply')}
                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-green-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                            >
                                <div className="p-3 bg-green-100 text-green-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <TruckIcon size={28} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-900">Approvisionner</h3>
                                    <p className="text-sm text-gray-500 line-clamp-1">Entrées de stock</p>
                                </div>
                            </button>
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
                                initialProductId={supplyInitialData?.productId}
                                initialQuantity={supplyInitialData?.quantity}
                            />
                        )}
                        {mode === 'order-prep' && (
                            <OrderPreparation
                                onBack={handleBack}
                                onGoToFinalization={() => setMode('order-finalize')}
                            />
                        )}
                        {mode === 'order-finalize' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <BackButton onClick={() => setMode('order-prep')} />
                                    <h2 className="text-lg font-bold text-gray-900">Finalisation Commande</h2>
                                </div>
                                <OrderFinalization />
                            </div>
                        )}
                        {mode === 'import' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[400px]">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
                                    <BackButton
                                        onClick={handleBack}
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
        </div >
    );
}

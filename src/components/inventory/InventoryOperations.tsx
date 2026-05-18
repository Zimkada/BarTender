import { useState, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, TruckIcon, FileSpreadsheet } from 'lucide-react';
import { Product, ProductStockInfo, Category } from '../../types';

import { InventoryAddForm } from './operations/InventoryAddForm';
import { InventorySupplyForm } from './operations/InventorySupplyForm';
import { BackButton } from '../ui/BackButton';

// Lazy load
const ProductImport = lazy(() => import('../ProductImport').then(m => ({ default: m.ProductImport })));

interface InventoryOperationsProps {
    getProductStockInfo: (id: string) => ProductStockInfo | null;
    categories: Category[];
    products: Product[];
    onSaveProduct: (data: any) => Promise<void> | void;
    onSupply: (data: any) => Promise<void> | void;
    isProductImportEnabled: boolean;
}

type OperationMode = 'menu' | 'add' | 'supply' | 'import';

export function InventoryOperations({
    categories,
    products,
    onSaveProduct,
    onSupply,
    isProductImportEnabled,
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
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-6"
                    >
                        {/* Tuiles d'action — entrer des produits / stock dans le système */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <button
                                onClick={() => setMode('add')}
                                data-guide="inventory-add-btn"
                                className="group p-6 bg-card rounded-2xl border border-border hover:border-brand-primary/40 hover:shadow-md shadow-sm transition-all text-left flex items-start gap-4 active:scale-[0.98]"
                            >
                                <div className="p-3 bg-brand-subtle text-brand-primary rounded-xl flex-shrink-0">
                                    <PlusCircle size={28} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-h3 text-foreground">Nouveau produit</h3>
                                    <p className="text-body-sm text-muted-foreground line-clamp-1">Ajout manuel au catalogue</p>
                                </div>
                            </button>

                            {isProductImportEnabled && (
                                <button
                                    onClick={() => setMode('import')}
                                    data-guide="inventory-import-btn"
                                    className="group p-6 bg-card rounded-2xl border border-border hover:border-brand-primary/40 hover:shadow-md shadow-sm transition-all text-left flex items-start gap-4 active:scale-[0.98]"
                                >
                                    <div className="p-3 bg-brand-subtle text-brand-primary rounded-xl flex-shrink-0">
                                        <FileSpreadsheet size={28} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-h3 text-foreground">Import Excel</h3>
                                        <p className="text-body-sm text-muted-foreground line-clamp-1">Chargement massif</p>
                                    </div>
                                </button>
                            )}

                            <button
                                onClick={() => setMode('supply')}
                                data-guide="inventory-supply-btn"
                                className="group p-6 bg-card rounded-2xl border border-border hover:border-brand-primary/40 hover:shadow-md shadow-sm transition-all text-left flex items-start gap-4 active:scale-[0.98]"
                            >
                                <div className="p-3 bg-brand-subtle text-brand-primary rounded-xl flex-shrink-0">
                                    <TruckIcon size={28} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-h3 text-foreground">Approvisionner</h3>
                                    <p className="text-body-sm text-muted-foreground line-clamp-1">Entrée de stock directe</p>
                                </div>
                            </button>
                        </div>


                    </motion.div>
                ) : (
                    <motion.div
                        key="op-form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        {mode === 'add' && (
                            <InventoryAddForm
                                onClose={handleBack}
                                onSave={async (data) => {
                                    await onSaveProduct(data);
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
                        {mode === 'import' && (
                            <div className="bg-card rounded-2xl shadow-sm border border-border p-4 min-h-[400px]">
                                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                                    <BackButton
                                        onClick={handleBack}
                                    />
                                    <h2 className="text-h3 text-foreground">Importation massive</h2>
                                </div>
                                <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Chargement...</div>}>
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

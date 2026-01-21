import { Suspense, lazy } from 'react';
import { Category, Product } from '../../../types';
import { BackButton } from '../../ui/BackButton';

// Lazy load
const ProductModal = lazy(() => import('../../ProductModal').then(m => ({ default: m.ProductModal })));

interface InventoryAddFormProps {
    onClose: () => void;
    onSave: (data: any) => void;
    categories: Category[];
}

export function InventoryAddForm({ onClose, onSave, categories }: InventoryAddFormProps) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[400px]">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
                <BackButton
                    onClick={onClose}
                    iconType="chevron"
                    className="text-gray-500 hover:text-gray-900"
                />
                <h2 className="text-lg font-bold text-gray-900">Nouveau Produit</h2>
            </div>
            <Suspense fallback={<div className="py-12 text-center text-gray-400">Chargement du formulaire...</div>}>
                <ProductModal
                    isOpen={true}
                    inline={true}
                    onClose={onClose}
                    onSave={onSave}
                    categories={categories}
                />
            </Suspense>
        </div>
    );
}

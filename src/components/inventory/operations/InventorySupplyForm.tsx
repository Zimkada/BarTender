import { Suspense, lazy } from 'react';
import { Product } from '../../../types';
import { BackButton } from '../../ui/BackButton';

// Lazy load
const SupplyModal = lazy(() => import('../../SupplyModal').then(m => ({ default: m.SupplyModal })));

interface InventorySupplyFormProps {
    onClose: () => void;
    onSave: (data: any) => Promise<void> | void;
    products: Product[];
    initialProductId?: string;
    initialQuantity?: number;
}

export function InventorySupplyForm({ onClose, onSave, products, initialProductId, initialQuantity }: InventorySupplyFormProps) {
    return (
        <div className="bg-card rounded-2xl shadow-sm border border-border p-4 min-h-[400px]">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
                <BackButton
                    onClick={onClose}
                />
                <h2 className="text-lg font-bold text-foreground">Approvisionnement Manuel</h2>
            </div>
            <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Chargement du formulaire...</div>}>
                <SupplyModal
                    isOpen={true}
                    inline={true}
                    onClose={onClose}
                    onSave={async (data) => {
                        await onSave(data);
                        onClose();
                    }}
                    products={products}
                    initialProductId={initialProductId}
                    initialQuantity={initialQuantity}
                />
            </Suspense>
        </div>
    );
}

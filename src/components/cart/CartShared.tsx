import { Plus, Minus, Trash2, Tag } from 'lucide-react';
import { CartItem } from '../../types';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useCartLogic } from '../../hooks/useCartLogic';

interface CartSharedProps {
    items: CartItem[];
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    variant?: 'mobile' | 'desktop';
    barId?: string;
}

/**
 * Composant partagé pour afficher la liste des produits dans le panier
 * Utilisé par Cart.tsx, ServerCart.tsx, QuickSaleFlow.tsx
 * Gère l'affichage des promotions, contrôles de quantité, suppression
 */
export function CartShared({
    items,
    onUpdateQuantity,
    onRemoveItem,
    variant = 'mobile',
    barId
}: CartSharedProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { calculateItemPrice } = useCartLogic({ items, barId });

    const isMobile = variant === 'mobile';

    if (items.length === 0) {
        return null;
    }

    return (
        <div className={isMobile ? 'space-y-3' : 'space-y-2'}>
            {items.map((item) => {
                const prices = calculateItemPrice(item);

                return (
                    <div
                        key={item.product.id}
                        className={`bg-amber-50 rounded-${isMobile ? '2xl' : 'xl'} p-${isMobile ? '4' : '3'} border border-amber-${isMobile ? '200' : '100'}`}
                    >
                        {/* Nom + bouton supprimer */}
                        <div className={`flex items-start justify-between mb-${isMobile ? '3' : '2'}`}>
                            <div className="flex-1 min-w-0">
                                <h3 className={`font-${isMobile ? 'bold' : 'medium'} text-gray-${isMobile ? '900' : '800'} text-${isMobile ? 'base' : 'sm'}`}>
                                    {item.product.name}
                                </h3>
                                <p className="text-sm text-gray-600">{item.product.volume}</p>
                            </div>
                            <button
                                onClick={() => onRemoveItem(item.product.id)}
                                className={`p-2 text-red-${isMobile ? '500' : '400'} ${isMobile ? 'active' : 'hover'}:bg-red-100 rounded-lg transition-colors`}
                                aria-label="Supprimer"
                            >
                                <Trash2 size={isMobile ? 20 : 16} />
                            </button>
                        </div>

                        {/* Quantité + Prix */}
                        <div className="flex items-center justify-between">
                            {/* Contrôles quantité */}
                            <div className={`flex items-center gap-${isMobile ? '3' : '2'}`}>
                                <button
                                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                                    className={`w-${isMobile ? '12' : '8'} h-${isMobile ? '12' : '8'} bg-amber-200 text-amber-700 rounded-${isMobile ? 'xl' : 'lg'} ${isMobile ? 'active' : 'hover'}:bg-amber-300 transition-colors flex items-center justify-center`}
                                    aria-label="Diminuer quantité"
                                >
                                    <Minus size={isMobile ? 20 : 14} strokeWidth={3} />
                                </button>
                                <span className={`text-gray-${isMobile ? '900' : '800'} font-${isMobile ? 'bold' : 'medium'} text-${isMobile ? 'xl' : 'base'} min-w-[${isMobile ? '40' : '32'}px] text-center`}>
                                    {item.quantity}
                                </span>
                                <button
                                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                                    className={`w-${isMobile ? '12' : '8'} h-${isMobile ? '12' : '8'} bg-amber-200 text-amber-700 rounded-${isMobile ? 'xl' : 'lg'} ${isMobile ? 'active' : 'hover'}:bg-amber-300 transition-colors flex items-center justify-center`}
                                    aria-label="Augmenter quantité"
                                >
                                    <Plus size={isMobile ? 20 : 14} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Prix avec promotion */}
                            <div className="text-right">
                                {prices.hasPromotion ? (
                                    <>
                                        <div className="flex items-center gap-1.5 justify-end mb-0.5">
                                            <Tag size={16} className="text-green-600" />
                                            <span className="text-sm text-green-600 font-semibold">PROMO</span>
                                        </div>
                                        <div className="text-base text-gray-400 line-through">
                                            {formatPrice(prices.original)}
                                        </div>
                                        <div className="text-green-600 font-bold text-xl font-mono">
                                            {formatPrice(prices.final)}
                                        </div>
                                    </>
                                ) : (
                                    <span className={`text-amber-600 font-bold text-${isMobile ? 'xl' : 'base'} font-mono`}>
                                        {formatPrice(prices.final)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

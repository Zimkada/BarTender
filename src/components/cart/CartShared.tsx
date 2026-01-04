import { Plus, Minus, Trash2, Tag } from 'lucide-react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { CalculatedItem } from '../../hooks/useCartLogic';

interface CartSharedProps {
    items: CalculatedItem[];
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    variant?: 'mobile' | 'desktop';
    showTotalReductions?: boolean;
}

/**
 * Map des types de promotion vers labels courts et descriptifs
 */
const PROMO_TYPE_LABELS: Record<string, string> = {
    'bundle': '🎁 Lot',
    'fixed_discount': '💰 -Montant',
    'percentage': '📊 -%',
    'special_price': '⏰ Spécial',
};

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
    showTotalReductions = false,
}: CartSharedProps) {
    const { formatPrice } = useCurrencyFormatter();
    const isMobile = variant === 'mobile';

    // ✅ Calculer total réductions
    const totalReductions = items.reduce((sum, item) => sum + item.discount_amount, 0);

    if (items.length === 0) {
        return null;
    }

    // ✅ Classes statiques pré-compilées pour performances optimales
    // Mobile: Grands boutons tactiles (48x48px min), espacements généreux
    // Desktop: Compact, hover states
    const styles = {
        container: isMobile ? 'space-y-3' : 'space-y-2',

        card: isMobile
            ? 'bg-amber-50 rounded-2xl p-4 border border-amber-200'
            : 'bg-amber-50 rounded-xl p-3 border border-amber-100',

        header: isMobile ? 'flex items-start justify-between mb-3' : 'flex items-start justify-between mb-2',

        productName: isMobile
            ? 'font-bold text-gray-900 text-base'
            : 'font-medium text-gray-800 text-sm',

        deleteButton: isMobile
            ? 'p-2 text-red-500 active:bg-red-100 rounded-lg transition-colors'
            : 'p-2 text-red-400 hover:bg-red-100 rounded-lg transition-colors',

        quantityContainer: isMobile ? 'flex items-center gap-3' : 'flex items-center gap-2',

        quantityButton: isMobile
            ? 'w-12 h-12 bg-amber-200 text-amber-700 rounded-xl active:bg-amber-300 transition-colors flex items-center justify-center'
            : 'w-8 h-8 bg-amber-200 text-amber-700 rounded-lg hover:bg-amber-300 transition-colors flex items-center justify-center',

        quantityText: isMobile
            ? 'text-gray-900 font-bold text-xl min-w-[40px] text-center'
            : 'text-gray-800 font-medium text-base min-w-[32px] text-center',

        priceText: isMobile
            ? 'text-amber-600 font-bold text-xl font-mono'
            : 'text-amber-600 font-bold text-base font-mono',
    };

    return (
        <>
            <div className={styles.container}>
                {items.map((item) => {
                return (
                    <div
                        key={item.product.id}
                        className={styles.card}
                    >
                        {/* Nom + bouton supprimer */}
                        <div className={styles.header}>
                            <div className="flex-1 min-w-0">
                                <h3 className={styles.productName}>
                                    {item.product.name}
                                </h3>
                                <p className="text-sm text-gray-600">{item.product.volume}</p>
                            </div>
                            <button
                                onClick={() => onRemoveItem(item.product.id)}
                                className={styles.deleteButton}
                                aria-label="Supprimer"
                            >
                                <Trash2 size={isMobile ? 20 : 16} />
                            </button>
                        </div>

                        {/* Quantité + Prix */}
                        <div className="flex items-center justify-between">
                            {/* Contrôles quantité */}
                            <div className={styles.quantityContainer}>
                                <button
                                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                                    className={styles.quantityButton}
                                    aria-label="Diminuer quantité"
                                >
                                    <Minus size={isMobile ? 20 : 14} strokeWidth={3} />
                                </button>
                                <span className={styles.quantityText}>
                                    {item.quantity}
                                </span>
                                <button
                                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                                    className={styles.quantityButton}
                                    aria-label="Augmenter quantité"
                                >
                                    <Plus size={isMobile ? 20 : 14} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Prix avec promotion */}
                            <div className="text-right">
                                {item.hasPromotion ? (
                                    <>
                                        <div className="flex items-center gap-1.5 justify-end mb-0.5">
                                            <Tag size={16} className="text-green-600" />
                                            <span className="text-sm text-green-600 font-semibold">
                                                {item.promotion_type
                                                    ? PROMO_TYPE_LABELS[item.promotion_type] || 'PROMO'
                                                    : 'PROMO'}
                                            </span>
                                        </div>
                                        <div className="text-base text-gray-400 line-through">
                                            {formatPrice(item.original_unit_price * item.quantity)}
                                        </div>
                                        <div className="text-green-600 font-bold text-xl font-mono">
                                            {formatPrice(item.total_price)}
                                        </div>
                                    </>
                                ) : (
                                    <span className={styles.priceText}>
                                        {formatPrice(item.total_price)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            </div>

            {/* ✅ Affichage total réductions (optionnel) */}
            {showTotalReductions && totalReductions > 0 && (
                <div className={isMobile
                    ? 'bg-green-50 rounded-2xl p-4 border border-green-200 mt-3'
                    : 'bg-green-50 rounded-xl p-3 border border-green-100 mt-2'
                }>
                    <div className="flex items-center justify-between">
                        <span className={isMobile
                            ? 'font-semibold text-gray-700 text-base flex items-center gap-2'
                            : 'font-medium text-gray-700 text-sm flex items-center gap-2'
                        }>
                            <Tag size={isMobile ? 20 : 16} className="text-green-600" />
                            Réduction totale
                        </span>
                        <span className={isMobile
                            ? 'text-green-600 font-bold text-lg font-mono'
                            : 'text-green-600 font-bold text-base font-mono'
                        }>
                            -{formatPrice(totalReductions)}
                        </span>
                    </div>
                </div>
            )}
        </>
    );
}

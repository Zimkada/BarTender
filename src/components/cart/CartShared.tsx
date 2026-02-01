import { Plus, Minus, Trash2, Tag, Package } from 'lucide-react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { CalculatedItem } from '../../hooks/useCartLogic';
import { motion, AnimatePresence } from 'framer-motion';

interface CartSharedProps {
    items: CalculatedItem[];
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    variant?: 'mobile' | 'desktop';
    showTotalReductions?: boolean;
}

const PROMO_TYPE_LABELS: Record<string, string> = {
    'bundle': 'Lot',
    'fixed_discount': '-Montant',
    'percentage': '-%',
    'special_price': 'Spécial',
};

export function CartShared({
    items,
    onUpdateQuantity,
    onRemoveItem,
    variant = 'mobile',
    showTotalReductions = false,
}: CartSharedProps) {
    const { formatPrice } = useCurrencyFormatter();
    const isMobile = variant === 'mobile';

    const totalReductions = items.reduce((sum, item) => sum + item.discount_amount, 0);

    if (items.length === 0) return null;

    return (
        <div className="space-y-2 pb-2">
            <AnimatePresence mode="popLayout">
                {items.map((item) => (
                    <motion.div
                        key={item.product.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, x: 20 }}
                        className="relative group mb-2"
                    >
                        <div className="flex items-stretch gap-2">
                            {/* MAIN CONTENT: Product + Qty (Bordured) */}
                            <div className="flex-1 p-1.5 flex items-center gap-2 bg-white rounded-2xl border-2 border-brand-primary shadow-sm overflow-hidden">
                                {/* 1. Thumbnail (Small) */}
                                <div className="w-9 h-9 rounded-xl bg-brand-subtle/50 flex items-center justify-center flex-shrink-0 border border-brand-primary/10">
                                    {item.product.image ? (
                                        <img
                                            src={item.product.image}
                                            className="w-6 h-6 object-contain mix-blend-multiply"
                                            alt=""
                                        />
                                    ) : (
                                        <Package size={14} className="text-brand-primary/30" />
                                    )}
                                </div>

                                {/* 2. Info (Middle) */}
                                <div className="flex-1 min-w-0 pr-1">
                                    <h3 className="font-black text-[10px] text-gray-900 uppercase tracking-tight truncate leading-tight">
                                        {item.product.name}
                                    </h3>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] font-black text-gray-900 font-mono leading-none">
                                            {formatPrice(item.total_price)}
                                        </span>
                                        <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                            {item.product.volume}
                                        </span>
                                    </div>
                                </div>

                                {/* 3. Controls (Compact Right) */}
                                <div className="flex items-center bg-gray-50 rounded-lg p-0.5 gap-1.5 border border-gray-100 ml-auto">
                                    <button
                                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                                        className="w-6 h-6 rounded-md bg-white border border-brand-subtle flex items-center justify-center text-brand-primary active:scale-90 transition-transform"
                                    >
                                        <Minus size={12} strokeWidth={3} />
                                    </button>

                                    <span className="text-[11px] font-black text-gray-900 font-mono w-4 text-center">
                                        {item.quantity}
                                    </span>

                                    <button
                                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                                        className="w-6 h-6 rounded-md bg-brand-primary flex items-center justify-center text-white active:scale-90 transition-transform shadow-sm"
                                        style={{ background: 'var(--brand-gradient)' }}
                                    >
                                        <Plus size={12} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>

                            {/* 4. Delete Button - ISOLATED (Outside Main Border) */}
                            <button
                                onClick={() => onRemoveItem(item.product.id)}
                                className="w-10 flex items-center justify-center bg-red-50 hover:bg-red-100 rounded-2xl border-2 border-transparent text-red-500 active:scale-90 transition-all flex-shrink-0"
                                aria-label="Supprimer"
                            >
                                <Trash2 size={18} strokeWidth={2.5} />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Total Reductions Badge */}
            <AnimatePresence>
                {showTotalReductions && totalReductions > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-emerald-50 rounded-lg p-1.5 border border-emerald-100 flex items-center justify-between"
                    >
                        <span className="font-black text-[8px] text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                            <Tag size={10} />
                            ÉCO
                        </span>
                        <span className="text-emerald-600 font-black text-[10px] font-mono">
                            -{formatPrice(totalReductions)}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

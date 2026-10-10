import { useState, useRef, useEffect } from 'react';
import { Plus, Minus, Trash2, Tag, Package } from 'lucide-react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { CalculatedItem } from '../../hooks/useCartLogic';
import { motion, AnimatePresence } from 'framer-motion';

interface QuantityControlProps {
    quantity: number;
    maxQty: number;
    isMaxReached: boolean;
    onUpdateQuantity: (quantity: number) => void;
    onRemove: () => void;
}

function QuantityControl({ quantity, maxQty, isMaxReached, onUpdateQuantity, onRemove }: QuantityControlProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const startEdit = () => {
        setDraft(String(quantity));
        setIsEditing(true);
    };

    const commit = () => {
        const parsed = parseInt(draft, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            const clamped = Math.min(parsed, maxQty);
            if (clamped !== quantity) onUpdateQuantity(clamped);
        } else if (draft.trim() === '' || parsed === 0) {
            onRemove();
        }
        setIsEditing(false);
    };

    const cancel = () => setIsEditing(false);

    return (
        // ⭐ Cibles de 40px (contre 24px avant, audit UI/UX du 10/10/2026) :
        // on ajuste une quantité d'un doigt, debout, dans un bar sombre.
        <div className="flex items-center bg-muted rounded-xl p-0.5 gap-1 border border-border ml-auto flex-shrink-0">
            <button
                onClick={() => onUpdateQuantity(quantity - 1)}
                className="w-10 h-10 rounded-lg bg-card border border-brand-subtle flex items-center justify-center text-brand-primary active:scale-90 transition-transform"
                aria-label="Diminuer la quantité"
            >
                <Minus size={16} strokeWidth={3} />
            </button>

            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
                    }}
                    className={`text-body-sm font-bold tabular-nums w-9 h-10 text-center bg-card border border-brand-primary rounded-lg outline-none ${isMaxReached ? 'text-orange-600' : 'text-foreground'}`}
                    aria-label="Quantité"
                />
            ) : (
                <button
                    type="button"
                    onClick={startEdit}
                    className={`text-body-sm font-bold tabular-nums w-9 h-10 text-center ${isMaxReached ? 'text-orange-600' : 'text-foreground'}`}
                    aria-label={`Modifier la quantité (actuellement ${quantity})`}
                >
                    {quantity}
                </button>
            )}

            <button
                onClick={() => !isMaxReached && onUpdateQuantity(quantity + 1)}
                disabled={isMaxReached}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-white transition-all shadow-sm ${isMaxReached
                    ? 'bg-gray-300 cursor-not-allowed opacity-50'
                    : 'bg-brand-primary active:scale-90'
                    }`}
                style={{ background: isMaxReached ? undefined : 'var(--brand-gradient)' }}
                aria-label="Augmenter la quantité"
            >
                <Plus size={16} strokeWidth={3} />
            </button>
        </div>
    );
}

interface CartSharedProps {
    items: CalculatedItem[];
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    showTotalReductions?: boolean;
    maxStockLookup?: (productId: string) => number; // 🛡️ Fix Force Sale
}

export function CartShared({
    items,
    onUpdateQuantity,
    onRemoveItem,
    showTotalReductions = false,
    maxStockLookup
}: CartSharedProps) {
    const { formatPrice } = useCurrencyFormatter();

    const totalReductions = items.reduce((sum, item) => sum + item.discount_amount, 0);

    if (items.length === 0) return null;

    return (
        <div className="space-y-2 pb-2">
            <AnimatePresence mode="popLayout">
                {items.map((item) => {
                    const maxQty = maxStockLookup ? maxStockLookup(item.product.id) : Infinity;
                    const isMaxReached = item.quantity >= maxQty;

                    return (
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
                                {/* ⭐ DEUX RANGÉES (revue du 10/10/2026, audit UI/UX).
                                    Sur une seule rangée, les boutons de 40px ne
                                    laissaient au nom que 77px sur un écran de 360px
                                    (« World Col… ») et le prix passait sur deux
                                    lignes (« 600 / FCFA »). Le nom prend désormais
                                    toute la largeur ; prix et quantité ont leur
                                    propre rangée. Minimum de texte : `text-micro`
                                    (11px), contre 6 à 8px avant. */}
                                <div className={`flex-1 min-w-0 p-2 flex flex-col gap-1.5 bg-card rounded-2xl border-2 ${isMaxReached ? 'border-orange-200' : 'border-brand-primary'} shadow-sm overflow-hidden transition-colors duration-300`}>
                                    {/* Rangée 1 : identité du produit */}
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 border border-brand-primary/10">
                                            {item.product.image ? (
                                                <img
                                                    src={item.product.image}
                                                    className="w-7 h-7 object-contain mix-blend-multiply"
                                                    alt=""
                                                />
                                            ) : (
                                                <Package size={14} className="text-brand-primary/30" />
                                            )}
                                        </div>
                                        <h3 className="flex-1 min-w-0 font-bold text-caption text-foreground truncate leading-tight">
                                            {item.product.name}
                                        </h3>
                                        {/* ⚠️ Le volume ne rétrécit jamais : c'est lui
                                            qui distingue un 33cl d'un 65cl. */}
                                        <span className="flex-shrink-0 text-micro text-muted-foreground uppercase">
                                            {item.product.volume}
                                        </span>
                                        {isMaxReached && (
                                            <span className="flex-shrink-0 bg-orange-100 text-orange-600 text-micro font-bold px-1 rounded uppercase">
                                                Max
                                            </span>
                                        )}
                                    </div>

                                    {/* Rangée 2 : prix de la ligne + quantité */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-body-sm font-bold text-foreground tabular-nums whitespace-nowrap">
                                            {formatPrice(item.total_price)}
                                        </span>
                                        <QuantityControl
                                            quantity={item.quantity}
                                            maxQty={maxQty}
                                            isMaxReached={isMaxReached}
                                            onUpdateQuantity={(q) => onUpdateQuantity(item.product.id, q)}
                                            onRemove={() => onRemoveItem(item.product.id)}
                                        />
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
                    );
                })}
            </AnimatePresence>

            {/* Total Reductions Badge */}
            <AnimatePresence>
                {showTotalReductions && totalReductions > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-emerald-50 rounded-lg p-1.5 border border-emerald-100 flex items-center justify-between"
                    >
                        <span className="font-black text-micro text-emerald-700 uppercase tracking-wider flex items-center gap-1">
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


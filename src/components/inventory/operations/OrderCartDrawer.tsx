import { X, Trash2, Download, MessageCircle, ShoppingCart, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrderItem } from '../../../hooks/useOrderCart';
import { OrderItemCard } from './OrderItemCard';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { EnhancedButton } from '../../EnhancedButton';
import { Button } from '../../ui/Button';

interface OrderCartDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    items: OrderItem[];
    calculations: {
        totalItems: number;
        totalLots: number;
        totalCost: number;
        totalUnits: number;
        averageCostPerUnit: number;
    };
    onUpdateItem: (productId: string, updates: Partial<OrderItem>) => void;
    onRemoveItem: (productId: string) => void;
    onClearCart: () => void;
    onExportExcel: () => void;
    onExportWhatsApp: () => void;
}

export function OrderCartDrawer({
    isOpen,
    onClose,
    items,
    calculations,
    onUpdateItem,
    onRemoveItem,
    onClearCart,
    onExportExcel,
    onExportWhatsApp
}: OrderCartDrawerProps) {
    const { formatPrice } = useCurrencyFormatter();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[999] lg:hidden"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white shadow-2xl z-[1000] flex flex-col lg:relative lg:w-full lg:shadow-none lg:border-l lg:border-gray-200"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-brand-primary/10 bg-brand-subtle/10">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-brand-primary text-white rounded-lg shadow-sm">
                                    <ShoppingCart size={18} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 leading-tight">Panier</h3>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-brand-primary opacity-70">Préparation Commande</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-brand-primary hover:bg-brand-subtle rounded-lg transition-all"
                                aria-label="Fermer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Summary */}
                        <div className="p-4 bg-gradient-to-br from-brand-bg-subtle to-white border-b border-brand-border">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="text-center">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Articles</p>
                                    <p className="text-xl font-black text-brand-primary">{calculations.totalItems}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Lots</p>
                                    <p className="text-xl font-black text-brand-primary">{calculations.totalLots}</p>
                                </div>
                                <div className="col-span-2 text-center pt-2 border-t border-brand-border">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Coût Total</p>
                                    <p className="text-2xl font-black text-gray-900">{formatPrice(calculations.totalCost)}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Moy: {formatPrice(calculations.averageCostPerUnit)}/unité
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {items.length === 0 ? (
                                <div className="text-center py-12 px-6">
                                    <div className="w-20 h-20 bg-brand-subtle/50 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                                        <Package size={40} className="text-brand-primary opacity-60" />
                                    </div>
                                    <h4 className="font-black text-gray-900 text-lg">Panier vide</h4>
                                    <p className="text-sm text-gray-500 mt-2 mb-8 mx-auto max-w-[200px]">Ajoutez des produits pour commencer votre préparation.</p>
                                    <Button
                                        onClick={onClose}
                                        variant="default"
                                        className="w-full rounded-2xl shadow-lg shadow-brand-primary/20"
                                    >
                                        Parcourir les produits
                                    </Button>
                                </div>
                            ) : (
                                items.map(item => (
                                    <OrderItemCard
                                        key={item.productId}
                                        item={item}
                                        onUpdate={(updates) => onUpdateItem(item.productId, updates)}
                                        onRemove={() => onRemoveItem(item.productId)}
                                    />
                                ))
                            )}
                        </div>

                        {/* Actions */}
                        {items.length > 0 && (
                            <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <EnhancedButton
                                        variant="success"
                                        size="sm"
                                        onClick={onExportExcel}
                                        icon={<Download size={16} />}
                                        className="text-xs !bg-[#1D6F42] hover:!bg-[#185c37] !text-white border-none shadow-md"
                                    >
                                        Excel
                                    </EnhancedButton>
                                    <EnhancedButton
                                        variant="success"
                                        size="sm"
                                        onClick={onExportWhatsApp}
                                        icon={<MessageCircle size={16} />}
                                        className="text-xs !bg-[#25D366] hover:!bg-[#128C7E] !text-white border-none shadow-md"
                                    >
                                        WhatsApp
                                    </EnhancedButton>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={onClose}
                                    className="w-full rounded-xl border-brand-primary/20 text-brand-primary hover:bg-brand-subtle/30 font-bold lg:hidden"
                                >
                                    Continuer ma sélection
                                </Button>
                                <button
                                    onClick={onClearCart}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors pt-2"
                                >
                                    <Trash2 size={14} />
                                    Vider le panier
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

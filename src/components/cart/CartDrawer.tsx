import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X } from 'lucide-react';
import { useState } from 'react';
import { CalculatedItem } from '../../hooks/useCartLogic';
import { CartShared } from './CartShared';
import { useViewport } from '../../hooks/useViewport';
import { SelectOption } from '../ui/Select';
import { PaymentMethod } from './PaymentMethodSelector';
import { CartFooter } from './CartFooter';

interface CartDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    items: CalculatedItem[];
    total: number;
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    onClear: () => void;
    onCheckout: (serverName?: string, paymentMethod?: PaymentMethod) => Promise<void>;
    isSimplifiedMode?: boolean;
    serverNames?: string[];
    currentServerName?: string;
    isLoading?: boolean;
}

export function CartDrawer({
    isOpen,
    onClose,
    items,
    total,
    onUpdateQuantity,
    onRemoveItem,
    onClear,
    onCheckout,
    isSimplifiedMode = false,
    serverNames = [],
    currentServerName,
    isLoading = false
}: CartDrawerProps) {
    const { isMobile } = useViewport();

    const [selectedServer, setSelectedServer] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

    const serverOptions: SelectOption[] = [
        { value: '', label: 'Sélectionner un serveur...' },
        ...(currentServerName ? [{ value: `Moi (${currentServerName})`, label: `Moi (${currentServerName})` }] : []),
        ...serverNames.map(name => ({ value: name, label: name }))
    ];

    const handleCheckout = async () => {
        if (isSimplifiedMode && !selectedServer) {
            alert('Veuillez sélectionner le serveur qui a effectué la vente');
            return;
        }
        await onCheckout(isSimplifiedMode ? selectedServer : undefined, paymentMethod);
        if (!isLoading) setSelectedServer('');
    };

    // --- ANIMATION VARIANTS ---
    const overlayVariants = {
        closed: { opacity: 0 },
        open: { opacity: 1 }
    };

    const drawerVariants = isMobile ? {
        // Mobile: Bottom Sheet
        closed: { y: "100%" },
        open: { y: 0 }
    } : {
        // Desktop: Right Side Panel
        closed: { x: "100%" },
        open: { x: 0 }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* OVERLAY */}
                    <motion.div
                        key="overlay"
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={overlayVariants}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                        onClick={onClose}
                    />

                    {/* DRAWER */}
                    <motion.div
                        key="drawer"
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={drawerVariants}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className={`
                            fixed z-50 bg-white shadow-2xl flex flex-col
                            ${isMobile
                                ? 'bottom-0 left-0 right-0 h-[85vh] rounded-t-3xl' // Mobile
                                : 'top-0 right-0 bottom-0 w-[450px]' // Desktop
                            }
                        `}
                    >
                        {/* --- HANDLE (Mobile Only) --- */}
                        {isMobile && (
                            <div className="w-full flex justify-center pt-3 pb-1" onClick={onClose}>
                                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                            </div>
                        )}

                        {/* --- HEADER --- */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <ShoppingCart className="text-amber-500" size={24} />
                                Panier
                                <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                                    {items.length}
                                </span>
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* --- CONTENT (Scrollable) --- */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <CartShared
                                items={items}
                                onUpdateQuantity={onUpdateQuantity}
                                onRemoveItem={onRemoveItem}
                                variant={isMobile ? 'mobile' : 'desktop'}
                                showTotalReductions={true}
                            />

                            {items.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                                        <ShoppingCart size={40} opacity={0.5} />
                                    </div>
                                    <p className="text-lg font-medium">Votre panier est vide</p>
                                    <button onClick={onClose} className="text-amber-500 font-bold hover:underline">
                                        Ajouter des produits
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* --- FOOTER (Actions) --- */}
                        {items.length > 0 && (
                            <div className="p-6 border-t border-gray-100 bg-gray-50/50 safe-pb">
                                <CartFooter
                                    total={total}
                                    isSimplifiedMode={isSimplifiedMode}
                                    serverOptions={serverOptions}
                                    selectedServer={selectedServer}
                                    onServerChange={setSelectedServer}
                                    paymentMethod={paymentMethod}
                                    onPaymentMethodChange={setPaymentMethod}
                                    onCheckout={handleCheckout}
                                    onClear={onClear}
                                    isLoading={isLoading}
                                    hasItems={items.length > 0}
                                    isMobile={isMobile}
                                />
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

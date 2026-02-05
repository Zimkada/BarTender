import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, ShoppingBag } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CalculatedItem } from '../../hooks/useCartLogic';
import { CartShared } from './CartShared';
import { useViewport } from '../../hooks/useViewport';
import { SelectOption } from '../ui/Select';
import { PaymentMethod } from './PaymentMethodSelector';
import { CartFooter } from './CartFooter';
import type { TicketWithSummary } from '../../hooks/queries/useTickets';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { formatTicketInfo } from '../../utils/formatTicketInfo';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { ServerMappingsService } from '../../services/supabase/server-mappings.service';

interface CartDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    items: CalculatedItem[];
    total: number;
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    onClear: () => void;
    onCheckout: (serverName?: string, paymentMethod?: PaymentMethod, ticketId?: string) => Promise<void>;
    isSimplifiedMode?: boolean;
    serverNames?: string[];
    currentServerName?: string;
    ticketsWithSummary?: TicketWithSummary[];
    onCreateBon?: (serverId: string | null, tableNumber?: number, customerName?: string) => Promise<string | null>;
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
    ticketsWithSummary = [],
    onCreateBon,
    isLoading = false
}: CartDrawerProps) {
    const { isMobile } = useViewport();
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();

    const [selectedServer, setSelectedServer] = useState<string>('');
    const [selectedBon, setSelectedBon] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [effectiveServerId, setEffectiveServerId] = useState<string | null>(null);

    // Résolution du serveur effectif : mode simplifié → résolution nom→UUID, mode complet → userId connecté
    useEffect(() => {
        if (!isSimplifiedMode) {
            setEffectiveServerId(currentSession?.userId || null);
            return;
        }
        if (!selectedServer) {
            setEffectiveServerId(null);
            return;
        }
        // "Moi (" = user connecté — court-circuit, pas de résolution via server_name_mappings
        if (selectedServer.startsWith('Moi (')) {
            setEffectiveServerId(currentSession?.userId || null);
            return;
        }
        ServerMappingsService.getUserIdForServerName(currentBar?.id || '', selectedServer)
            .then(id => setEffectiveServerId(id || null));
    }, [selectedServer, isSimplifiedMode, currentSession?.userId, currentBar?.id]);

    // Réinitialiser le bon sélectionné quand le serveur change
    useEffect(() => {
        setSelectedBon('');
    }, [effectiveServerId]);

    // Reset state when drawer closes to ensure clean slate on next open
    useEffect(() => {
        if (!isOpen) {
            setSelectedBon('');
            // Optional: reset selectedServer too if desired, but user specifically asked for bon reset.
            // Keeping selectedServer might be useful for repeated fast entry by same server.
            // But let's reset it to be safe and consistent with "clean slate".
            setSelectedServer('');
        }
    }, [isOpen]);

    const serverOptions: SelectOption[] = [
        { value: '', label: 'Sélectionner un serveur...' },
        ...(currentServerName ? [{ value: `Moi (${currentServerName})`, label: `Moi (${currentServerName})` }] : []),
        ...serverNames.map(name => ({ value: name, label: name }))
    ];

    // Filtrer les bons par serveur effectif — bons sans server_id (legacy) sont visibles à tous
    const filteredTickets = effectiveServerId
        ? ticketsWithSummary.filter(t => !t.serverId || t.serverId === effectiveServerId)
        : ticketsWithSummary;

    const bonOptions: SelectOption[] = [
        { value: '', label: 'Sans bon' },
        ...filteredTickets.map(t => {
            const ticketInfo = formatTicketInfo(t);
            return {
                value: t.id,
                label: `BON #${t.ticketNumber || '?'}${ticketInfo ? ` (${ticketInfo})` : ''} • ${t.productSummary} • ${formatPrice(t.totalAmount)}`
            };
        })
    ];

    const handleCreateBon = async (tableNumber?: number, customerName?: string) => {
        if (!onCreateBon) return;
        const newId = await onCreateBon(effectiveServerId, tableNumber, customerName);
        if (newId) setSelectedBon(newId);
    };

    const handleCheckout = async () => {
        if (isSimplifiedMode && !selectedServer) {
            alert('Veuillez sélectionner le serveur qui a effectué la vente');
            return;
        }
        await onCheckout(isSimplifiedMode ? selectedServer : undefined, paymentMethod, selectedBon || undefined);
        if (!isLoading) {
            setSelectedServer('');
            setSelectedBon('');
        }
    };

    const drawerVariants = isMobile ? {
        closed: { y: "100%", opacity: 0.5 },
        open: { y: 0, opacity: 1 }
    } : {
        closed: { x: "100%", opacity: 0.5 },
        open: { x: 0, opacity: 1 }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* OVERLAY GLASS */}
                    <motion.div
                        key="overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-brand-dark/20 backdrop-blur-md z-[100]"
                        onClick={onClose}
                    />

                    {/* DRAWER PREMIUM */}
                    <motion.div
                        key="drawer"
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={drawerVariants}
                        transition={{ type: "spring", damping: 30, stiffness: 400 }}
                        className={`
                            fixed z-[110] bg-white/95 backdrop-blur-2xl shadow-[0_-20px_80px_-20px_rgba(0,0,0,0.3)] flex flex-col
                            ${isMobile
                                ? 'bottom-0 left-0 right-0 h-[94vh] rounded-t-[3rem]' // Mobile
                                : 'top-0 right-0 bottom-0 w-[420px] rounded-l-[3rem]' // Desktop
                            }
                            border-l border-white/20
                        `}
                    >
                        {/* --- DRAG HANDLE (Mobile) --- */}
                        {isMobile && (
                            <div className="w-full flex justify-center pt-2 pb-1" onClick={onClose}>
                                <div className="w-12 h-1 bg-gray-200 rounded-full" />
                            </div>
                        )}

                        {/* --- HEADER VISION 2026 --- */}
                        <div className="flex items-center justify-between px-6 py-2 border-b border-gray-100/50">
                            <div className="flex flex-row items-center gap-2">
                                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 uppercase tracking-tighter">
                                    <ShoppingBag className="text-brand-primary" size={20} strokeWidth={2.5} />
                                    Panier
                                    <span className="ml-2 bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide uppercase">
                                        ({items.length} {items.length > 1 ? 'articles' : 'article'})
                                    </span>
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-600 hover:text-gray-900 rounded-full transition-all hover:rotate-90"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* --- CONTENT (Scrollable) --- */}
                        <div className="flex-1 overflow-y-auto px-6 py-2 scroll-smooth">
                            <CartShared
                                items={items}
                                onUpdateQuantity={onUpdateQuantity}
                                onRemoveItem={onRemoveItem}
                                variant={isMobile ? 'mobile' : 'desktop'}
                                showTotalReductions={true}
                            />

                            {items.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="h-full flex flex-col items-center justify-center text-gray-300 space-y-6 pb-20"
                                >
                                    <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center border border-gray-100 italic">
                                        <ShoppingCart size={48} strokeWidth={1} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-black text-gray-400 uppercase tracking-tighter">Votre panier est vide</p>
                                        <p className="text-xs font-medium text-gray-400 mt-2">Commencez par ajouter des boissons</p>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="px-6 py-3 bg-brand-subtle text-brand-primary rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand-primary hover:text-white transition-all active:scale-95"
                                    >
                                        Parcourir le catalogue
                                    </button>
                                </motion.div>
                            )}
                        </div>

                        {/* --- FOOTER STICKY GLASS --- */}
                        {items.length > 0 && (
                            <div className="p-6 bg-white/80 backdrop-blur-xl border-t border-gray-100 rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] safe-pb">
                                <CartFooter
                                    total={total}
                                    isSimplifiedMode={isSimplifiedMode}
                                    serverOptions={serverOptions}
                                    selectedServer={selectedServer}
                                    onServerChange={setSelectedServer}
                                    bonOptions={bonOptions}
                                    selectedBon={selectedBon}
                                    onBonChange={setSelectedBon}
                                    onCreateBon={handleCreateBon}
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

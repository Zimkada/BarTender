import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { usePurchaseOrder } from '../../hooks/queries/usePurchaseOrdersQueries';
import { usePurchaseOrdersMutations } from '../../hooks/mutations/usePurchaseOrdersMutations';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useFeedback } from '../../hooks/useFeedback';
import type { PurchaseOrderSummary } from '../../types';
import {
    Truck,
    Package,
    CheckCircle2,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface OrderReceptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: PurchaseOrderSummary;
    barId: string;
}

export function OrderReceptionModal({ isOpen, onClose, order, barId }: OrderReceptionModalProps) {
    const { currentSession } = useAuth();
    const { formatPrice } = useCurrencyFormatter();
    const { showSuccess, showError } = useFeedback();
    const { data: fullOrder, isLoading } = usePurchaseOrder(isOpen ? order.id : undefined);
    const { convertToSupplies } = usePurchaseOrdersMutations(barId);

    // receivedQty keyed by item id — reset when order changes
    const [receivedQty, setReceivedQty] = useState<Record<string, number>>({});
    const [expandedItems, setExpandedItems] = useState<string[]>([]);

    // Reset state when switching to a different order
    useEffect(() => {
        setReceivedQty({});
        setExpandedItems([]);
    }, [order.id]);

    // Pre-fill with ordered quantities when order loads or changes
    useEffect(() => {
        if (fullOrder && fullOrder.id === order.id) {
            const initial: Record<string, number> = {};
            fullOrder.items.forEach(item => {
                initial[item.id] = item.receivedQuantity ?? item.quantity;
            });
            setReceivedQty(initial);
        }
    }, [fullOrder, order.id]);

    const toggleExpand = (id: string) => {
        setExpandedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const totalReceived = fullOrder
        ? fullOrder.items.reduce((acc, item) => acc + (receivedQty[item.id] ?? 0), 0)
        : 0;

    const allFullyReceived = fullOrder?.items.every(
        item => (receivedQty[item.id] ?? 0) >= item.quantity
    );

    const hasAnythingToReceive = totalReceived > 0;

    const handleConfirm = async () => {
        if (!fullOrder || !currentSession) return;

        const receivedItems = fullOrder.items.map(item => ({
            itemId: item.id,
            receivedQuantity: receivedQty[item.id] ?? 0,
        }));

        try {
            const result = await convertToSupplies.mutateAsync({
                orderId: order.id,
                userId: currentSession.userId,
                receivedItems,
            });

            const label = result.status === 'received' ? 'entièrement réceptionnée' : 'partiellement réceptionnée';
            showSuccess(`Commande ${label} — ${result.suppliesCreated} approvisionnement(s) créé(s).`);
            onClose();
        } catch {
            showError('Erreur lors de la réception. Veuillez réessayer.');
        }
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Réceptionner la livraison"
            description={`Commande du ${order.createdAt.toLocaleDateString('fr-FR')}`}
            icon={<Truck className="text-indigo-600" size={24} />}
            headerClassName="bg-indigo-50/50"
            size="lg"
        >
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                    <Spinner size="lg" />
                    <p className="text-sm text-muted-foreground">Chargement de la commande…</p>
                </div>
            ) : !fullOrder ? (
                <div className="p-4 text-center text-muted-foreground">Commande introuvable.</div>
            ) : (
                <div className="space-y-4">
                    {/* Info banner */}
                    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                        <p>Saisissez les quantités réellement reçues. Le stock et la comptabilité seront mis à jour automatiquement.</p>
                    </div>

                    {/* Items list */}
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        {fullOrder.items.map(item => {
                            const qty = receivedQty[item.id] ?? 0;
                            const isPartial = qty > 0 && qty < item.quantity;
                            const isFull = qty >= item.quantity;
                            const isMissing = qty === 0;
                            const isExpanded = expandedItems.includes(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        'rounded-xl border p-3 transition-all',
                                        isFull && 'border-green-200 bg-green-50/50',
                                        isPartial && 'border-amber-200 bg-amber-50/50',
                                        isMissing && 'border-border bg-card',
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Status icon */}
                                        <div className={cn(
                                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                                            isFull && 'bg-green-100',
                                            isPartial && 'bg-amber-100',
                                            isMissing && 'bg-muted',
                                        )}>
                                            {isFull
                                                ? <CheckCircle2 size={16} className="text-green-600" />
                                                : isPartial
                                                    ? <AlertTriangle size={16} className="text-amber-500" />
                                                    : <Package size={16} className="text-muted-foreground" />
                                            }
                                        </div>

                                        {/* Product info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-foreground text-sm truncate">{item.productName}</p>
                                            <p className="text-xs text-muted-foreground">{item.productVolume}</p>
                                        </div>

                                        {/* Qty comparison */}
                                        <div className="text-right mr-2 hidden sm:block">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Commandé</p>
                                            <p className="text-sm font-black text-foreground/80">{item.quantity}</p>
                                        </div>

                                        {/* Input received qty */}
                                        <div className="flex flex-col items-center">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Reçu</p>
                                            <input
                                                type="number"
                                                min={0}
                                                max={item.quantity * 2}
                                                value={qty}
                                                onChange={e => setReceivedQty(prev => ({
                                                    ...prev,
                                                    [item.id]: Math.max(0, parseInt(e.target.value) || 0),
                                                }))}
                                                className={cn(
                                                    'w-20 px-2 py-1.5 text-center font-black text-base rounded-lg border outline-none focus:ring-2',
                                                    isFull && 'border-green-300 bg-green-50 text-green-800 focus:ring-green-200',
                                                    isPartial && 'border-amber-300 bg-amber-50 text-amber-800 focus:ring-amber-200',
                                                    isMissing && 'border-border bg-muted text-foreground/80 focus:ring-brand-primary/20',
                                                )}
                                            />
                                        </div>

                                        {/* Expand toggle for details */}
                                        <button
                                            onClick={() => toggleExpand(item.id)}
                                            className="p-1 text-muted-foreground hover:text-foreground/70"
                                        >
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                    </div>

                                    {/* Expanded details */}
                                    {isExpanded && (
                                        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                            <div>
                                                <p className="uppercase font-bold text-muted-foreground">Lot / Condit.</p>
                                                <p className="font-bold text-foreground/80">{item.lotSize} unités</p>
                                            </div>
                                            <div>
                                                <p className="uppercase font-bold text-muted-foreground">Prix / Lot</p>
                                                <p className="font-bold text-foreground/80">{formatPrice(item.lotPrice)}</p>
                                            </div>
                                            {item.supplierName && (
                                                <div>
                                                    <p className="uppercase font-bold text-muted-foreground">Fournisseur</p>
                                                    <p className="font-bold text-foreground/80">{item.supplierName}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold">Total reçu</p>
                            <p className="text-lg font-black text-foreground">{totalReceived} unités</p>
                            {!allFullyReceived && totalReceived > 0 && (
                                <p className="text-xs text-amber-600 font-medium mt-0.5">Livraison partielle</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={onClose} disabled={convertToSupplies.isPending}>
                                Annuler
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={!hasAnythingToReceive || convertToSupplies.isPending}
                                className="gap-2 text-white"
                                style={{ backgroundColor: '#6366F1', backgroundImage: 'none' }}
                            >
                                <Truck size={16} />
                                {convertToSupplies.isPending
                                    ? 'Réception en cours…'
                                    : allFullyReceived
                                        ? 'Confirmer la réception'
                                        : 'Réception partielle'
                                }
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}

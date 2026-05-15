import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePurchaseOrders } from '../../hooks/queries/usePurchaseOrdersQueries';
import { usePurchaseOrdersMutations } from '../../hooks/mutations/usePurchaseOrdersMutations';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useFeedback } from '../../hooks/useFeedback';
import { useAuth } from '../../context/AuthContext';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { OrderReceptionModal } from './OrderReceptionModal';
import { OrderPreparation } from './operations/OrderPreparation';
import { OrderFinalization } from './operations/OrderFinalization';
import { BackButton } from '../ui/BackButton';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import type { PurchaseOrderSummary, PurchaseOrderStatus } from '../../types';
import {
    ClipboardList,
    Truck,
    CheckCircle2,
    Clock,
    XCircle,
    PackageCheck,
    PackageSearch,
    ChevronRight,
    Plus,
    Ban,
    RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_CONFIG: Record<PurchaseOrderStatus, {
    label: string;
    icon: React.ReactNode;
    badge: string;
}> = {
    draft: {
        label: 'Brouillon',
        icon: <Clock size={14} className="text-muted-foreground" />,
        badge: 'bg-muted text-foreground/70 border-border',
    },
    ordered: {
        label: 'En attente',
        icon: <Truck size={14} className="text-amber-500" />,
        badge: 'bg-amber-100 text-amber-700 border-amber-200',
    },
    partially_received: {
        label: 'Partielle',
        icon: <PackageSearch size={14} className="text-blue-500" />,
        badge: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    received: {
        label: 'Réceptionné',
        icon: <PackageCheck size={14} className="text-green-500" />,
        badge: 'bg-green-100 text-green-700 border-green-200',
    },
    cancelled: {
        label: 'Annulée',
        icon: <XCircle size={14} className="text-red-400" />,
        badge: 'bg-red-50 text-red-500 border-red-100',
    },
};

type FilterMode = 'active' | 'history';
type CreationMode = 'list' | 'prep' | 'finalize';

interface PurchaseOrdersTabProps {
    barId: string;
}

export function PurchaseOrdersTab({ barId }: PurchaseOrdersTabProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const { showSuccess, showError } = useFeedback();
    const { data: orders, isLoading, refetch } = usePurchaseOrders(barId);
    const { cancelOrder, markAsOrdered } = usePurchaseOrdersMutations(barId);

    const canManage = currentSession?.role === 'promoteur'
        || currentSession?.role === 'gerant'
        || currentSession?.role === 'super_admin';

    const [filterMode, setFilterMode] = useState<FilterMode>('active');
    const [creationMode, setCreationMode] = useState<CreationMode>('list');
    const [orderToCancel, setOrderToCancel] = useState<PurchaseOrderSummary | null>(null);
    const [orderToReceive, setOrderToReceive] = useState<PurchaseOrderSummary | null>(null);

    const handleNewOrder = () => setCreationMode('prep');
    const handleBackToList = () => setCreationMode('list');

    const activeOrders = orders?.filter(o =>
        o.status === 'draft' || o.status === 'ordered' || o.status === 'partially_received'
    ) ?? [];

    const historyOrders = orders?.filter(o =>
        o.status === 'received' || o.status === 'cancelled'
    ) ?? [];

    const displayed = filterMode === 'active' ? activeOrders : historyOrders;

    const handleMarkOrdered = async (order: PurchaseOrderSummary) => {
        try {
            await markAsOrdered.mutateAsync(order.id);
            showSuccess('Commande marquée comme envoyée au fournisseur.');
        } catch {
            showError('Impossible de mettre à jour la commande.');
        }
    };

    const handleConfirmCancel = async () => {
        if (!orderToCancel) return;
        try {
            await cancelOrder.mutateAsync(orderToCancel.id);
            showSuccess('Commande annulée.');
        } catch {
            showError('Impossible d\'annuler la commande.');
        } finally {
            setOrderToCancel(null);
        }
    };

    // Mode création de commande — affiché à la place de la liste
    if (creationMode === 'prep') {
        return (
            <OrderPreparation
                onBack={handleBackToList}
                onGoToFinalization={() => setCreationMode('finalize')}
            />
        );
    }

    if (creationMode === 'finalize') {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <BackButton onClick={() => setCreationMode('prep')} />
                    <h2 className="text-h3 text-foreground">Finalisation commande</h2>
                </div>
                <OrderFinalization onOrderSaved={handleBackToList} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toolbar : filter tabs (ligne 1 mobile) + actions (ligne 2 mobile) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {/* Filter tabs (segmented control) */}
                <div
                    role="radiogroup"
                    aria-label="Filtrer les commandes"
                    className="flex flex-1 p-0.5 bg-muted rounded-full border border-border"
                >
                    <button
                        role="radio"
                        aria-checked={filterMode === 'active'}
                        onClick={() => setFilterMode('active')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-caption whitespace-nowrap transition-all',
                            filterMode === 'active'
                                ? 'bg-card text-brand-primary shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground font-medium',
                        )}
                    >
                        En cours
                        {activeOrders.length > 0 && (
                            <span className={cn(
                                'px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
                                filterMode === 'active' ? 'bg-brand-subtle text-brand-primary' : 'bg-border text-foreground/70',
                            )}>
                                {activeOrders.length}
                            </span>
                        )}
                    </button>
                    <button
                        role="radio"
                        aria-checked={filterMode === 'history'}
                        onClick={() => setFilterMode('history')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-caption whitespace-nowrap transition-all',
                            filterMode === 'history'
                                ? 'bg-card text-brand-primary shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground font-medium',
                        )}
                    >
                        Historique
                    </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:flex-shrink-0">
                    <button
                        onClick={() => refetch()}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors flex-shrink-0"
                        aria-label="Actualiser"
                        title="Actualiser"
                    >
                        <RefreshCw size={16} />
                    </button>
                    {canManage && (
                        <Button
                            size="sm"
                            onClick={handleNewOrder}
                            data-guide="inventory-new-order-btn"
                            className="gap-1.5 flex-1 sm:flex-initial"
                        >
                            <Plus size={16} />
                            Nouvelle commande
                        </Button>
                    )}
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <Spinner size="lg" />
                    <p className="text-sm text-muted-foreground">Chargement des commandes…</p>
                </div>
            ) : displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card rounded-2xl border border-dashed border-border">
                    <ClipboardList size={48} className="mb-3 opacity-20" />
                    <p className="text-body font-medium">
                        {filterMode === 'active'
                            ? 'Aucune commande en cours'
                            : 'Aucun historique'}
                    </p>
                    {filterMode === 'active' && canManage && (
                        <button
                            onClick={handleNewOrder}
                            className="mt-4 text-body-sm text-brand-primary hover:text-brand-dark font-semibold underline underline-offset-2"
                        >
                            Créer une commande
                        </button>
                    )}
                </div>
            ) : (
                <AnimatePresence mode="popLayout">
                    <div className="space-y-3">
                        {displayed.map(order => {
                            const cfg = STATUS_CONFIG[order.status];
                            // RPC convert_purchase_order_to_supplies n'accepte que 'draft' | 'ordered'
                            const canReceive = canManage && order.status === 'ordered';
                            const canSendToSupplier = canManage && order.status === 'draft';
                            const canCancel = canManage && (order.status === 'draft' || order.status === 'ordered');

                            return (
                                <motion.div
                                    key={order.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
                                >
                                    {/* Card header */}
                                    <div className="p-4 flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-brand-subtle flex items-center justify-center shrink-0">
                                            <ClipboardList size={20} className="text-brand-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={cn(
                                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold border',
                                                    cfg.badge,
                                                )}>
                                                    {cfg.icon}
                                                    {cfg.label}
                                                </span>
                                                <span className="text-caption text-muted-foreground">
                                                    {format(order.createdAt, "d MMM yyyy", { locale: fr })}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                                                <span className="text-body font-semibold text-foreground tabular-nums">
                                                    {formatPrice(order.totalCost)}
                                                </span>
                                                <span className="text-caption text-muted-foreground">
                                                    {order.itemsCount} produit{order.itemsCount > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            {order.notes && (
                                                <p className="text-caption text-muted-foreground italic mt-1 truncate">
                                                    {order.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {(canReceive || canSendToSupplier || canCancel) && (
                                        <div className="border-t border-border px-4 py-2 flex items-center gap-2 flex-wrap">
                                            {canReceive && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => setOrderToReceive(order)}
                                                    className="gap-1.5"
                                                >
                                                    <Truck size={14} />
                                                    Réceptionner
                                                </Button>
                                            )}
                                            {canSendToSupplier && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleMarkOrdered(order)}
                                                    disabled={markAsOrdered.isPending}
                                                    className="gap-1.5 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                                >
                                                    <CheckCircle2 size={14} />
                                                    Marquer comme envoyée
                                                </Button>
                                            )}
                                            {canCancel && (
                                                <button
                                                    onClick={() => setOrderToCancel(order)}
                                                    className="ml-auto flex items-center gap-1 text-caption text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-2 py-1 rounded-lg transition-all"
                                                >
                                                    <Ban size={12} />
                                                    Annuler
                                                </button>
                                            )}
                                            {order.status === 'received' && (
                                                <span className="flex items-center gap-1 text-caption text-green-600 dark:text-green-400 font-medium">
                                                    <CheckCircle2 size={14} />
                                                    Réceptionné le {order.receivedAt
                                                        ? format(order.receivedAt, "d MMM", { locale: fr })
                                                        : '—'
                                                    }
                                                </span>
                                            )}
                                            {order.status !== 'received' && order.status !== 'cancelled' && order.status !== 'draft' && (
                                                <span className="ml-auto flex items-center gap-1 text-caption text-muted-foreground">
                                                    <ChevronRight size={14} />
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </AnimatePresence>
            )}

            {/* Cancel confirmation */}
            <ConfirmationModal
                isOpen={!!orderToCancel}
                onClose={() => setOrderToCancel(null)}
                onConfirm={handleConfirmCancel}
                title="Annuler la commande"
                message="Cette commande sera marquée comme annulée. Le stock ne sera pas modifié. Cette action est irréversible."
                confirmLabel={cancelOrder.isPending ? 'Annulation…' : 'Confirmer l\'annulation'}
                cancelLabel="Garder"
                isDestructive
                isLoading={cancelOrder.isPending}
            />

            {/* Reception modal */}
            {orderToReceive && (
                <OrderReceptionModal
                    isOpen={!!orderToReceive}
                    onClose={() => setOrderToReceive(null)}
                    order={orderToReceive}
                    barId={barId}
                />
            )}
        </div>
    );
}

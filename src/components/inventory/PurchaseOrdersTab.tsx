import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePurchaseOrders } from '../../hooks/queries/usePurchaseOrdersQueries';
import { usePurchaseOrdersMutations } from '../../hooks/mutations/usePurchaseOrdersMutations';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useFeedback } from '../../hooks/useFeedback';
import { useAuth } from '../../context/AuthContext';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { OrderReceptionModal } from './OrderReceptionModal';
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
        icon: <Clock size={14} className="text-gray-500" />,
        badge: 'bg-gray-100 text-gray-600 border-gray-200',
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

interface PurchaseOrdersTabProps {
    barId: string;
    onNewOrder: () => void;
}

export function PurchaseOrdersTab({ barId, onNewOrder }: PurchaseOrdersTabProps) {
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const { showSuccess, showError } = useFeedback();
    const { data: orders, isLoading, refetch } = usePurchaseOrders(barId);
    const { cancelOrder, markAsOrdered } = usePurchaseOrdersMutations(barId);

    const canManage = currentSession?.role === 'promoteur'
        || currentSession?.role === 'gerant'
        || currentSession?.role === 'super_admin';

    const [filterMode, setFilterMode] = useState<FilterMode>('active');
    const [orderToCancel, setOrderToCancel] = useState<PurchaseOrderSummary | null>(null);
    const [orderToReceive, setOrderToReceive] = useState<PurchaseOrderSummary | null>(null);

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

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-base font-black text-gray-900">Bons de commande</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {activeOrders.length > 0
                            ? `${activeOrders.length} commande(s) en cours`
                            : 'Aucune commande en cours'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                        title="Actualiser"
                    >
                        <RefreshCw size={16} />
                    </button>
                    {canManage && (
                        <Button
                            size="sm"
                            onClick={onNewOrder}
                            className="gap-1.5 text-white font-bold"
                            style={{ backgroundColor: '#6366F1', backgroundImage: 'none' }}
                        >
                            <Plus size={16} />
                            Nouvelle commande
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex p-1 bg-gray-100/80 rounded-xl">
                <button
                    onClick={() => setFilterMode('active')}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        filterMode === 'active'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700',
                    )}
                >
                    En cours
                    {activeOrders.length > 0 && (
                        <span className={cn(
                            'px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase',
                            filterMode === 'active' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600',
                        )}>
                            {activeOrders.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setFilterMode('history')}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        filterMode === 'history'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700',
                    )}
                >
                    Historique
                </button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <Spinner size="lg" />
                    <p className="text-sm text-gray-400">Chargement des commandes…</p>
                </div>
            ) : displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                    <ClipboardList size={48} className="mb-3 opacity-20" />
                    <p className="font-medium">
                        {filterMode === 'active'
                            ? 'Aucune commande en cours'
                            : 'Aucun historique'}
                    </p>
                    {filterMode === 'active' && canManage && (
                        <button
                            onClick={onNewOrder}
                            className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-bold underline underline-offset-2"
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
                            const canReceive = canManage && (order.status === 'ordered' || order.status === 'partially_received');
                            const canSendToSupplier = canManage && order.status === 'draft';
                            const canCancel = canManage && (order.status === 'draft' || order.status === 'ordered');

                            return (
                                <motion.div
                                    key={order.id}
                                    layout
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                                >
                                    {/* Card header */}
                                    <div className="p-4 flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                            <ClipboardList size={20} className="text-indigo-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={cn(
                                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border',
                                                    cfg.badge,
                                                )}>
                                                    {cfg.icon}
                                                    {cfg.label}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {format(order.createdAt, "d MMM yyyy", { locale: fr })}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                                                <span className="text-base font-black text-gray-900">
                                                    {formatPrice(order.totalCost)}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {order.itemsCount} produit{order.itemsCount > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            {order.notes && (
                                                <p className="text-xs text-gray-400 italic mt-1 truncate">
                                                    {order.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {(canReceive || canSendToSupplier || canCancel) && (
                                        <div className="border-t border-gray-50 px-4 py-2 flex items-center gap-2 flex-wrap">
                                            {canReceive && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => setOrderToReceive(order)}
                                                    className="gap-1.5 text-white font-bold"
                                                    style={{ backgroundColor: '#6366F1', backgroundImage: 'none' }}
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
                                                    className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                                                >
                                                    <CheckCircle2 size={14} />
                                                    Marquer comme envoyée
                                                </Button>
                                            )}
                                            {canCancel && (
                                                <button
                                                    onClick={() => setOrderToCancel(order)}
                                                    className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-all"
                                                >
                                                    <Ban size={12} />
                                                    Annuler
                                                </button>
                                            )}
                                            {order.status === 'received' && (
                                                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                                    <CheckCircle2 size={14} />
                                                    Réceptionné le {order.receivedAt
                                                        ? format(order.receivedAt, "d MMM", { locale: fr })
                                                        : '—'
                                                    }
                                                </span>
                                            )}
                                            {order.status !== 'received' && order.status !== 'cancelled' && order.status !== 'draft' && (
                                                <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
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

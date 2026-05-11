import { useState, useMemo } from 'react';
import { User, Check, X, ChevronUp, ChevronDown, CheckCircle2, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sale, SaleItem, User as UserType } from '../../../types';
import { EnhancedButton } from '../../EnhancedButton';

interface DashboardOrdersProps {
    sales: Sale[];
    users: UserType[];
    onValidate: (saleId: string) => void;
    onReject: (saleId: string) => void;
    onValidateAll: (salesToValidate: Sale[]) => void;
    isServerRole: boolean;
    currentUserId: string;
    formatPrice: (amount: number) => string;
    processingId?: string | null;
}

export function DashboardOrders({
    sales,
    users,
    onValidate,
    onReject,
    onValidateAll,
    isServerRole,
    currentUserId,
    formatPrice,
    processingId
}: DashboardOrdersProps) {
    const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());
    const showBulkValidation = !isServerRole;

    // Helper pour vérifier si une vente est récente (< 10 minutes)
    const isSaleRecent = (createdAt: Date): boolean => {
        const TEN_MINUTES_MS = 10 * 60 * 1000;
        const now = new Date().getTime();
        const saleTime = new Date(createdAt).getTime();
        return (now - saleTime) < TEN_MINUTES_MS;
    };

    // Déterminer si un serveur peut annuler une vente spécifique
    const canServerCancel = (sale: Sale): boolean => {
        if (!isServerRole) return false;
        return sale.soldBy === currentUserId && isSaleRecent(new Date(sale.createdAt));
    };

    const toggleExpanded = (saleId: string) => {
        setExpandedSales((prev: Set<string>) => {
            const newSet = new Set(prev);
            if (newSet.has(saleId)) {
                newSet.delete(saleId);
            } else {
                newSet.add(saleId);
            }
            return newSet;
        });
    };

    const salesByServer = useMemo(() => {
        return sales.reduce((acc, sale) => {
            const serverId = sale.soldBy;
            if (!acc[serverId]) acc[serverId] = [];
            acc[serverId].push(sale);
            return acc;
        }, {} as Record<string, Sale[]>);
    }, [sales]);

    const sortedServerIds = Object.keys(salesByServer).sort((a, b) => {
        const userA = users.find(u => u.id === a)?.name || '';
        const userB = users.find(u => u.id === b)?.name || '';
        return userA.localeCompare(userB);
    });

    if (sales.length === 0) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} strokeWidth={1.5} />
                </div>
                <h3 className="text-h3 text-gray-900 mb-2">Tout est à jour</h3>
                <p className="text-body-sm text-gray-500 max-w-sm mx-auto">
                    Aucune vente en attente. Votre flux de service est parfaitement synchronisé.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm" data-guide="pending-sales">
            {/* Header — titre + compteur + bulk action */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h3 className="text-h3 text-gray-900">Commandes en attente</h3>
                    <p className="text-body-sm text-gray-500 mt-0.5 tabular-nums">
                        {sales.length} transaction{sales.length > 1 ? 's' : ''} à valider
                    </p>
                </div>

                {showBulkValidation && (
                    <EnhancedButton
                        onClick={() => onValidateAll(sales)}
                        size="sm"
                        variant="secondary"
                        icon={<CheckCheck size={16} />}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 hover:border-brand-primary hover:bg-brand-subtle hover:text-brand-primary text-body-sm font-semibold transition-colors whitespace-nowrap"
                    >
                        Tout valider ({sales.length})
                    </EnhancedButton>
                )}
            </div>

            {/* Liste des ventes groupées par serveur */}
            <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 scrollbar-premium">
                {sortedServerIds.map(serverId => {
                    const serverSales = salesByServer[serverId];
                    const server = users.find(u => u.id === serverId);

                    return (
                        <div key={serverId}>
                            {/* En-tête serveur — sticky */}
                            <div className="flex justify-between items-center mb-3 sticky top-0 z-20 bg-white py-2 -mx-1 px-1">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white">
                                        <User size={14} />
                                    </div>
                                    <h4 className="text-body-sm font-semibold text-gray-900">
                                        {server?.name || 'Collaborateur inconnu'}
                                    </h4>
                                    <span className="text-caption text-gray-400 tabular-nums">
                                        {serverSales.length}
                                    </span>
                                </div>
                                {showBulkValidation && (
                                    <button
                                        onClick={() => onValidateAll(serverSales)}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand-primary hover:bg-brand-subtle hover:text-brand-primary text-caption font-medium transition-colors whitespace-nowrap"
                                    >
                                        Valider lot ({serverSales.length})
                                    </button>
                                )}
                            </div>

                            {/* Cards individuelles */}
                            <div className="space-y-2 pl-3 border-l-2 border-gray-100 ml-3">
                                {serverSales.map((sale, idx) => {
                                    const isExpanded = expandedSales.has(sale.id);
                                    const totalItems = sale.items_count ?? sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
                                    const canCancel = !isServerRole || canServerCancel(sale);
                                    const canValidate = !isServerRole;

                                    return (
                                        <motion.div
                                            key={sale.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.15, delay: idx * 0.03 }}
                                            className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all overflow-hidden"
                                        >
                                            <div className="p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    {/* Info bloc — heure + prix + détails */}
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="flex flex-col flex-shrink-0">
                                                            <span className="text-micro text-gray-400 leading-none mb-1 tabular-nums">
                                                                {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <p className="text-body font-semibold text-gray-900 tabular-nums leading-none">
                                                                {formatPrice(sale.total).replace(/[\s]?FCFA/g, '')}
                                                            </p>
                                                        </div>

                                                        <button
                                                            onClick={() => toggleExpanded(sale.id)}
                                                            className="flex items-center gap-1.5 text-caption font-medium text-gray-700 hover:text-brand-primary transition-colors px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-brand-subtle"
                                                        >
                                                            <span>Détails ({totalItems})</span>
                                                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                        </button>
                                                    </div>

                                                    {/* Actions — boutons cercles */}
                                                    {(canValidate || canCancel) && (
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {canValidate && (
                                                                <EnhancedButton
                                                                    onClick={() => onValidate(sale.id)}
                                                                    variant="success"
                                                                    size="sm"
                                                                    className="w-9 h-9 !p-0 rounded-full shadow-sm active:scale-90 transition-transform flex items-center justify-center"
                                                                    loading={processingId === sale.id}
                                                                    disabled={!!processingId}
                                                                    icon={<Check size={16} strokeWidth={2.5} />}
                                                                    aria-label="Valider la vente"
                                                                >
                                                                    {''}
                                                                </EnhancedButton>
                                                            )}
                                                            {canCancel && (
                                                                <EnhancedButton
                                                                    onClick={() => onReject(sale.id)}
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    className="w-9 h-9 !p-0 bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white active:scale-90 transition-all flex items-center justify-center border border-red-100"
                                                                    loading={processingId === sale.id}
                                                                    disabled={!!processingId}
                                                                    icon={<X size={16} strokeWidth={2.5} />}
                                                                    aria-label="Annuler la vente"
                                                                >
                                                                    {''}
                                                                </EnhancedButton>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                                        className="border-t border-gray-100 bg-gray-50/50"
                                                    >
                                                        <div className="p-3 space-y-2">
                                                            <p className="text-micro text-gray-500">
                                                                Articles ({sale.items.length})
                                                            </p>
                                                            <div className="space-y-1.5">
                                                                {sale.items.map((item: SaleItem, index: number) => (
                                                                    <div key={index} className="flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <span className="w-6 h-6 flex items-center justify-center bg-white rounded-md text-caption font-semibold text-brand-primary border border-gray-200 tabular-nums flex-shrink-0">
                                                                                {item.quantity}
                                                                            </span>
                                                                            <span className="text-caption font-medium text-gray-800 truncate">
                                                                                {item.product_name}
                                                                            </span>
                                                                            {item.product_volume && (
                                                                                <span className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded flex-shrink-0">
                                                                                    {item.product_volume}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-caption font-semibold text-gray-900 tabular-nums flex-shrink-0">
                                                                            {formatPrice(item.total_price)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div >
        </div >
    );
}

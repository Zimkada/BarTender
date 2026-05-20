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
            <div className="bg-card rounded-2xl p-12 text-center border border-border shadow-sm">
                <div className="w-16 h-16 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} strokeWidth={1.5} />
                </div>
                <h3 className="text-h3 text-foreground mb-2">Tout est à jour</h3>
                <p className="text-body-sm text-muted-foreground max-w-sm mx-auto">
                    Aucune vente en attente. Votre flux de service est parfaitement synchronisé.
                </p>
            </div>
        );
    }

    // Affiche "Tout valider" uniquement s'il y a plusieurs serveurs (sinon "Valider lot" suffit)
    const showTopValidateAll = showBulkValidation && sortedServerIds.length > 1;

    return (
        <div className="bg-card rounded-2xl p-5 sm:p-6 border border-border shadow-sm" data-guide="pending-sales">
            {/* Header — titre + compteur + bulk action (seulement si plusieurs serveurs) */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h3 className="text-h3 text-foreground">Commandes en attente</h3>
                    <p className="text-body-sm text-muted-foreground mt-0.5 tabular-nums">
                        {sales.length} transaction{sales.length > 1 ? 's' : ''} à valider
                    </p>
                </div>

                {showTopValidateAll && (
                    <EnhancedButton
                        onClick={() => onValidateAll(sales)}
                        size="sm"
                        variant="secondary"
                        icon={<CheckCheck size={16} />}
                        className="text-body-sm font-semibold whitespace-nowrap"
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
                            <div className="flex justify-between items-center gap-2 mb-3 sticky top-0 z-20 bg-card py-2 -mx-1 px-1">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-background flex-shrink-0">
                                        <User size={14} />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-body-sm font-semibold text-foreground truncate">
                                            {server?.name || 'Collaborateur inconnu'}
                                        </h4>
                                        <p className="text-caption text-muted-foreground tabular-nums">
                                            {serverSales.length} commande{serverSales.length > 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                                {showBulkValidation && (
                                    <button
                                        onClick={() => onValidateAll(serverSales)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground/80 hover:border-brand-primary hover:bg-brand-subtle hover:text-brand-primary text-caption font-medium transition-colors whitespace-nowrap flex-shrink-0"
                                    >
                                        <CheckCheck size={14} />
                                        Valider lot ({serverSales.length})
                                    </button>
                                )}
                            </div>

                            {/* Cards individuelles */}
                            <div className="space-y-2 pl-3 border-l-2 border-border ml-3">
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
                                            className="bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all overflow-hidden"
                                        >
                                            <div className="p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    {/* Bloc info : prix dominant + heure secondaire */}
                                                    <div className="flex-1 min-w-0 flex flex-col items-start">
                                                        <span className="text-h3 font-semibold text-foreground tabular-nums leading-tight">
                                                            {formatPrice(sale.total)}
                                                        </span>
                                                        <span className="text-caption text-muted-foreground mt-0.5 tabular-nums">
                                                            {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>

                                                    {/* Actions — boutons cercles 44×44 (touch target a11y) */}
                                                    {(canValidate || canCancel) && (
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {canValidate && (
                                                                <EnhancedButton
                                                                    onClick={() => onValidate(sale.id)}
                                                                    variant="success"
                                                                    size="sm"
                                                                    className="w-11 h-11 !p-0 rounded-full shadow-sm active:scale-90 transition-transform flex items-center justify-center"
                                                                    loading={processingId === sale.id}
                                                                    disabled={!!processingId}
                                                                    icon={<Check size={18} strokeWidth={2.5} />}
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
                                                                    className="w-11 h-11 !p-0 bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 rounded-full hover:bg-red-500 hover:text-white active:scale-90 transition-all flex items-center justify-center border border-red-100 dark:border-red-900/40"
                                                                    loading={processingId === sale.id}
                                                                    disabled={!!processingId}
                                                                    icon={<X size={18} strokeWidth={2.5} />}
                                                                    aria-label="Annuler la vente"
                                                                >
                                                                    {''}
                                                                </EnhancedButton>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Bouton "Voir détails" — explicite + bien visible */}
                                                <button
                                                    onClick={() => toggleExpanded(sale.id)}
                                                    className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-brand-subtle text-caption font-medium text-foreground/80 hover:text-brand-primary border border-border hover:border-brand-primary/40 transition-colors"
                                                    aria-expanded={isExpanded}
                                                >
                                                    {isExpanded ? (
                                                        <>
                                                            <ChevronUp size={14} />
                                                            <span>Masquer les détails</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown size={14} />
                                                            <span>Voir les {totalItems} article{totalItems > 1 ? 's' : ''}</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                                        className="border-t border-border bg-muted/50"
                                                    >
                                                        <div className="p-3">
                                                            <div className="space-y-2">
                                                                {sale.items.map((item: SaleItem, index: number) => (
                                                                    <div key={index} className="flex items-center justify-between gap-2">
                                                                        <div className="flex items-baseline gap-2 min-w-0 flex-1">
                                                                            <span className="text-caption font-semibold text-brand-primary tabular-nums flex-shrink-0">
                                                                                {item.quantity}×
                                                                            </span>
                                                                            <span className="text-caption font-medium text-foreground truncate">
                                                                                {item.product_name}
                                                                                {item.product_volume && (
                                                                                    <span className="text-muted-foreground font-normal ml-1">
                                                                                        {item.product_volume}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        <span className="text-caption font-semibold text-foreground tabular-nums flex-shrink-0">
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

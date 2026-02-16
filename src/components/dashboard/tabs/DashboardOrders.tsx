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
            <div className="bg-white/40 backdrop-blur-md rounded-[2.5rem] p-12 text-center border-2 border-brand-primary/20 shadow-xl shadow-brand-subtle/5">
                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner border border-emerald-100/50">
                    <CheckCircle2 size={40} strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-black text-brand-dark uppercase tracking-tight mb-2">Tout est ordonné !</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed max-w-[240px] mx-auto opacity-80">
                    Aucune vente en attente. Votre flux de service est parfaitement synchronisé.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white/40 backdrop-blur-md rounded-[2.5rem] p-5 sm:p-7 border-2 border-brand-primary shadow-2xl shadow-brand-subtle/10 overflow-hidden" data-guide="pending-sales">
            {/* Header Expert - Centered Hero Layout */}
            <div className="flex flex-col items-center text-center gap-4 mb-10">
                <div className="flex flex-col items-center">
                    <h3 className="font-black text-brand-dark text-2xl uppercase tracking-tighter mb-1">
                        Commandes en attente
                    </h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-80">
                        {sales.length} TRANSACTION{sales.length > 1 ? 'S' : ''} À VALIDER
                    </p>
                </div>

                {showBulkValidation && (
                    <div className="flex items-center justify-center w-full">
                        <EnhancedButton
                            onClick={() => onValidateAll(sales)}
                            size="md"
                            variant="secondary"
                            icon={<CheckCheck size={16} className="text-gray-900 group-hover:text-white" />}
                            className="w-auto px-10 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 shadow-md hover:shadow-lg hover:border-brand-primary hover:bg-brand-primary hover:text-white font-black uppercase tracking-widest text-[9px] transition-all whitespace-nowrap flex flex-row items-center justify-center flex-nowrap"
                        >
                            Tout Valider ({sales.length})
                        </EnhancedButton>
                    </div>
                )}
            </div>

            {/* List Optimized for Expert View */}
            <div className="space-y-8 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {sortedServerIds.map(serverId => {
                    const serverSales = salesByServer[serverId];
                    const server = users.find(u => u.id === serverId);

                    return (
                        <div key={serverId} className="relative">
                            {/* Server Identification Row */}
                            <div className="flex justify-between items-center mb-4 sticky top-0 z-20 bg-white/10 backdrop-blur-sm py-1">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white border-2 border-white shadow-sm">
                                        <User size={14} />
                                    </div>
                                    <h4 className="font-black text-xs text-gray-900 uppercase tracking-tight">
                                        {server?.name || 'Collaborateur Inconnu'}
                                    </h4>
                                </div>
                                {showBulkValidation && (
                                    <button
                                        onClick={() => onValidateAll(serverSales)}
                                        className="px-4 py-1.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-brand-dark hover:border-brand-primary hover:bg-brand-primary hover:text-white font-black uppercase tracking-widest text-[9px] transition-all shadow-sm whitespace-nowrap"
                                    >
                                        Valider Lot ({serverSales.length})
                                    </button>
                                )}
                            </div>

                            {/* Individual Order Cards */}
                            <div className="space-y-3 pl-2 border-l-2 border-brand-subtle/10 ml-1">
                                {serverSales.map((sale, idx) => {
                                    const isExpanded = expandedSales.has(sale.id);
                                    const totalItems = sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
                                    const canCancel = !isServerRole || canServerCancel(sale);
                                    const canValidate = !isServerRole;

                                    return (
                                        <motion.div
                                            key={sale.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="bg-white/80 rounded-2xl border border-brand-subtle/30 shadow-sm overflow-hidden group hover:shadow-md transition-all"
                                        >
                                            <div className="p-2 sm:p-3 bg-gradient-to-r from-transparent to-brand-subtle/5">
                                                <div className="flex items-center justify-between gap-2">
                                                    {/* Info Bloc - Ultra Compract */}
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="flex flex-col flex-shrink-0">
                                                            <span className="text-[8px] font-bold text-gray-400 font-mono leading-none mb-0.5">
                                                                {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <p className="font-black text-sm text-gray-900 font-mono tracking-tighter leading-none">
                                                                {formatPrice(sale.total).replace(/[\s]?FCFA/g, '')}
                                                            </p>
                                                        </div>

                                                        <button
                                                            onClick={() => toggleExpanded(sale.id)}
                                                            className="flex items-center gap-1.5 text-[9px] font-black text-gray-900 hover:text-brand-primary uppercase tracking-widest transition-all px-3 py-1.5 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20"
                                                        >
                                                            <span>DÉTAILS ({totalItems})</span>
                                                            <div className="flex-shrink-0">
                                                                {isExpanded ? <ChevronUp size={12} strokeWidth={3} /> : <ChevronDown size={12} strokeWidth={3} />}
                                                            </div>
                                                        </button>
                                                    </div>

                                                    {/* Actions - Ultra Compact cercles */}
                                                    {(canValidate || canCancel) && (
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {canValidate && (
                                                                <EnhancedButton
                                                                    onClick={() => onValidate(sale.id)}
                                                                    variant="success"
                                                                    size="sm"
                                                                    className="w-9 h-9 !p-0 rounded-full shadow-lg shadow-emerald-500/20 active:scale-90 transition-all flex items-center justify-center"
                                                                    loading={processingId === sale.id}
                                                                    disabled={!!processingId}
                                                                    icon={<Check size={16} strokeWidth={3} />}
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
                                                                    icon={<X size={16} strokeWidth={3} />}
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
                                                        transition={{ duration: 0.3, ease: "easeOut" }}
                                                        className="border-t border-brand-subtle/10 bg-brand-subtle/5 backdrop-blur-sm"
                                                    >
                                                        <div className="p-4 space-y-3">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className="w-1 h-3 bg-brand-primary rounded-full" />
                                                                <p className="text-[9px] font-black text-brand-dark uppercase tracking-widest">
                                                                    Articles ({sale.items.length})
                                                                </p>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {sale.items.map((item: SaleItem, index: number) => (
                                                                    <div key={index} className="flex items-center justify-between group/item">
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="w-5 h-5 flex items-center justify-center bg-white rounded-md text-[10px] font-black text-brand-primary border border-brand-subtle/20 shadow-sm">
                                                                                {item.quantity}
                                                                            </span>
                                                                            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-tight">
                                                                                {item.product_name}
                                                                            </span>
                                                                            {item.product_volume && (
                                                                                <span className="text-[9px] font-black text-gray-400 border border-gray-100 px-1.5 py-0.5 rounded uppercase">
                                                                                    {item.product_volume}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="font-bold text-[11px] text-gray-900 font-mono tracking-tighter">
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

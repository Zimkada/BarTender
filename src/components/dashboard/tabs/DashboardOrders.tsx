import { useState, useMemo } from 'react';
import { User, Check, X, ChevronUp, ChevronDown, ShoppingBag } from 'lucide-react';
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
    formatPrice: (amount: number) => string;
}

export function DashboardOrders({
    sales,
    users,
    onValidate,
    onReject,
    onValidateAll,
    isServerRole,
    formatPrice
}: DashboardOrdersProps) {
    const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());
    const showBulkValidation = !isServerRole;

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
            // Source of truth: soldBy is the business attribution
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
            <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-gray-100">
                <div className="w-16 h-16 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Check size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Tout est à jour !</h3>
                <p className="text-gray-500 max-w-sm mx-auto">
                    Aucune vente en attente de validation pour le moment. Toutes les commandes ont été traitées.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl p-4 border border-amber-200" data-guide="pending-sales">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800 text-lg">Commandes en attente ({sales.length})</h3>
                {showBulkValidation && (
                    <EnhancedButton onClick={() => onValidateAll(sales)} size="sm" variant="primary">Tout Valider</EnhancedButton>
                )}
            </div>
            <div className="space-y-4 max-h-96 overflow-y-auto">
                {sortedServerIds.map(serverId => {
                    const serverSales = salesByServer[serverId];
                    const server = users.find(u => u.id === serverId);
                    return (
                        <div key={serverId} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2"><User size={16} /> {server?.name || 'Inconnu'}</h4>
                                {showBulkValidation && (
                                    <EnhancedButton onClick={() => onValidateAll(serverSales)} size="sm">Valider tout</EnhancedButton>
                                )}
                            </div>
                            <div className="space-y-2">
                                {serverSales.map(sale => {
                                    const showButtons = !isServerRole;

                                    const isExpanded = expandedSales.has(sale.id);
                                    const totalItems = sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

                                    return (
                                        <div key={sale.id} className="bg-amber-50 rounded-lg border border-amber-100 overflow-hidden">
                                            <div className="p-3 flex justify-between items-center">
                                                <div className="flex items-center gap-3 flex-1">
                                                    <div>
                                                        <p className="text-xs text-gray-500">{new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                        <p className="font-bold text-amber-600">{formatPrice(sale.total)}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleExpanded(sale.id)}
                                                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-amber-600 transition-colors px-2 py-1 rounded-md hover:bg-amber-100"
                                                    >
                                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                        <span>Détails ({totalItems})</span>
                                                    </button>
                                                </div>
                                                {showButtons && (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => onValidate(sale.id)} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"><Check size={16} /></button>
                                                        <button onClick={() => onReject(sale.id)} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"><X size={16} /></button>
                                                    </div>
                                                )}
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="border-t border-amber-200 bg-amber-50/50"
                                                    >
                                                        <div className="p-3 space-y-2">
                                                            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                                                                <ShoppingBag size={14} />
                                                                Articles ({sale.items.length}):
                                                            </p>
                                                            {sale.items.map((item: SaleItem, index: number) => (
                                                                <div key={index} className="flex items-center justify-between text-sm pl-5 border-l-2 border-amber-300">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium text-gray-700">{item.quantity}x</span>
                                                                        <span className="text-gray-600">{item.product_name}</span>
                                                                        {item.product_volume && (
                                                                            <span className="text-gray-600 text-xs">({item.product_volume})</span>
                                                                        )}
                                                                    </div>
                                                                    <span className="font-semibold text-amber-600">
                                                                        {formatPrice(item.total_price)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

import { Eye, RotateCcw, User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sale, User } from '../../../../types';
import { getSaleDate } from '../../../../utils/saleHelpers';

interface SalesCardsViewProps {
    sales: Sale[];
    formatPrice: (price: number) => string;
    onViewDetails: (sale: Sale) => void;
    getReturnsBySale: (saleId: string) => any[];
    users?: User[];
}

export function SalesCardsView({
    sales,
    formatPrice,
    onViewDetails,
    getReturnsBySale,
    users
}: SalesCardsViewProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sales.map(sale => (
                <SaleCard
                    key={sale.id}
                    sale={sale}
                    formatPrice={formatPrice}
                    onViewDetails={() => onViewDetails(sale)}
                    getReturnsBySale={getReturnsBySale}
                    users={users}
                />
            ))}
        </div>
    );
}

// Internal component for individual card - "Mini Ticket" Style
export function SaleCard({
    sale,
    formatPrice,
    onViewDetails,
    getReturnsBySale,
    users
}: {
    sale: Sale;
    formatPrice: (price: number) => string;
    onViewDetails: () => void;
    getReturnsBySale?: (saleId: string) => any[];
    users?: User[];
}) {
    // Calculer le montant des retours remboursés
    const saleReturns = getReturnsBySale ? getReturnsBySale(sale.id) : [];
    const refundedAmount = saleReturns
        .filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
        .reduce((sum, r) => sum + r.refundAmount, 0);

    const netAmount = sale.total - refundedAmount;
    const hasReturns = saleReturns.length > 0;

    // Badge de statut compact
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'validated': return 'bg-green-100 text-green-700';
            case 'pending': return 'bg-amber-100 text-amber-700';
            case 'rejected': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    // Infos utilisateurs
    const serverUserId = sale.soldBy;
    const seller = users?.find(u => u.id === serverUserId);

    return (
        <motion.div
            whileHover={{ y: -4, rotate: 1 }}
            className="group relative bg-white rounded-sm shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
            onClick={onViewDetails}
        >
            {/* Top Border "Receipt" accent */}
            <div className="h-1.5 w-full bg-amber-400/80" />

            <div className="p-4 cursor-pointer">
                {/* Header: ID + Time + User */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                        <span className="font-mono text-xs text-gray-400 font-bold tracking-widest">#{sale.id.slice(-6)}</span>
                        <span className="text-xs font-medium text-gray-500 flex items-center gap-1 mt-0.5">
                            {new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {seller && <><span className="text-gray-300">•</span> <UserIcon size={10} /> {seller.name}</>}
                        </span>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getStatusColor(sale.status)}`}>
                        {sale.status === 'validated' ? 'Payé' : sale.status}
                    </div>
                </div>

                {/* Divider dashed */}
                <div className="border-b border-dashed border-gray-200 my-3" />

                {/* Product Summary */}
                <div className="space-y-1.5 min-h-[50px]">
                    {sale.items.slice(0, 2).map((item: any, index) => (
                        <div key={index} className="flex justify-between items-center text-xs text-gray-600">
                            <span className="truncate pr-2">
                                <span className="font-bold text-gray-800 mr-1">{item.quantity}x</span>
                                {item.product?.name || item.product_name}
                            </span>
                            <span className="font-mono">{formatPrice((item.product?.price || item.unit_price) * item.quantity)}</span>
                        </div>
                    ))}
                    {sale.items.length > 2 && (
                        <p className="text-[10px] text-gray-400 italic text-center mt-1">
                            + {sale.items.length - 2} autres articles...
                        </p>
                    )}
                </div>

                {/* Divider dashed */}
                <div className="border-b-2 border-dashed border-gray-100 my-3" />

                {/* Total Section */}
                <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                        {hasReturns ? (
                            <>
                                <span className="text-[10px] text-gray-400 line-through decoration-red-400 decoration-2">
                                    {formatPrice(sale.total)}
                                </span>
                                <span className="text-sm font-bold text-red-500 flex items-center gap-1">
                                    <RotateCcw size={12} />
                                    -{formatPrice(refundedAmount)}
                                </span>
                            </>
                        ) : (
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Total Net</span>
                        )}
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-xl font-bold text-gray-800 font-mono tracking-tighter">
                            {formatPrice(netAmount)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Hover Action Overlay */}
            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm text-xs font-bold text-gray-700 flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                    <Eye size={14} /> Voir le ticket
                </div>
            </div>

            {/* Bottom serrated edge (Visual only via border masking usually, but simplistic here) */}
            <div className="h-1 w-full bg-gradient-to-r from-transparent via-gray-200/50 to-transparent" />
        </motion.div>
    );
}


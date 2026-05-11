import { RotateCcw, User as UserIcon, ArrowLeftRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sale, User } from '../../../../types';
import { isConfirmedReturn, getSaleDate } from '../../../../utils/saleHelpers';
import { isToday } from 'date-fns';

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
        .filter(isConfirmedReturn)
        .reduce((sum, r) => sum + r.refundAmount, 0);

    const netAmount = sale.total - refundedAmount;
    const hasReturns = saleReturns.length > 0;

    // Badge de statut — couleurs sémantiques universelles
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'validated': return 'bg-green-50 text-green-700 border border-green-100';
            case 'pending': return 'bg-brand-subtle text-brand-primary border border-brand-primary/20';
            case 'rejected': return 'bg-red-50 text-red-700 border border-red-100';
            case 'cancelled': return 'bg-gray-100 text-gray-600 border border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border border-gray-200';
        }
    };

    // Infos utilisateurs
    const serverUserId = sale.soldBy;
    const seller = users?.find(u => u.id === serverUserId);

    return (
        <motion.div
            whileHover={{ y: -2 }}
            className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand-primary/30 transition-all cursor-pointer overflow-hidden"
            onClick={onViewDetails}
        >
            {/* Accent supérieur — esprit "ticket" */}
            <div className="h-1 w-full bg-brand-primary" />

            <div className="p-4">
                {/* Header : ID + heure + serveur */}
                <div className="flex justify-between items-start mb-3 gap-2">
                    <div className="flex flex-col min-w-0">
                        <span className="text-caption font-medium text-gray-400 tabular-nums">#{sale.id.slice(-6)}</span>
                        <span className="text-caption text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                            {(() => {
                                const saleDate = getSaleDate(sale);
                                const dateStr = isToday(saleDate)
                                    ? ''
                                    : `${saleDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} • `;
                                const timeStr = new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                return <span className="tabular-nums">{dateStr}{timeStr}</span>;
                            })()}
                            {seller && <><span className="text-gray-300 mx-1">•</span> <UserIcon size={10} className="flex-shrink-0" /> <span className="truncate">{seller.name}</span></>}
                        </span>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                        {(sale as any).sourceReturnId && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                <ArrowLeftRight size={10} />
                                Échange
                            </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(sale.status)}`}>
                            {sale.status === 'validated' ? 'Payé' : sale.status === 'cancelled' ? 'Annulée' : sale.status === 'rejected' ? 'Rejetée' : sale.status}
                        </span>
                    </div>
                </div>

                {/* Divider dashed — esprit ticket */}
                <div className="border-b border-dashed border-gray-200 my-3" />

                {/* Lien vers retour source si échange */}
                {(sale as any).sourceReturnId && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mb-3">
                        <p className="text-caption text-amber-700 font-medium flex items-center gap-1.5">
                            <ArrowLeftRight size={10} />
                            Remplacement du retour #{((sale as any).sourceReturnId as string).slice(-6).toUpperCase()}
                        </p>
                    </div>
                )}

                {/* Articles (preview) */}
                <div className="space-y-1.5 min-h-[50px]">
                    {sale.items.slice(0, 2).map((item: any, index) => (
                        <div key={index} className="flex justify-between items-center text-body-sm text-gray-600 gap-2">
                            <span className="truncate min-w-0">
                                <span className="font-semibold text-gray-800 mr-1 tabular-nums">{item.quantity}×</span>
                                {item.product?.name || item.product_name}
                            </span>
                            <span className="tabular-nums flex-shrink-0">{formatPrice((item.product?.price || item.unit_price) * item.quantity)}</span>
                        </div>
                    ))}
                    {sale.items.length > 2 && (
                        <p className="text-caption text-gray-400 italic text-center mt-1">
                            + {sale.items.length - 2} autres articles
                        </p>
                    )}
                </div>

                <div className="border-b border-dashed border-gray-200 my-3" />

                {/* Total */}
                <div className="flex justify-between items-end gap-2">
                    <div className="flex flex-col min-w-0">
                        {hasReturns ? (
                            <>
                                <span className="text-caption text-gray-400 line-through decoration-red-400 tabular-nums">
                                    {formatPrice(sale.total)}
                                </span>
                                <span className="text-body-sm font-semibold text-red-500 flex items-center gap-1 tabular-nums">
                                    <RotateCcw size={12} />
                                    -{formatPrice(refundedAmount)}
                                </span>
                            </>
                        ) : (
                            <span className="text-micro text-gray-500">Total net</span>
                        )}
                    </div>
                    <span className="text-h3 font-semibold text-gray-900 tabular-nums flex-shrink-0">
                        {formatPrice(netAmount)}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}


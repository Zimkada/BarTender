import React from 'react';
import {
    Phone,
    Clock,
    CheckCircle,
    User,
    AlertTriangle,
    Package
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Consignment, Sale, User as UserType } from '../../types';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { cn } from '../../lib/utils';

interface ConsignmentCardProps {
    consignment: Consignment;
    onClaim: () => void;
    onForfeit: () => void;
    users: UserType[];
    sales: Sale[];
    isReadOnly?: boolean;
}

export function ConsignmentCard({
    consignment,
    onClaim,
    onForfeit,
    users,
    sales,
    isReadOnly = false
}: ConsignmentCardProps) {
    const { formatPrice } = useCurrencyFormatter();

    // Attribution logic
    const originalSeller = React.useMemo(() => {
        const originalSale = sales.find(s => s.id === consignment.saleId);
        if (originalSale) {
            const serverUserId = originalSale.soldBy;
            return users.find(u => u.id === serverUserId);
        }
        return undefined;
    }, [sales, consignment.saleId, users]);

    const expiresAt = new Date(consignment.expiresAt);
    const now = new Date();
    const timeDiff = expiresAt.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
    const isExpired = hoursLeft < 0;
    const isExpiringSoon = hoursLeft >= 0 && hoursLeft <= 24;

    // Helper for visual status
    const getStatusParams = () => {
        if (isExpired) return { color: "bg-red-500", border: "border-red-500/20", bg: "bg-red-50" };
        if (isExpiringSoon) return { color: "bg-amber-500", border: "border-amber-500/20", bg: "bg-amber-50" };
        return { color: "bg-brand-primary", border: "border-brand-primary/20", bg: "bg-white" };
    };

    const status = getStatusParams();

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative bg-white rounded-[1.5rem] p-5 border shadow-md hover:shadow-xl transition-all overflow-hidden",
                "border-gray-100 hover:border-brand-primary/30 hover:shadow-brand-primary/5"
            )}
        >
            {/* Elite Left Accent Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${status.color} opacity-80`} />

            <div className="pl-3">
                {/* Header: Customer & Badge */}
                <div className="flex justify-between items-start mb-5">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-black text-gray-900 text-lg truncate leading-none">
                                {consignment.customerName}
                            </h4>
                            {isExpiringSoon && !isExpired && (
                                <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500" />
                            )}
                        </div>
                        {consignment.customerPhone ? (
                            <a
                                href={`tel:${consignment.customerPhone}`}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-brand-primary transition-colors bg-gray-50 px-2 py-1 rounded-md border border-gray-100"
                            >
                                <Phone size={10} strokeWidth={3} />
                                {consignment.customerPhone}
                            </a>
                        ) : (
                            <span className="text-[10px] text-gray-300 italic">Sans contact</span>
                        )}
                    </div>

                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-sm",
                        isExpired ? "bg-red-50 border-red-100 text-red-600" :
                            isExpiringSoon ? "bg-amber-50 border-amber-100 text-amber-700" :
                                "bg-gray-50 border-gray-100 text-gray-500"
                    )}>
                        {isExpired ? (
                            <>
                                <AlertTriangle size={12} strokeWidth={2.5} />
                                <span className="text-[9px] font-black uppercase tracking-wider">Expiré</span>
                            </>
                        ) : (
                            <>
                                <Clock size={12} strokeWidth={2.5} />
                                <span className="text-[9px] font-black uppercase tracking-wider">
                                    {Math.floor(hoursLeft / 24)}j {hoursLeft % 24}h
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Ticket Zone: Product Details */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-dashed border-gray-200 mb-5 relative group-hover:border-brand-primary/20 transition-colors">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center shrink-0">
                            <span className="font-black text-xl text-gray-900">{consignment.quantity}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Produit</p>
                            <p className="font-bold text-gray-900 leading-tight">{consignment.productName}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{consignment.productVolume || 'Standard'}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100/50 border-dashed">
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Valeur Stockée</p>
                            <p
                                className="font-black text-sm font-mono tracking-tighter"
                                style={{ background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                            >
                                {formatPrice(consignment.totalAmount)}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Limite</p>
                            <p className={`text-xs font-bold ${isExpiringSoon ? 'text-amber-600' : 'text-gray-600'}`}>
                                {expiresAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    {/* Meta Info (Seller & ID) */}
                    <div className="flex items-center justify-between sm:justify-start gap-3 mb-2 sm:mb-0 sm:mr-auto">
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                            #{consignment.id.slice(-4).toUpperCase()}
                        </span>
                        {originalSeller && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-50 border border-purple-100/50">
                                <User size={10} className="text-purple-600" />
                                <span className="text-[9px] font-black text-purple-600 uppercase tracking-tight">
                                    {originalSeller.name}
                                </span>
                            </div>
                        )}
                    </div>

                    {!isReadOnly && (
                        <div className="flex gap-2 w-full sm:w-auto">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onClaim}
                                className="flex-1 sm:flex-none px-4 py-2.5 text-white rounded-xl shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2"
                                style={{ background: 'var(--brand-gradient)' }}
                                title="Client récupère le produit"
                            >
                                <CheckCircle size={14} strokeWidth={3} />
                                <span className="text-[10px] font-black uppercase tracking-wider">Récupérer</span>
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onForfeit}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-xl flex items-center justify-center gap-2 transition-colors"
                                title="Confisquer (Remise en stock)"
                            >
                                <Package size={14} strokeWidth={2.5} />
                                <span className="text-[10px] font-black uppercase tracking-wider">Confisquer</span>
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

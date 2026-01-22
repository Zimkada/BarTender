import React from 'react';
import {
    Phone,
    Clock,
    CheckCircle,
    XCircle,
    User,
    AlertTriangle,
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

    // Attribution logic: soldBy is the single source of truth
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative bg-white rounded-3xl border-2 transition-all p-5 hover:shadow-xl",
                isExpired
                    ? "border-red-100 bg-red-50/30"
                    : isExpiringSoon
                        ? "border-amber-100 bg-amber-50/30"
                        : "border-gray-100 hover:border-amber-200"
            )}
        >
            {/* Header section with Badge */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0">
                    <h4 className="font-black text-gray-900 text-lg flex items-center gap-2 truncate">
                        {consignment.customerName}
                    </h4>
                    {consignment.customerPhone && (
                        <a
                            href={`tel:${consignment.customerPhone}`}
                            className="text-xs font-bold text-gray-400 hover:text-amber-600 flex items-center gap-1.5 transition-colors mt-0.5"
                        >
                            <Phone size={12} strokeWidth={3} />
                            {consignment.customerPhone}
                        </a>
                    )}
                </div>

                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm text-white",
                    isExpired
                        ? "bg-red-600"
                        : isExpiringSoon
                            ? "bg-amber-500 text-amber-950"
                            : "bg-gray-900"
                )}>
                    {isExpired ? (
                        <>
                            <AlertTriangle size={12} strokeWidth={3} />
                            <span>Expiré</span>
                        </>
                    ) : (
                        <>
                            <Clock size={12} strokeWidth={3} />
                            <span>{Math.floor(hoursLeft / 24)}j {hoursLeft % 24}h</span>
                        </>
                    )}
                </div>
            </div>

            {/* Product Details Area (Ticket-like background) */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 border-dashed space-y-3 mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center font-black text-gray-600">
                        {consignment.quantity}
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-black text-gray-400 uppercase leading-none mb-1">Produit</p>
                        <p className="font-bold text-gray-900 text-sm">{consignment.productName}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-50 border-dashed">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-0.5">Valeur</p>
                        <p className="font-bold text-amber-600 font-mono">{formatPrice(consignment.totalAmount)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-0.5">Date limite</p>
                        <p className="text-xs font-bold text-gray-700">{expiresAt.toLocaleDateString('fr-FR')}</p>
                    </div>
                </div>
            </div>

            {/* Footer Meta */}
            <div className="flex items-center justify-between px-1 mb-5">
                <div className="flex items-center gap-1">
                    {originalSeller && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 bg-purple-100 rounded-lg flex items-center justify-center">
                                <User size={12} className="text-purple-600" />
                            </div>
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-tighter">{originalSeller.name}</span>
                        </div>
                    )}
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">#{consignment.id.slice(-6).toUpperCase()}</span>
            </div>

            {/* Actions */}
            {!isReadOnly && (
                <div className="flex gap-3">
                    <button
                        onClick={onClaim}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white h-12 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95"
                    >
                        <CheckCircle size={16} strokeWidth={3} />
                        Récupérer
                    </button>
                    <button
                        onClick={onForfeit}
                        className="flex-1 bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-200 transition-all active:scale-95"
                    >
                        <XCircle size={16} strokeWidth={3} />
                        Confisquer
                    </button>
                </div>
            )}

            {/* Urgency Indicator Bar */}
            {isExpiringSoon && !isExpired && (
                <motion.div
                    animate={{ opacity: [0.4, 1.0, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1"
                >
                    <div className="w-3 h-3 bg-amber-500 rounded-full border-2 border-white shadow-sm shadow-amber-200" />
                </motion.div>
            )}
        </motion.div>
    );
}

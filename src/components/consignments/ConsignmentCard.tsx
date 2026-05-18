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
    /** Pre-computed seller — skips internal sales.find() + users.find() when provided */
    precomputedSeller?: UserType;
}

export function ConsignmentCard({
    consignment,
    onClaim,
    onForfeit,
    users,
    sales,
    isReadOnly = false,
    precomputedSeller,
}: ConsignmentCardProps) {
    const { formatPrice } = useCurrencyFormatter();

    // Attribution logic — O(1) when precomputedSeller is provided
    const originalSeller = React.useMemo(() => {
        if (precomputedSeller !== undefined) return precomputedSeller;
        const originalSale = sales.find(s => s.id === consignment.saleId);
        if (originalSale) {
            const serverUserId = originalSale.soldBy;
            return users.find(u => u.id === serverUserId);
        }
        return undefined;
    }, [precomputedSeller, sales, consignment.saleId, users]);

    const expiresAt = new Date(consignment.expiresAt);
    const now = new Date();
    const timeDiff = expiresAt.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
    const isExpired = hoursLeft < 0;
    const isExpiringSoon = hoursLeft >= 0 && hoursLeft <= 24;

    // Helper for visual status
    const getStatusParams = () => {
        if (isExpired) return { color: "bg-red-500", border: "border-red-500/20", bg: "bg-red-50 dark:bg-red-950/30" };
        if (isExpiringSoon) return { color: "bg-amber-500", border: "border-amber-500/20", bg: "bg-amber-50 dark:bg-amber-950/30" };
        return { color: "bg-brand-primary", border: "border-brand-primary/20", bg: "bg-card" };
    };

    const status = getStatusParams();

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative bg-card rounded-[1.5rem] p-5 border shadow-md hover:shadow-xl transition-all overflow-hidden",
                "border-border hover:border-brand-primary/30 hover:shadow-brand-primary/5"
            )}
        >
            {/* Elite Left Accent Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${status.color} opacity-80`} />

            <div className="pl-3">
                {/* Header: Customer & Badge */}
                <div className="flex justify-between items-start mb-5 gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-h3 font-semibold text-foreground truncate leading-none">
                                {consignment.customerName}
                            </h4>
                            {isExpiringSoon && !isExpired && (
                                <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                            )}
                        </div>
                        {consignment.customerPhone ? (
                            <a
                                href={`tel:${consignment.customerPhone}`}
                                className="inline-flex items-center gap-1.5 text-caption font-medium text-muted-foreground hover:text-brand-primary transition-colors bg-muted px-2 py-1 rounded-md border border-border tabular-nums"
                            >
                                <Phone size={10} strokeWidth={3} />
                                {consignment.customerPhone}
                            </a>
                        ) : (
                            <span className="text-caption text-muted-foreground/60 italic">Sans contact</span>
                        )}
                    </div>

                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-sm flex-shrink-0",
                        isExpired ? "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/40 text-red-600 dark:text-red-400" :
                            isExpiringSoon ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-400" :
                                "bg-muted border-border text-muted-foreground"
                    )}>
                        {isExpired ? (
                            <>
                                <AlertTriangle size={12} strokeWidth={2.5} />
                                <span className="text-micro">Expiré</span>
                            </>
                        ) : (
                            <>
                                <Clock size={12} strokeWidth={2.5} />
                                <span className="text-micro tabular-nums">
                                    {Math.floor(hoursLeft / 24)}j {hoursLeft % 24}h
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Ticket Zone: Product Details */}
                <div className="bg-muted/50 rounded-xl p-4 border border-dashed border-border mb-5 relative group-hover:border-brand-primary/20 transition-colors">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-card border border-border shadow-sm flex items-center justify-center shrink-0">
                            <span className="text-h3 font-semibold text-foreground tabular-nums">{consignment.quantity}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-micro text-muted-foreground mb-1">Produit</p>
                            <p className="text-body font-semibold text-foreground leading-tight">{consignment.productName}</p>
                            <p className="text-caption text-muted-foreground mt-0.5">{consignment.productVolume || 'Standard'}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border border-dashed">
                        <div>
                            <p className="text-micro text-muted-foreground mb-0.5">Valeur stockée</p>
                            <p className="text-body-sm font-semibold text-brand-primary tabular-nums">
                                {formatPrice(consignment.totalAmount)}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-micro text-muted-foreground mb-0.5">Limite</p>
                            <p className={`text-caption font-medium tabular-nums ${isExpiringSoon ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/70'}`}>
                                {expiresAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    {/* Meta Info (Seller & ID) */}
                    <div className="flex items-center justify-between sm:justify-start gap-3 mb-2 sm:mb-0 sm:mr-auto">
                        <span className="text-micro text-muted-foreground/70 tabular-nums">
                            #{consignment.id.slice(-4).toUpperCase()}
                        </span>
                        {originalSeller && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-brand-subtle border border-brand-subtle">
                                <User size={10} className="text-brand-primary" />
                                <span className="text-micro text-brand-primary">
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
                                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 text-white rounded-xl shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-1.5 sm:gap-2 btn-brand"
                                title="Client récupère le produit"
                            >
                                <CheckCircle size={13} className="sm:w-[14px] sm:h-[14px]" strokeWidth={3} />
                                <span className="text-caption font-semibold">Récupérer</span>
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onForfeit}
                                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 transition-colors"
                                title="Confisquer (remise en stock)"
                            >
                                <Package size={13} className="sm:w-[14px] sm:h-[14px]" strokeWidth={2.5} />
                                <span className="text-caption font-semibold">Confisquer</span>
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
